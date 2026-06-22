import { useMemo, useState } from "react";
import { americanToDecimal, americanToProb } from "../services/espn";
import { getChineseNameFromAbbr } from "../services/duckdb";
import type { EspnMatchWithOdds } from "../services/duckdb";
import type { ChinaLotteryOdds } from "../services/chinaLottery";
import { predictFromElo, getTeamRating } from "../services/elo";
import type { EloRating } from "../services/elo";

// ── Types ──

type Source = "multi" | "china" | "espn" | "elo";

interface SimRow {
  eventId: number;
  homeCn: string;
  awayCn: string;
  homeAbbr: string;
  awayAbbr: string;
  utcDate: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Predicted outcome */
  predicted: "home" | "draw" | "away";
  prob: number; // de-vigged probability (%)
  bestDecimal: number; // best available decimal odds for predicted outcome
  /** Actual outcome (for finished matches) */
  actual: "home" | "draw" | "away" | null;
  wouldWin: boolean | null; // null = upcoming
}

const BET = 100;

// ── Helpers ──

function getActual(home: number | null, away: number | null): "home" | "draw" | "away" | null {
  if (home == null || away == null) return null;
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function deVig(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0);
  if (sum <= 0) return probs;
  return probs.map((p) => p / sum);
}

/** Compute SimRow from multi-bookmaker data */
function simFromMulti(oddsRows: any[], match: EspnMatchWithOdds): SimRow | null {
  const h2h = oddsRows.filter((r: any) => r.market_type === "h2h" && r.home_price != null && r.away_price != null);
  if (h2h.length === 0) return null;

  // Aggregate de-vigged probabilities
  let tHome = 0, tDraw = 0, tAway = 0, count = 0;
  let bestHomeDec = 0, bestDrawDec = 0, bestAwayDec = 0;

  for (const r of h2h) {
    const hp = americanToProb(r.home_price);
    const dp = r.draw_price != null ? americanToProb(r.draw_price) : 0;
    const ap = americanToProb(r.away_price);
    const sum = hp + dp + ap;
    if (sum <= 0) continue;

    tHome += hp / sum;
    tDraw += dp / sum;
    tAway += ap / sum;
    count++;

    // Track best decimal odds for each outcome
    const hDec = americanToDecimal(r.home_price);
    const dDec = r.draw_price != null ? americanToDecimal(r.draw_price) : 0;
    const aDec = americanToDecimal(r.away_price);
    if (hDec > bestHomeDec) bestHomeDec = hDec;
    if (dDec > bestDrawDec) bestDrawDec = dDec;
    if (aDec > bestAwayDec) bestAwayDec = aDec;
  }

  if (count === 0) return null;

  const probs = deVig([tHome / count, tDraw / count, tAway / count]);
  const outcomes: ("home" | "draw" | "away")[] = ["home", "draw", "away"];
  const bestIdx = probs.indexOf(Math.max(...probs));
  const predicted = outcomes[bestIdx];
  const bestDecs = [bestHomeDec, bestDrawDec, bestAwayDec];

  return {
    eventId: match.eventId,
    homeCn: getChineseNameFromAbbr(match.homeAbbr),
    awayCn: getChineseNameFromAbbr(match.awayAbbr),
    homeAbbr: match.homeAbbr,
    awayAbbr: match.awayAbbr,
    utcDate: match.utcDate,
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    predicted,
    prob: Math.round(probs[bestIdx] * 100),
    bestDecimal: bestDecs[bestIdx],
    actual: getActual(match.homeScore, match.awayScore),
    wouldWin: match.status === "post" ? getActual(match.homeScore, match.awayScore) === predicted : null,
  };
}

/** Compute SimRow from China lottery data */
function simFromChina(odds: ChinaLotteryOdds, match: EspnMatchWithOdds): SimRow | null {
  const probs = deVig([1 / odds.hadHome, 1 / odds.hadDraw, 1 / odds.hadAway]);
  const outcomes: ("home" | "draw" | "away")[] = ["home", "draw", "away"];
  const bestIdx = probs.indexOf(Math.max(...probs));
  const predicted = outcomes[bestIdx];
  const decs = [odds.hadHome, odds.hadDraw, odds.hadAway];

  return {
    eventId: match.eventId,
    homeCn: getChineseNameFromAbbr(match.homeAbbr),
    awayCn: getChineseNameFromAbbr(match.awayAbbr),
    homeAbbr: match.homeAbbr,
    awayAbbr: match.awayAbbr,
    utcDate: match.utcDate,
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    predicted,
    prob: Math.round(probs[bestIdx] * 100),
    bestDecimal: decs[bestIdx],
    actual: getActual(match.homeScore, match.awayScore),
    wouldWin: match.status === "post" ? getActual(match.homeScore, match.awayScore) === predicted : null,
  };
}

