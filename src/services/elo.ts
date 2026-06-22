// Elo rating system for World Cup match prediction
// Based on the standard Elo algorithm with football-specific adaptations.
//
// Formula:
//   E_expected = 1 / (1 + 10^((R_opponent - R_self) / 400))
//   R_new = R_old + K × (S_actual - E_expected)
//
// Parameters:
//   K = 24 (World Cup match weight)
//   Home advantage = 0 (World Cup is neutral venues)
//   Initial rating = 1500

import type { EspnMatchWithOdds } from "./duckdb";

const INITIAL_RATING = 1500;
const K = 24;

// ── Types ──

export interface EloRating {
  teamKey: string;
  rating: number;
  matchesPlayed: number;
}

export interface EloPrediction {
  homeWin: number;   // de-vigged probability
  draw: number;
  awayWin: number;
}

export interface EloHistoryEntry {
  eventId: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homeRatingBefore: number;
  awayRatingBefore: number;
  homeRatingAfter: number;
  awayRatingAfter: number;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function actualScore(homeScore: number, awayScore: number, isHome: boolean): number {
  if (homeScore > awayScore) return isHome ? 1 : 0;
  if (homeScore < awayScore) return isHome ? 0 : 1;
  return 0.5; // draw
}

/**
 * Compute Elo ratings for all teams from completed matches.
 * Matches are processed chronologically — each match updates both teams' ratings.
 */
export function computeElo(matches: EspnMatchWithOdds[]): {
  ratings: EloRating[];
  history: EloHistoryEntry[];
} {
  const completed = matches
    .filter((m) => m.status === "post" && m.homeScore != null && m.awayScore != null)
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());

  const ratingMap = new Map<string, number>();
  const playedMap = new Map<string, number>();
  const history: EloHistoryEntry[] = [];

  for (const m of completed) {
    const homeKey = m.homeTeamKey;
    const awayKey = m.awayTeamKey;
    const homeScore = m.homeScore!;
    const awayScore = m.awayScore!;

    // Initialize if new team
    if (!ratingMap.has(homeKey)) ratingMap.set(homeKey, INITIAL_RATING);
    if (!ratingMap.has(awayKey)) ratingMap.set(awayKey, INITIAL_RATING);
    if (!playedMap.has(homeKey)) playedMap.set(homeKey, 0);
    if (!playedMap.has(awayKey)) playedMap.set(awayKey, 0);

    const homeRating = ratingMap.get(homeKey)!;
    const awayRating = ratingMap.get(awayKey)!;

    // No home advantage in World Cup (neutral venues)
    const E_home = expectedScore(homeRating, awayRating);
    const E_away = 1 - E_home;

    const S_home = actualScore(homeScore, awayScore, true);
    const S_away = actualScore(homeScore, awayScore, false);

    const newHome = homeRating + K * (S_home - E_home);
    const newAway = awayRating + K * (S_away - E_away);

    ratingMap.set(homeKey, newHome);
    ratingMap.set(awayKey, newAway);
    playedMap.set(homeKey, playedMap.get(homeKey)! + 1);
    playedMap.set(awayKey, playedMap.get(awayKey)! + 1);

    history.push({
      eventId: m.eventId,
      homeTeam: homeKey,
      awayTeam: awayKey,
      homeScore,
      awayScore,
      homeRatingBefore: Math.round(homeRating * 10) / 10,
      awayRatingBefore: Math.round(awayRating * 10) / 10,
      homeRatingAfter: Math.round(newHome * 10) / 10,
      awayRatingAfter: Math.round(newAway * 10) / 10,
    });
  }

  const ratings: EloRating[] = [];
  for (const [teamKey, rating] of ratingMap) {
    ratings.push({ teamKey, rating: Math.round(rating * 10) / 10, matchesPlayed: playedMap.get(teamKey) ?? 0 });
  }
  ratings.sort((a, b) => b.rating - a.rating);

  return { ratings, history };
}

/**
 * Predict match outcome from Elo ratings.
 *
 * Draw probability decreases as rating gap increases.
 */
export function predictFromElo(homeRating: number, awayRating: number): EloPrediction {
  const E_home = expectedScore(homeRating, awayRating);
  const E_away = 1 - E_home;

  // Draw probability: highest when teams are evenly matched (~25%), tails off with gap
  const diff = Math.abs(homeRating - awayRating);
  const drawProb = 0.28 * Math.exp(-diff / 300);

  // Scale home/away to fill remaining probability
  const total = E_home + E_away;
  if (total <= 0) return { homeWin: 0.34, draw: 0.32, awayWin: 0.34 };
  const remaining = 1 - drawProb;
  return {
    homeWin: Math.round(((E_home / total) * remaining) * 10000) / 10000,
    draw: Math.round(drawProb * 10000) / 10000,
    awayWin: Math.round(((E_away / total) * remaining) * 10000) / 10000,
  };
}

/**
 * Get a team's rating from the computed ratings array.
 */
export function getTeamRating(ratings: EloRating[], teamKey: string): number {
  return ratings.find((r) => r.teamKey === teamKey)?.rating ?? INITIAL_RATING;
}
