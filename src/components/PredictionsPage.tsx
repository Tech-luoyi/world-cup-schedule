import { useState, useEffect, useMemo, useRef } from "react";
import { waitForDuckDB, waitForSyncCompletion, getEspnMatchesWithOdds, getTeamStatsRankings, getEspnMatchStatsCount, syncEspnData, syncOddsData, getOddsForEvents, getChineseNameFromAbbr } from "../services/duckdb";
import type { EspnMatchWithOdds, TeamStatsRanking } from "../services/duckdb";
import { americanToProb, americanToDecimal } from "../services/espn";
import { fetchChinaLotteryOdds } from "../services/chinaLottery";
import type { ChinaLotteryOdds } from "../services/chinaLottery";
import BettingSimulation from "./BettingSimulation";
import { computeElo } from "../services/elo";
import type { EloRating } from "../services/elo";

// ── Helpers ──

function formatUtc(utc: string): string {
  try {
    const d = new Date(utc);
    return d.toLocaleString("zh-CN", {
      month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "Asia/Shanghai",
    });
  } catch {
    return utc;
  }
}

function moneylineBar3way(homeML: number, drawML: number | null, awayML: number): { home: number; draw: number; away: number } {
  const homeP = americanToProb(homeML);
  const awayP = americanToProb(awayML);
  const drawP = drawML != null ? americanToProb(drawML) : 0;
  const total = homeP + awayP + drawP;
  if (total <= 0) return { home: 34, draw: 32, away: 34 };
  return { home: Math.round((homeP / total) * 100), draw: Math.round((drawP / total) * 100), away: Math.round((awayP / total) * 100) };
}

function formatOdds(val: number | null): string {
  if (val === null || val === 0) return "-";
  return val > 0 ? `+${val}` : `${val}`;
}

// ── Border particle effect for highlight ──

