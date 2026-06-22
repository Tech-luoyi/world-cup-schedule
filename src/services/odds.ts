// The Odds API client
// Docs: https://the-odds-api.com
//
// In production (GitHub Pages) use VITE_ODDS_PROXY_URL to avoid exposing the API key.
// The proxy is a Cloudflare Worker that holds the key as a secret.
// In local dev, falls back to VITE_ODDS_API_KEY for convenience.

const DIRECT_BASE = "https://api.the-odds-api.com/v4";

export interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

export interface OddsMarket {
  key: string;        // "h2h" | "spreads" | "totals"
  last_update: string;
  outcomes: OddsOutcome[];
}

export interface OddsBookmaker {
  key: string;        // "bet365", "pinnacle"
  title: string;      // "Bet365", "Pinnacle"
  last_update: string;
  markets: OddsMarket[];
}

export interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

export interface OddsDataRow {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmakerKey: string;
  bookmakerTitle: string;
  marketKey: string;
  homePrice: number | null;
  awayPrice: number | null;
  drawPrice: number | null;
  handicap: number | null;
  overUnder: number | null;
  overPrice: number | null;
  underPrice: number | null;
  timestamp: number;
}

function getApiKey(): string | null {
  return import.meta.env.VITE_ODDS_API_KEY || null;
}

function getProxyUrl(): string | null {
  return import.meta.env.VITE_ODDS_PROXY_URL || null;
}

/** Fetch all markets (h2h, spreads, totals) for World Cup from The Odds API */
export async function fetchAllOdds(): Promise<OddsEvent[]> {
  const proxyUrl = getProxyUrl();
  const key = getApiKey();

  if (!proxyUrl && !key) {
    console.warn("[OddsAPI] No VITE_ODDS_PROXY_URL or VITE_ODDS_API_KEY configured — skipping odds fetch");
    return [];
  }

  const regions = "uk,eu,us";
  const markets = "h2h,spreads,totals";
  const query = `regions=${regions}&markets=${markets}&oddsFormat=american`;
  const path = `/sports/soccer_fifa_world_cup/odds/`;

  let url: string;
  if (proxyUrl) {
    // Use proxy (Cloudflare Worker) — apiKey added server-side, never in client
    url = `${proxyUrl}${path}?${query}`;
  } else {
    // Local dev fallback: direct call with env var
    url = `${DIRECT_BASE}${path}?apiKey=${key}&${query}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[OddsAPI] HTTP ${res.status}`, await res.text());
      return [];
    }
    const data: OddsEvent[] = await res.json();
    console.log(`[OddsAPI] Fetched ${data.length} events with odds`);
    return data;
  } catch (e) {
    console.error("[OddsAPI] Fetch failed:", e);
    return [];
  }
}

/** Flatten OddsEvent[] into rows for DB storage */
export function flattenOdds(events: OddsEvent[]): OddsDataRow[] {
  const rows: OddsDataRow[] = [];
  const now = Date.now();

  for (const ev of events) {
    for (const bm of ev.bookmakers) {
      for (const mkt of bm.markets) {
        const row: OddsDataRow = {
          eventId: ev.id,
          homeTeam: ev.home_team,
          awayTeam: ev.away_team,
          commenceTime: ev.commence_time,
          bookmakerKey: bm.key,
          bookmakerTitle: bm.title,
          marketKey: mkt.key,
          homePrice: null,
          awayPrice: null,
          drawPrice: null,
          handicap: null,
          overUnder: null,
          overPrice: null,
          underPrice: null,
          timestamp: now,
        };

        for (const o of mkt.outcomes) {
          if (mkt.key === "h2h") {
            if (o.name === ev.home_team) row.homePrice = o.price;
            else if (o.name === ev.away_team) row.awayPrice = o.price;
            else row.drawPrice = o.price;
          } else if (mkt.key === "spreads") {
            if (o.name === ev.home_team) {
              row.homePrice = o.price;
              row.handicap = o.point ?? null;
            } else {
              row.awayPrice = o.price;
              if (row.handicap == null) row.handicap = o.point ?? null;
            }
          } else if (mkt.key === "totals") {
            if (o.name === "Over") {
              row.overPrice = o.price;
              row.overUnder = o.point ?? null;
            } else {
              row.underPrice = o.price;
              if (row.overUnder == null) row.overUnder = o.point ?? null;
            }
          }
        }
        rows.push(row);
      }
    }
  }
  return rows;
}
