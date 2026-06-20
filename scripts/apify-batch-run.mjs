/**
 * Full Apify Transfermarkt fetch: all 1100+ players in async batches (150 per batch).
 *
 * Usage: node scripts/apify-batch-run.mjs <APIFY_TOKEN>
 */

import fs from 'fs';

const T = process.argv[2];
if (!T) { console.error('Usage: node scripts/apify-batch-run.mjs <TOKEN>'); process.exit(1); }

const SQUADS = 'src/data/squads.ts';
const ACTOR = 'automation-lab~transfermarkt-scraper';
const API = `https://api.apify.com/v2/acts/${ACTOR}`;
const BATCH = 150;

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[ø]/g,'o').replace(/[æ]/g,'ae')
    .toLowerCase().replace(/[^a-z0-9\s\-]/g,'').trim();
}
function rev(s) {
  const p = s.split(/\s+/);
  return p.length <= 1 ? s : [p[p.length-1], ...p.slice(0,-1)].join(' ');
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

async function fetchBatch(queries, idx, total) {
  const label = `[${idx}/${total}] ${queries[0]}...`;
  console.log(`${label} Starting...`);

  // Start run
  const sr = await fetch(API+'/runs?token='+T, {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({searchQueries:queries, maxPlayersPerQuery:1, language:'en', includeTransferHistory:false})});
  const sd = await sr.json();
  if (sd.error) throw new Error(`Start ${idx}: ${sd.error.message}`);
  const rid = sd.data.id, did = sd.data.defaultDatasetId;

  // Poll
  let status = sd.data.status;
  while (status === 'READY' || status === 'RUNNING') {
    await sleep(15000);
    try {
      const pr = await fetch(API+'/runs/'+rid+'?token='+T);
      const pd = await pr.json();
      status = pd.data?.status;
    } catch(e) { console.log(`  Poll err: ${e.message}`); }
  }

  if (status !== 'SUCCEEDED') {
    console.log(`  ${label} Failed: ${status}`);
    return [];
  }

  // Fetch results
  let items = [];
  let offset = 0;
  while (true) {
    const fr = await fetch(`https://api.apify.com/v2/datasets/${did}/items?token=${T}&offset=${offset}&limit=1000`);
    const batch = await fr.json();
    if (!batch.length) break;
    items.push(...batch);
    offset += batch.length;
    if (batch.length < 1000) break;
  }

  console.log(`  ${label} Done: ${items.length} items`);
  return items;
}

async function main() {
  // Read names
  const content = fs.readFileSync(SQUADS, 'utf-8');
  const names = [...new Set([...content.matchAll(/\{ name: "[^"]*", nameEn: "([^"]*)",/g)].map(m=>m[1]))];
  console.log(`📋 ${names.length} unique players\n`);

  // Split into batches
  const batches = [];
  for (let i = 0; i < names.length; i += BATCH) batches.push(names.slice(i, i + BATCH));
  console.log(`🔄 Processing ${batches.length} batches of up to ${BATCH}...\n`);

  // Fetch all
  const allItems = [];
  const t0 = Date.now();
  for (let i = 0; i < batches.length; i++) {
    const items = await fetchBatch(batches[i], i + 1, batches.length);
    allItems.push(...items);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(`  Cumulative: ${allItems.length} items | ${elapsed}s elapsed\n`);
  }

  // Build lookup
  console.log('🔍 Building lookup...');
  const lookup = new Map();
  for (const item of allItems) {
    const n = item.name, v = item.marketValueNumeric;
    if (!n || v === null || v === undefined || v <= 0) continue;
    const norm = normalize(n);
    lookup.set(norm, v);
    const r = normalize(rev(n));
    if (r !== norm) lookup.set(r, v);
  }
  console.log(`   ${lookup.size} name entries`);

  // Merge
  console.log('🔄 Merging...');
  const lines = content.split('\n');
  let out = '', matched = 0, total = 0;
  const re = /\{ name: "([^"]*)", nameEn: "([^"]*)", position: "([^"]*)", detailedPosition: "([^"]*)", marketValueEuro: (\d+), number: (\d+), club: "([^"]*)", age: (\d+), caps: (\d+), goals: (\d+) \},/;

  for (const line of lines) {
    const pm = line.match(re);
    if (!pm) { out += line + '\n'; continue; }
    const [, cn, en, p, dp, ov, num, club, ag, ca, go] = pm;
    total++;
    let nv = null;
    for (const sn of [en, rev(en)]) { nv = lookup.get(normalize(sn)); if (nv != null) break; }
    const fv = nv != null ? nv : parseInt(ov);
    if (nv != null) matched++;
    out += `      { name: "${cn}", nameEn: "${en}", position: "${p}", detailedPosition: "${dp}", marketValueEuro: ${fv}, number: ${num}, club: "${club}", age: ${ag}, caps: ${ca}, goals: ${go} },\n`;
  }

  fs.writeFileSync(SQUADS, out, 'utf-8');

  console.log(`\n✅ Done! Total: ${total} | Apify: ${matched} (${(matched/total*100).toFixed(1)}%) | Kept: ${total-matched}`);
  const t1 = Math.round((Date.now()-t0)/1000);
  console.log(`   Time: ${Math.floor(t1/60)}m ${t1%60}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
