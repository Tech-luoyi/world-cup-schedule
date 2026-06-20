/**
 * Salvage ALL data from past Apify runs and merge into squads.ts.
 */
const T = process.env.APIFY_TOKEN || '<YOUR_APIFY_TOKEN>';
const fs = require('fs');
const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ø/g,'o').replace(/æ/g,'ae')
    .toLowerCase().replace(/[^a-z0-9\s\-]/g,'').trim();
}
function rev(s) {
  const p = s.split(/\s+/);
  return p.length <= 1 ? s : [p[p.length-1], ...p.slice(0,-1)].join(' ');
}

async function getDatasetItems(did) {
  let items = [], off = 0;
  while (true) {
    try {
      const batch = await fetchJSON(`https://api.apify.com/v2/datasets/${did}/items?token=${T}&offset=${off}&limit=1000`);
      if (!batch.length) break;
      items.push(...batch);
      off += batch.length;
      if (batch.length < 1000) break;
    } catch(e) { break; }
  }
  return items;
}

async function main() {
  const startTime = Date.now();

  // Get all runs
  const allRuns = [];
  for (let off = 0; off < 200; off += 50) {
    const j = await fetchJSON(`https://api.apify.com/v2/acts/automation-lab~transfermarkt-scraper/runs?token=${T}&limit=50&offset=${off}&desc=true`);
    allRuns.push(...j.data.items);
    if (j.data.items.length < 50) break;
    await new Promise(r=>setTimeout(r, 500));
  }

  // Filter runs with data
  const runsWithData = [];
  for (const run of allRuns) {
    if (!run.defaultDatasetId) continue;
    if (run.status !== 'SUCCEEDED' && run.status !== 'TIMED-OUT') continue;
    try {
      const check = await fetchJSON(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${T}&limit=1`);
      if (check.length > 0) runsWithData.push({ id: run.id, did: run.defaultDatasetId, status: run.status });
    } catch(e) {}
  }
  console.log(`Found ${runsWithData.length} runs with data\n`);

  // Fetch ALL items from all runs
  const lk = new Map();
  let totalItems = 0, totalWithVal = 0;
  for (const rd of runsWithData) {
    const items = await getDatasetItems(rd.did);
    totalItems += items.length;
    let runVals = 0;
    for (const it of items) {
      const n = it.name, v = it.marketValueNumeric;
      if (!n || v == null || v <= 0) continue;
      runVals++;
      const norm = normalize(n);
      // Latest scrape wins (higher index = newer for same run)
      lk.set(norm, v);
      const r = normalize(rev(n));
      if (r !== norm) lk.set(r, v);
    }
    totalWithVal += runVals;
    console.log(`  ${rd.id.slice(0,8)} (${rd.status}): ${items.length} items, ${runVals} with value`);
    await new Promise(r=>setTimeout(r, 200));
  }

  console.log(`\nTotal: ${totalItems} items, ${totalWithVal} with value`);
  console.log(`Lookup: ${lk.size} unique name entries`);

  // Merge into squads.ts
  const c = fs.readFileSync('src/data/squads.ts', 'utf-8');
  const lines = c.split('\n');
  let out = '', matched = 0, total = 0;
  const re = /\{ name: "([^"]*)", nameEn: "([^"]*)", position: "([^"]*)", detailedPosition: "([^"]*)", marketValueEuro: (\d+), number: (\d+), club: "([^"]*)", age: (\d+), caps: (\d+), goals: (\d+) \},/;

  for (const line of lines) {
    const pm = line.match(re);
    if (!pm) { out += line + '\n'; continue; }
    const [, cn, en, p, dp, ov, num, club, ag, ca, go] = pm;
    total++;
    let nv = null;
    for (const sn of [en, rev(en)]) { nv = lk.get(normalize(sn)); if (nv != null) break; }
    const fv = nv != null ? nv : parseInt(ov);
    if (nv != null) matched++;
    out += `      { name: "${cn}", nameEn: "${en}", position: "${p}", detailedPosition: "${dp}", marketValueEuro: ${fv}, number: ${num}, club: "${club}", age: ${ag}, caps: ${ca}, goals: ${go} },\n`;
  }

  fs.writeFileSync('src/data/squads.ts', out, 'utf-8');
  const tm = Math.round((Date.now()-startTime)/1000);
  console.log(`\nDone! Total: ${total} | Apify-matched: ${matched} (${(matched/total*100).toFixed(1)}%) | Kept: ${total-matched}`);
  console.log(`Time: ${Math.floor(tm/60)}m ${tm%60}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
