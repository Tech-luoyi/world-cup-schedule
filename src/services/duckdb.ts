import type { TeamSquad, Player } from '../data/squads';

// ── Sync caches (populated after DuckDB init) ──
let _teamCache: Record<string, { flag: string; name: string; continent: string }> | null = null;
let _venueCache: string[] | null = null;
let _venueMapCache: Record<number, number> | null = null;
let _fifaCodeMap: Record<string, string> | null = null;

// ── DuckDB instance (singleton) ──
let _db: any = null;
let _ready = false;
let _initPromise: Promise<void> | null = null;

/** Whether DuckDB has been fully initialized */
export function isDuckDBReady(): boolean {
  return _ready;
}

/** Wait for DuckDB initialization to complete */
export function waitForDuckDB(): Promise<void> {
  if (_ready) return Promise.resolve();
  if (_initPromise) return _initPromise;
  return Promise.reject(new Error('DuckDB not initialized'));
}

// ── Sync cache getters (available after DuckDB init) ──

export function getFlag(countryName: string): string {
  return _teamCache?.[countryName]?.flag ?? '🏳️';
}

export function getChineseName(countryName: string): string {
  return _teamCache?.[countryName]?.name ?? countryName;
}

/** Get Chinese name from a FIFA/ESPN abbreviation (e.g. "MEX" → "墨西哥") */
export function getChineseNameFromAbbr(abbr: string): string {
  if (!_fifaCodeMap) return abbr;
  const teamKey = _fifaCodeMap[abbr];
  if (!teamKey) return abbr;
  return getChineseName(teamKey);
}

export function getContinent(countryName: string): string {
  return _teamCache?.[countryName]?.continent ?? '其他';
}

export function getVenue(matchId: number): string {
  if (_venueMapCache && _venueCache) {
    const idx = _venueMapCache[matchId];
    if (idx !== undefined && idx >= 0 && idx < _venueCache.length) {
      return _venueCache[idx];
    }
  }
  if (!_venueCache || _venueCache.length === 0) return 'Unknown';
  return _venueCache[matchId % _venueCache.length];
}

// ── SQL escaping ──

