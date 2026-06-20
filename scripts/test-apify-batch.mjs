import fs from 'fs';

const T = process.argv[2] || process.env.APIFY_TOKEN || '<YOUR_APIFY_TOKEN>';
const API = 'https://api.apify.com/v2/acts/automation-lab~transfermarkt-scraper';

const content = fs.readFileSync('src/data/squads.ts', 'utf-8');
const re = /\{ name: "[^"]*", nameEn: "([^"]*)",/g;
const names = [...new Set([...content.matchAll(re)].map(m=>m[1]))].slice(0, 50);
console.log('Testing with', names.length, 'players:', names.slice(0,3).join(', '), '...');

async function test() {
  const s = Date.now();

  const start = await fetch(API+'/runs?token='+T, {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({searchQueries:names, maxPlayersPerQuery:1, language:'en', includeTransferHistory:false})});
  const rd = await start.json();
  const runId = rd.data?.id;
  console.log('Run:', runId, 'started');

  let status = rd.data?.status;
  while (status === 'READY' || status === 'RUNNING') {
    await new Promise(r=>setTimeout(r, 10000));
    try {
      const poll = await fetch(API+'/runs/'+runId+'?token='+T);
      const pd = await poll.json();
      status = pd.data?.status;
      const items = pd.data?.stats?.totalDatasetItems;
      const dur = Math.round((Date.now()-s)/1000);
      console.log(dur+'s | Status:', status, '| Items:', items);
    } catch(e) {
      console.log('Poll error:', e.message);
    }
  }

  if (status === 'SUCCEEDED') {
    const ds = await fetch('https://api.apify.com/v2/datasets/'+rd.data.defaultDatasetId+'/items?token='+T+'&limit=100');
    const items = await ds.json();
    const withVal = items.filter(i=>i.marketValueNumeric > 0);
    console.log('Done in', Math.round((Date.now()-s)/1000)+'s. Total:', items.length, '| With value:', withVal.length);
    withVal.slice(0,5).forEach(i=>console.log('  '+i.name+': €'+(i.marketValueNumeric/1000000).toFixed(0)+'M'));
  } else {
    console.log('Failed:', status);
  }
}
test().catch(e=>console.error(e));
