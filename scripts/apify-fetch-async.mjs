/**
 * Fetch player market values from Transfermarkt via Apify (async mode).
 * Submits all players in one run, polls for completion, fetches results.
 *
 * Usage: node scripts/apify-fetch-async.mjs <APIFY_TOKEN>
 */

import fs from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: node scripts/apify-fetch-async.mjs <APIFY_TOKEN>');
  process.exit(1);
}

const SQUADS_FILE = 'src/data/squads.ts';
const ACTOR_ID = 'automation-lab~transfermarkt-scraper';
const API = `https://api.apify.com/v2/acts/${ACTOR_ID}`;

// ── Helpers ──

function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ø]/g, 'o').replace(/[æ]/g, 'ae')
    .toLowerCase().replace(/[^a-z0-9\s\-]/g, '').trim();
}

function reverseName(name) {
  const parts = name.split(/\s+/);
  if (parts.length <= 1) return name;
  return [parts[parts.length - 1], ...parts.slice(0, -1)].join(' ');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  // 1. Read all player names
  const content = fs.readFileSync(SQUADS_FILE, 'utf-8');
  const playerNames = [];
  const re = /\{ name: "[^"]*", nameEn: "([^"]*)",/g;
  for (const m of content.matchAll(re)) playerNames.push(m[1]);
  const uniqueNames = [...new Set(playerNames)];
  console.log(`📋 ${playerNames.length} players, ${uniqueNames.length} unique`);

  // 2. Start Apify run
  console.log(`\n🚀 Starting Apify actor run with ${uniqueNames.length} search queries...`);
  const startRes = await fetch(`${API}/runs?token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchQueries: uniqueNames,
      maxPlayersPerQuery: 1,
      language: 'en',
      includeTransferHistory: false,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const runData = await startRes.json();
  const runId = runData.data?.id;
  const datasetId = runData.data?.defaultDatasetId;
  console.log(`   Run ID: ${runId}`);
  console.log(`   Status: ${runData.data?.status}`);

  if (runData.error) {
    console.error('❌', runData.error);
    process.exit(1);
  }

  // 3. Poll for completion
  console.log('\n⏳ Polling for completion...');
  let status = runData.data?.status;
  while (status !== 'SUCCEEDED' && status !== 'FAILED' && status !== 'ABORTED' && status !== 'TIMED-OUT') {
    await sleep(10000);
    try {
      const pollRes = await fetch(`${API}/runs/${runId}?token=${TOKEN}`, {
        signal: AbortSignal.timeout(15000),
      });
      const pollData = await pollRes.json();
      status = pollData.data?.status;
      const stats = pollData.data?.stats;
      console.log(`   Status: ${status} | Searched: ${stats?.totalDatasetItems || 0} items | ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      console.log(`   Poll error: ${e.message}, retrying...`);
    }
  }

  if (status !== 'SUCCEEDED') {
    console.error(`❌ Run ended with status: ${status}`);
    process.exit(1);
  }
  console.log('✅ Run completed!');

  // 4. Fetch dataset items
  console.log('\n📥 Fetching results...');
  let allItems = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const dsRes = await fetch(`${API.replace('/v2/acts/' + ACTOR_ID, '/v2/datasets')}/${datasetId}/items?token=${TOKEN}&offset=${offset}&limit=${limit}&format=json`, {
      signal: AbortSignal.timeout(30000),
    });
    const items = await dsRes.json();
    if (!items.length) break;
    allItems.push(...items);
    offset += items.length;
    console.log(`   Fetched ${allItems.length} items...`);
    if (items.length < limit) break;
  }

  console.log(`\n📊 Total results: ${allItems.length}`);

  // 5. Build lookup
  const lookup = new Map();
  for (const item of allItems) {
    const name = item.name;
    const value = item.marketValueNumeric;
    if (!name || value === null || value === undefined || value <= 0) continue;
    const norm = normalize(name);
    lookup.set(norm, { value, matchedName: name });
    // Also index reversed
    const rev = normalize(reverseName(name));
    if (rev !== norm) lookup.set(rev, { value, matchedName: name });
  }

  console.log(`   Lookup built: ${lookup.size} name entries\n`);

  // 6. Replace values in squads.ts
  console.log('🔄 Merging into squads.ts...');
  const lines = content.split('\n');
  let result = '';
  let matchedCount = 0;
  let totalCount = 0;
  const sampleMatches = [];

  const squadsRe = /\{ name: "([^"]*)", nameEn: "([^"]*)", position: "([^"]*)", detailedPosition: "([^"]*)", marketValueEuro: (\d+), number: (\d+), club: "([^"]*)", age: (\d+), caps: (\d+), goals: (\d+) \},/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pm = line.match(squadsRe);
    if (pm) {
      const [, name, nameEn, pos, detPos, oldVal, num, club, age, caps, goals] = pm;
      totalCount++;

      let newValue = null;
      for (const sn of [nameEn, reverseName(nameEn)]) {
        const entry = lookup.get(normalize(sn));
        if (entry) { newValue = entry.value; break; }
      }

      const finalValue = (newValue !== null && newValue > 0) ? newValue : parseInt(oldVal);
      if (newValue !== null && newValue > 0) {
        matchedCount++;
        if (sampleMatches.length < 20) {
          sampleMatches.push(`${nameEn}: €${(finalValue/1000000).toFixed(0)}M`);
        }
      }

      const newLine = `      { name: "${name}", nameEn: "${nameEn}", position: "${pos}", detailedPosition: "${detPos}", marketValueEuro: ${finalValue}, number: ${num}, club: "${club}", age: ${age}, caps: ${caps}, goals: ${goals} },`;
      result += newLine + '\n';
    } else {
      result += line + '\n';
    }
  }

  fs.writeFileSync(SQUADS_FILE, result, 'utf-8');

  console.log(`✅ Done!`);
  console.log(`   Total: ${totalCount}  |  Apify matched: ${matchedCount} (${(matchedCount/totalCount*100).toFixed(1)}%)`);
  console.log(`   Kept existing: ${totalCount - matchedCount}`);
  console.log(`\n   Sample matches:`);
  sampleMatches.forEach(s => console.log(`     ${s}`));
}

main().catch(e => { console.error(e); process.exit(1); });