function esc(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function escN(n: number | undefined | null): string {
  if (n === undefined || n === null) return 'NULL';
  return String(n);
}

// ── Initialization (lazy import duckdb-wasm) ──

let _duckdbModule: any = null;

export async function initDuckDB(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = _doInit();
  return _initPromise;
}

async function _doInit(): Promise<void> {
  const log = (msg: string) => console.log(`%c[DuckDB]%c ${msg}`, 'color:#FFD700', '');
  const errLog = (msg: string, e?: any) => {
    console.error(`%c[DuckDB]%c ${msg}`, 'color:#FF0055', '', e || '');
    (window as any).__duckdbError = { msg, error: e };
  };

  try {
    log('Importing duckdb-wasm module...');
    _duckdbModule = await import('@duckdb/duckdb-wasm');
    log(`Module loaded (version: ${_duckdbModule.PACKAGE_VERSION || '?'})`);

    // 1. Create bundles with absolute paths (worker runs on blob URL, needs absolute)
    const base = window.location.origin;
    const bundles: any = {
      mvp: {
        mainModule: `${base}/duckdb/duckdb-mvp.wasm`,
        mainWorker: `${base}/duckdb/duckdb-browser-mvp.worker.js`,
      },
      eh: {
        mainModule: `${base}/duckdb/duckdb-eh.wasm`,
        mainWorker: `${base}/duckdb/duckdb-browser-eh.worker.js`,
      },
    };

    log('Selecting bundle...');
    const bundle = await _duckdbModule.selectBundle(bundles);
    log(`Selected: ${bundle.mainWorker}`);

    log('Creating worker...');
    const worker = await _duckdbModule.createWorker(bundle.mainWorker!);
    log('Worker created');

    const logger = new _duckdbModule.VoidLogger();
    _db = new _duckdbModule.AsyncDuckDB(logger, worker);

    log('Instantiating WASM (this may take a moment)...');
    await _db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    log('WASM instantiated');

    log('Opening database...');
    await _db.open({
      path: ':memory:',
      accessMode: _duckdbModule.DuckDBAccessMode.READ_WRITE,
    });
    log('Database opened');

    // 2. Create tables
    let conn = await _db.connect();
    await conn.query(`CREATE TABLE teams (
      team_key VARCHAR PRIMARY KEY,
      name_cn VARCHAR,
      flag VARCHAR,
      group_letter VARCHAR,
      fifa_code VARCHAR,
      fifa_rank INTEGER,
      coach VARCHAR,
      coach_cn VARCHAR
    )`);
    await conn.query(`CREATE TABLE players (
      team_key VARCHAR,
      name VARCHAR,
      name_en VARCHAR,
      position VARCHAR,
      detailed_position VARCHAR,
      market_value_euro INTEGER,
      number INTEGER,
      club VARCHAR,
      age INTEGER,
      caps INTEGER,
      goals INTEGER
    )`);
    await conn.query(`CREATE TABLE venues (
      id INTEGER PRIMARY KEY,
      name VARCHAR
    )`);
    // ESPN match data
    await conn.query(`CREATE TABLE IF NOT EXISTS espn_matches (
      event_id INTEGER PRIMARY KEY,
      date VARCHAR,
      utc_date VARCHAR,
      home_team_key VARCHAR,
      away_team_key VARCHAR,
      home_abbr VARCHAR,
      away_abbr VARCHAR,
      home_score INTEGER,
      away_score INTEGER,
      home_record VARCHAR,
      away_record VARCHAR,
      status VARCHAR,
      status_detail VARCHAR
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS match_stats (
      event_id INTEGER,
      team_key VARCHAR,
      team_abbr VARCHAR,
      possession_pct DOUBLE,
      total_shots INTEGER,
      shots_on_target INTEGER,
      saves INTEGER,
      fouls_committed INTEGER,
      yellow_cards INTEGER,
      red_cards INTEGER,
      offsides INTEGER,
      corners INTEGER,
      accurate_passes INTEGER,
      total_passes INTEGER,
      pass_pct DOUBLE,
      accurate_crosses INTEGER,
      total_crosses INTEGER,
      cross_pct DOUBLE,
      blocked_shots INTEGER,
      effective_tackles INTEGER,
      total_tackles INTEGER,
      tackle_pct DOUBLE,
      interceptions INTEGER,
      effective_clearance INTEGER,
      total_clearance INTEGER,
      PRIMARY KEY (event_id, team_key)
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS espn_pickcenters (
      event_id INTEGER PRIMARY KEY,
      provider VARCHAR,
      home_money_line INTEGER,
      away_money_line INTEGER,
      draw_money_line INTEGER,
      spread DOUBLE,
      home_spread_odds DOUBLE,
      away_spread_odds DOUBLE,
      over_under DOUBLE,
      over_odds DOUBLE,
      under_odds DOUBLE,
      details VARCHAR
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS odds_data (
      event_id INTEGER NOT NULL,
      source VARCHAR NOT NULL,
      bookmaker_key VARCHAR,
      bookmaker_title VARCHAR,
      market_type VARCHAR NOT NULL,
      home_price DOUBLE,
      away_price DOUBLE,
      draw_price DOUBLE,
      handicap DOUBLE,
      over_under DOUBLE,
      over_price DOUBLE,
      under_price DOUBLE,
      fetched_at BIGINT NOT NULL
    )`);
    await conn.close();
    log('Tables created (incl. ESPN match_stats, odds_data)');

    // 3. Load data from static files
    const { teamMap } = await import('../data/teamMap');
    const { STADIUMS } = await import('../data/venues');
    const { squads } = await import('../data/squads');

    // Insert teams (batch)
    conn = await _db.connect();
    const teamRows: string[] = [];
    for (const s of squads) {
      const info = teamMap[s.teamKey] || { flag: '🏳️', name: s.teamCn };
      teamRows.push(
        `(${esc(s.teamKey)},${esc(s.teamCn)},${esc(info.flag)},${esc(s.group)},${esc(s.fifaCode)},${s.fifaRank},${esc(s.coach)},${esc(s.coachCn)})`
      );
    }
    await conn.query(`INSERT INTO teams VALUES ${teamRows.join(',')}`);
    await conn.close();
    log(`Inserted ${teamRows.length} teams`);

    // Insert players (batch)
    conn = await _db.connect();
    const playerRows: string[] = [];
    for (const s of squads) {
      for (const p of s.players) {
        playerRows.push(
          `(${esc(s.teamKey)},${esc(p.name)},${esc(p.nameEn)},${esc(p.position)},${esc(p.detailedPosition)},${p.marketValueEuro},${p.number},${esc(p.club)},${p.age},${escN(p.caps)},${escN(p.goals)})`
        );
      }
    }
    await conn.query(`INSERT INTO players VALUES ${playerRows.join(',')}`);
    await conn.close();
    log(`Inserted ${playerRows.length} players`);

    // Insert venues (batch)
    conn = await _db.connect();
    const venueRows = STADIUMS.map((name: string, i: number) => `(${i},${esc(name)})`);
    await conn.query(`INSERT INTO venues VALUES ${venueRows.join(',')}`);
    await conn.close();
    log(`Inserted ${venueRows.length} venues`);

    // 4. Build sync caches
    const { VENUE_MAP } = await import('../data/venues');
    _teamCache = { ...teamMap };
    _venueCache = [...STADIUMS];
    _venueMapCache = { ...VENUE_MAP };
    // fifaCode (e.g. "JPN") → teamKey (e.g. "Japan")
    _fifaCodeMap = {};
    for (const s of squads) {
      _fifaCodeMap[s.fifaCode] = s.teamKey;
    }

    _ready = true;

    // Start ESPN sync immediately (sets _syncPromise synchronously)
    syncEspnData().catch((e) => errLog('Auto-sync failed', e));

    // Expose DuckDB to dev console for inspection
    exposeToWindow();
    console.log(
      '%c🐤 DuckDB Ready %c| %cteams: 48 %c| %cplayers: ~1100 %c| %cvenues: 16',
      'color:#FFD700;font-weight:bold',
      '',
      'color:#0f0',
      '',
      'color:#0f0',
      '',
      'color:#0f0'
    );
    console.log('%c💡 Try: %cwindow.__duckdb.query("SELECT * FROM teams")',
      '',
      'color:#888;font-style:italic'
    );
  } catch (err) {
    errLog('Init failed', err);
    _initPromise = null;
    throw err;
  }
}

// ── Squad queries (async, use prepared statements) ──

export async function getSquad(teamKey: string): Promise<TeamSquad | undefined> {
  if (!_db) throw new Error('DuckDB not initialized');
  const conn = await _db.connect();
  try {
    const stmt = await conn.prepare('SELECT * FROM teams WHERE team_key = $1');
    const teamResult = await stmt.query(teamKey);
    await stmt.close();
    const teams = teamResult.toArray() as any[];
    if (teams.length === 0) return undefined;
    const t = teams[0];

    const pStmt = await conn.prepare('SELECT * FROM players WHERE team_key = $1 ORDER BY number');
    const playerResult = await pStmt.query(teamKey);
    await pStmt.close();
    const rows = playerResult.toArray() as any[];

    return {
      teamKey: t.team_key,
      teamCn: t.name_cn,
      flag: t.flag,
      group: t.group_letter,
      fifaCode: t.fifa_code,
      fifaRank: t.fifa_rank,
      coach: t.coach,
      coachCn: t.coach_cn,
      players: rows.map((p: any) => ({
        name: p.name, nameEn: p.name_en,
        position: p.position, detailedPosition: p.detailed_position,
        marketValueEuro: p.market_value_euro,
        number: p.number, club: p.club, age: p.age,
        caps: p.caps ?? undefined, goals: p.goals ?? undefined,
      })),
    };
  } finally {
    await conn.close();
  }
}

export async function getAllSquads(): Promise<TeamSquad[]> {
  if (!_db) throw new Error('DuckDB not initialized');
  const conn = await _db.connect();
  try {
    const teamResult = await conn.query('SELECT * FROM teams ORDER BY group_letter, team_key');
    const teams = teamResult.toArray() as any[];

    const playerResult = await conn.query('SELECT * FROM players ORDER BY team_key, number');
    const allPlayers = playerResult.toArray() as any[];

    const byTeam: Record<string, Player[]> = {};
    for (const p of allPlayers) {
      if (!byTeam[p.team_key]) byTeam[p.team_key] = [];
      byTeam[p.team_key].push({
        name: p.name, nameEn: p.name_en,
        position: p.position, detailedPosition: p.detailed_position,
        marketValueEuro: p.market_value_euro,
        number: p.number, club: p.club, age: p.age,
        caps: p.caps ?? undefined, goals: p.goals ?? undefined,
      });
    }

    return teams.map((t: any) => ({
      teamKey: t.team_key,
      teamCn: t.name_cn,
      flag: t.flag,
      group: t.group_letter,
      fifaCode: t.fifa_code,
      fifaRank: t.fifa_rank,
      coach: t.coach,
      coachCn: t.coach_cn,
      players: byTeam[t.team_key] || [],
    }));
  } finally {
    await conn.close();
  }
}

export async function getSquadsByGroup(): Promise<Record<string, TeamSquad[]>> {
  const all = await getAllSquads();
  const byGroup: Record<string, TeamSquad[]> = {};
  for (const s of all) {
    if (!byGroup[s.group]) byGroup[s.group] = [];
    byGroup[s.group].push(s);
  }
  return byGroup;
}

export async function getSquadsByContinent(): Promise<Record<string, TeamSquad[]>> {
  const all = await getAllSquads();
  const byContinent: Record<string, TeamSquad[]> = {};
  for (const s of all) {
    const con = _teamCache?.[s.teamKey]?.continent ?? '其他';
    if (!byContinent[con]) byContinent[con] = [];
    byContinent[con].push(s);
  }
  for (const con of Object.keys(byContinent)) {
    byContinent[con].sort((a, b) => a.fifaRank - b.fifaRank);
  }
  return byContinent;
}

// ── Dev console inspection ──

function exposeToWindow() {
  const win = window as any;
  win.__duckdb = {
    ready: true,
    /** Run a SQL query and return results as plain objects */
    async query(sql: string) {
      if (!_db) throw new Error('DuckDB not initialized');
      const conn = await _db.connect();
      try {
        const result = await conn.query(sql);
        return result.toArray();
      } finally {
        await conn.close();
      }
    },
    /** Get table names */
    async tables() {
      const rows = await win.__duckdb.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
      );
      return rows.map((r: any) => r.table_name);
    },
    /** Count rows in a table */
    async count(table: string) {
      const rows = await win.__duckdb.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
      return rows[0]?.cnt;
    },
    /** Trigger ESPN data sync */
    async syncEspn() {
      const result = await syncEspnData();
      console.log(`Synced: ${result.matches} matches, ${result.stats} stats`);
      return result;
    },
  };
}

