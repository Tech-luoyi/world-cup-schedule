// China Sports Lottery (竞彩) odds client
// Source: https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry
// No API key required, CORS enabled for browser fetch

const BASE = "https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry";

export interface ChinaLotteryOdds {
  matchId: number;
  matchNum: number;
  /** Mapped ESPN event_id (null if no match) */
  eventId: number | null;
  homeTeamCn: string;
  awayTeamCn: string;
  homeTeamKey: string;
  awayTeamKey: string;
  /** HAD 胜平负 decimal odds (non-handicap) */
  hadHome: number;
  hadDraw: number;
  hadAway: number;
}

// ── Chinese → English team name mapping ──
// Covers all 48 World Cup teams from teamMap.ts,
// with truncation variants the sporttery.cn API may use
const cnToEn: Record<string, string> = {
  // 亚洲 AFC
  "澳大利亚": "Australia",
  "伊朗": "Iran",
  "伊拉克": "Iraq",
  "日本": "Japan",
  "约旦": "Jordan",
  "卡塔尔": "Qatar",
  "沙特": "Saudi Arabia",
  "沙特阿拉伯": "Saudi Arabia",
  "韩国": "South Korea",
  "乌兹别克斯坦": "Uzbekistan",
  "乌兹别克": "Uzbekistan",

  // 非洲 CAF
  "阿尔及利亚": "Algeria",
  "阿尔及利": "Algeria",
  "佛得角": "Cape Verde Islands",
  "刚果(金)": "Congo DR",
  "刚果金": "Congo DR",
  "埃及": "Egypt",
  "加纳": "Ghana",
  "科特迪瓦": "Ivory Coast",
  "摩洛哥": "Morocco",
  "塞内加尔": "Senegal",
  "南非": "South Africa",
  "突尼斯": "Tunisia",

  // 北美洲 CONCACAF
  "加拿大": "Canada",
  "库拉索": "Curaçao",
  "海地": "Haiti",
  "墨西哥": "Mexico",
  "巴拿马": "Panama",
  "美国": "United States",

  // 南美洲 CONMEBOL
  "阿根廷": "Argentina",
  "巴西": "Brazil",
  "哥伦比亚": "Colombia",
  "厄瓜多尔": "Ecuador",
  "巴拉圭": "Paraguay",
  "乌拉圭": "Uruguay",

  // 欧洲 UEFA
  "奥地利": "Austria",
  "比利时": "Belgium",
  "波黑": "Bosnia-Herzegovina",
  "克罗地亚": "Croatia",
  "捷克": "Czechia",
  "英格兰": "England",
  "法国": "France",
  "德国": "Germany",
  "荷兰": "Netherlands",
  "挪威": "Norway",
  "葡萄牙": "Portugal",
  "苏格兰": "Scotland",
  "西班牙": "Spain",
  "瑞典": "Sweden",
  "瑞士": "Switzerland",
  "土耳其": "Turkey",

  // 大洋洲 OFC
  "新西兰": "New Zealand",
};

/** Fetch all China lottery odds for today */
export async function fetchChinaLotteryOdds(): Promise<ChinaLotteryOdds[]> {
  try {
    const url = `${BASE}?poolCode=hhad,had&channel=c`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[ChinaLottery] HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    if (!data?.value?.matchInfoList) {
      console.warn("[ChinaLottery] Unexpected response structure");
      return [];
    }

    const results: ChinaLotteryOdds[] = [];
    const matchDays: any[] = data.value.matchInfoList;

    for (const day of matchDays) {
      const subMatches: any[] = day.subMatchList || [];

      for (const m of subMatches) {
        if (m.leagueAbbName !== "世界杯") continue;

        const homeCn = m.homeTeamAllName || "";
        const awayCn = m.awayTeamAbbName || "";
        const homeKey = cnToEn[homeCn] || null;
        const awayKey = cnToEn[awayCn] || null;
        if (!homeKey || !awayKey) {
          console.warn(`[ChinaLottery] Unknown team: "${homeCn}" vs "${awayCn}"`);
          continue;
        }

        const oddsList: any[] = m.oddsList || [];
        // Find HAD (胜平负, non-handicap) odds
        const had = oddsList.find((o: any) => o.poolCode === "HAD");
        if (!had || !had.h || !had.d || !had.a) continue;

        results.push({
          matchId: m.matchId,
          matchNum: m.matchNum,
          eventId: null, // will be resolved later
          homeTeamCn: homeCn,
          awayTeamCn: awayCn,
          homeTeamKey: homeKey,
          awayTeamKey: awayKey,
          hadHome: parseFloat(had.h),
          hadDraw: parseFloat(had.d),
          hadAway: parseFloat(had.a),
        });
      }
    }

    console.log(`[ChinaLottery] Fetched ${results.length} World Cup matches with odds`);
    return results;
  } catch (e) {
    console.error("[ChinaLottery] Fetch failed:", e);
    return [];
  }
}
