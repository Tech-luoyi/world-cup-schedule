import type { TeamSquad, Player } from "../data/squads";
import {
  getSquad as duckGetSquad,
  getAllSquads as duckGetAllSquads,
  getSquadsByGroup as duckGetSquadsByGroup,
  getSquadsByContinent as duckGetSquadsByContinent,
  getFlag as duckGetFlag,
  getChineseName as duckGetChineseName,
  getContinent as duckGetContinent,
  isDuckDBReady,
} from "./duckdb";
import { getFlag as mapGetFlag, getChineseName as mapGetChineseName, getContinent as mapGetContinent } from "../data/teamMap";

export type { TeamSquad, Player };

/** Get squad for a single team by English name */
export async function getSquad(teamKey: string): Promise<TeamSquad | undefined> {
  if (isDuckDBReady()) return duckGetSquad(teamKey);
  const { squads } = await import("../data/squads");
  return squads.find((s) => s.teamKey === teamKey);
}

/** Get all squads */
export async function getAllSquads(): Promise<TeamSquad[]> {
  if (isDuckDBReady()) return duckGetAllSquads();
  const { squads } = await import("../data/squads");
  return squads;
}

/** Get squads grouped by group letter */
export async function getSquadsByGroup(): Promise<Record<string, TeamSquad[]>> {
  if (isDuckDBReady()) return duckGetSquadsByGroup();
  const { squads } = await import("../data/squads");
  const byGroup: Record<string, TeamSquad[]> = {};
  for (const s of squads) {
    if (!byGroup[s.group]) byGroup[s.group] = [];
    byGroup[s.group].push(s);
  }
  return byGroup;
}

/** Get squads grouped by continent */
export async function getSquadsByContinent(): Promise<Record<string, TeamSquad[]>> {
  if (isDuckDBReady()) return duckGetSquadsByContinent();
  const { squads } = await import("../data/squads");
  const byContinent: Record<string, TeamSquad[]> = {};
  for (const s of squads) {
    const con = mapGetContinent(s.teamKey);
    if (!byContinent[con]) byContinent[con] = [];
    byContinent[con].push(s);
  }
  // Sort each continent by FIFA rank
  for (const con of Object.keys(byContinent)) {
    byContinent[con].sort((a, b) => a.fifaRank - b.fifaRank);
  }
  return byContinent;
}

/** Get all unique detailed positions across all squads */
export function getAllPositions(): string[] {
  return ["门将", "左后卫", "中后卫", "右后卫", "后腰", "左中场", "右中场", "前腰", "左边锋", "中锋", "右边锋"];
}

/** Get continent for a country */
export function getContinent(countryName: string): string {
  if (isDuckDBReady()) return duckGetContinent(countryName);
  return mapGetContinent(countryName);
}
export function getGenericPosition(detailed: string): string {
  const map: Record<string, string> = {
    "门将": "门将",
    "左后卫": "后卫", "中后卫": "后卫", "右后卫": "后卫",
    "后腰": "中场", "左中场": "中场", "右中场": "中场", "前腰": "中场",
    "左边锋": "前锋", "中锋": "前锋", "右边锋": "前锋",
  };
  return map[detailed] || detailed;
}

/** Get flag - use DuckDB cache if ready, otherwise fall back to teamMap */
export function getFlag(countryName: string): string {
  if (isDuckDBReady()) return duckGetFlag(countryName);
  return mapGetFlag(countryName);
}

/** Get Chinese name - use DuckDB cache if ready, otherwise fall back to teamMap */
export function getChineseName(countryName: string): string {
  if (isDuckDBReady()) return duckGetChineseName(countryName);
  return mapGetChineseName(countryName);
}