// ── ESPN data sync ──

let _syncing = false;
let _lastSync = 0;
let _syncPromise: Promise<{ matches: number; stats: number; pickcenters: number }> | null = null;

/** Wait for the current or next ESPN sync to complete */
export async function waitForSyncCompletion(): Promise<void> {
  if (_syncPromise) await _syncPromise;
}

/** Sync ESPN match data into DuckDB. Safe to call multiple times. */
export async function syncEspnData(): Promise<{ matches: number; stats: number; pickcenters: number }> {
  if (!_db) throw new Error('DuckDB not initialized');
  if (_syncing) {
    if (_syncPromise) return _syncPromise;
    return { matches: 0, stats: 0, pickcenters: 0 };
  }
  _syncing = true;

  _syncPromise = (async () => {
    try {
      const { syncAll } = await import('./espn');
      const { matches, stats, pickcenters } = await syncAll();
      const conn = await _db.connect();
      try {
        // Replace match data — only delete if we have new data
        const matchRows: string[] = [];
        for (const m of matches) {
          const homeKey = _fifaCodeMap?.[m.homeAbbr] ?? m.homeAbbr;
          const awayKey = _fifaCodeMap?.[m.awayAbbr] ?? m.awayAbbr;
          matchRows.push(
            `(${m.eventId},${esc(m.date)},${esc(m.utcDate)},${esc(homeKey)},${esc(awayKey)},${esc(m.homeAbbr)},${esc(m.awayAbbr)},` +
            `${escN(m.homeScore)},${escN(m.awayScore)},${esc(m.homeRecord)},${esc(m.awayRecord)},${esc(m.status)},${esc(m.statusDetail)})`
          );
        }
        if (matchRows.length > 0) {
          await conn.query('DELETE FROM espn_matches');
          await conn.query(`INSERT INTO espn_matches VALUES ${matchRows.join(',')}`);
        }

        // Replace stats data — only delete if we have new data
        const statRows: string[] = [];
        for (const s of stats) {
          const homeKey = _fifaCodeMap?.[s.home.abbr] ?? s.home.abbr;
          const awayKey = _fifaCodeMap?.[s.away.abbr] ?? s.away.abbr;
          const toRow = (eventId: number, teamKey: string, abbr: string, t: any) =>
            `(${eventId},${esc(teamKey)},${esc(abbr)},` +
            `${t.possessionPct},${t.totalShots},${t.shotsOnTarget},${t.saves},` +
            `${t.foulsCommitted},${t.yellowCards},${t.redCards},${t.offsides},${t.corners},` +
            `${t.accuratePasses},${t.totalPasses},${t.passPct},` +
            `${t.accurateCrosses},${t.totalCrosses},${t.crossPct},` +
            `${t.blockedShots},${t.effectiveTackles},${t.totalTackles},${t.tacklePct},` +
            `${t.interceptions},${t.effectiveClearance},${t.totalClearance})`;
          statRows.push(toRow(s.eventId, homeKey, s.home.abbr, s.home));
          statRows.push(toRow(s.eventId, awayKey, s.away.abbr, s.away));
        }
        if (statRows.length > 0) {
          await conn.query('DELETE FROM match_stats');
          await conn.query(`INSERT INTO match_stats VALUES ${statRows.join(',')}`);
        }

        // Replace pickcenter data — only delete if we have new data
        const pcRows: string[] = [];
        for (const p of pickcenters) {
          pcRows.push(
            `(${p.eventId},${esc(p.provider)},` +
            `${p.homeMoneyLine},${p.awayMoneyLine},${escN(p.drawMoneyLine)},${p.spread},` +
            `${p.homeSpreadOdds},${p.awaySpreadOdds},${p.overUnder},` +
            `${p.overOdds},${p.underOdds},${esc(p.details)})`
          );
        }
        if (pcRows.length > 0) {
          await conn.query('DELETE FROM espn_pickcenters');
          await conn.query(`INSERT INTO espn_pickcenters VALUES ${pcRows.join(',')}`);
        }
      } finally {
        await conn.close();
      }

      _lastSync = Date.now();
      console.log(
        `%c[ESPN]%c Synced ${matches.length} matches, ${stats.length} stats, ${pickcenters.length} odds`,
        'color:#00BFFF', ''
      );
      return { matches: matches.length, stats: stats.length, pickcenters: pickcenters.length };
    } catch (err) {
      console.error('%c[ESPN]%c Sync failed:', 'color:#FF0055', '', err);
      return { matches: 0, stats: 0, pickcenters: 0 };
    } finally {
      _syncing = false;
    }
  })();

  return _syncPromise;
}

