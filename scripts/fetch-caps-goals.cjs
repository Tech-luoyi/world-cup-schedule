/**
 * Fetch real international caps/goals from transfermarkt-datasets.
 * Downloads the players CSV, matches our squads, writes updated squads.ts.
 *
 * Usage: node scripts/fetch-caps-goals.cjs
 */

const fs = require('fs');
const https = require('https');
const zlib = require('zlib');

const PLAYERS_URL = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/players.csv.gz';
const SQUADS_FILE = 'src/data/squads.ts';
const CACHE_FILE = '/tmp/transfermarkt-players.csv';

// ── Country name mapping: our teamKey → Transfermarkt country_of_citizenship ──
const COUNTRY_MAP = {
  'Turkey': 'Turkey',
  'Czechia': 'Czech Republic',
  'Ivory Coast': "Cote d'Ivoire",
  'Congo DR': 'DR Congo',
  'Cape Verde Islands': 'Cape Verde',
  'Curaçao': 'Curacao',
  'Haiti': 'Haiti',
  'South Korea': 'Korea, South',
  'Bosnia-Herzegovina': 'Bosnia-Herzegovina',
};

function normalize(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ø]/g, 'o').replace(/[æ]/g, 'ae')
    .toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
}

function rev(s) {
  const p = s.split(/\s+/);
  return p.length <= 1 ? s : [p[p.length - 1], ...p.slice(0, -1)].join(' ');
}

function lastWord(s) {
  const p = s.trim().split(/\s+/);
  return p[p.length - 1];
}

function firstWord(s) {
  const p = s.trim().split(/\s+/);
  return p[0];
}

