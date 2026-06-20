/**
 * One-time data enrichment script.
 *
 * Reads src/data/squads.ts, adds two new fields to every player:
 *   - detailedPosition: refined position (e.g. 左边锋, 中后卫, 前腰...)
 *   - marketValueEuro: estimated market value in EUR
 *
 * Usage: node scripts/enrich-squads.mjs
 */

import fs from 'fs';

// ── Config ──
const SRC = 'src/data/squads.ts';

// ═══════════════════════════════════════════════════════════════════
// KNOWN PLAYER POSITIONS (English name → detailed position)
// ═══════════════════════════════════════════════════════════════════
const KNOWN_POSITIONS = {
  // Group A
  "Guillermo Ochoa": "门将", "Edson Alvarez": "后腰", "Santiago Gimenez": "中锋",
  "Hirving Lozano": "左边锋", "Johan Vasquez": "中后卫", "Cesar Montes": "中后卫",
  "Jorge Sanchez": "右后卫", "Jesus Gallardo": "左后卫", "Henry Martin": "中锋",
  "Julian Araujo": "右后卫", "Alexis Vega": "左边锋",

  "Son Heung-min": "左边锋", "Kim Min-jae": "中后卫", "Lee Kang-in": "前腰",
  "Hwang Hee-chan": "左边锋", "Hwang In-beom": "后腰", "Lee Jae-sung": "前腰",
  "Cho Gue-sung": "中锋", "Kim Young-gwon": "中后卫", "Seol Young-woo": "左后卫",
  "Kim Moon-hwan": "右后卫", "Jeong Woo-yeong": "右边锋",

  "Patrik Schick": "中锋", "Tomas Soucek": "后腰", "Vladimir Coufal": "右后卫",
  "Adam Hlozek": "左边锋", "David Jurasek": "左后卫", "Tomas Holes": "中后卫",
  "Vaclav Cerny": "右边锋", "Michal Sadilek": "后腰",

  "Percy Tau": "左边锋", "Teboho Mokoena": "后腰", "Lyle Foster": "中锋",
  "Khuliso Mudau": "右后卫", "Aubrey Modiba": "左后卫", "Mothobi Mvala": "中后卫",

  // Group B
  "Alphonso Davies": "左后卫", "Jonathan David": "中锋", "Cyle Larin": "中锋",
  "Stephen Eustaquio": "后腰", "Tajon Buchanan": "右边锋", "Alistair Johnston": "右后卫",
  "Ismael Kone": "左中场", "Liam Millar": "左边锋",

  "Edin Dzeko": "中锋", "Miralem Pjanic": "前腰", "Rade Krunic": "左中场",
  "Sead Kolasinac": "左后卫", "Anel Ahmedhodzic": "中后卫", "Ermedin Demirovic": "左边锋",
  "Amar Dedic": "右后卫", "Ibrahim Sehic": "门将",

  "Lautaro Martinez": "中锋", "Lionel Messi": "右边锋", "Julian Alvarez": "中锋",
  "Angel Di Maria": "右边锋", "Enzo Fernandez": "后腰", "Alexis Mac Allister": "左中场",
  "Rodrigo De Paul": "右中场", "Cristian Romero": "中后卫", "Nicolas Otamendi": "中后卫",
  "Nicolas Tagliafico": "左后卫", "Nahuel Molina": "右后卫", "Emiliano Martinez": "门将",

  "Jhon Arias": "左边锋", "Luis Diaz": "左边锋", "James Rodriguez": "前腰",
  "Rafael Santos Borre": "中锋", "Jefferson Lerma": "后腰", "Mateus Uribe": "左中场",
  "Davinson Sanchez": "中后卫", "Daniel Munoz": "右后卫", "Yerry Mina": "中后卫",

  // Group C
  "Kylian Mbappe": "左边锋", "Ousmane Dembele": "右边锋", "Antoine Griezmann": "前腰",
  "Aurelien Tchouameni": "后腰", "Eduardo Camavinga": "左中场", "Dayot Upamecano": "中后卫",
  "Theo Hernandez": "左后卫", "Jules Kounde": "右后卫", "William Saliba": "中后卫",
  "Marcus Thuram": "中锋", "Randal Kolo Muani": "中锋",

  "Mohamed Salah": "右边锋", "Mahmoud Trezeguet": "左边锋", "Mostafa Mohamed": "中锋",
  "Omar Marmoush": "中锋", "Mohamed Elneny": "后腰", "Ahmed Hegazi": "中后卫",
  "Mohamed Abdelmonem": "中后卫",

  "Murat Yakin": "后腰", "Granit Xhaka": "后腰", "Breel Embolo": "中锋",
  "Manuel Akanji": "中后卫", "Ricardo Rodriguez": "左后卫", "Xherdan Shaqiri": "右边锋",
  "Denis Zakaria": "后腰", "Zeki Amdouni": "左边锋",

  "Adrien Rabiot": "左中场", "Christopher Nkunku": "前腰", "Olivier Giroud": "中锋",
  "Mike Maignan": "门将", "Ibrahima Konate": "中后卫", "Benjamin Pavard": "右后卫",

  // Group D
  "Christian Pulisic": "左边锋", "Timothy Weah": "右边锋", "Folarin Balogun": "中锋",
  "Weston McKennie": "右中场", "Yunus Musah": "后腰", "Tyler Adams": "后腰",
  "Antonee Robinson": "左后卫", "Sergino Dest": "右后卫", "Chris Richards": "中后卫",
  "Giovanni Reyna": "前腰",

  "Vinicius Junior": "左边锋", "Rodrygo": "右边锋", "Gabriel Martinelli": "左边锋",
  "Gabriel Jesus": "中锋", "Bruno Guimaraes": "后腰", "Lucas Paqueta": "前腰",
  "Eder Militao": "中后卫", "Marquinhos": "中后卫", "Danilo": "右后卫",
  "Renan Lodi": "左后卫",

  "Ferran Torres": "右边锋", "Pedri": "前腰", "Gavi": "左中场",
  "Rodri": "后腰", "Dani Olmo": "前腰", "Alvaro Morata": "中锋",
  "Nico Williams": "左边锋", "Lamine Yamal": "右边锋", "Aymeric Laporte": "中后卫",

  "Salem Al-Dawsari": "左边锋", "Firas Al-Buraikan": "中锋", "Mohammed Kanno": "后腰",
  "Ali Al-Bulayhi": "中后卫", "Saud Abdulhamid": "右后卫",

  // Group E
  "Aleksandar Mitrovic": "中锋", "Dusan Vlahovic": "中锋", "Sergej Milinkovic-Savic": "前腰",
  "Dusan Tadic": "左边锋", "Filip Kostic": "左后卫", "Nikola Milenkovic": "中后卫",
  "Strahinja Pavlovic": "中后卫", "Andrija Zivkovic": "右边锋",

  "Dominik Szoboszlai": "前腰", "Roland Sallai": "右边锋", "Barnabas Varga": "中锋",
  "Willi Orban": "中后卫", "Milos Kerkez": "左后卫", "Callum Styles": "后腰",

  "Evan Ferguson": "中锋", "Nathan Collins": "中后卫", "Matt Doherty": "右后卫",
  "Josh Cullen": "后腰", "Andrew Omobamidele": "中后卫",

  "Odion Ighalo": "中锋", "Moses Simon": "左边锋", "Samuel Chukwueze": "右边锋",
  "Wilfred Ndidi": "后腰", "Alex Iwobi": "前腰", "Victor Osimhen": "中锋",
  "Calvin Bassey": "左后卫", "Ola Aina": "右后卫", "Semi Ajayi": "中后卫",
  "Joe Aribo": "左中场", "Kelechi Iheanacho": "中锋", "Ademola Lookman": "左边锋",

  // Group F
  "Jude Bellingham": "前腰", "Harry Kane": "中锋", "Phil Foden": "左边锋",
  "Bukayo Saka": "右边锋", "Declan Rice": "后腰", "Trent Alexander-Arnold": "右后卫",
  "John Stones": "中后卫", "Kyle Walker": "右后卫", "Jack Grealish": "左边锋",
  "Cole Palmer": "前腰", "Jordan Pickford": "门将", "Harry Maguire": "中后卫",

  "Jonathan Clauss": "右后卫", "Raphael Varane": "中后卫", "Moussa Diaby": "右边锋",
  "Elye Wahi": "中锋", "Warren Zaire-Emery": "后腰",

  "Fabian Schar": "中后卫", "Remo Freuler": "后腰", "Noah Okafor": "左边锋",
  "Ruben Vargas": "右边锋", "Silvan Widmer": "右后卫",

  "Jay Idzes": "中后卫", "Sandy Walsh": "右后卫", "Shayne Pattynama": "左后卫",
  "Rafael Struick": "中锋",

  // Group G
  "Jamal Musiala": "前腰", "Leroy Sane": "右边锋", "Florian Wirtz": "前腰",
  "Kai Havertz": "中锋", "Ilkay Gundogan": "左中场", "Joshua Kimmich": "后腰",
  "Antonio Rudiger": "中后卫", "Jonathan Tah": "中后卫", "David Raum": "左后卫",
  "Manuel Neuer": "门将", "Marc-Andre ter Stegen": "门将", "Niclas Fullkrug": "中锋",

  "Jose Cifuentes": "后腰", "Moises Caicedo": "后腰", "Enner Valencia": "中锋",
  "Piero Hincapie": "左后卫", "Pervis Estupinan": "左后卫", "Willian Pacho": "中后卫",

  "Takumi Minamino": "前腰", "Kaoru Mitoma": "左边锋", "Takefusa Kubo": "右边锋",
  "Wataru Endo": "后腰", "Daichi Kamada": "前腰", "Ritsu Doan": "右边锋",
  "Ko Itakura": "中后卫", "Hiroki Ito": "左后卫", "Ayase Ueda": "中锋",

  "Theo Bongonda": "左边锋", "Charles De Ketelaere": "前腰", "Leandro Trossard": "左边锋",
  "Kevin De Bruyne": "前腰", "Romelu Lukaku": "中锋", "Jeremy Doku": "右边锋",
  "Youri Tielemans": "后腰", "Amadou Onana": "后腰", "Jan Vertonghen": "中后卫",
  "Timothy Castagne": "右后卫", "Wout Faes": "中后卫",

  // Group H
  "Rafael Leao": "左边锋", "Bruno Fernandes": "前腰", "Bernardo Silva": "右边锋",
  "Cristiano Ronaldo": "中锋", "Ruben Dias": "中后卫", "Joao Cancelo": "右后卫",
  "Vitinha": "后腰", "Diogo Costa": "门将", "Diogo Jota": "左边锋",
  "Joao Palhinha": "后腰", "Nuno Mendes": "左后卫", "Goncalo Inacio": "中后卫",

  "Khvicha Kvaratskhelia": "左边锋", "Georges Mikautadze": "中锋",
  "Guram Kashia": "中后卫", "Giorgi Mamardashvili": "门将",

  "Alejandro Garnacho": "左边锋", "Federico Valverde": "右中场", "Darwin Nunez": "中锋",
  "Rodrigo Bentancur": "后腰", "Ronald Araujo": "中后卫", "Jose Gimenez": "中后卫",
  "Mathias Olivera": "左后卫", "Manuel Ugarte": "后腰",

  "Hakim Ziyech": "前腰", "Achraf Hakimi": "右后卫", "Youssef En-Nesyri": "中锋",
  "Sofyan Amrabat": "后腰", "Noussair Mazraoui": "左后卫", "Nayef Aguerd": "中后卫",
  "Romain Saiss": "中后卫",

  // Group I
  "Vincent Aboubakar": "中锋", "Andre Onana": "门将", "Andre-Frank Zambo Anguissa": "后腰",
  "Karl Toko Ekambi": "左边锋", "Bryan Mbeumo": "右边锋", "Jean-Charles Castelletto": "中后卫",
  "Nouhou Tolo": "左后卫", "Collins Fai": "右后卫",

  "Sardar Azmoun": "中锋", "Mehdi Taremi": "中锋", "Alireza Jahanbakhsh": "右边锋",
  "Saeid Ezatolahi": "后腰", "Saman Ghoddos": "前腰", "Milad Mohammadi": "左后卫",
  "Hossein Kanaani": "中后卫",

  "Johan Mojica": "左后卫", "Luis Sinisterra": "左边锋", "Jhon Duran": "中锋",
  "Juan Cuadrado": "右边锋", "Duvan Zapata": "中锋", "Kevin Castano": "后腰",
  "Deiver Machado": "左后卫", "Carlos Cuesta": "中后卫",

  "Riyad Mahrez": "右边锋", "Islam Slimani": "中锋", "Ismael Bennacer": "后腰",
  "Ramy Bensebaini": "左后卫", "Houssem Aouar": "前腰", "Aissa Mandi": "中后卫",
  "Youcef Atal": "右后卫", "Amine Gouiri": "左边锋",

  // Group J
  "Memphis Depay": "中锋", "Cody Gakpo": "左边锋", "Virgil van Dijk": "中后卫",
  "Frenkie de Jong": "后腰", "Matthijs de Ligt": "中后卫", "Denzel Dumfries": "右后卫",
  "Daley Blind": "左后卫", "Xavi Simons": "前腰", "Donny van de Beek": "前腰",
  "Donyell Malen": "右边锋", "Ryan Gravenberch": "左中场",

  "Andreas Christensen": "中后卫", "Christian Eriksen": "前腰", "Rasmus Hojlund": "中锋",
  "Pierre-Emile Hojbjerg": "后腰", "Joakim Maehle": "左后卫", "Jens Stryger Larsen": "右后卫",
  "Mikkel Damsgaard": "前腰", "Jonas Wind": "中锋",

  "Samuel Umtiti": "中后卫", "Ellyes Skhiri": "后腰", "Youssef Msakni": "前腰",
  "Mohamed Ali Ben Romdhane": "后腰", "Aissa Laidouni": "左中场",

  "Heung-Min Son": "左边锋", // alias
  "Moussa Niakhate": "中后卫",

  // Group K
  "Erling Haaland": "中锋", "Martin Odegaard": "前腰", "Alexander Sorloth": "中锋",
  "Sander Berge": "后腰", "Julian Ryerson": "右后卫", "Leo Ostigard": "中后卫",
  "Fredrik Aursnes": "左中场", "Kristoffer Ajer": "中后卫",

  "Sofiane Boufal": "左边锋", "Azzedine Ounahi": "前腰", "Noussair Mazraoui": "左后卫",
  "Munir El Haddadi": "左边锋", "Ayoub El Kaabi": "中锋", "Selim Amallah": "前腰",

  "Heung-Min Son": "左边锋",
  // already covered above
  "Jonathan Bamba": "左边锋", "Sebastien Haller": "中锋",
  "Nicolas Pepe": "右边锋", "Franck Kessie": "后腰", "Serge Aurier": "右后卫",
  "Evan Ndicka": "中后卫", "Simon Adingra": "左边锋",

  // Group L
  "Almoez Ali": "中锋", "Akram Afif": "左边锋", "Hassan Al-Haydos": "前腰",
  "Boualem Khoukhi": "中后卫", "Pedro Miguel": "右后卫", "Abdelkarim Hassan": "左后卫",

  "Awer Mabil": "右边锋", "Mat Ryan": "门将", "Harry Souttar": "中后卫",
  "Jackson Irvine": "后腰", "Craig Goodwin": "左边锋", "Martin Boyle": "右边锋",
  "Kye Rowles": "中后卫",

  "Musa Barrow": "左边锋", "Ablie Jallow": "右边锋",

  "Georgian De Arrascaeta": "前腰", "Maximiliano Araujo": "左边锋",
  "Nicolas De La Cruz": "右中场",
};

