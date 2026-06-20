import type { Match } from "../types/match";

export interface GroupRecord {
  team: string
  teamKey: string
  flag: string
  mp: number
  totalMatches: number  // 小组总场数 (通常是 3)
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
}

export interface GroupTable {
  group: string
  records: GroupRecord[]
}

export interface KnockoutRound {
  label: string      // "1/16决赛"
  stage: string      // "Round of 16"
  matchCount: number
  matches: Match[]
}

// Compute group standings from finished group-stage matches
export function computeGroupStandings(matches: Match[]): GroupTable[] {
  const groupMatches = matches.filter(
    (m) => m.stage === "Group stage" && m.groupLetter && m.status === "finished"
  );

  // Collect all unique teams per group
  const groupTeams: Record<string, Set<string>> = {};
  const groupFlags: Record<string, Record<string, string>> = {};
  const groupTeamKeys: Record<string, Record<string, string>> = {};

  // First pass: find all teams in each group
  for (const m of matches) {
    const g = m.groupLetter;
    if (!g) continue;
    if (!groupTeams[g]) {
      groupTeams[g] = new Set();
      groupFlags[g] = {};
      groupTeamKeys[g] = {};
    }
    if (m.homeTeam) {
      groupTeams[g].add(m.homeTeam);
      groupFlags[g][m.homeTeam] = m.homeFlag;
      groupTeamKeys[g][m.homeTeam] = m.homeTeamKey;
    }
    if (m.awayTeam) {
      groupTeams[g].add(m.awayTeam);
      groupFlags[g][m.awayTeam] = m.awayFlag;
      groupTeamKeys[g][m.awayTeam] = m.awayTeamKey;
    }
  }

  const tables: GroupTable[] = [];

  for (const group of [...Object.keys(groupTeams)].sort()) {
    const teams = groupTeams[group];
    const total = teams.size - 1; // 每队与组内其他队各赛一场
    const records: Record<string, GroupRecord> = {};

    // Initialize all teams
    for (const team of teams) {
      records[team] = {
        team,
        teamKey: groupTeamKeys[group][team] || team,
        flag: groupFlags[group][team] || "🏳️",
        mp: 0, totalMatches: total, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0,
      };
    }

    // Process finished matches
    for (const m of groupMatches) {
      if (m.groupLetter !== group) continue;
      const home = records[m.homeTeam];
      const away = records[m.awayTeam];
      if (!home || !away) continue;
      if (m.homeScore === undefined || m.awayScore === undefined) continue;

      home.mp++; away.mp++;
      home.gf += m.homeScore; home.ga += m.awayScore;
      away.gf += m.awayScore; away.ga += m.homeScore;

      if (m.homeScore > m.awayScore) {
        home.w++; home.pts += 3;
        away.l++;
      } else if (m.homeScore < m.awayScore) {
        away.w++; away.pts += 3;
        home.l++;
      } else {
        home.d++; home.pts++;
        away.d++; away.pts++;
      }
    }

    // Compute GD and sort
    const sorted = Object.values(records).map((r) => ({
      ...r,
      gd: r.gf - r.ga,
    }));
    sorted.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);

    tables.push({ group, records: sorted });
  }

  return tables;
}

// Organize knockout rounds
export function getKnockoutRounds(matches: Match[]): KnockoutRound[] {
  const knockout = matches.filter((m) => m.stage !== "Group stage");

  const stageOrder = [
    { label: "1/16决赛", stage: "Round of 32" },
    { label: "1/8决赛", stage: "Round of 16" },
    { label: "1/4决赛", stage: "Quarter-finals" },
    { label: "半决赛", stage: "Semi-finals" },
    { label: "三四名决赛", stage: "Third-place playoff" },
    { label: "决赛", stage: "Final" },
  ];

  return stageOrder.map(({ label, stage }) => {
    const roundMatches = knockout.filter((m) => m.stage === stage);
    roundMatches.sort((a, b) =>
      new Date(`${a.utcTimestamp}Z`).getTime() - new Date(`${b.utcTimestamp}Z`).getTime()
    );
    return {
      label,
      stage,
      matchCount: roundMatches.length,
      matches: roundMatches,
    };
  }).filter((r) => r.matchCount > 0);
}
