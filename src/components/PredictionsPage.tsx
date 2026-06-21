import { useState, useEffect, useMemo, useRef } from "react";
import { waitForDuckDB, waitForSyncCompletion, getEspnMatchesWithOdds, getTeamStatsRankings, getEspnMatchStatsCount, syncEspnData, getChineseNameFromAbbr } from "../services/duckdb";
import type { EspnMatchWithOdds, TeamStatsRanking } from "../services/duckdb";
import { americanToProb, americanToDecimal } from "../services/espn";

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
  return {
    home: Math.round((homeP / total) * 100),
    draw: Math.round((drawP / total) * 100),
    away: Math.round((awayP / total) * 100),
  };
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

// ── Sub-components ──

function OddsCard({ match, flashKey }: { match: EspnMatchWithOdds; flashKey: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const hasOdds = match.homeMoneyLine !== null && match.awayMoneyLine !== null;
  const bars = hasOdds && match.homeMoneyLine != null && match.awayMoneyLine != null
    ? moneylineBar3way(match.homeMoneyLine, match.drawMoneyLine, match.awayMoneyLine)
    : null;
  const hasDraw = match.drawMoneyLine != null;
  const homeCn = getChineseNameFromAbbr(match.homeAbbr);
  const awayCn = getChineseNameFromAbbr(match.awayAbbr);

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

      {/* Moneyline probability bar */}
      {bars && (
        <div className="mb-3">
          <div className="flex h-6 rounded-full overflow-hidden text-[10px] font-bold">
            <div
              className="bg-[#00FF41]/80 text-[#0A0A0A] flex items-center justify-center transition-all"
              style={{ width: `${bars.home}%` }}
            >
              {bars.home > 12 ? `${bars.home}%` : ""}
            </div>
            <div
              className={`${hasDraw ? "bg-[#FF0055]/60 text-white" : "bg-[#333333] text-[#666666]"} flex items-center justify-center transition-all`}
              style={{ width: `${bars.draw}%` }}
            >
              {bars.draw > 8 ? `${hasDraw ? "平 " : ""}${bars.draw}%` : ""}
            </div>
            <div
              className="bg-[#FFAA00]/70 text-[#0A0A0A] flex items-center justify-center transition-all"
              style={{ width: `${bars.away}%` }}
            >
              {bars.away > 12 ? `${bars.away}%` : ""}
            </div>
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-[#666666]">
            <span>{homeCn} 胜</span>
            <span>平</span>
            <span>{awayCn} 胜</span>
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
            <th className="text-left py-2 pr-3 text-[#666666] font-medium whitespace-nowrap sticky left-0 z-10 bg-[#111111]"># 球队</th>
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
              <td className="py-2 pr-3 font-bold text-white sticky left-0 z-10 bg-[#111111]">
                <span className="text-[#555555] font-normal mr-2">{i + 1}.</span>
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
  const [view, setView] = useState<"odds" | "stats">("odds");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const prevHighlightRef = useRef<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [matches, setMatches] = useState<EspnMatchWithOdds[]>([]);
  const [rankings, setRankings] = useState<TeamStatsRanking[]>([]);
  const [statsCount, setStatsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await syncEspnData();
      // Re-fetch after sync
      const [m, r, c] = await Promise.all([
        getEspnMatchesWithOdds(),
        getTeamStatsRankings(),
        getEspnMatchStatsCount(),
      ]);
      setMatches(m.filter((x) => x.status === "pre"));
      setRankings(r);
      setStatsCount(c);
    } catch (e) {
      console.error("[PredictionsPage] Refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let retries = 0;
    let canFinish = false;
    const MAX_RETRIES = 15;

    const loadData = async () => {
      try {
        await waitForDuckDB();
        // Wait for the initial auto-sync, then re-trigger if data is still empty
        await waitForSyncCompletion();
        if (cancelled) return;

        // Re-trigger sync if previous one failed or returned no odds data
        if (retries > 0) {
          await syncEspnData();
        }

        const [m, r, c] = await Promise.all([
          getEspnMatchesWithOdds(),
          getTeamStatsRankings(),
          getEspnMatchStatsCount(),
        ]);
        if (cancelled) return;

        // If no data at all, retry with re-sync
        if (m.length === 0 && r.length === 0 && c === 0 && retries < MAX_RETRIES) {
          retries++;
          setTimeout(() => { if (!cancelled) loadData(); }, 3000);
          return;
        }

        canFinish = true;
        setMatches(m.filter((x) => x.status === "pre"));
        setRankings(r);
        setStatsCount(c);
      } catch (e) {
        if (retries < MAX_RETRIES) {
          retries++;
          setTimeout(() => { if (!cancelled) loadData(); }, 3000);
          return;
        }
        canFinish = true;
        console.error("[PredictionsPage] Failed to load data:", e);
      } finally {
        if (!cancelled && canFinish) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
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
            <span className="text-[10px] text-[#555555]">DraftKings</span>
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
                <OddsCard key={m.eventId} match={m} flashKey={flashKey} />
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
    </div>
  );
}
