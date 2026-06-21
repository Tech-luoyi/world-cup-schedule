// ESPN public API client — no API key required
// Data source: https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

export interface EspnMatch {
  eventId: number;
  date: string;           // "2026-06-11"
  utcDate: string;        // "2026-06-11T19:00Z"
  homeAbbr: string;       // "MEX"
  awayAbbr: string;       // "RSA"
  homeScore: number | null;
  awayScore: number | null;
  homeRecord: string;     // "0-0-1" etc.
  awayRecord: string;
  status: "pre" | "in" | "post";
  statusDetail: string;   // "Full Time", "Scheduled", "In Progress"
}

export interface EspnMatchStats {
  eventId: number;
  home: TeamStats;
  away: TeamStats;
}

export interface TeamStats {
  abbr: string;
  possessionPct: number;
  totalShots: number;
  shotsOnTarget: number;
  saves: number;
  foulsCommitted: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  corners: number;
  accuratePasses: number;
  totalPasses: number;
  passPct: number;
  accurateCrosses: number;
  totalCrosses: number;
  crossPct: number;
  blockedShots: number;
  effectiveTackles: number;
  totalTackles: number;
  tacklePct: number;
  interceptions: number;
  effectiveClearance: number;
  totalClearance: number;
}

// ── Fetch all tournament matches (single API call with date range) ──

export async function fetchAllMatches(): Promise<EspnMatch[]> {
  const url = `${BASE}/scoreboard?dates=20260611-20260719`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status}`);
  const data = await res.json();
  const events = data.events || [];
  return events.map(parseEvent);
}

function parseEvent(event: any): EspnMatch {
  const comp = event.competitions[0];
  const statusType = comp.status.type;
  const home = comp.competitors.find((c: any) => c.homeAway === "home");
  const away = comp.competitors.find((c: any) => c.homeAway === "away");

  let status: "pre" | "in" | "post" = "pre";
  if (statusType.state === "pre") status = "pre";
  else if (statusType.state === "in") status = "in";
  else if (statusType.completed || statusType.state === "post") status = "post";

  return {
    eventId: parseInt(comp.id),
    date: (event.date || "").slice(0, 10),
    utcDate: event.date || "",
    homeAbbr: home?.team?.abbreviation ?? "?",
    awayAbbr: away?.team?.abbreviation ?? "?",
    homeScore: home?.score != null ? parseInt(home.score) : null,
    awayScore: away?.score != null ? parseInt(away.score) : null,
    homeRecord: home?.records?.[0]?.summary ?? "",
    awayRecord: away?.records?.[0]?.summary ?? "",
    status,
    statusDetail: statusType.description ?? "",
  };
}

// ── Fetch detailed match statistics ──

export async function fetchMatchSummary(eventId: number): Promise<EspnMatchStats | null> {
  const url = `${BASE}/summary?event=${eventId}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const boxscore = data.boxscore;
  if (!boxscore?.teams) return null;

  const homeTeam = boxscore.teams[0];
  const awayTeam = boxscore.teams[1];
  if (!homeTeam || !awayTeam) return null;

  const parseStats = (teamData: any, fallbackAbbr: string): TeamStats => {
    const stats = teamData.statistics || [];
    const dict: Record<string, string> = {};
    for (const s of stats) dict[s.name] = s.displayValue;

    return {
      abbr: teamData.team?.abbreviation ?? fallbackAbbr,
      possessionPct: parseFloat(dict.possessionPct ?? "0"),
      totalShots: parseInt(dict.totalShots ?? "0"),
      shotsOnTarget: parseInt(dict.shotsOnTarget ?? "0"),
      saves: parseInt(dict.saves ?? "0"),
      foulsCommitted: parseInt(dict.foulsCommitted ?? "0"),
      yellowCards: parseInt(dict.yellowCards ?? "0"),
      redCards: parseInt(dict.redCards ?? "0"),
      offsides: parseInt(dict.offsides ?? "0"),
      corners: parseInt(dict.wonCorners ?? "0"),
      accuratePasses: parseInt(dict.accuratePasses ?? "0"),
      totalPasses: parseInt(dict.totalPasses ?? "0"),
      passPct: parseFloat(dict.passPct ?? "0"),
      accurateCrosses: parseInt(dict.accurateCrosses ?? "0"),
      totalCrosses: parseInt(dict.totalCrosses ?? "0"),
      crossPct: parseFloat(dict.crossPct ?? "0"),
      blockedShots: parseInt(dict.blockedShots ?? "0"),
      effectiveTackles: parseInt(dict.effectiveTackles ?? "0"),
      totalTackles: parseInt(dict.totalTackles ?? "0"),
      tacklePct: parseFloat(dict.tacklePct ?? "0"),
      interceptions: parseInt(dict.interceptions ?? "0"),
      effectiveClearance: parseInt(dict.effectiveClearance ?? "0"),
      totalClearance: parseInt(dict.totalClearance ?? "0"),
    };
  };

  return {
    eventId,
    home: parseStats(homeTeam, "HOME"),
    away: parseStats(awayTeam, "AWAY"),
  };
}

