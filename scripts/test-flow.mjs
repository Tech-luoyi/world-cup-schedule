const T = process.env.APIFY_TOKEN || '<YOUR_APIFY_TOKEN>';
const API = 'https://api.apify.com/v2/acts/automation-lab~transfermarkt-scraper';
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function go() {
  const queries = ['Lamine Yamal','Jude Bellingham','Erling Haaland','Kylian Mbappe','Vinicius Junior'];
  console.log('Starting run with', queries.length, 'players...');

  const sr = await fetch(API+'/runs?token='+T, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({searchQueries:queries, maxPlayersPerQuery:1, language:'en', includeTransferHistory:false}),
    signal:AbortSignal.timeout(20000)
  });
  const sd = await sr.json();
  if (sd.error) { console.error('Start error:', sd.error); process.exit(1); }
  const rid = sd.data.id, did = sd.data.defaultDatasetId;
  console.log('Run:', rid, '| Status:', sd.data.status);

  let s = sd.data.status;
  while (s === 'READY' || s === 'RUNNING') {
    await sleep(10000);
    const pr = await fetch(API+'/runs/'+rid+'?token='+T);
    const pd = await pr.json();
    s = pd.data.status;
    console.log('  Status:', s, '| items:', pd.data.stats?.totalDatasetItems);
  }
  if (s === 'SUCCEEDED') {
    console.log('SUCCEEDED, fetching results...');
  } else {
    console.log('Run ended with:', s);
    process.exit(1);
  }

  const items = await fetch('https://api.apify.com/v2/datasets/'+did+'/items?token='+T+'&limit=10')
    .then(r=>r.json());
  console.log('Items:', items.length);
  items.forEach(i=>
    console.log('  '+i.name+': €'+(i.marketValueNumeric/1000000).toFixed(0)+'M')
  );
}
go().catch(e=>console.error(e));
