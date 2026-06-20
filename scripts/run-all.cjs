const T = process.env.APIFY_TOKEN || '<YOUR_APIFY_TOKEN>';
const fs = require('fs');
const API = 'https://api.apify.com/v2/acts/automation-lab~transfermarkt-scraper';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const BATCH = 150;

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/o/g,'o').replace(/ae/g,'ae')
    .toLowerCase().replace(/[^a-z0-9\s\-]/g,'').trim();
}
function rev(s) {
  const p = s.split(/\s+/);
  return p.length <= 1 ? s : [p[p.length-1], ...p.slice(0,-1)].join(' ');
}

async function doOne(queries, idx, total) {
  const label = `[${idx}/${total}]`;
  console.log(label, 'Starting...');
  const sr = await fetch(API+'/runs?token='+T, {method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({searchQueries:queries, maxPlayersPerQuery:1, language:'en', includeTransferHistory:false}),
    signal:AbortSignal.timeout(20000)});
  const sd = await sr.json();
  if (sd.error) { console.log(label, 'Error:', sd.error.message); return []; }
  const rid = sd.data.id, did = sd.data.defaultDatasetId;

  let s = sd.data.status;
  while (s === 'READY' || s === 'RUNNING') {
    await sleep(15000);
    const pr = await fetch(API+'/runs/'+rid+'?token='+T);
    const pd = await pr.json();
    s = pd.data.status;
  }

  if (s !== 'SUCCEEDED') { console.log(label, s); return []; }

  let items = [], off = 0;
  while (true) {
    const batch = await fetch(`https://api.apify.com/v2/datasets/${did}/items?token=${T}&offset=${off}&limit=1000`)
      .then(r=>r.json());
    if (!batch.length) break;
    items.push(...batch);
    off += batch.length;
    if (batch.length < 1000) break;
  }
  console.log(label, 'Got', items.length, 'results');
  return items;
}

async function main() {
  const c = fs.readFileSync('src/data/squads.ts', 'utf-8');
  const names = [...new Set([...c.matchAll(/\{ name: "[^"]*", nameEn: "([^"]*)",/g)].map(m=>m[1]))];
  console.log('Players:', names.length);

  const batches = [];
  for (let i = 0; i < names.length; i += BATCH) batches.push(names.slice(i, i+BATCH));
  console.log('Batches:', batches.length, '\n');

  const all = [];
  const t0 = Date.now();
  for (let i = 0; i < batches.length; i++) {
    const items = await doOne(batches[i], i+1, batches.length);
    all.push(...items);
    console.log('  Total so far:', all.length, '|', Math.round((Date.now()-t0)/1000), 's\n');
  }

  // Build lookup
  const lk = new Map();
  for (const it of all) {
    const n = it.name, v = it.marketValueNumeric;
    if (!n || v == null || v <= 0) continue;
    lk.set(normalize(n), v);
    const r = normalize(rev(n));
    if (r !== normalize(n)) lk.set(r, v);
  }
  console.log('Lookup:', lk.size, 'entries');

  // Merge
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

  const tm = Math.round((Date.now()-t0)/1000);
  console.log(`\nDone! Total: ${total} | Apify: ${matched} (${(matched/total*100).toFixed(1)}%) | Kept: ${total-matched}`);
  console.log(`Time: ${Math.floor(tm/60)}m ${tm%60}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
