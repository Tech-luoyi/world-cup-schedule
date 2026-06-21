import type { TeamSquad, Player } from '../data/squads';

// ── Sync caches (populated after DuckDB init) ──
let _teamCache: Record<string, { flag: string; name: string; continent: string }> | null = null;
let _venueCache: string[] | null = null;
let _venueMapCache: Record<number, number> | null = null;

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

    const logger = new _duckdbModule.ConsoleLogger();
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
    await conn.close();
    log('Tables created');

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

    _ready = true;

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
  };
}