/** Compute SimRow from Elo ratings (no decimal odds — uses fair odds from probability) */
function simFromElo(match: EspnMatchWithOdds, ratings: EloRating[]): SimRow | null {
  const homeRating = getTeamRating(ratings, match.homeTeamKey);
  const awayRating = getTeamRating(ratings, match.awayTeamKey);
  const pred = predictFromElo(homeRating, awayRating);
  const outcomes: ("home" | "draw" | "away")[] = ["home", "draw", "away"];
  const probs = [pred.homeWin, pred.draw, pred.awayWin];
  const bestIdx = probs.indexOf(Math.max(...probs));
  const predicted = outcomes[bestIdx];
  // Fair decimal odds (no juice) = 1 / probability
  const fairDecimal = probs[bestIdx] > 0 ? 1 / probs[bestIdx] : 0;

  return {
    eventId: match.eventId,
    homeCn: getChineseNameFromAbbr(match.homeAbbr),
    awayCn: getChineseNameFromAbbr(match.awayAbbr),
    homeAbbr: match.homeAbbr,
    awayAbbr: match.awayAbbr,
    utcDate: match.utcDate,
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    predicted,
    prob: Math.round(probs[bestIdx] * 100),
    bestDecimal: Math.round(fairDecimal * 100) / 100,
    actual: getActual(match.homeScore, match.awayScore),
    wouldWin: match.status === "post" ? getActual(match.homeScore, match.awayScore) === predicted : null,
  };
}

/** Compute SimRow from ESPN moneyline odds */
function simFromEspn(match: EspnMatchWithOdds): SimRow | null {
  if (match.homeMoneyLine == null || match.awayMoneyLine == null) return null;
  const hProb = americanToProb(match.homeMoneyLine);
  const dProb = match.drawMoneyLine != null ? americanToProb(match.drawMoneyLine) : 0;
  const aProb = americanToProb(match.awayMoneyLine);
  const probs = deVig([hProb, dProb, aProb]);
  const outcomes: ("home" | "draw" | "away")[] = ["home", "draw", "away"];
  const bestIdx = probs.indexOf(Math.max(...probs));
  const predicted = outcomes[bestIdx];
  const decs = [
    americanToDecimal(match.homeMoneyLine),
    match.drawMoneyLine != null ? americanToDecimal(match.drawMoneyLine) : 0,
    americanToDecimal(match.awayMoneyLine),
  ];

  return {
    eventId: match.eventId,
    homeCn: getChineseNameFromAbbr(match.homeAbbr),
    awayCn: getChineseNameFromAbbr(match.awayAbbr),
    homeAbbr: match.homeAbbr,
    awayAbbr: match.awayAbbr,
    utcDate: match.utcDate,
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    predicted,
    prob: Math.round(probs[bestIdx] * 100),
    bestDecimal: decs[bestIdx],
    actual: getActual(match.homeScore, match.awayScore),
    wouldWin: match.status === "post" ? getActual(match.homeScore, match.awayScore) === predicted : null,
  };
}

// ── Sub-components ──

