// 2026 世界杯 16 个场馆（中美加）
export const STADIUMS = [
  "大都会人寿体育场 (新泽西)",
  "AT&T体育场 (得克萨斯)",
  "箭头体育场 (密苏里)",
  "NRG体育场 (休斯顿)",
  "梅赛德斯-奔驰体育场 (亚特兰大)",
  "SoFi体育场 (洛杉矶)",
  "硬石体育场 (迈阿密)",
  "吉列体育场 (马萨诸塞)",
  "林肯金融体育场 (费城)",
  "李维斯体育场 (旧金山)",
  "流明球场 (西雅图)",
  "阿兹特克体育场 (墨西哥城)",
  "BBVA体育场 (蒙特雷)",
  "阿克伦体育场 (瓜达拉哈拉)",
  "BMO球场 (多伦多)",
  "BC广场 (温哥华)",
];

// Deterministic venue assignment based on match_id
export function getVenue(matchId: number): string {
  return STADIUMS[matchId % STADIUMS.length];
}