function ParticleBurst() {
  const particles = useMemo(() => {
    const items: { left: string; top: string; tx: number; ty: number; size: number; color: string; delay: number }[] = [];
    const perEdge = 20;
    const edges = ['top', 'right', 'bottom', 'left'] as const;
    for (const edge of edges) {
      for (let i = 0; i < perEdge; i++) {
        const t = (i + Math.random() * 0.6) / perEdge;
        let left: string, top: string, tx: number, ty: number;
        switch (edge) {
          case 'top':
            left = `${t * 100}%`; top = '0';
            tx = (Math.random() - 0.5) * 50;
            ty = 15 + Math.random() * 35;
            break;
          case 'bottom':
            left = `${t * 100}%`; top = '100%';
            tx = (Math.random() - 0.5) * 50;
            ty = -(15 + Math.random() * 35);
            break;
          case 'left':
            left = '0'; top = `${t * 100}%`;
            tx = 15 + Math.random() * 35;
            ty = (Math.random() - 0.5) * 50;
            break;
          case 'right':
            left = '100%'; top = `${t * 100}%`;
            tx = -(15 + Math.random() * 35);
            ty = (Math.random() - 0.5) * 50;
            break;
        }
        items.push({
          left, top, tx, ty,
          size: 2 + Math.random() * 3,
          color: Math.random() > 0.25 ? '#00FF41' : '#AAFFAA',
          delay: Math.random() * 0.4,
        });
      }
    }
    return items;
  }, []);

  return (
    <div className="absolute inset-0 overflow-visible pointer-events-none z-10">
      {particles.map((p, i) => (
        <div
          key={i}
          className="particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size + 1}px ${p.color}`,
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            animationDelay: `${p.delay}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/** Aggregate h2h odds from multiple bookmakers into true probabilities (juice removed) */
function aggregateOddsProbabilities(oddsRows: any[]): {
  homeProb: number;
  drawProb: number;
  awayProb: number;
  bookmakerCount: number;
} | null {
  const h2hRows = oddsRows.filter((r: any) => r.market_type === 'h2h');
  if (h2hRows.length === 0) return null;

  let totalHome = 0, totalDraw = 0, totalAway = 0;
  let count = 0;

  for (const r of h2hRows) {
    if (r.home_price == null || r.away_price == null || r.draw_price == null) continue;
    const hp = americanToProb(r.home_price);
    const dp = americanToProb(r.draw_price);
    const ap = americanToProb(r.away_price);
    const sum = hp + dp + ap;
    if (sum <= 0) continue;
    // Remove overround (juice) per bookmaker, then sum
    totalHome += hp / sum;
    totalDraw += dp / sum;
    totalAway += ap / sum;
    count++;
  }

  if (count === 0) return null;

  return {
    homeProb: Math.round((totalHome / count) * 100),
    drawProb: Math.round((totalDraw / count) * 100),
    awayProb: Math.round((totalAway / count) * 100),
    bookmakerCount: count,
  };
}

// ── Sub-components ──

function OddsCard({ match, flashKey, oddsRows, chinaOdds }: { match: EspnMatchWithOdds; flashKey: string | null; oddsRows: any[]; chinaOdds?: ChinaLotteryOdds }) {
  const [expanded, setExpanded] = useState(false);
  const [showOddsCompare, setShowOddsCompare] = useState(false);
  const hasOdds = match.homeMoneyLine !== null && match.awayMoneyLine !== null;
  const homeCn = getChineseNameFromAbbr(match.homeAbbr);
  const awayCn = getChineseNameFromAbbr(match.awayAbbr);
  const aggregated = aggregateOddsProbabilities(oddsRows);
  const bars = hasOdds
    ? moneylineBar3way(match.homeMoneyLine!, match.drawMoneyLine, match.awayMoneyLine!)
    : null;

  // Chinese lottery probability (decimal odds → true probability)
  const chinaBar = chinaOdds ? (() => {
    const hp = 1 / chinaOdds.hadHome;
    const dp = 1 / chinaOdds.hadDraw;
    const ap = 1 / chinaOdds.hadAway;
    const sum = hp + dp + ap;
    if (sum <= 0) return null;
    return {
      home: Math.round((hp / sum) * 100),
      draw: Math.round((dp / sum) * 100),
      away: Math.round((ap / sum) * 100),
    };
  })() : null;

  return (
    <div
      data-match-key={`${match.homeTeamKey}-${match.awayTeamKey}`}
      className={`relative bg-[#111111] border border-[#222222] rounded-xl p-4 transition-colors ${
        flashKey === `${match.homeTeamKey}-${match.awayTeamKey}`
          ? "highlight-flash"
          : "hover:border-[#333333]"
      }`}
    >
      {flashKey === `${match.homeTeamKey}-${match.awayTeamKey}` && <ParticleBurst />}
      {/* Header: teams + time */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-bold text-white truncate">{homeCn}</span>
          <span className="text-[10px] text-[#666666] font-bold">VS</span>
          <span className="text-sm font-bold text-white truncate">{awayCn}</span>
        </div>
        <span className="text-[11px] text-[#888888] whitespace-nowrap ml-2">
          {formatUtc(match.utcDate)}
        </span>
      </div>

      {/* Probability bar — prefers China lottery, falls back to multi-bookmaker */}
      {chinaBar && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-[#888888] mb-0.5">
            <span>🇨🇳 竞彩</span>
            <span className="text-[#666666]">
              {chinaOdds!.hadHome.toFixed(2)} / {chinaOdds!.hadDraw.toFixed(2)} / {chinaOdds!.hadAway.toFixed(2)}
            </span>
          </div>
          <div className="flex h-5 rounded-full overflow-hidden text-[9px] font-bold">
            <div className="bg-[#22c55e] flex items-center justify-center" style={{ width: `${chinaBar.home}%` }}>
              {chinaBar.home > 10 ? `${chinaBar.home}%` : ""}
            </div>
            <div className="bg-[#8b5cf6] flex items-center justify-center text-white" style={{ width: `${chinaBar.draw}%` }}>
              {chinaBar.draw > 8 ? `${chinaBar.draw}%` : ""}
            </div>
            <div className="bg-[#f97316] flex items-center justify-center text-white" style={{ width: `${chinaBar.away}%` }}>
              {chinaBar.away > 10 ? `${chinaBar.away}%` : ""}
            </div>
          </div>
          <div className="flex justify-between mt-0.5 text-[10px] text-[#555555]">
            <span>{homeCn} 胜</span>
            <span>平</span>
            <span>{awayCn} 胜</span>
          </div>
        </div>
      )}

      {/* Multi-bookmaker aggregated probability (only when no china lottery) */}
      {!chinaBar && aggregated && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-[#555555] mb-0.5">
            <span>综合 {aggregated.bookmakerCount} 家赔率</span>
          </div>
          <div className="flex h-5 rounded-full overflow-hidden text-[9px] font-bold">
            <div className="bg-[#22c55e] flex items-center justify-center" style={{ width: `${aggregated.homeProb}%` }}>
              {aggregated.homeProb > 10 ? `${aggregated.homeProb}%` : ""}
            </div>
            <div className="bg-[#8b5cf6] flex items-center justify-center text-white" style={{ width: `${aggregated.drawProb}%` }}>
              {aggregated.drawProb > 8 ? `${aggregated.drawProb}%` : ""}
            </div>
            <div className="bg-[#f97316] flex items-center justify-center text-white" style={{ width: `${aggregated.awayProb}%` }}>
              {aggregated.awayProb > 10 ? `${aggregated.awayProb}%` : ""}
            </div>
          </div>
        </div>
      )}

      {/* ESPN implied probability (last resort fallback, from local data) */}
      {!chinaBar && !aggregated && bars && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-[#555555] mb-0.5">
            <span>ESPN 盘口隐含胜率</span>
          </div>
          <div className="flex h-5 rounded-full overflow-hidden text-[9px] font-bold">
            <div className="bg-[#22c55e] flex items-center justify-center" style={{ width: `${bars.home}%` }}>
              {bars.home > 10 ? `${bars.home}%` : ""}
            </div>
            <div className="bg-[#8b5cf6] flex items-center justify-center text-white" style={{ width: `${bars.draw}%` }}>
              {bars.draw > 8 ? `${bars.draw}%` : ""}
            </div>
            <div className="bg-[#f97316] flex items-center justify-center text-white" style={{ width: `${bars.away}%` }}>
              {bars.away > 10 ? `${bars.away}%` : ""}
            </div>
          </div>
        </div>
      )}

      {/* Odds details line */}
      {hasOdds && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#888888]">
          <span>
            独赢: <span className="text-[#00FF41]">{formatOdds(match.homeMoneyLine)}</span>
            <span className="text-[#555555]"> / </span>
            <span className="text-[#FF0055]/70">{match.drawMoneyLine != null ? formatOdds(match.drawMoneyLine) : "-"}</span>
            <span className="text-[#555555]"> / </span>
            <span className="text-[#FFAA00]">{formatOdds(match.awayMoneyLine)}</span>
          </span>
          {match.spread != null && (
            <span>
              让球: <span className="text-white">{match.spread >= 0 ? "+" : ""}{match.spread}</span>
            </span>
          )}
          {match.overUnder != null && (
            <span>
              大小: <span className="text-white">{match.overUnder}</span>
            </span>
          )}
        </div>
      )}

      {!hasOdds && (
        <p className="text-[11px] text-[#555555] italic">暂无盘口数据</p>
      )}

      {/* Expandable detail */}
      {hasOdds && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-[10px] text-[#555555] hover:text-[#888888] transition-colors"
          >
            {expanded ? "收起详情 ▲" : "展开详情 ▼"}
          </button>
          {expanded && (
            <div className="mt-2 pt-2 border-t border-[#222222] grid grid-cols-2 gap-2 text-[11px]">
              <div className="text-[#888888]">
                <span className="block text-[10px] text-[#555555]">主胜 (decimal)</span>
                <span className="text-[#00FF41] font-medium">
                  {match.homeMoneyLine != null ? americanToDecimal(match.homeMoneyLine).toFixed(2) : "-"}
                </span>
              </div>
              <div className="text-[#888888]">
                <span className="block text-[10px] text-[#555555]">客胜 (decimal)</span>
                <span className="text-[#FFAA00] font-medium">
                  {match.awayMoneyLine != null ? americanToDecimal(match.awayMoneyLine).toFixed(2) : "-"}
                </span>
              </div>
              <div className="text-[#888888]">
                <span className="block text-[10px] text-[#555555]">平局 (decimal)</span>
                <span className="text-[#FF0055]/70 font-medium">
                  {match.drawMoneyLine != null ? americanToDecimal(match.drawMoneyLine).toFixed(2) : "-"}
                </span>
              </div>
              {match.spread != null && (
                <>
                  <div className="text-[#888888]">
                    <span className="block text-[10px] text-[#555555]">让球盘赔率</span>
                    <span className="text-white font-medium">
                      {match.homeSpreadOdds != null ? formatOdds(match.homeSpreadOdds) : "-"}
                      {" / "}
                      {match.awaySpreadOdds != null ? formatOdds(match.awaySpreadOdds) : "-"}
                    </span>
                  </div>
                  <div className="text-[#888888]">
                    <span className="block text-[10px] text-[#555555]">大小球赔率</span>
                    <span className="text-white font-medium">
                      {match.overOdds != null ? formatOdds(match.overOdds) : "-"}
                      {" / "}
                      {match.underOdds != null ? formatOdds(match.underOdds) : "-"}
                    </span>
                  </div>
                </>
              )}
              <div className="col-span-2 text-[10px] text-[#555555]">
                数据来源: DraftKings (via ESPN)
              </div>
            </div>
          )}
        </>
      )}

      {/* Multi-bookmaker comparison */}
      {oddsRows.length > 0 && (
        <>
          <button
            onClick={() => setShowOddsCompare(!showOddsCompare)}
            className="mt-2 text-[10px] text-[#FF8C00] hover:text-[#FFAA33] transition-colors"
          >
            {showOddsCompare ? "收起多公司对比 ▲" : `多公司对比 (${oddsRows.length} 条) ▼`}
          </button>
          {showOddsCompare && (
            <div className="mt-2 pt-2 border-t border-[#222222] overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-[#222222] text-[#666666]">
                    <th className="text-left py-1 pr-2 font-medium whitespace-nowrap">公司</th>
                    <th className="text-right py-1 px-1 font-medium">主</th>
                    <th className="text-right py-1 px-1 font-medium">平</th>
                    <th className="text-right py-1 px-1 font-medium">客</th>
                    <th className="text-right py-1 px-1 font-medium">让球</th>
                    <th className="text-right py-1 px-1 font-medium">大小</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group by bookmaker, find h2h/spreads/totals for each
                    const groups: Record<string, any[]> = {};
                    for (const r of oddsRows) {
                      if (!groups[r.bookmaker_title]) groups[r.bookmaker_title] = [];
                      groups[r.bookmaker_title].push(r);
                    }
                    return Object.entries(groups).map(([title, rows]) => {
                      const h2h = rows.find((r: any) => r.market_type === 'h2h');
                      const spread = rows.find((r: any) => r.market_type === 'spreads');
                      const totals = rows.find((r: any) => r.market_type === 'totals');
                      return (
                        <tr key={title} className="border-b border-[#1A1A1A] hover:bg-[#151515]">
                          <td className="text-left py-1.5 pr-2 text-white font-medium whitespace-nowrap">{title}</td>
                          <td className="text-right py-1.5 px-1 text-[#00FF41]">{h2h ? formatOdds(h2h.home_price) : '-'}</td>
                          <td className="text-right py-1.5 px-1 text-[#FF0055]/70">{h2h ? formatOdds(h2h.draw_price) : '-'}</td>
                          <td className="text-right py-1.5 px-1 text-[#FFAA00]">{h2h ? formatOdds(h2h.away_price) : '-'}</td>
                          <td className="text-right py-1.5 px-1 text-white whitespace-nowrap">
                            {spread
                              ? `${spread.handicap != null ? (spread.handicap >= 0 ? '+' : '') + spread.handicap : '-'} (${formatOdds(spread.home_price)})`
                              : '-'}
                          </td>
                          <td className="text-right py-1.5 px-1 text-white whitespace-nowrap">
                            {totals
                              ? `大${totals.over_under ?? '-'} (${formatOdds(totals.over_price)})`
                              : '-'}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
              <div className="mt-1 text-[9px] text-[#555555]">数据来源: The Odds API</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatsTable({ rankings, nameMap, onSort }: {
  rankings: TeamStatsRanking[];
  nameMap: Record<string, string>;
  onSort: (key: keyof TeamStatsRanking) => void;
}) {
  const [sortKey, setSortKey] = useState<keyof TeamStatsRanking>("avgPossession");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: keyof TeamStatsRanking) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    onSort(key);
  };

  const sorted = useMemo(() => {
    const copy = [...rankings];
    copy.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });
    return copy;
  }, [rankings, sortKey, sortAsc]);

  const columns: { key: keyof TeamStatsRanking; label: string; suffix?: string }[] = [
    { key: "avgPossession", label: "场均控球", suffix: "%" },
    { key: "avgShots", label: "场均射门" },
    { key: "avgShotsOnTarget", label: "场均射正" },
    { key: "avgCorners", label: "场均角球" },
    { key: "passPct", label: "传球成功率", suffix: "%" },
    { key: "avgSaves", label: "场均扑救" },
    { key: "avgYellowCards", label: "场均黄牌" },
  ];

  const SortIcon = ({ col }: { col: keyof TeamStatsRanking }) => {
    if (sortKey !== col) return <span className="text-[#333333] ml-0.5">↕</span>;
    return <span className="text-[#00FF41] ml-0.5">{sortAsc ? "↑" : "↓"}</span>;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#222222]">
            <th className="text-left py-2 pr-4 text-[#666666] font-medium whitespace-nowrap sticky left-0 z-10 bg-[#111111] min-w-[110px]"># 球队</th>
            <th className="text-center py-2 px-2 text-[#666666] font-medium whitespace-nowrap">场次</th>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="text-right py-2 px-2 text-[#666666] font-medium whitespace-nowrap cursor-pointer hover:text-white transition-colors"
              >
                {col.label}
                <SortIcon col={col.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.teamAbbr}
              className="border-b border-[#1A1A1A] hover:bg-[#151515] transition-colors"
            >
              <td className="py-2 pr-4 font-bold text-white whitespace-nowrap sticky left-0 z-10 bg-[#111111] min-w-[110px]">
                <span className="text-[#555555] font-normal mr-1.5">{i + 1}.</span>
                {nameMap[row.teamAbbr] ?? row.teamAbbr}
              </td>
              <td className="text-center py-2 px-2 text-[#888888]">{row.matchesPlayed}</td>
              {columns.map((col) => {
                const val = row[col.key] as number;
                // Highlight top 3
                const rank = sorted.indexOf(row);
                const isTop3 = rank < 3;
                return (
                  <td
                    key={col.key}
                    className={`text-right py-2 px-2 font-medium ${
                      isTop3 && sortKey === col.key
                        ? sortAsc
                          ? rank === 0 ? "text-[#00FF41]" : "text-[#AAFFAA]"
                          : rank === 0 ? "text-[#00FF41]" : "text-[#AAFFAA]"
                        : "text-white"
                    }`}
                  >
                    {val}
                    {col.suffix ?? ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── CSS flash animation ──
const FLASH_DURATION_MS = 2000;

// ── Main component ──

export default function PredictionsPage({ highlightMatch: externalHighlight }: { highlightMatch?: { homeKey: string; awayKey: string } | null }) {
  const [view, setView] = useState<"odds" | "stats" | "sim">("odds");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const prevHighlightRef = useRef<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [allMatches, setAllMatches] = useState<EspnMatchWithOdds[]>([]);
  const [matches, setMatches] = useState<EspnMatchWithOdds[]>([]);
  const [rankings, setRankings] = useState<TeamStatsRanking[]>([]);
  const [statsCount, setStatsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [oddsMap, setOddsMap] = useState<Record<number, any[]>>({});
  const [chinaLotteryMap, setChinaLotteryMap] = useState<Record<number, ChinaLotteryOdds>>({});
  const [eloRatings, setEloRatings] = useState<EloRating[]>([]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([syncEspnData(), syncOddsData()]);
      // Re-fetch after sync
      const [m, r, c] = await Promise.all([
        getEspnMatchesWithOdds(),
        getTeamStatsRankings(),
        getEspnMatchStatsCount(),
      ]);
      setAllMatches(m);
      setEloRatings(computeElo(m).ratings);
      const filtered = m.filter((x) => x.status === "pre");
      setMatches(filtered);
      setRankings(r);
      setStatsCount(c);
      // Load odds data for each match
      await loadOddsForMatches(filtered);
      await loadChinaLotteryData(filtered);
    } catch (e) {
      console.error("[PredictionsPage] Refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  };

  const loadOddsForMatches = async (mlist: EspnMatchWithOdds[]) => {
    const ids = mlist.map((m) => m.eventId);
    if (ids.length === 0) { setOddsMap({}); return; }
    const allOdds = await getOddsForEvents(ids);
    const map: Record<number, any[]> = {};
    for (const row of allOdds) {
      const eid = (row as any).event_id as number;
      if (!map[eid]) map[eid] = [];
      map[eid].push(row);
    }
    setOddsMap(map);
  };

  const loadChinaLotteryData = async (mlist: EspnMatchWithOdds[]) => {
    const odds = await fetchChinaLotteryOdds();
    const map: Record<number, ChinaLotteryOdds> = {};
    for (const c of odds) {
      const match = mlist.find((m) => m.homeTeamKey === c.homeTeamKey && m.awayTeamKey === c.awayTeamKey);
      if (match) {
        c.eventId = match.eventId;
        map[match.eventId] = c;
      } else {
        console.warn(`[ChinaLottery] No match for ${c.homeTeamKey} vs ${c.awayTeamKey}`);
      }
    }
    setChinaLotteryMap(map);
  };

  useEffect(() => {
    let cancelled = false;
    let retries = 0;
    let canFinish = false;
    const MAX_RETRIES = 10;

    // Global timeout: if nothing loaded within 30s, give up and show empty state
    const globalTimeout = setTimeout(() => {
      if (!cancelled && !canFinish) {
        canFinish = true;
        setLoading(false);
      }
    }, 30000);

    const loadData = async () => {
      try {
        // Wait for DuckDB (will retry init if previous attempt failed)
        try {
          await waitForDuckDB();
        } catch {
          // DuckDB not initialized — try again via initDuckDB()
          const { initDuckDB } = await import("../services/duckdb");
          await initDuckDB();
          await waitForDuckDB();
        }
        if (cancelled) return;

        // Wait for ESPN sync
        await waitForSyncCompletion();
        if (cancelled) return;

        // Re-trigger sync if retrying (initial auto-sync may have failed)
        if (retries > 0) {
          await syncEspnData();
        }

        // Sync odds data (waits for App.tsx's fire-and-forget if already started)
        await syncOddsData();

        const [m, r, c] = await Promise.all([
          getEspnMatchesWithOdds(),
          getTeamStatsRankings(),
          getEspnMatchStatsCount(),
        ]);
        if (cancelled) return;

        // If no data at all, retry with re-sync
        if (m.length === 0 && r.length === 0 && c === 0 && retries < MAX_RETRIES) {
          retries++;
          setTimeout(() => { if (!cancelled) loadData(); }, 2000);
          return;
        }

        canFinish = true;
        setAllMatches(m);
        setEloRatings(computeElo(m).ratings);
        const filtered = m.filter((x) => x.status === "pre");
        setMatches(filtered);
        setRankings(r);
        setStatsCount(c);
        // Load odds data for each match
        loadOddsForMatches(filtered);
        loadChinaLotteryData(filtered);
      } catch (e) {
        if (retries < MAX_RETRIES) {
          retries++;
          setTimeout(() => { if (!cancelled) loadData(); }, 2000);
          return;
        }
        canFinish = true;
        console.error("[PredictionsPage] Failed to load data:", e);
      } finally {
        if (!cancelled && canFinish) {
          clearTimeout(globalTimeout);
          setLoading(false);
        }
      }
    };

    loadData();
    return () => { cancelled = true; clearTimeout(globalTimeout); };
  }, []);

  // ── Highlight: scroll to + flash the targeted match ──
  useEffect(() => {
    if (externalHighlight == null) return;
    const key = `${externalHighlight.homeKey}-${externalHighlight.awayKey}`;
    if (key === prevHighlightRef.current) return;
    prevHighlightRef.current = key;

    // Switch to odds view
    setView("odds");
    // Set flash key immediately — OddsCards will animate when they render
    setFlashKey(key);

    // Retry scrollIntoView until the element exists (data may still be loading)
    let retries = 0;
    const MAX_RETRIES = 30; // ~15s total
    const tryScroll = () => {
      const el = document.querySelector<HTMLElement>(`[data-match-key="${key}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setFlashKey(null), FLASH_DURATION_MS);
        return;
      }
      retries++;
      if (retries < MAX_RETRIES) setTimeout(tryScroll, 500);
    };
    setTimeout(tryScroll, 200);
    return () => { clearTimeout(flashTimerRef.current); };
  }, [externalHighlight]);

  const nameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of matches) {
      map[m.homeAbbr] = getChineseNameFromAbbr(m.homeAbbr);
      map[m.awayAbbr] = getChineseNameFromAbbr(m.awayAbbr);
    }
    for (const r of rankings) {
      map[r.teamAbbr] = getChineseNameFromAbbr(r.teamAbbr);
    }
    return map;
  }, [matches, rankings]);

  const upcomingCount = matches.length;
  const oddsCount = matches.filter((m) => m.homeMoneyLine != null).length;

  // ── Loading state ──
  if (loading) {
    return (
      <div className="pb-8">
        <div className="max-w-4xl mx-auto px-4 pt-4 flex items-center gap-3">
          <div className="inline-block w-5 h-5 border-2 border-[#00FF41]/30 border-t-[#00FF41] rounded-full animate-spin" />
          <span className="text-sm text-[#888888]">正在加载预测数据...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* View toggle */}
      <div className="max-w-4xl mx-auto px-4 pt-4 pb-2 flex gap-3">
        <button
          onClick={() => setView("odds")}
          className={`px-6 py-2.5 text-sm font-black rounded-lg transition-all duration-200 ${
            view === "odds"
              ? "bg-[#00FF41] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,65,0.4)]"
              : "bg-[#111111] text-[#888888] hover:text-white hover:bg-[#1A1A1A]"
          }`}
        >
          盘口分析
        </button>
        <button
          onClick={() => setView("stats")}
          className={`px-6 py-2.5 text-sm font-black rounded-lg transition-all duration-200 ${
            view === "stats"
              ? "bg-[#00FF41] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,65,0.4)]"
              : "bg-[#111111] text-[#888888] hover:text-white hover:bg-[#1A1A1A]"
          }`}
        >
          球队数据
        </button>
        <button
          onClick={() => setView("sim")}
          className={`px-6 py-2.5 text-sm font-black rounded-lg transition-all duration-200 ${
            view === "sim"
              ? "bg-[#f59e0b] text-[#0A0A0A] shadow-[0_0_20px_rgba(245,158,11,0.4)]"
              : "bg-[#111111] text-[#888888] hover:text-white hover:bg-[#1A1A1A]"
          }`}
        >
          📊 模拟投注
        </button>
      </div>

      {/* Odds view */}
      {view === "odds" && (
        <>
          {/* Info bar */}
          <div className="max-w-4xl mx-auto px-4 mb-3 flex items-center gap-3 text-xs text-[#666666]">
            <span>🔄 即将进行 {upcomingCount} 场</span>
            <span className="text-[#333333]">|</span>
            <span>📊 {oddsCount} 场有盘口数据</span>
            <span className="text-[#333333]">|</span>
            <span className="text-[10px] text-[#CC0000]">中国体彩竞彩</span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="ml-auto text-[10px] text-[#888888] hover:text-[#00FF41] transition-colors disabled:text-[#444444]"
            >
              {refreshing ? "刷新中..." : "⟳ 刷新"}
            </button>
          </div>

          {matches.length === 0 ? (
            <div className="max-w-4xl mx-auto px-4">
              <div className="bg-[#111111] border border-[#222222] rounded-xl p-8 text-center">
                <p className="text-sm text-[#888888]">暂无即将进行的比赛</p>
                <p className="text-xs text-[#555555] mt-1">数据将在新比赛开始时自动更新</p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4 grid gap-3">
              {matches.map((m) => (
                <OddsCard key={m.eventId} match={m} flashKey={flashKey} oddsRows={oddsMap[m.eventId] ?? []} chinaOdds={chinaLotteryMap[m.eventId]} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Stats view */}
      {view === "stats" && (
        <>
          <div className="max-w-4xl mx-auto px-4 mb-3 flex items-center gap-3 text-xs text-[#666666]">
            <span>📊 共 {statsCount} 条统计记录</span>
            <span className="text-[#333333]">|</span>
            <span className="text-[10px] text-[#555555]">点击表头排序 · 绿色高亮 = 榜首</span>
          </div>

          {rankings.length === 0 ? (
            <div className="max-w-4xl mx-auto px-4">
              <div className="bg-[#111111] border border-[#222222] rounded-xl p-8 text-center">
                <p className="text-sm text-[#888888]">暂无统计数据</p>
                <p className="text-xs text-[#555555] mt-1">比赛结束后自动生成</p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4">
              <div className="bg-[#111111] border border-[#222222] rounded-xl p-3">
                <StatsTable rankings={rankings} nameMap={nameMap} onSort={() => {}} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Simulation view */}
      {view === "sim" && (
        <BettingSimulation allMatches={allMatches} oddsMap={oddsMap} chinaLotteryMap={chinaLotteryMap} eloRatings={eloRatings} />
      )}
    </div>
  );
}