/** Get the last sync timestamp (ms since epoch) */
export function getLastSyncTime(): number {
  return _lastSync;
}

/** Whether a sync is currently in progress */
export function isSyncing(): boolean {
  return _syncing;
}

// ── The Odds API sync ──

let _oddsSyncing = false;
let _oddsSyncPromise: Promise<number> | null = null;

/** Sync odds data from The Odds API into DuckDB */
export async function syncOddsData(): Promise<number> {
  if (!_db) throw new Error('DuckDB not initialized');
  if (_oddsSyncing) {
    if (_oddsSyncPromise) return _oddsSyncPromise;
    return 0;
  }
  _oddsSyncing = true;

  _oddsSyncPromise = (async () => {
    try {
      const { fetchAllOdds, flattenOdds } = await import('./odds');
      const events = await fetchAllOdds();
      if (events.length === 0) return 0;

      const rows = flattenOdds(events);
      if (rows.length === 0) return 0;

      // Match odds events to ESPN events by team name
      const conn = await _db.connect();
      try {
        // Clear previous data
        await conn.query('DELETE FROM odds_data');
        let inserted = 0;

        for (const r of rows) {
          const matchResult = await conn.query(
            `SELECT event_id FROM espn_matches WHERE home_team_key = ${esc(r.homeTeam)} AND away_team_key = ${esc(r.awayTeam)} LIMIT 1`
          );
          const matchArr = matchResult.toArray();
          if (matchArr.length === 0) continue; // no matching ESPN event

          const eventId = (matchArr[0] as any).event_id;
          await conn.query(
            `INSERT INTO odds_data VALUES (${eventId},${esc('the_odds_api')},${esc(r.bookmakerKey)},${esc(r.bookmakerTitle)},` +
            `${esc(r.marketKey)},${escN(r.homePrice)},${escN(r.awayPrice)},${escN(r.drawPrice)},` +
            `${escN(r.handicap)},${escN(r.overUnder)},${escN(r.overPrice)},${escN(r.underPrice)},${r.timestamp})`
          );
          inserted++;
        }

        console.log(
          `%c[OddsAPI]%c Synced ${inserted} rows from ${rows.length} flattened, ${events.length} events`,
          'color:#FF8C00', ''
        );
        return inserted;
      } finally {
        await conn.close();
      }
    } catch (err) {
      console.error('%c[OddsAPI]%c Sync failed:', 'color:#FF0055', '', err);
      return 0;
    } finally {
      _oddsSyncing = false;
    }
  })();

  return _oddsSyncPromise;
}

