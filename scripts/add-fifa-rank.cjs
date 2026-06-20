/**
 * Add fifaRank to TeamSquad interface and all 48 team entries in squads.ts
 */
const fs = require('fs');

const content = fs.readFileSync('src/data/squads.ts', 'utf-8');

// 1. Update TeamSquad interface - add fifaRank after fifaCode
let updated = content.replace(
  '  fifaCode: string;\n  coach: string;',
  '  fifaCode: string;\n  fifaRank: number;\n  coach: string;'
);

// 2. FIFA rankings (June 2026) for all 48 teams
const rankings = {
  // Europe (16)
  "Spain": 2, "France": 3, "England": 4, "Portugal": 5, "Netherlands": 8,
  "Belgium": 9, "Germany": 10, "Croatia": 11, "Switzerland": 19, "Turkey": 22,
  "Austria": 24, "Norway": 31, "Sweden": 38, "Scotland": 40, "Czechia": 43,
  "Bosnia-Herzegovina": 64,
  // South America (6)
  "Argentina": 1, "Brazil": 6, "Colombia": 13, "Uruguay": 16, "Ecuador": 23, "Paraguay": 42,
  // Africa (10)
  "Morocco": 7, "Senegal": 15, "Algeria": 28, "Egypt": 29, "Ivory Coast": 33,
  "Congo DR": 46, "Tunisia": 45, "South Africa": 60, "Cape Verde Islands": 67, "Ghana": 73,
  // North America (6)
  "Mexico": 14, "United States": 17, "Canada": 30, "Panama": 34, "Curaçao": 82, "Haiti": 83,
  // Asia (9)
  "Japan": 18, "Iran": 20, "South Korea": 25, "Australia": 27, "Uzbekistan": 50,
  "Qatar": 56, "Iraq": 57, "Saudi Arabia": 61, "Jordan": 63,
  // Oceania (1)
  "New Zealand": 85,
};

// 3. Add fifaRank to each team entry: insert after fifaCode: "XXX",
for (const [teamKey, rank] of Object.entries(rankings)) {
  const pattern = new RegExp(
    `(teamKey: "${teamKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}",[^}]*fifaCode: "([^"]*)"),`,
    'g'
  );
  const before = updated.match(pattern);
  if (before) {
    updated = updated.replace(pattern, `$1, fifaRank: ${rank},`);
  } else {
    console.log(`WARNING: Could not find ${teamKey}`);
  }
}

fs.writeFileSync('src/data/squads.ts', updated, 'utf-8');
console.log('Done. Updated squads.ts with fifaRank for all teams.');
