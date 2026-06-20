/**
 * Fetch real-time player market values from Transfermarkt via Apify scraper.
 *
 * Usage: node scripts/apify-fetch-values.mjs <APIFY_TOKEN>
 *
 * Reads squads.ts → calls Apify in batches → writes updated marketValueEuro back.
 */

import fs from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: node scripts/apify-fetch-values.mjs <APIFY_TOKEN>');
  process.exit(1);
}

const SQUADS_FILE = 'src/data/squads.ts';
const ACTOR_ID = 'automation-lab~transfermarkt-scraper';
const BATCH_SIZE = 8;
const API_BASE = 'https://api.apify.com';
const MAX_RETRIES = 5;

// ── Helpers ──

function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ø]/g, 'o').replace(/[æ]/g, 'ae')
    .toLowerCase().replace(/[^a-z0-9\s\-]/g, '').trim();
}

/** Reversed name (for Korean name order: "Son Heung-min" → "Heung-min Son") */
function reverseName(name) {
  const parts = name.split(/\s+/);
  if (parts.length <= 1) return name;
  return [parts[parts.length - 1], ...parts.slice(0, -1)].join(' ');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── API Call ──

async function callApify(searchQueries) {
  const url = `${API_BASE}/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${TOKEN}&memory=1024&timeout=120`;
  const body = JSON.stringify({
    searchQueries,
    maxPlayersPerQuery: 1,
    language: 'en',
    includeTransferHistory: false,
  });

  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(`    Fetching batch ${searchQueries.length} queries...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(180000),
      });

      if (!res.ok) {
        const text = await res.text();
        const err = `HTTP ${res.status}: ${text.substring(0, 300)}`;
        if (res.status === 429) {
          console.log(`  Rate limited, waiting 15s...`);
          await sleep(15000);
          continue;
        }
        throw new Error(err);
      }

      const data = await res.json();
      return data;
    } catch (e) {
      lastError = e;
      console.log(`  Attempt ${attempt + 1} failed: ${e.message}`);
      if (attempt < MAX_RETRIES - 1) await sleep(5000);
    }
  }
  throw lastError;
}

// ── Extract market value from Apify result ──

function extractValue(item) {
  const val = item.marketValueNumeric;
  if (val === undefined || val === null) return null;
  return Number.isFinite(val) && val > 0 ? val : null;
}

function extractName(item) {
  return item.name || '';
}

function extractClub(item) {
  return item.currentClub || '';
}

// ── Build lookup ──

function buildLookup(results, playerNames) {
  // results is an array of items (one per search query if found)
  // Each item should have the player's profile data
  const lookup = new Map(); // normalized name → { value, matchedName }

  for (const item of results) {
    const name = extractName(item);
    const value = extractValue(item);
    const club = extractClub(item);

    if (!name || value === null) continue;

    const norm = normalize(name);
    if (!lookup.has(norm)) {
      lookup.set(norm, { value, matchedName: name, club });
    } else {
      // Prefer the entry with a club match
      const existing = lookup.get(norm);
      for (const pn of playerNames) {
        const normPn = normalize(pn);
        if (normPn === norm && !existing._clubMatched) {
          lookup.set(norm, { value, matchedName: name, club });
        }
      }
    }
  }

  // Also index reversed names
  const extraEntries = [];
  for (const [norm, entry] of lookup) {
    const rev = normalize(reverseName(entry.matchedName));
    if (rev !== norm) {
      extraEntries.push([rev, entry]);
    }
  }
  for (const [k, v] of extraEntries) {
    if (!lookup.has(k)) lookup.set(k, v);
  }

  return lookup;
}

// ── Main ──

async function main() {
  console.log('📡 Apify Transfermarkt Scraper');
  console.log(`   Batch size: ${BATCH_SIZE}\n`);

  // 1. Read all player names from squads.ts
  const content = fs.readFileSync(SQUADS_FILE, 'utf-8');
  const playerNames = [];
  const playerRe = /\{ name: "([^"]*)", nameEn: "([^"]*)", position: "([^"]*)",/g;
  for (const m of content.matchAll(playerRe)) {
    playerNames.push(m[2]); // nameEn
  }
  console.log(`📋 Total players to look up: ${playerNames.length}`);

  // Deduplicate (some names appear if same player listed twice)
  const uniqueNames = [...new Set(playerNames)];
  console.log(`   Unique names: ${uniqueNames.length}\n`);

  // 2. Fetch in batches
  const batches = [];
  for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
    batches.push(uniqueNames.slice(i, i + BATCH_SIZE));
  }

  console.log(`🔄 Fetching in ${batches.length} batches...\n`);

  const allResults = [];
  let totalCost = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Batch ${i + 1}/${batches.length} (${batch.length} players): ${batch[0]}...`);

    try {
      const data = await callApify(batch);

      // Apify returns { items: [...], total: N }
      const items = Array.isArray(data) ? data : (data.items || data.data || []);
      console.log(`  ✓ Got ${items.length} results`);

      if (items.length > 0) {
        allResults.push(...items);
        // Show a sample
        for (const item of items.slice(0, 3)) {
          const name = extractName(item);
          const val = extractValue(item);
          console.log(`    ${name}: ${val ? '€' + (val/1000000).toFixed(0) + 'M' : 'N/A'}`);
        }
      }

      // Add delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await sleep(2000);
      }
    } catch (e) {
      console.error(`  ✗ Batch ${i + 1} failed: ${e.message}`);
      // Continue with next batch
    }
  }

  console.log(`\n📊 Total results received: ${allResults.length}`);

  // 3. Build name → value lookup
  const lookup = buildLookup(allResults, uniqueNames);

  // 4. Replace values in squads.ts
  console.log('\n🔄 Merging values into squads.ts...');
  const lines = content.split('\n');
  let result = '';
  let matchedCount = 0;
  let totalCount = 0;
  let currentTeam = '';

  const squadsRe = /\{ name: "([^"]*)", nameEn: "([^"]*)", position: "([^"]*)", detailedPosition: "([^"]*)", marketValueEuro: (\d+), number: (\d+), club: "([^"]*)", age: (\d+), caps: (\d+), goals: (\d+) \},/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const tkMatch = line.match(/teamKey:\s*"([^"]+)"/);
    if (tkMatch) { currentTeam = tkMatch[1]; result += line + '\n'; continue; }

    const pm = line.match(squadsRe);
    if (pm) {
      const [, name, nameEn, pos, detPos, oldVal, num, club, age, caps, goals] = pm;
      totalCount++;

      // Try to find real value from Apify results
      const searchNames = [nameEn, reverseName(nameEn)];
      let newValue = null;

      for (const sn of searchNames) {
        const entry = lookup.get(normalize(sn));
        if (entry) {
          newValue = entry.value;
          break;
        }
      }

      let finalValue;
      if (newValue !== null && newValue > 0) {
        finalValue = newValue;
        matchedCount++;
      } else {
        // Keep existing value (from previous TM snapshot or estimate)
        finalValue = parseInt(oldVal);
      }

      const newLine = `      { name: "${name}", nameEn: "${nameEn}", position: "${pos}", detailedPosition: "${detPos}", marketValueEuro: ${finalValue}, number: ${num}, club: "${club}", age: ${age}, caps: ${caps}, goals: ${goals} },`;
      result += newLine + '\n';
    } else {
      result += line + '\n';
    }
  }

  fs.writeFileSync(SQUADS_FILE, result, 'utf-8');

  console.log(`\n✅ Done!`);
  console.log(`   Total players:    ${totalCount}`);
  console.log(`   Updated by Apify: ${matchedCount} (${(matchedCount/totalCount*100).toFixed(1)}%)`);
  console.log(`   Kept existing:    ${totalCount - matchedCount}`);
}

main().catch(err => { console.error(err); process.exit(1); });
