/**
 * Robust Apify batch runner v2.
 * Fixes: removed POST timeout, added retries, runs batches in parallel.
 * Usage: node scripts/apify-run-v2.cjs
 */
const T = process.env.APIFY_TOKEN || '<YOUR_APIFY_TOKEN>';
const fs = require('fs');
const API = 'https://api.apify.com/v2/acts/automation-lab~transfermarkt-scraper';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const BATCH = 150;
const PARALLEL = 2; // run this many batches concurrently

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ø/g,'o').replace(/æ/g,'ae')
    .toLowerCase().replace(/[^a-z0-9\s\-]/g,'').trim();
}
function rev(s) {
  const p = s.split(/\s+/);
  return p.length <= 1 ? s : [p[p.length-1], ...p.slice(0,-1)].join(' ');
}

async function fetchWithRetry(url, opts, retries=3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts);
      return res;
    } catch(e) {
      if (i === retries-1) throw e;
      console.log(`    Retry ${i+1}/${retries-1} after: ${e.message}`);
      await sleep(5000);
    }
  }
}

async function doBatch(queries, idx, total) {
  const label = `[${idx}/${total}] ${queries[0].substring(0,20)}`;
  console.log(`${label} - Starting run with ${queries.length} queries...`);

  // Step 1: Start run (NO timeout - can take 30-60s for large batches)
  try {
    const sr = await fetchWithRetry(API+'/runs?token='+T, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({searchQueries:queries, maxPlayersPerQuery:1, language:'en', includeTransferHistory:false})
    });
    const sd = await sr.json();
    if (sd.error) { console.log(`${label} - POST error: ${sd.error.message}`); return []; }
    const rid = sd.data.id;
    const did = sd.data.defaultDatasetId;
    let status = sd.data.status;
    console.log(`${label} - Run started: ${rid.slice(0,8)} status=${status}`);

    // Step 2: Poll until done
    let lastLog = Date.now();
    while (status === 'READY' || status === 'RUNNING') {
      await sleep(10000);
      try {
        const pr = await fetch(API+'/runs/'+rid+'?token='+T);
        const pd = await pr.json();
        status = pd.data?.status;
        const items = pd.data?.stats?.totalDatasetItems || 0;
        const elapsed = Math.round((Date.now() - lastLog)/1000);
        if (elapsed >= 30 || items > 0) {
          console.log(`  ${label} - ${status} | items: ${items} | ${Math.round((Date.now()-startTime)/1000)}s`);
          lastLog = Date.now();
        }
      } catch(e) {
        console.log(`  ${label} - Poll err: ${e.message}`);
      }
    }

    // Step 3: Fetch results
    if (status !== 'SUCCEEDED') {
      console.log(`${label} - Ended with status: ${status}`);
      return [];
    }

    let items = [], off = 0;
    while (true) {
      const batch = await fetch(`https://api.apify.com/v2/datasets/${did}/items?token=${T}&offset=${off}&limit=1000`)
        .then(r=>r.json());
      if (!batch.length) break;
      items.push(...batch);
      off += batch.length;
      if (batch.length < 1000) break;
    }
    const withVal = items.filter(i=>i.marketValueNumeric > 0).length;
    console.log(`${label} - DONE: ${items.length} items (${withVal} with values)`);
    return items;

  } catch(e) {
    console.log(`${label} - CRASH: ${e.message}`);
    return [];
  }
}

let startTime;

async function main() {
  startTime = Date.now();
  const c = fs.readFileSync('src/data/squads.ts', 'utf-8');
  const names = [...new Set([...c.matchAll(/\{ name: "[^"]*", nameEn: "([^"]*)",/g)].map(m=>m[1]))];
  console.log(`Players: ${names.length}`);

  const batches = [];
  for (let i = 0; i < names.length; i += BATCH) batches.push({idx: i/BATCH+1, total: Math.ceil(names.length/BATCH), queries: names.slice(i, i+BATCH)});
  console.log(`Batches: ${batches.length} | Parallel: ${PARALLEL}\n`);

  // Process in parallel chunks
  const all = [];
  for (let i = 0; i < batches.length; i += PARALLEL) {
    const chunk = batches.slice(i, i + PARALLEL);
    const results = await Promise.all(chunk.map(b => doBatch(b.queries, b.idx, b.total)));
    for (const r of results) all.push(...r);
    console.log(`  Cumulative: ${all.length} items | ${Math.round((Date.now()-startTime)/1000)}s\n`);
  }

  const withVal = all.filter(i=>i.marketValueNumeric > 0);
  console.log(`\nTotal: ${all.length} items (${withVal.length} with market value)`);

  // Build lookup
  console.log('Building name lookup...');
  const lk = new Map();
  for (const it of all) {
    const n = it.name, v = it.marketValueNumeric;
    if (!n || v == null || v <= 0) continue;
    lk.set(normalize(n), v);
    const r = normalize(rev(n));
    if (r !== normalize(n)) lk.set(r, v);
  }
  console.log(`  ${lk.size} name entries`);

  // Merge into squads.ts
  console.log('Merging into squads.ts...');
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