/** Get all bookmaker rows for a given event_id */
export async function getOddsForEvent(eventId: number): Promise<any[]> {
  if (!_db) return [];
  const conn = await _db.connect();
  try {
    const result = await conn.query(
      `SELECT * FROM odds_data WHERE event_id = ${eventId} ORDER BY bookmaker_title, market_type`
    );
    return result.toArray();
  } catch {
    return [];
  } finally {
    await conn.close();
  }
}

/** Batch fetch odds for multiple events — much faster than calling getOddsForEvent in a loop */
export async function getOddsForEvents(eventIds: number[]): Promise<any[]> {
  if (!_db || eventIds.length === 0) return [];
  const conn = await _db.connect();
  try {
    const ids = eventIds.join(",");
    const result = await conn.query(
      `SELECT * FROM odds_data WHERE event_id IN (${ids}) ORDER BY event_id, bookmaker_title, market_type`
    );
    return result.toArray();
  } catch {
    return [];
  } finally {
    await conn.close();
  }
}

// ── Prediction page query helpers ──

export interface EspnMatchWithOdds {
  eventId: number;
  date: string;
  utcDate: string;
  homeTeamKey: string;
  awayTeamKey: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
  homeRecord: string;
  awayRecord: string;
  status: string;
  statusDetail: string;
  homeMoneyLine: number | null;
  awayMoneyLine: number | null;
  drawMoneyLine: number | null;
  spread: number | null;
  homeSpreadOdds: number | null;
  awaySpreadOdds: number | null;
  overUnder: number | null;
  overOdds: number | null;
  underOdds: number | null;
  details: string | null;
}