// ═══════════════════════════════════════════════════════════════════
// CLUB TIERS (5 = elite, 1 = small)
// ═══════════════════════════════════════════════════════════════════
const CLUB_TIERS = {
  // ═══ Tier 5 - Elite clubs ═══
  "曼城": 5, "皇家马德里": 5, "拜仁慕尼黑": 5, "巴黎圣日耳曼": 5,
  "利物浦": 5, "巴塞罗那": 5, "阿森纳": 5, "国际米兰": 5,
  "切尔西": 5, "曼联": 5, "尤文图斯": 5,

  // ═══ Tier 4 - Strong European ═══
  "多特蒙德": 4, "勒沃库森": 4, "莱比锡红牛": 4, "AC米兰": 4,
  "那不勒斯": 4, "罗马": 4, "亚特兰大": 4, "拉齐奥": 4, "博洛尼亚": 4,
  "马德里竞技": 4, "赫罗纳": 4, "皇家社会": 4, "毕尔巴鄂竞技": 4, "比利亚雷亚尔": 4,
  "巴黎圣日尔曼": 5,
  "纽卡斯尔联": 4, "热刺": 4, "阿斯顿维拉": 4, "布莱顿": 4, "西汉姆联": 4,
  "马赛": 4, "里昂": 4, "摩纳哥": 4, "朗斯": 4, "尼斯": 4, "雷恩": 4, "里尔": 4,
  "波尔图": 4, "本菲卡": 4, "葡萄牙体育": 4, "布拉加": 4,
  "埃因霍温": 4, "阿贾克斯": 4, "费耶诺德": 4,
  "凯尔特人": 3, "流浪者": 3,
  "加拉塔萨雷": 4, "费内巴切": 4, "贝西克塔斯": 4,
  "顿涅茨克矿工": 4, "圣彼得堡泽尼特": 4,
  "贝尔格莱德红星": 3,
  "布鲁日": 4, "安德莱赫特": 4,
  "萨尔茨堡红牛": 4,
  "巴伦西亚": 4, "塞维利亚": 4,
  "诺丁汉森林": 3, "富勒姆": 3, "伯恩茅斯": 3, "狼队": 3,
  "伯恩利": 3, "利兹联": 3, "埃弗顿": 3, "水晶宫": 3,
  "都灵": 3, "热那亚": 3, "蒙扎": 3, "萨索洛": 3,
  "法兰克福": 3, "弗赖堡": 3, "沃尔夫斯堡": 3, "门兴格拉德巴赫": 3,
  "斯图加特": 3, "霍芬海姆": 3, "柏林联合": 3, "美因茨": 3,
  "西班牙人": 3, "赫塔费": 3, "奥萨苏纳": 3,
  "巴黎FC": 3, "斯特拉斯堡": 3, "兰斯": 3, "蒙彼利埃": 3, "南特": 3,
  "布拉格斯拉维亚": 3, "布拉格斯巴达": 3,
  "奥林匹亚科斯": 3, "帕纳辛纳科斯": 3, "雅典AEK": 3, "PAOK": 3,
  "费内巴赫": 4, "加拉塔萨雷伊": 4,
  "根特": 3, "亨克": 3, "安特卫普": 3,
  "博多格林特": 3, "莫尔德": 3,

  // ═══ Tier 2 / 3 - Mid-level clubs ═══
  "克鲁塞罗": 2, "弗拉门戈": 3, "帕尔梅拉斯": 3, "桑托斯": 2,
  "博塔弗戈": 2, "圣保罗": 2, "弗鲁米嫩塞": 2, "米内罗竞技": 2,
  "河床": 3, "博卡青年": 3,
  "美洲": 3, "蓝十字": 3, "蒙特雷": 3, "瓜达拉哈拉": 3, "托卢卡": 2,
  "利雅得新月": 3, "利雅得胜利": 3, "利雅得青年": 2, "吉达联合": 2,
  "萨德": 2, "杜海勒": 2, "迪拜祈祷": 2, "阿布扎比统一": 2,
  "阿尔艾因": 2, "艾因": 2, "哈利季费坎": 1,
  "萨勒尼塔纳": 2, "阿尔梅里亚": 2,
  "蔚山现代": 2, "全北现代": 2,
  "横滨水手": 2, "浦和红钻": 2, "川崎前锋": 2,
  "莫斯科迪纳摩": 2, "莫斯科斯巴达": 2,
  "金字塔": 1, "开罗国民": 2, "扎马雷克": 2,
  "马梅洛迪日落": 1, "奥兰多海盗": 1, "超级体育联": 1,
  "亨克": 2,
  "中日德兰": 2, "哥本哈根": 2,
  "特温特": 2, "阿尔克马尔": 2,
  "斯托克城": 2, "赫尔城": 2, "伯明翰城": 2,

  // ═══ MLS / Others ═══
  "明尼苏达联": 2, "波特兰伐木工": 1, "多伦多FC": 2, "蒙特利尔": 2,
  "温哥华白帽": 1, "哥伦布机员": 2, "纳什维尔": 2,

  // More clubs that appear in the data - auto-classified
  "迈阿密国际": 2, "洛杉矶FC": 2, "洛杉矶银河": 2,
  "亚特兰大联": 2, "纽约城FC": 2, "西雅图海湾人": 2,
};

