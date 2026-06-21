import type { Match, SmachMatch } from "../types/match";
import { getFlag as duckGetFlag, getChineseName as duckGetChineseName, getVenue as duckGetVenue, isDuckDBReady } from "./duckdb";
import { getFlag, getChineseName } from "../data/teamMap";
import { getVenue } from "../data/venues";

// Use DuckDB cache if ready, otherwise fall back to original data modules
function getFlagFn(name: string): string {
  if (isDuckDBReady()) return duckGetFlag(name);
  return getFlag(name);
}

function getChineseNameFn(name: string): string {
  if (isDuckDBReady()) return duckGetChineseName(name);
  return getChineseName(name);
}

function getVenueFn(matchId: number): string {
  if (isDuckDBReady()) return duckGetVenue(matchId);
  return getVenue(matchId);
}

const API_URL =
  "https://smach.github.io/worldcup26/data/chat_data.json";

// 固定 UTC+8 (北京时间)
const TIMEZONE = "Asia/Shanghai";

function fakeHeat(match: SmachMatch): number {
  const base =
    match.stage === "FINAL" ? 95 :
    match.stage === "SEMI_FINALS" ? 88 :
    match.stage === "QUARTER_FINALS" ? 78 :
    match.stage === "ROUND_OF_16" ? 65 :
    match.stage === "ROUND_OF_32" ? 50 :
    35;
  const scoreBonus = match.is_finished ? 20 : match.is_today ? 25 : 0;
  return Math.min(99, base + scoreBonus + Math.floor(Math.random() * 10));
}

function fakeDiscussion(match: SmachMatch): number {
  const base =
    match.stage === "FINAL" ? 450000 :
    match.stage === "SEMI_FINALS" ? 280000 :
    match.stage === "QUARTER_FINALS" ? 150000 :
    match.stage === "ROUND_OF_16" ? 80000 :
    match.stage === "ROUND_OF_32" ? 40000 :
    20000;
  const multiplier = match.is_finished ? 1.5 : match.is_today ? 1.3 : 1;
  return Math.floor(base * multiplier + Math.random() * 10000);
}

function mapStatus(status: string): "upcoming" | "live" | "finished" {
  if (status === "FINISHED" || status === "AWARDED") return "finished";
  if (status === "LIVE" || status === "IN_PLAY" || status === "PAUSED") return "live";
  return "upcoming";
}

// 从 UTC ISO 时间解析出北京时间的 date ("2026-06-21") 和 time ("01:00")
function formatBeijingTime(utcDateStr: string): { date: string; time: string } {
  const d = new Date(utcDateStr + "Z");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const vals: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") vals[p.type] = p.value;
  }
  return {
    date: `${vals.year}-${vals.month}-${vals.day}`,
    time: `${vals.hour}:${vals.minute}`,
  };
}

export function transformMatch(raw: SmachMatch): Match {
  const beijing = formatBeijingTime(raw.utc_date);
  return {
    id: String(raw.match_id),
    utcTimestamp: raw.utc_date,
    date: beijing.date,
    time: beijing.time,
    homeTeam: getChineseNameFn(raw.home_team),
    awayTeam: getChineseNameFn(raw.away_team),
    homeTeamKey: raw.home_team,
    awayTeamKey: raw.away_team,
    homeFlag: getFlagFn(raw.home_team),
    awayFlag: getFlagFn(raw.away_team),
    homeScore: raw.home_score ?? undefined,
    awayScore: raw.away_score ?? undefined,
    status: mapStatus(raw.status),
    venue: raw.venue || getVenueFn(raw.match_id),
    heatIndex: fakeHeat(raw),
    discussionCount: fakeDiscussion(raw),
    stage: raw.stage_label,
    groupLetter: raw.group_letter ?? undefined,
  };
}

export async function fetchMatches(): Promise<{
  matches: Match[];
  error?: string;
}> {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw: SmachMatch[] = await res.json();
    const matches = raw.map(transformMatch);
    matches.sort((a, b) => {
      const da = new Date(`${a.utcTimestamp}Z`).getTime();
      const db = new Date(`${b.utcTimestamp}Z`).getTime();
      return da - db;
    });
    return { matches };
  } catch (e) {
    return {
      matches: [],
      error: e instanceof Error ? e.message : "Failed to fetch match data",
    };
  }
}
