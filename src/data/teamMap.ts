// Actual 48 teams from smach API → { flag emoji, Chinese name, continent }
export const teamMap: Record<string, { flag: string; name: string; continent: string }> = {
  // ── 亚洲 AFC ──
  Australia: { flag: "🇦🇺", name: "澳大利亚", continent: "亚洲" },
  Iran: { flag: "🇮🇷", name: "伊朗", continent: "亚洲" },
  Iraq: { flag: "🇮🇶", name: "伊拉克", continent: "亚洲" },
  Japan: { flag: "🇯🇵", name: "日本", continent: "亚洲" },
  Jordan: { flag: "🇯🇴", name: "约旦", continent: "亚洲" },
  Qatar: { flag: "🇶🇦", name: "卡塔尔", continent: "亚洲" },
  "Saudi Arabia": { flag: "🇸🇦", name: "沙特", continent: "亚洲" },
  "South Korea": { flag: "🇰🇷", name: "韩国", continent: "亚洲" },
  Uzbekistan: { flag: "🇺🇿", name: "乌兹别克斯坦", continent: "亚洲" },

  // ── 非洲 CAF ──
  Algeria: { flag: "🇩🇿", name: "阿尔及利亚", continent: "非洲" },
  "Cape Verde Islands": { flag: "🇨🇻", name: "佛得角", continent: "非洲" },
  "Congo DR": { flag: "🇨🇩", name: "刚果(金)", continent: "非洲" },
  Egypt: { flag: "🇪🇬", name: "埃及", continent: "非洲" },
  Ghana: { flag: "🇬🇭", name: "加纳", continent: "非洲" },
  "Ivory Coast": { flag: "🇨🇮", name: "科特迪瓦", continent: "非洲" },
  Morocco: { flag: "🇲🇦", name: "摩洛哥", continent: "非洲" },
  Senegal: { flag: "🇸🇳", name: "塞内加尔", continent: "非洲" },
  "South Africa": { flag: "🇿🇦", name: "南非", continent: "非洲" },
  Tunisia: { flag: "🇹🇳", name: "突尼斯", continent: "非洲" },

  // ── 北美洲 CONCACAF ──
  Canada: { flag: "🇨🇦", name: "加拿大", continent: "北美洲" },
  Curaçao: { flag: "🇨🇼", name: "库拉索", continent: "北美洲" },
  Haiti: { flag: "🇭🇹", name: "海地", continent: "北美洲" },
  Mexico: { flag: "🇲🇽", name: "墨西哥", continent: "北美洲" },
  Panama: { flag: "🇵🇦", name: "巴拿马", continent: "北美洲" },
  "United States": { flag: "🇺🇸", name: "美国", continent: "北美洲" },

  // ── 南美洲 CONMEBOL ──
  Argentina: { flag: "🇦🇷", name: "阿根廷", continent: "南美洲" },
  Brazil: { flag: "🇧🇷", name: "巴西", continent: "南美洲" },
  Colombia: { flag: "🇨🇴", name: "哥伦比亚", continent: "南美洲" },
  Ecuador: { flag: "🇪🇨", name: "厄瓜多尔", continent: "南美洲" },
  Paraguay: { flag: "🇵🇾", name: "巴拉圭", continent: "南美洲" },
  Uruguay: { flag: "🇺🇾", name: "乌拉圭", continent: "南美洲" },

  // ── 欧洲 UEFA ──
  Austria: { flag: "🇦🇹", name: "奥地利", continent: "欧洲" },
  Belgium: { flag: "🇧🇪", name: "比利时", continent: "欧洲" },
  "Bosnia-Herzegovina": { flag: "🇧🇦", name: "波黑", continent: "欧洲" },
  Croatia: { flag: "🇭🇷", name: "克罗地亚", continent: "欧洲" },
  Czechia: { flag: "🇨🇿", name: "捷克", continent: "欧洲" },
  England: { flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", name: "英格兰", continent: "欧洲" },
  France: { flag: "🇫🇷", name: "法国", continent: "欧洲" },
  Germany: { flag: "🇩🇪", name: "德国", continent: "欧洲" },
  Netherlands: { flag: "🇳🇱", name: "荷兰", continent: "欧洲" },
  Norway: { flag: "🇳🇴", name: "挪威", continent: "欧洲" },
  Portugal: { flag: "🇵🇹", name: "葡萄牙", continent: "欧洲" },
  Scotland: { flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", name: "苏格兰", continent: "欧洲" },
  Spain: { flag: "🇪🇸", name: "西班牙", continent: "欧洲" },
  Sweden: { flag: "🇸🇪", name: "瑞典", continent: "欧洲" },
  Switzerland: { flag: "🇨🇭", name: "瑞士", continent: "欧洲" },
  Turkey: { flag: "🇹🇷", name: "土耳其", continent: "欧洲" },

  // ── 大洋洲 OFC ──
  "New Zealand": { flag: "🇳🇿", name: "新西兰", continent: "大洋洲" },
};

export function getFlag(countryName: string): string {
  return teamMap[countryName]?.flag ?? "🏳️";
}

export function getChineseName(countryName: string): string {
  return teamMap[countryName]?.name ?? countryName;
}

export function getContinent(countryName: string): string {
  return teamMap[countryName]?.continent ?? "其他";
}
