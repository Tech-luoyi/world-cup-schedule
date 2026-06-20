/**
 * Merge real Transfermarkt market values into squads.ts.
 *
 * Uses the transfermarkt-datasets DuckDB file to look up actual market values
 * for each player. Matches by name with multiple normalization strategies.
 * Falls back to estimation formula for unmatched players.
 *
 * Usage: node scripts/merge-transfermarkt.mjs
 */

import fs from 'fs';
import duckdb from 'duckdb';

const SQUADS_FILE = 'src/data/squads.ts';
const TM_DB = 'scripts/transfermarkt.duckdb';

// ── DuckDB Promise wrapper ──
function dbAll(db, sql, ...params) {
  return new Promise((resolve, reject) => {
    db.all(sql, ...params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ── Name normalization ──
function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ø]/g, 'o').replace(/[Ø]/g, 'O')
    .replace(/[æ]/g, 'ae').replace(/[Æ]/g, 'AE');
}

function normalizeName(name) {
  return stripAccents(name).toLowerCase().replace(/[^a-z0-9\s\-]/g, '').trim();
}

// ── Name reversal (for Korean-style names) ──
function reverseName(name) {
  const parts = name.split(/\s+/);
  if (parts.length < 2) return name;
  // "Son Heung-min" -> "Heung-min Son"
  // "Heung-min Son" -> "Son Heung-min"
  return [parts[parts.length - 1], ...parts.slice(0, -1)].join(' ');
}

// ── Estimate formula (fallback) ──
function estimateValue(club, age, caps, goals, pos) {
  const TIERS = {
    "曼城": 5, "皇家马德里": 5, "拜仁慕尼黑": 5, "巴黎圣日耳曼": 5,
    "利物浦": 5, "巴塞罗那": 5, "阿森纳": 5, "国际米兰": 5,
    "切尔西": 5, "曼联": 5,
    "多特蒙德": 4, "勒沃库森": 4, "莱比锡红牛": 4, "AC米兰": 4, "那不勒斯": 4,
    "罗马": 4, "亚特兰大": 4, "马德里竞技": 4, "赫罗纳": 4, "皇家社会": 4,
    "纽卡斯尔联": 4, "热刺": 4, "阿斯顿维拉": 4, "布莱顿": 4, "西汉姆联": 4,
    "马赛": 4, "里昂": 4, "摩纳哥": 4, "朗斯": 4, "里尔": 4,
    "波尔图": 4, "本菲卡": 4, "葡萄牙体育": 4, "埃因霍温": 4, "阿贾克斯": 4,
    "加拉塔萨雷": 4, "费内巴切": 4, "布鲁日": 4, "安德莱赫特": 4,
    "萨尔茨堡红牛": 4, "塞维利亚": 4, "巴伦西亚": 4,
    "凯尔特人": 3, "流浪者": 3, "费耶诺德": 3,
    "狼队": 3, "伯恩茅斯": 3, "富勒姆": 3, "都灵": 3, "热那亚": 3,
    "法兰克福": 3, "弗赖堡": 3, "霍芬海姆": 3, "柏林联合": 3, "美因茨": 3,
    "斯图加特": 3, "布拉格斯拉维亚": 3, "布拉格斯巴达": 3,
    "奥林匹亚科斯": 3, "雅典AEK": 3, "根特": 3, "亨克": 3,
    "费内巴赫": 4, "加拉塔萨雷伊": 4,
    "美洲": 3, "蓝十字": 3, "蒙特雷": 3, "瓜达拉哈拉": 3,
    "利雅得新月": 3, "利雅得胜利": 3, "克鲁塞罗": 2, "弗拉门戈": 3,
    "河床": 3, "博卡青年": 3,
    "蔚山现代": 2, "全北现代": 2, "利雅得青年": 2, "杜海勒": 2,
    "中日德兰": 2, "哥本哈根": 2, "萨德": 2,
    "明尼苏达联": 2, "多伦多FC": 2, "蒙特利尔": 2, "纳什维尔": 2,
    "斯托克城": 2, "伯明翰城": 2, "赫尔城": 2,
    "伯恩利": 3, "埃弗顿": 3, "水晶宫": 3,
  };
  let tier = 1;
  for (const [name, t] of Object.entries(TIERS)) {
    if (club.includes(name) || name.includes(club)) { tier = t; break; }
  }
  const baseMap = { 1: 1_500_000, 2: 6_000_000, 3: 15_000_000, 4: 30_000_000, 5: 50_000_000 };
  const base = baseMap[tier] || 1_500_000;
  let ageMult;
  if (age <= 20) ageMult = 0.4 + (age - 16) * 0.06;
  else if (age <= 23) ageMult = 0.64 + (age - 20) * 0.12;
  else if (age <= 27) ageMult = 1.0 + (age - 23) * 0.08;
  else if (age <= 30) ageMult = 1.32 - (age - 27) * 0.06;
  else if (age <= 35) ageMult = 1.14 - (age - 30) * 0.09;
  else ageMult = Math.max(0.1, 0.69 - (age - 35) * 0.08);
  const capsMult = 1.0 + Math.min((caps || 0) / 250, 0.6);
  const goalsMult = 1.0 + Math.min((goals || 0) / 160, 0.4);
  const posMap = { "门将": 0.7, "左后卫": 0.85, "右后卫": 0.85, "中后卫": 0.95,
    "后腰": 0.9, "左中场": 0.8, "右中场": 0.8, "前腰": 1.05,
    "左边锋": 1.1, "右边锋": 1.1, "中锋": 1.2 };
  const posMult = posMap[pos] || 0.8;
  return Math.round((base * ageMult * capsMult * goalsMult * posMult) / 100_000) * 100_000;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const db = new duckdb.Database(TM_DB);

  // ── Build a name → market_value lookup cache from Transfermarkt ──
  console.log('Building Transfermarkt name lookup cache...');

  // Get all players with their current market value and name
  const tmPlayers = await dbAll(db,
    `SELECT player_id, name, market_value_in_eur, current_club_name, date_of_birth
     FROM players WHERE market_value_in_eur IS NOT NULL`
  );
  console.log(`  Loaded ${tmPlayers.length} players from Transfermarkt`);

  // Also get the most recent valuation for each player (may be more recent than snapshot)
  const tmValuations = await dbAll(db,
    `SELECT pv.player_id, pv.market_value_in_eur, pv.date
     FROM player_valuations pv
     JOIN (
       SELECT player_id, MAX(date) as max_date
       FROM player_valuations
       GROUP BY player_id
     ) latest ON pv.player_id = latest.player_id AND pv.date = latest.max_date`
  );
  console.log(`  Loaded ${tmValuations.length} latest valuations`);

  // Merge: use the more recent value
  const valuationMap = new Map(); // player_id -> { value, date }
  for (const v of tmValuations) {
    valuationMap.set(v.player_id, { value: v.market_value_in_eur, date: v.date });
  }

  // Build normalized name -> player_id lookup
  // We need to handle: our data is "Son Heung-min", TM data is "Heung-min Son"
  const nameIndex = new Map(); // normalized_name -> [player_info]
  for (const p of tmPlayers) {
    const norm = normalizeName(p.name);
    if (!nameIndex.has(norm)) nameIndex.set(norm, []);
    nameIndex.get(norm).push(p);

    // Also index reversed name
    const reversed = normalizeName(reverseName(p.name));
    if (reversed !== norm) {
      if (!nameIndex.has(reversed)) nameIndex.set(reversed, []);
      nameIndex.get(reversed).push(p);
    }
  }

  // ── Parse squads.ts and replace market values ──
  console.log('\nMatching players and replacing market values...');
  const content = fs.readFileSync(SQUADS_FILE, 'utf-8');
  const lines = content.split('\n');

  let currentTeamKey = '';
  let result = '';
  let matchedCount = 0;
  let fallbackCount = 0;
  let totalCount = 0;
  const unmatchedPlayers = [];

  const playerLineRe = /\{ name: "([^"]*)", nameEn: "([^"]*)", position: "([^"]*)", detailedPosition: "([^"]*)", marketValueEuro: (\d+), number: (\d+), club: "([^"]*)", age: (\d+), caps: (\d+), goals: (\d+) \},/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const tkMatch = line.match(/teamKey:\s*"([^"]+)"/);
    if (tkMatch) {
      currentTeamKey = tkMatch[1];
      result += line + '\n';
      continue;
    }

    const pm = line.match(playerLineRe);
    if (pm) {
      const [, name, nameEn, position, detailedPosition, oldValue, number, club, ageStr, caps, goals] = pm;
      totalCount++;

      // Try to find real market value from Transfermarkt
      let realValue = null;
      const searchNames = [nameEn, reverseName(nameEn)];

      for (const searchName of searchNames) {
        const normSearch = normalizeName(searchName);
        const candidates = nameIndex.get(normSearch) || [];

        for (const c of candidates) {
          // Extra validation: same club or fuzzy club match helps disambiguate
          const normClub = normalizeName(club);
          const normTMClub = c.current_club_name ? normalizeName(c.current_club_name) : '';
          const clubMatch = !c.current_club_name || normClub.includes(normTMClub) || normTMClub.includes(normClub);

          if (clubMatch || candidates.length === 1) {
            const playerId = c.player_id;
            const snapshotVal = c.market_value_in_eur;
            const latestVal = valuationMap.get(playerId);

            // Use the more recent valuation, otherwise snapshot
            if (latestVal && latestVal.value != null) {
              realValue = latestVal.value;
            } else if (snapshotVal != null) {
              realValue = snapshotVal;
            }
            break;
          }
        }
        if (realValue != null) break;
      }

      // If no match found, try looser matching
      if (realValue == null) {
        for (const searchName of searchNames) {
          const normSearch = normalizeName(searchName);
          // Try: does any TM name contain this search name or vice versa?
          for (const p of tmPlayers) {
            const normTM = normalizeName(p.name);
            if (normTM.includes(normSearch) || normSearch.includes(normTM)) {
              // Check name parts overlap significantly
              const searchParts = new Set(normSearch.split(/[\s\-]+/));
              const tmParts = new Set(normTM.split(/[\s\-]+/));
              const intersection = new Set([...searchParts].filter(x => tmParts.has(x)));
              if (intersection.size >= Math.min(searchParts.size, tmParts.size) - 1) {
                const playerId = p.player_id;
                const latestVal = valuationMap.get(playerId);
                realValue = latestVal?.value ?? p.market_value_in_eur ?? null;
                break;
              }
            }
          }
          if (realValue != null) break;
        }
      }

      let finalValue;
      if (realValue != null && realValue > 0) {
        finalValue = realValue;
        matchedCount++;
      } else {
        finalValue = estimateValue(club, parseInt(ageStr), parseInt(caps), parseInt(goals), detailedPosition);
        fallbackCount++;
        if (fallbackCount <= 20) {
          unmatchedPlayers.push(`${nameEn} (${club})`);
        }
      }

      const newLine = `      { name: "${name}", nameEn: "${nameEn}", position: "${position}", detailedPosition: "${detailedPosition}", marketValueEuro: ${finalValue}, number: ${number}, club: "${club}", age: ${ageStr}, caps: ${caps}, goals: ${goals} },`;
      result += newLine + '\n';
    } else {
      result += line + '\n';
    }
  }

  // Write result
  fs.writeFileSync(SQUADS_FILE, result, 'utf-8');

  console.log(`\nResults:`);
  console.log(`  Total players:    ${totalCount}`);
  console.log(`  TM matched:       ${matchedCount} (${(matchedCount/totalCount*100).toFixed(1)}%)`);
  console.log(`  Estimate fallback: ${fallbackCount} (${(fallbackCount/totalCount*100).toFixed(1)}%)`);

  if (unmatchedPlayers.length > 0) {
    console.log(`\n  First ${Math.min(20, unmatchedPlayers.length)} unmatched players:\n    ${unmatchedPlayers.join('\n    ')}`);
  }

  db.close();
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