export async function getEspnMatchesWithOdds(): Promise<EspnMatchWithOdds[]> {
  if (!_db) throw new Error('DuckDB not initialized');
  const conn = await _db.connect();
  try {
    const result = await conn.query(`
      SELECT m.*, p.home_money_line, p.away_money_line, p.draw_money_line, p.spread,
             p.home_spread_odds, p.away_spread_odds, p.over_under,
             p.over_odds, p.under_odds, p.details
      FROM espn_matches m
      LEFT JOIN espn_pickcenters p ON m.event_id = p.event_id
      ORDER BY m.utc_date ASC
    `);
    const rows = result.toArray() as any[];
    return rows.map((r) => ({
      eventId: r.event_id,
      date: r.date,
      utcDate: r.utc_date,
      homeTeamKey: r.home_team_key,
      awayTeamKey: r.away_team_key,
      homeAbbr: r.home_abbr,
      awayAbbr: r.away_abbr,
      homeScore: r.home_score,
      awayScore: r.away_score,
      homeRecord: r.home_record,
      awayRecord: r.away_record,
      status: r.status,
      statusDetail: r.status_detail,
      homeMoneyLine: r.home_money_line,
      awayMoneyLine: r.away_money_line,
      drawMoneyLine: r.draw_money_line ?? null,
      spread: r.spread,
      homeSpreadOdds: r.home_spread_odds,
      awaySpreadOdds: r.away_spread_odds,
      overUnder: r.over_under,
      overOdds: r.over_odds,
      underOdds: r.under_odds,
      details: r.details,
    }));
  } finally {
    await conn.close();
  }
}