// ── ESPN Pickcenter (DraftKings odds data) ──

export interface EspnPickcenter {
  eventId: number;
  provider: string;
  homeMoneyLine: number;
  awayMoneyLine: number;
  drawMoneyLine: number | null;
  spread: number;
  homeSpreadOdds: number;
  awaySpreadOdds: number;
  overUnder: number;
  overOdds: number;
  underOdds: number;
  details: string;
}

function extractPickcenter(eventId: number, data: any): EspnPickcenter | null {
  const picks = data.pickcenter;
  if (!picks || !Array.isArray(picks) || picks.length === 0) return null;
  const pc = picks[0];
  const home = pc.homeTeamOdds;
  const away = pc.awayTeamOdds;
  if (!home || !away) return null;

  // Try common patterns for draw odds (drawOdds can be an object {moneyLine: N} or a number)
  const drawML: number | null =
    pc.drawMoneyLine != null
      ? (typeof pc.drawMoneyLine === 'number' ? pc.drawMoneyLine : pc.drawMoneyLine?.moneyLine ?? null)
    : pc.drawOdds != null
      ? (typeof pc.drawOdds === 'number' ? pc.drawOdds : pc.drawOdds?.moneyLine ?? null)
    : (pc.drawTeamOdds?.moneyLine ?? null);

  return {
    eventId,
    provider: pc.provider?.name ?? "ESPN",
    homeMoneyLine: home.moneyLine ?? 0,
    awayMoneyLine: away.moneyLine ?? 0,
    drawMoneyLine: drawML,
    spread: pc.spread ?? 0,
    homeSpreadOdds: home.spreadOdds ?? 0,
    awaySpreadOdds: away.spreadOdds ?? 0,
    overUnder: pc.overUnder ?? 0,
    overOdds: pc.overOdds ?? 0,
    underOdds: pc.underOdds ?? 0,
    details: pc.details ?? "",
  };
}

/** Fetch pickcenter data for a single match */
export async function fetchMatchPickcenter(eventId: number): Promise<EspnPickcenter | null> {
  const url = `${BASE}/summary?event=${eventId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return extractPickcenter(eventId, data);
}

/** Convert American odds to decimal */
export function americanToDecimal(american: number): number {
  if (american > 0) return 1 + american / 100;
  return 1 + 100 / Math.abs(american);
}

/** Convert American odds to implied probability */
export function americanToProb(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

// ── High-level sync: fetch all matches + summaries + pickcenter, return structured data ──

export interface SyncResult {
  matches: EspnMatch[];
  stats: EspnMatchStats[];
  pickcenters: EspnPickcenter[];
}

export async function syncAll(): Promise<SyncResult> {
  const matches = await fetchAllMatches();

  // Only fetch summaries for finished matches (they have stats)
  const finished = matches.filter((m) => m.status === "post");
  // Fetch pickcenter for upcoming matches (upcoming + the first few finished)
  const withOdds = matches.filter((m) => m.status !== "post").slice(0, 40);

  // Fetch summaries in batches to be nice to ESPN
  const stats: EspnMatchStats[] = [];
  const pickcenters: EspnPickcenter[] = [];
  const BATCH_SIZE = 5;

  // Stats from finished matches
  for (let i = 0; i < finished.length; i += BATCH_SIZE) {
    const batch = finished.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((m) => fetchMatchSummary(m.eventId))
    );
    for (const r of results) {
      if (r) stats.push(r);
    }
    if (i + BATCH_SIZE < finished.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Pickcenter from upcoming + recent matches
  for (let i = 0; i < withOdds.length; i += BATCH_SIZE) {
    const batch = withOdds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((m) => fetchMatchPickcenter(m.eventId))
    );
    for (const r of results) {
      if (r) pickcenters.push(r);
    }
    if (i + BATCH_SIZE < withOdds.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return { matches, stats, pickcenters };
}