function getCountryTM(teamKey) {
  if (COUNTRY_MAP[teamKey]) return COUNTRY_MAP[teamKey];
  return teamKey;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

/** Download file */
async function download(url, dest) {
  if (fs.existsSync(dest)) {
    const stat = fs.statSync(dest);
    if (stat.size > 1000000) {
      console.log(`Using cached file: ${dest} (${(stat.size/1024/1024).toFixed(1)}MB)`);
      return;
    }
  }
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        https.get(res.headers.location, (r2) => {
          r2.pipe(file);
          file.on('finish', resolve);
          file.on('error', reject);
        });
        return;
      }
      res.pipe(file);
      file.on('finish', resolve);
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  // 1. Download
  console.log('Step 1: Downloading Transfermarkt players dataset...');
  await download(PLAYERS_URL, CACHE_FILE);
  console.log('  Done.');

  // 2. Parse CSV and build rich lookup
  console.log('\nStep 2: Parsing CSV and building lookups...');
  const raw = zlib.gunzipSync(fs.readFileSync(CACHE_FILE)).toString('utf-8');
  const lines = raw.split('\n');
  const header = lines[0].split(',');

  // Find column indices
  const idx = {};
  const needed = ['player_id', 'first_name', 'last_name', 'name', 'country_of_citizenship', 'international_caps', 'international_goals'];
  for (const col of needed) {
    idx[col] = header.indexOf(col);
  }
  console.log('  Column indices:', JSON.stringify(idx));

  // Lookups:
  // 1. country::normalized_name → { caps, goals }
  // 2. country::normalized_lastname → [{ caps, goals, fullName }] (for fallback with disambiguation)
  // 3. normalized_name → { caps, goals, country } (global fallback)
  // 4. country::single_name → [{ caps, goals, fullName }] (for single-name players like "Alisson")
  const byCountryName = new Map();
  const byCountryLast = new Map();
  const byCountrySingle = new Map();
  const byName = new Map();

  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVLine(lines[i]);
    const caps = parseInt(cols[idx.international_caps]) || 0;
    const goals = parseInt(cols[idx.international_goals]) || 0;
    const name = cols[idx.name];
    const firstName = cols[idx.first_name];
    const lastName = cols[idx.last_name];
    const citizenship = cols[idx.country_of_citizenship];

    if (!name) continue;

    // Normalize name variants
    const normName = normalize(name);
    const normFirst = normalize(firstName);
    const normLast = normalize(lastName);

    // Build composite name from first+last (helps match players with different full names)
    const compositeName = normalize(firstName + ' ' + lastName);

    const data = { caps, goals, country: citizenship, fullName: name };

    // Index by country (handle dual citizenship: comma-separated)
    const countries = citizenship ? citizenship.split(',').map(c => c.trim()) : [];
    for (const country of countries) {
      // Country + full name
      const keyFull = `${country}::${normName}`;
      const existingFull = byCountryName.get(keyFull);
      if (!existingFull || caps > existingFull.caps) {
        byCountryName.set(keyFull, data);
      }

      // Country + composite (first+last)
      if (compositeName && compositeName !== normName) {
        const keyComp = `${country}::${compositeName}`;
        const existingComp = byCountryName.get(keyComp);
        if (!existingComp || caps > existingComp.caps) {
          byCountryName.set(keyComp, data);
        }
      }

      // Country + last name (for fallback)
      if (normLast) {
        const keyLast = `${country}::${normLast}`;
        let entries = byCountryLast.get(keyLast);
        if (!entries) { entries = []; byCountryLast.set(keyLast, entries); }
        entries.push(data);
      }

      // Country + single name (for players with mononyms like "Alisson", "Neymar")
      if (!normFirst && !normLast && normName) {
        const keySingle = `${country}::${normName}`;
        let entries = byCountrySingle.get(keySingle);
        if (!entries) { entries = []; byCountrySingle.set(keySingle, entries); }
        entries.push(data);
      }
    }

    // Global name-only lookup (no country filter)
    const existingName = byName.get(normName);
    if (!existingName || caps > existingName.caps) {
      byName.set(normName, data);
    }
    count++;
  }
  console.log(`  Parsed ${count} players`);
  console.log(`  byCountryName: ${byCountryName.size} entries`);
  console.log(`  byCountryLast: ${byCountryLast.size} entries`);
  console.log(`  byCountrySingle: ${byCountrySingle.size} entries`);
  console.log(`  byName: ${byName.size} entries`);

  // 3. Read our squads.ts
  console.log('\nStep 3: Reading squads.ts...');
  const content = fs.readFileSync(SQUADS_FILE, 'utf-8');

  // Extract player records
  const playerRe = /\{ name: "([^"]*)", nameEn: "([^"]*)", position: "([^"]*)", detailedPosition: "([^"]*)", marketValueEuro: (\d+), number: (\d+), club: "([^"]*)", age: (\d+), caps: (\d+), goals: (\d+) \},/g;
  const players = [];
  for (const m of content.matchAll(playerRe)) {
    players.push({
      name: m[1], nameEn: m[2], position: m[3], detailedPosition: m[4],
      marketValueEuro: parseInt(m[5]), number: parseInt(m[6]),
      club: m[7], age: parseInt(m[8]), caps: parseInt(m[9]), goals: parseInt(m[10]),
    });
  }
  console.log(`  Found ${players.length} player records`);

  // Build player-team mapping
  const lines2 = content.split('\n');
  const playerTeams = [];
  let currentTeam = '';
  for (const line of lines2) {
    const tm = line.match(/teamKey: "([^"]+)"/);
    if (tm) { currentTeam = tm[1]; continue; }
    const pm = line.match(/\{ name: "([^"]*)", nameEn: "([^"]*)",/);
    if (pm) playerTeams.push(currentTeam);
  }
  console.log(`  Mapped ${playerTeams.length} players to teams`);

  // 4. Match
  console.log('\nStep 4: Matching players...');
  let matched = 0, notFound = 0;
  const sampleMatches = [];
  const sampleMisses = [];

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const teamKey = playerTeams[i] || '';
    const tmCountry = getCountryTM(teamKey);

    let found = null;
    const nameEn = p.nameEn;
    const normEn = normalize(nameEn);
    const revEn = normalize(rev(nameEn));
    const lastEn = normalize(lastWord(nameEn));

    // Strategy 1: country + exact full name (and reversed)
    found = byCountryName.get(`${tmCountry}::${normEn}`);
    if (!found) found = byCountryName.get(`${tmCountry}::${revEn}`);

    // Strategy 2: country + last name (only if unique in that country)
    if (!found) {
      const entries = byCountryLast.get(`${tmCountry}::${lastEn}`);
      if (entries && entries.length === 1) {
        found = entries[0];
      }
    }

    // Strategy 3: global name match (across all countries)
    if (!found) {
      const nf = byName.get(normEn);
      if (nf) found = nf;
    }
    if (!found) {
      const nf = byName.get(revEn);
      if (nf) found = nf;
    }

    // Strategy 4: match by first name as last_name or single name (e.g., "Alisson Becker" → "Alisson")
    if (!found) {
      const firstEn = normalize(firstWord(nameEn));
      if (firstEn.length >= 3 && nameEn.split(/\s+/).length >= 2) {
        // Check last-name lookup (single-name players like Alisson have last_name="Alisson")
        const lastNameEntries = byCountryLast.get(`${tmCountry}::${firstEn}`);
        if (lastNameEntries && lastNameEntries.length >= 1 && lastNameEntries.length <= 5) {
          let best = null;
          for (const e of lastNameEntries) {
            if (!best || e.caps > best.caps) best = e;
          }
          if (best) found = best;
        }
        // Also check single-name lookup
        if (!found) {
          const singleEntries = byCountrySingle.get(`${tmCountry}::${firstEn}`);
          if (singleEntries && singleEntries.length >= 1 && singleEntries.length <= 5) {
            let best = null;
            for (const e of singleEntries) {
              if (!best || e.caps > best.caps) best = e;
            }
            if (best) found = best;
          }
        }
      }
    }

    // Strategy 5: loose last-name match in country (for partial name matches)
    if (!found && lastEn.length >= 4) {
      const lastEntries = byCountryLast.get(`${tmCountry}::${lastEn}`);
      if (lastEntries && lastEntries.length <= 8) {
        let best = null;
        for (const e of lastEntries) {
          if (!best || e.caps > best.caps) best = e;
        }
        if (best) {
          const ourFirst = normalize(firstWord(nameEn));
          const tmFull = normalize(best.fullName);
          if (ourFirst.length <= 2 || tmFull.includes(ourFirst[0]) || tmFull.startsWith(ourFirst.substring(0, 3))) {
            found = best;
          }
        }
      }
    }

    if (found) {
      p.caps = found.caps;
      p.goals = found.goals;
      matched++;
    } else {
      // Zero out unmatched — use real data only
      p.caps = 0;
      p.goals = 0;
      notFound++;
      if (sampleMisses.length < 15) {
        sampleMisses.push(`${nameEn} (${teamKey}/${tmCountry})`);
      }
    }
  }

  const pct = (matched / players.length * 100).toFixed(1);
  console.log(`  Matched: ${matched}/${players.length} (${pct}%)  |  Not found: ${notFound}`);

  if (sampleMatches.length > 0) {
    console.log('\n  Sample matches:');
    sampleMatches.forEach(s => console.log(`    ✓ ${s}`));
  }
  if (sampleMisses.length > 0) {
    console.log('\n  Sample misses:');
    sampleMisses.forEach(s => console.log(`    ✗ ${s}`));
  }

  // 5. Write
  console.log('\nStep 5: Writing updated squads.ts...');
  let result = '';
  let pi = 0;
  for (const line of lines2) {
    const pm = line.match(/\{ name: "([^"]*)", nameEn: "([^"]*)", position: "([^"]*)", detailedPosition: "([^"]*)", marketValueEuro: (\d+), number: (\d+), club: "([^"]*)", age: (\d+), caps: (\d+), goals: (\d+) \},/);
    if (pm && pi < players.length) {
      const p = players[pi];
      result += `      { name: "${p.name}", nameEn: "${p.nameEn}", position: "${p.position}", detailedPosition: "${p.detailedPosition}", marketValueEuro: ${p.marketValueEuro}, number: ${p.number}, club: "${p.club}", age: ${p.age}, caps: ${p.caps}, goals: ${p.goals} },`;
      result += '\n';
      pi++;
    } else {
      result += line + '\n';
    }
  }

  fs.writeFileSync(SQUADS_FILE, result, 'utf-8');
  console.log('  Done!');

  console.log('\n========================================');
  console.log(`Total: ${players.length}  |  Matched: ${matched} (${pct}%)  |  Missed: ${notFound}`);
  console.log('========================================');
}

main().catch(e => { console.error(e); process.exit(1); });