/** Get club tier, default to 1 for unknown clubs */
function getClubTier(club) {
  if (CLUB_TIERS[club]) return CLUB_TIERS[club];
  // Attempt fuzzy match (check if known club name is substring)
  for (const [name, tier] of Object.entries(CLUB_TIERS)) {
    if (club.includes(name) || name.includes(club)) return tier;
  }
  return 1; // Unknown clubs default to Tier 1
}

/** Base value by tier */
function baseTierValue(tier) {
  const map = { 1: 1_500_000, 2: 6_000_000, 3: 15_000_000, 4: 30_000_000, 5: 50_000_000 };
  return map[tier] || 1_500_000;
}

/** Age multiplier curve */
function ageCurve(age) {
  if (age <= 20) return 0.4 + (age - 16) * 0.06;
  if (age <= 23) return 0.64 + (age - 20) * 0.12;
  if (age <= 27) return 1.0 + (age - 23) * 0.08;
  if (age <= 30) return 1.32 - (age - 27) * 0.06;
  if (age <= 35) return 1.14 - (age - 30) * 0.09;
  return Math.max(0.1, 0.69 - (age - 35) * 0.08);
}

/** Position premium */
const POSITION_PREMIUM = {
  "门将": 0.70,
  "左后卫": 0.85, "右后卫": 0.85, "中后卫": 0.95,
  "后腰": 0.90, "左中场": 0.80, "右中场": 0.80, "前腰": 1.05,
  "左边锋": 1.10, "右边锋": 1.10, "中锋": 1.20,
};