function OutcomeTag({ outcome }: { outcome: "home" | "draw" | "away" }) {
  const colors: Record<string, string> = {
    home: "bg-[#22c55e]/20 text-[#22c55e]",
    draw: "bg-[#8b5cf6]/20 text-[#8b5cf6]",
    away: "bg-[#f97316]/20 text-[#f97316]",
  };
  const labels: Record<string, string> = { home: "主胜", draw: "平局", away: "客胜" };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colors[outcome]}`}>{labels[outcome]}</span>;
}

function formatDt(utc: string): string {
  try {
    const d = new Date(utc);
    return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
  } catch { return utc; }
}

// ── Main component ──

interface Props {
  allMatches: EspnMatchWithOdds[];
  oddsMap: Record<number, any[]>;
  chinaLotteryMap: Record<number, ChinaLotteryOdds>;
  eloRatings: EloRating[];
}

export default function BettingSimulation({ allMatches, oddsMap, chinaLotteryMap, eloRatings }: Props) {
  const [source, setSource] = useState<Source>("multi");

  const rows = useMemo<SimRow[]>(() => {
    const result: SimRow[] = [];
    for (const match of allMatches) {
      let row: SimRow | null = null;
      if (source === "multi") {
        const odds = oddsMap[match.eventId] ?? [];
        if (odds.length > 0) row = simFromMulti(odds, match);
      } else if (source === "china") {
        const odds = chinaLotteryMap[match.eventId];
        if (odds) row = simFromChina(odds, match);
      } else if (source === "espn") {
        row = simFromEspn(match);
      } else if (source === "elo") {
        row = simFromElo(match, eloRatings);
      }
      if (row) result.push(row);
    }
    return result;
  }, [allMatches, oddsMap, chinaLotteryMap, eloRatings, source]);

  const stats = useMemo(() => {
    const finished = rows.filter((r) => r.wouldWin !== null);
    const won = finished.filter((r) => r.wouldWin);
    const totalBet = rows.length * BET;
    const totalReturn = rows.reduce((s, r) => s + (r.wouldWin ? r.bestDecimal * BET : 0), 0);
    const upcoming = rows.filter((r) => r.wouldWin === null).length;
    return {
      total: rows.length,
      finished: finished.length,
      won: won.length,
      winRate: finished.length > 0 ? Math.round((won.length / finished.length) * 100) : 0,
      totalBet,
      totalReturn: Math.round(totalReturn * 100) / 100,
      profit: Math.round((totalReturn - totalBet) * 100) / 100,
      roi: totalBet > 0 ? (((totalReturn - totalBet) / totalBet) * 100).toFixed(1) : "0.0",
      upcoming,
    };
  }, [rows]);

  // ── Render ──

  const sourceLabels: Record<Source, string> = { multi: "综合博彩", china: "竞彩", espn: "ESPN", elo: "Elo 评分" };
  const sourceTabOrder: Source[] = ["multi", "china", "espn", "elo"];

  return (
    <div className="max-w-4xl mx-auto px-4">
      {/* Source tabs */}
      <div className="flex gap-2 mb-3">
        {sourceTabOrder.map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
              source === s
                ? "bg-[#00FF41] text-[#0A0A0A]"
                : "bg-[#111111] text-[#666666] hover:text-white"
            }`}
          >
            {sourceLabels[s]}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl p-3 mb-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
          <div>
            <div className="text-[#888888] mb-0.5">预测场次</div>
            <div className="text-white font-bold text-sm">{stats.total}</div>
          </div>
          <div>
            <div className="text-[#888888] mb-0.5">已结算</div>
            <div className={`font-bold text-sm ${stats.winRate >= 50 ? "text-[#22c55e]" : "text-[#f97316]"}`}>
              {stats.won}/{stats.finished} ({stats.winRate}%)
            </div>
          </div>
          <div>
            <div className="text-[#888888] mb-0.5">投入 ¥{stats.totalBet.toLocaleString()}</div>
            <div className={`font-bold text-sm ${stats.profit >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
              回报 ¥{stats.totalReturn.toFixed(0)} ({stats.profit >= 0 ? "+" : ""}¥{stats.profit.toFixed(0)})
            </div>
          </div>
          <div>
            <div className="text-[#888888] mb-0.5">ROI</div>
            <div className={`font-bold text-lg ${Number(stats.roi) >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
              {Number(stats.roi) >= 0 ? "+" : ""}{stats.roi}%
            </div>
          </div>
        </div>
        <div className="mt-2 text-[10px] text-[#555555] text-center">
          每场固定投注 ¥{BET}，选择概率最高的结果 · {stats.upcoming} 场未开始
        </div>
      </div>

      {/* Match rows */}
      {rows.length === 0 ? (
        <div className="bg-[#111111] border border-[#222222] rounded-xl p-8 text-center">
          <p className="text-sm text-[#888888]">暂无可用赔率数据</p>
          <p className="text-xs text-[#555555] mt-1">等待赔率同步完成</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const potentialReturn = (r.bestDecimal * BET).toFixed(0);
            const profit = r.wouldWin === true ? `+¥${(r.bestDecimal * BET - BET).toFixed(0)}` : r.wouldWin === false ? "-¥100" : null;
            return (
              <div key={r.eventId} className="bg-[#111111] border border-[#222222] rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[#666666]">{formatDt(r.utcDate)}</span>
                  {r.status === "post" && r.homeScore != null && (
                    <span className="text-xs text-white font-bold">{r.homeScore} - {r.awayScore}</span>
                  )}
                  {r.status === "pre" && (
                    <span className="text-[10px] text-[#555555]">未开始</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white font-bold truncate">{r.homeCn} vs {r.awayCn}</div>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <div className="flex items-center gap-2">
                    <OutcomeTag outcome={r.predicted} />
                    <span className="text-xs text-[#888888]">{r.prob}%</span>
                    <span className="text-xs text-[#555555]">@ {r.bestDecimal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#555555]">¥{BET} → ¥{potentialReturn}</span>
                    {r.wouldWin !== null && (
                      <span className={`text-[11px] font-bold ${r.wouldWin ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                        {profit}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