export interface TeamStatsRanking {
  teamAbbr: string;
  matchesPlayed: number;
  avgPossession: number;
  avgShots: number;
  avgShotsOnTarget: number;
  avgSaves: number;
  avgFouls: number;
  avgYellowCards: number;
  avgCorners: number;
  passPct: number;
  avgAccuratePasses: number;
  avgTackles: number;
  avgInterceptions: number;
  avgClearance: number;
}

export async function getTeamStatsRankings(): Promise<TeamStatsRanking[]> {
  if (!_db) throw new Error('DuckDB not initialized');
  const conn = await _db.connect();
  try {
    const result = await conn.query(`
      SELECT
        team_abbr,
        COUNT(*) AS matches_played,
        AVG(possession_pct) AS avg_possession,
        AVG(total_shots) AS avg_shots,
        AVG(shots_on_target) AS avg_sot,
        AVG(saves) AS avg_saves,
        AVG(fouls_committed) AS avg_fouls,
        AVG(yellow_cards) AS avg_yellow,
        AVG(corners) AS avg_corners,
        AVG(pass_pct) AS avg_pass_pct,
        AVG(accurate_passes) AS avg_acc_passes,
        AVG(total_tackles) AS avg_tackles,
        AVG(interceptions) AS avg_int,
        AVG(effective_clearance) AS avg_clear
      FROM match_stats
      GROUP BY team_abbr
      ORDER BY avg_possession DESC
    `);
    const rows = result.toArray() as any[];
    return rows.map((r) => ({
      teamAbbr: r.team_abbr,
      matchesPlayed: r.matches_played,
      avgPossession: Math.round(r.avg_possession * 10) / 10,
      avgShots: Math.round(r.avg_shots * 10) / 10,
      avgShotsOnTarget: Math.round(r.avg_sot * 10) / 10,
      avgSaves: Math.round(r.avg_saves * 10) / 10,
      avgFouls: Math.round(r.avg_fouls * 10) / 10,
      avgYellowCards: Math.round(r.avg_yellow * 10) / 10,
      avgCorners: Math.round(r.avg_corners * 10) / 10,
      passPct: Math.round(r.avg_pass_pct * 1000) / 10,
      avgAccuratePasses: Math.round(r.avg_acc_passes),
      avgTackles: Math.round(r.avg_tackles * 10) / 10,
      avgInterceptions: Math.round(r.avg_int * 10) / 10,
      avgClearance: Math.round(r.avg_clear * 10) / 10,
    }));
  } finally {
    await conn.close();
  }
}

export async function getEspnMatchStatsCount(): Promise<number> {
  if (!_db) return 0;
  const conn = await _db.connect();
  try {
    const result = await conn.query('SELECT COUNT(*) AS cnt FROM match_stats');
    const rows = result.toArray() as any[];
    return rows[0]?.cnt ?? 0;
  } catch {
    return 0;
  } finally {
    await conn.close();
  }
}