/** Compute market value */
function computeMarketValue(club, age, caps, goals, detailedPos) {
  const tier = getClubTier(club);
  const base = baseTierValue(tier);
  const ageMult = ageCurve(age);
  const capsMult = 1.0 + Math.min((caps || 0) / 250, 0.6);
  const goalsMult = 1.0 + Math.min((goals || 0) / 160, 0.4);
  const posMult = POSITION_PREMIUM[detailedPos] || 0.8;
  const raw = base * ageMult * capsMult * goalsMult * posMult;
  // Round to nearest 100K for realistic values
  return Math.round(raw / 100_000) * 100_000;
}

/** Simple hash function for deterministic assignment */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Assign detailed position based on generic position + hash of player identity.
 * Uses known-player map first, then hash-based distribution.
 */
function assignDetailedPosition(nameEn, teamKey, genericPos) {
  // Check known positions first
  const key = nameEn;
  if (KNOWN_POSITIONS[key]) return KNOWN_POSITIONS[key];

  // Hash-based assignment for unknown players
  const hash = hashString(nameEn + "::" + teamKey);

  switch (genericPos) {
    case "门将":
      return "门将";

    case "后卫": {
      // Distribute: 40% CB, 30% LB, 30% RB
      const h = hash % 100;
      if (h < 40) return "中后卫";
      if (h < 70) return "左后卫";
      return "右后卫";
    }

    case "中场": {
      // Distribute: 30% CDM, 25% CAM, 23% LM, 22% RM
      const h = hash % 100;
      if (h < 30) return "后腰";
      if (h < 55) return "前腰";
      if (h < 78) return "左中场";
      return "右中场";
    }

    case "前锋": {
      // Distribute: 40% ST, 30% LW, 30% RW
      const h = hash % 100;
      if (h < 40) return "中锋";
      if (h < 70) return "左边锋";
      return "右边锋";
    }

    default:
      return genericPos;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

const content = fs.readFileSync(SRC, 'utf-8');

// Regex to match player objects. Each player is one line like:
//   { name: "奥乔亚", nameEn: "Guillermo Ochoa", position: "门将", number: 13, club: "萨勒尼塔纳", age: 39, caps: 150, goals: 0 },
const playerRegex = /\{ name: "([^"]*)", nameEn: "([^"]*)", position: "([^"]*)", number: (\d+), club: "([^"]*)", age: (\d+), caps: (\d+), goals: (\d+) \},\n/g;

let totalPlayers = 0;
const teamKeyMap = new Map();

// First, extract the team context
// Team blocks look like:
//   teamKey: "Mexico", teamCn: "墨西哥", ...
// And they contain players arrays

const teamBlocks = content.split(/\n\s+teamKey:/);
// teamBlocks[0] is the header (interface definitions etc.)
// teamBlocks[1..] each start with: "Mexico", teamCn: ...

// But the teamKey extraction from the full context is tricky with multiline.
// Simpler approach: find the current teamKey by scanning backwards for each player match.

// Actually, let me use a different approach.
// Parse the file into team blocks, then process each team's players.

// Split by team block pattern
const lines = content.split('\n');
let currentTeamKey = '';
let result = '';

let playerCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Detect teamKey assignment
  const teamKeyMatch = line.match(/teamKey:\s*"([^"]+)"/);
  if (teamKeyMatch) {
    currentTeamKey = teamKeyMatch[1];
    result += line + '\n';
    continue;
  }

  // Try to match a player line
  const playerMatch = line.match(playerRegex.source.replace(/\\n/g, '').replace(/^\{/, '{').replace(/\},\n$/, '}'));
  // Actually, let me just use the global regex with exec

  // Let me try a simpler approach - match player lines directly
  const pm = line.match(/\{ name: "([^"]*)", nameEn: "([^"]*)", position: "([^"]*)", number: (\d+), club: "([^"]*)", age: (\d+), caps: (\d+), goals: (\d+) \},/);
  if (pm) {
    const [, name, nameEn, position, number, club, ageStr, caps, goals] = pm;
    const age = parseInt(ageStr);

    const detailedPosition = assignDetailedPosition(nameEn, currentTeamKey, position);
    const marketValueEuro = computeMarketValue(club, age, parseInt(caps), parseInt(goals), detailedPosition);

    // Reconstruct the line with new fields inserted after position
    const newLine = `      { name: "${name}", nameEn: "${nameEn}", position: "${position}", detailedPosition: "${detailedPosition}", marketValueEuro: ${marketValueEuro}, number: ${number}, club: "${club}", age: ${age}, caps: ${caps}, goals: ${goals} },`;
    result += newLine + '\n';
    playerCount++;
  } else {
    result += line + '\n';
  }
}

console.log(`Processed ${playerCount} players across teams`);
console.log(`Current team key on last player: ${currentTeamKey}`);

// Write the result
fs.writeFileSync(SRC, result, 'utf-8');
console.log(`Written to ${SRC}`);
