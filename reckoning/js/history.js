// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// HISTORICAL BATTLES: ten fields of the game's own years and two fights at sea, fought again on the ground where they were — the armies that
// stood there, in their own coats, under their own colours, at the hour of the day it was and in its weather; you a
// captain of a company on whichever side you choose. Each is a company's share of the day, not the whole of it (the
// cavalry only a share of it: the great charges were thousands strong), and against bots only; a win or a loss
// rates nothing — what's kept is which you've won, and on which side.
//
// A battle: its sides, each a list of companies (the first of the side you choose is yours): uni, the coats; muster,
// its men by kind (pvp.js's TROOPS); guns; call, a kind's own name in that army. fort: the side that holds works (one
// company a side only). hold: how long a side's officers stand before coming on (a defender, long). won: the side
// that won the day, as it happened (null: neither). map: its ground and what stood on it (histmap.js).
// A battle at sea (sea: true) has, for each side, a fleet (naval.js's ships, each of its own nation where the side's a
// league of two), and is fought as the campaign's are: you on the flagship, the other captains on their own.

export const BATTLES = [
  {
    id: "chocim", name: "Chocim", date: "11 November 1673", year: 1673, lon: 26.5, lat: 48.5, at: "On the Dniester, in Podolia",
    hour: "morning", cloud: 0.85, mist: 0.35, fort: 1, won: 0, you: 0,
    map: { ramp: [-40, 0, 60, 4], rivers: [{ u: 96, w: 34, d: 2.4 }], low: 3, things: [["tents", 66, 76, -44, 44, 16], ["castle", 92, 120, 1.2], ["church", -120, -60, 0.3, 14, 7]] },
    brief: "Hussein Pasha's army has dug in on the old camp above the Dniester, behind ramparts. Hetman Jan Sobieski has kept the Polish–Lithuanian army standing to arms all through a night of sleet, so the Turks are worn out with watching. At dawn the infantry and dismounted dragoons go over the earthworks first, to open a way for the hussars.",
    after: ["The Polish foot carried the ramparts and the hussars rode through the gaps. The Turkish army broke against the river; the bridge gave way under the men crowding onto it. Within a year Sobieski was King of Poland.", "History went the other way: here the camp held."],
    sides: [
      { name: "The Commonwealth", lead: "Hetman Jan Sobieski", cos: [{ uni: "polish", muster: { musketeer: 16, sword: 6, pike: 4, grenadier: 4 }, guns: 2, call: { sword: "Dragoon" } }] },
      { name: "The Ottoman army", lead: "Hussein Pasha", hold: 999, cos: [{ uni: "ottoman", muster: { musketeer: 16, bow: 10, sword: 8 }, guns: 2 }] },
    ],
  },
  {
    id: "seneffe", name: "Seneffe", date: "11 August 1674", year: 1674, lon: 4.26, lat: 50.53, at: "In the Spanish Netherlands",
    hour: "evening", cloud: 0.2, mist: 0, fort: null, won: null, you: 0,
    map: { hills: [{ u: -60, v: 70, r: 50, h: 4 }, { u: 80, v: -60, r: 60, h: 3 }], things: [["church", 18, 62, 0.2, 20, 12], ["house", 0, 52, 0.1], ["house", 32, 50, -0.2, 8, 5, "tile"], ["house", 8, 74, 1.4], ["house", 40, 70, 0.3], ["house", -20, -58, 0.2, 9, 6, "tile"], ["house", -6, -66, 1.5], ["house", -32, -64, 0.1], ["mill", 90, 10]] },
    brief: "The Prince of Condé has caught William of Orange's allied army strung out on the march: Dutch, Spanish and the Emperor's men. He falls on them in the afternoon, and the fighting runs on, village by village, until well past dark: one of the bloodiest days of the war.",
    after: ["Both sides claimed it. Condé held the field and took the baggage, but neither army could do more for the rest of the year. Close to twenty thousand men were killed or wounded.", "Both sides claimed it. Condé held the field and took the baggage, but neither army could do more for the rest of the year. Close to twenty thousand men were killed or wounded."],
    sides: [
      { name: "The French", lead: "Louis, Prince of Condé", cos: [{ uni: "french", muster: { musketeer: 14, pike: 6, grenadier: 4 }, guns: 1 }, { uni: "french", muster: { musketeer: 12, pike: 6, cavalry: 4 }, guns: 1 }] },
      { name: "The Allies", lead: "William of Orange", hold: 20, cos: [{ uni: "dutch", muster: { musketeer: 12, pike: 6 }, guns: 1 }, { uni: "spanish", muster: { musketeer: 10, pike: 8, sword: 2 } }, { uni: "imperial", muster: { musketeer: 12, pike: 4, grenadier: 2 }, guns: 1 }] },
    ],
  },
  {
    id: "fehrbellin", name: "Fehrbellin", date: "28 June 1675", year: 1675, lon: 12.77, lat: 52.81, at: "In the Mark of Brandenburg",
    hour: "morning", cloud: 0.55, mist: 0.7, fort: null, won: 0, you: 0,
    map: { hills: [{ u: -48, v: -26, r: 30, h: 6 }, { u: -52, v: 24, r: 28, h: 5 }, { u: -95, v: 0, r: 40, h: 7 }], marsh: { u0: 72, u1: 200 }, things: [["church", 130, -110, 0.4, 16, 9], ["house", 120, -90, 0.3], ["house", 140, -92, 0.1], ["mill", -70, 60]] },
    brief: "The Swedes have invaded Brandenburg while its Elector was away at the Rhine. Frederick William has marched back faster than anyone believed he could. He caught Wrangel's rearguard in the fog by the Rhin marshes, fewer men but more guns, and set his guns on the sandhills.",
    after: ["The Brandenburg guns on the hills, and their horse, broke the Swedish line, and the Swedes fell back across the marshes. Brandenburg had beaten the army everyone feared. From that day the Elector was called the Great.", "Here Sweden's army kept its fearsome name."],
    sides: [
      { name: "Brandenburg", lead: "Frederick William, the Great Elector", cos: [{ uni: "brandenburg", muster: { musketeer: 8, sword: 4, cavalry: 8 }, guns: 3, call: { sword: "Dragoon", cavalry: "Cuirassier" } }] },
      { name: "Sweden", lead: "Wolmar Wrangel", hold: 40, cos: [{ uni: "swedish", muster: { musketeer: 16, pike: 8, cavalry: 3 }, guns: 2 }] },
    ],
  },
  {
    id: "lund", name: "Lund", date: "4 December 1676", year: 1676, lon: 13.19, lat: 55.7, at: "In Scania",
    hour: "morning", cloud: 0.6, mist: 0.25, fort: null, won: 0, you: 0,
    map: { snow: true, hills: [{ u: -70, v: 30, r: 45, h: 4 }], rivers: [{ v: -96, w: 18, d: 1.6 }], low: 3.2, things: [["spire", -150, 240, 55, "slate"], ["spire", -122, 236, 55, "slate"], ["house", 40, -70, 0.2], ["house", 58, -66, 0.4]] },
    brief: "Christian V has brought a Danish army over the Sound to win back Scania. Young Charles XI of Sweden crosses the frozen river at first light and attacks, on ground hard with frost. The Danes outnumber him.",
    after: ["After eight hours, about half of all the men on the field had been killed or wounded, the bloodiest battle Scandinavia ever saw. The Swedes held the field, and Scania stayed Swedish.", "Here the Danes won back Scania's last hope."],
    sides: [
      { name: "Sweden", lead: "King Charles XI", cos: [{ uni: "swedish", muster: { musketeer: 12, pike: 6, cavalry: 4 }, guns: 1 }, { uni: "swedish", muster: { musketeer: 14, pike: 6, grenadier: 2 }, guns: 1 }] },
      { name: "Denmark", lead: "King Christian V", hold: 12, cos: [{ uni: "danish", muster: { musketeer: 14, pike: 6 }, guns: 1 }, { uni: "danish", muster: { musketeer: 10, pike: 4, cavalry: 4 } }, { uni: "danish", muster: { musketeer: 12, pike: 4, grenadier: 2 }, guns: 1 }] },
    ],
  },
  {
    id: "vienna", name: "Vienna", date: "12 September 1683", year: 1683, lon: 16.3, lat: 48.27, at: "The Kahlenberg, before Vienna",
    hour: "afternoon", cloud: 0.15, mist: 0, fort: null, won: 0, you: 0,
    map: { ramp: [-140, 26, 30, 0], hills: [{ u: -210, v: -40, r: 90, h: 34 }], rivers: [{ v: -210, w: 60, d: 2.6 }], r2: 360, things: [["vines", -72, -14, -46, -14], ["vines", -72, -14, 14, 46], ["tents", 64, 120, -55, 55, 22], ["spire", 330, 40, 120, "slate"], ["city", 300, -60, 140, 12], ["skyline", 420, 10, 1.6, "vienna", 30], ["church", -150, 60, 0.3, 18, 8], ["house", -130, 76, 0.2], ["house", -110, 70, 0.5]] },
    brief: "Kara Mustafa's army has had Vienna under siege for two months, and the city is near its end. The relief army has come over the Wienerwald: the Emperor's men, the Saxons and Bavarians, and King Jan Sobieski's Poles. They fight down the vineyards of the Kahlenberg all day towards the Turkish camp, and at the end of it comes the greatest cavalry charge in history.",
    after: ["The relief army broke through the Turkish lines, and Sobieski's winged hussars rode down into the camp. The siege was lifted that evening. The Ottoman Empire would never stand at Vienna again.", "Here the relief failed. Vienna's fate hangs on the walls alone."],
    sides: [
      { name: "The Holy League", lead: "King Jan III Sobieski", cos: [{ uni: "polish", muster: { musketeer: 8, sword: 4, cavalry: 6 }, guns: 1, call: { cavalry: "Hussar" } }, { uni: "imperial", muster: { musketeer: 12, pike: 4, grenadier: 2 }, guns: 1 }, { uni: "saxon", muster: { musketeer: 12, pike: 4 }, guns: 1 }, { uni: "bavarian", muster: { musketeer: 10, pike: 4, grenadier: 2 } }] },
      { name: "The Ottoman army", lead: "Grand Vizier Kara Mustafa", hold: 35, cos: [{ uni: "ottoman", muster: { musketeer: 12, bow: 5, sword: 3, cavalry: 2 }, guns: 1, call: { cavalry: "Sipahi" } }, { uni: "ottoman", muster: { musketeer: 12, bow: 5, sword: 5 }, guns: 1 }, { uni: "ottoman", muster: { musketeer: 10, bow: 6, sword: 6 } }] },
    ],
  },
  {
    id: "sedgemoor", name: "Sedgemoor", date: "6 July 1685", year: 1685, lon: -2.92, lat: 51.12, at: "Somerset, England",
    hour: "night", cloud: 0.2, mist: 0.55, fort: 0, won: 0, you: 1,
    map: { low: 1.8, rivers: [{ u: -22, w: 4.5, d: 1.0, bank: 1.5 }], things: [["church", -140, 8, 0, 26, 0], ["house", -118, 34, 0.1], ["house", -124, -26, 0.4], ["house", -100, -40, 0.2], ["tents", -120, -60, -50, 50, 14, "canvas", "ridge"]] },
    brief: "The Duke of Monmouth has raised the West Country against his uncle, King James II. His army is farmers and weavers, many armed with scythes fixed to poles. He tries a night march across the moor to surprise the King's army asleep in its camp, but a shot goes off in the mist, and the regulars wake behind the Bussex Rhine ditch.",
    after: ["The rebels could not get across the ditch, and stood firing into the dark until dawn. Then the King's guns and horse broke them. It was the last pitched battle on English soil. Monmouth was beheaded nine days later, and hundreds of his men were hanged.", "Here the rebellion won its night. Monmouth's road to London lies open."],
    sides: [
      { name: "The King's army", lead: "the Earl of Feversham", hold: 999, cos: [{ uni: "english", muster: { musketeer: 12, pike: 6, grenadier: 3, cavalry: 3 }, guns: 3 }] },
      { name: "Monmouth's rebels", lead: "James, Duke of Monmouth", cos: [{ uni: "rebels", muster: { musketeer: 14, axe: 12, pike: 8 }, guns: 1, call: { axe: "Scytheman", pike: "Pitchfork" } }] },
    ],
  },
  {
    id: "hamburg", name: "Hamburg", date: "August 1686", year: 1686, lon: 9.99, lat: 53.55, at: "Before the walls of Hamburg",
    hour: "afternoon", cloud: 0.4, mist: 0, fort: 0, won: 0, you: 0,
    map: { low: 3, rivers: [{ v: 150, w: 90, d: 3 }], r2: 380, things: [["city", -96, -110, 110, 10], ["skyline", -320, -10, 1.7], ["ships", -230, -140, 128, 4], ["tents", 72, 112, -48, 48, 32, "canvas", "ridge"]] },
    brief: "King Christian V of Denmark wants the free city of Hamburg for himself. He has brought an army and his siege guns to its walls. The city's own citizens stand on the works with the militia, and wait for help from Lüneburg.",
    after: ["The walls held. Troops from Brunswick-Lüneburg came to the city's aid, and the Danes struck their camp and went home. Hamburg stayed free.", "Here the walls gave way, and Hamburg is the King of Denmark's."],
    sides: [
      { name: "The Free City of Hamburg", lead: "the city's council", hold: 999, cos: [{ uni: "hamburg", muster: { musketeer: 16, pike: 6, grenadier: 2 }, guns: 3, call: { musketeer: "Militiaman" } }] },
      { name: "Denmark", lead: "King Christian V", cos: [{ uni: "danish", muster: { musketeer: 20, pike: 6, grenadier: 6 }, guns: 2 }] },
    ],
  },
  {
    id: "boyne", name: "The Boyne", date: "1 July 1690", year: 1690, lon: -6.42, lat: 53.72, at: "Oldbridge, Ireland",
    hour: "morning", cloud: 0.3, mist: 0, fort: null, won: 0, you: 0,
    map: { low: 2, ramp: [10, 0, 110, 9], rivers: [{ u: 0, w: 15, d: 0.85, bank: 4 }], things: [["house", 18, 36, 0.2], ["house", 30, 48, -0.1, 8, 5], ["house", 22, 60, 1.4], ["house", 14, -48, 0.3], ["church", 110, -60, 0.2, 14, 0], ["house", -40, 70, 0.4]] },
    brief: "Two kings face each other across the river. William III leads Dutch guards, English and Danish regiments; his father-in-law James II leads French regiments and his Irish army. At Oldbridge, William's Dutch Blue Guards wade in up to their waists, under fire from the southern bank.",
    after: ["William's men forced the crossing, and James's army fell back towards Dublin in good order. James fled to France. The Boyne decided who would reign in England, Scotland and Ireland.", "Here King James held the river, and kept his crown within reach."],
    sides: [
      { name: "King William's army", lead: "William III", cos: [{ uni: "dutch", muster: { musketeer: 14, pike: 4, grenadier: 2 }, guns: 1 }, { uni: "english", muster: { musketeer: 12, pike: 4, cavalry: 3 }, guns: 1 }, { uni: "danish", muster: { musketeer: 14, pike: 4 } }] },
      { name: "King James's army", lead: "James II", hold: 45, cos: [{ uni: "french", muster: { musketeer: 16, pike: 4, grenadier: 2 }, guns: 1 }, { uni: "irish", muster: { musketeer: 12, pike: 8, sword: 4 } }] },
    ],
  },
  {
    id: "beachyhead", name: "Beachy Head", date: "10 July 1690", year: 1690, lon: 0.25, lat: 50.66, at: "Off the Sussex coast, in the Channel",
    sea: true, won: 0, you: 0,
    brief: "The French fleet is out in the Channel in strength, and King William is away in Ireland. Admiral Tourville has more ships than the allies; the Earl of Torrington, ordered to fight anyway, sends the Dutch in first, and they bear the worst of it while the English hold off.",
    after: ["The Dutch squadron was badly mauled and the allies ran for the Thames, burning their own crippled ships. For a few weeks the French held the Channel, but Tourville never landed an army. Torrington was court-martialled and acquitted, and never served at sea again.", "Here the allied line held, and Tourville's fleet went home to Brest with the Channel still closed to it."],
    sides: [
      { name: "The French fleet", lead: "the Comte de Tourville", color: "#e9e4d4", nation: "Kingdom of France", fleet: [{ k: "line" }, { k: "line" }, { k: "frigate" }, { k: "frigate" }] },
      { name: "The Anglo-Dutch fleet", lead: "the Earl of Torrington", color: "#c0392b", nation: "Kingdom of England", fleet: [{ k: "line" }, { k: "line", color: "#e07b26", name: "Dutch Republic" }, { k: "frigate", color: "#e07b26", name: "Dutch Republic" }, { k: "sloop" }] },
    ],
  },
  {
    id: "barfleur", name: "Barfleur", date: "29 May 1692", year: 1692, lon: -1.27, lat: 49.67, at: "Off Cape Barfleur, Normandy",
    sea: true, won: 0, you: 1,
    brief: "King Louis has an army waiting on the Norman coast to sail for England and put James II back on the throne. Tourville is ordered to clear the way, and he attacks, though Admiral Russell's English and Dutch ships nearly double his own. All day the French line fights the allies in fog and failing wind.",
    after: ["Tourville's fleet fought the allies to a standstill and slipped away in the fog, but with the tide against them many could not reach safe harbour. Over the next days the English burned fifteen of them at Cherbourg and La Hougue, under the eyes of King James himself. The invasion of England was never tried again.", "Here Tourville broke the allied line, and the road across the Channel lay open to King James's army."],
    sides: [
      { name: "The Anglo-Dutch fleet", lead: "Admiral Edward Russell", color: "#c0392b", nation: "Kingdom of England", fleet: [{ k: "line" }, { k: "line" }, { k: "line", color: "#e07b26", name: "Dutch Republic" }, { k: "frigate" }, { k: "frigate", color: "#e07b26", name: "Dutch Republic" }] },
      { name: "The French fleet", lead: "the Comte de Tourville", color: "#e9e4d4", nation: "Kingdom of France", fleet: [{ k: "line" }, { k: "line" }, { k: "frigate" }] },
    ],
  },
  {
    id: "zenta", name: "Zenta", date: "11 September 1697", year: 1697, lon: 20.08, lat: 45.93, at: "On the Tisza, in Hungary",
    hour: "evening", cloud: 0.1, mist: 0, fort: 1, won: 0, you: 0,
    map: { low: 2.6, rivers: [{ u: 100, w: 46, d: 2.6 }], things: [["bridge", 66, 134, -10, 5], ["tents", 66, 74, -56, 56, 12, "green"], ["tents", 150, 200, -80, 60, 24], ["church", -140, 80, 0.2, 14, 6]] },
    brief: "Prince Eugene of Savoy has caught the Sultan's army halfway across the Tisza. The Sultan is over the river already. The rest wait their turn behind the earthworks of the bridgehead. Eugene has only a few hours of daylight left, and attacks straight off the march.",
    after: ["The Imperial foot stormed the bridgehead and drove the Ottoman army into the river. Tens of thousands died before dark, while the Imperials lost a few hundred. Two years later the Sultan gave up Hungary at Karlowitz.", "Here the bridgehead held, and the Sultan's army got away over the river."],
    sides: [
      { name: "The Emperor's army", lead: "Prince Eugene of Savoy", cos: [{ uni: "imperial", muster: { musketeer: 18, grenadier: 6, pike: 4 }, guns: 3 }] },
      { name: "The Ottoman army", lead: "Sultan Mustafa II", hold: 999, cos: [{ uni: "ottoman", muster: { musketeer: 14, bow: 8, sword: 6, cavalry: 4 }, guns: 2, call: { cavalry: "Sipahi" } }] },
    ],
  },
  {
    id: "narva", name: "Narva", date: "30 November 1700", year: 1700, lon: 28.19, lat: 59.38, at: "In Ingria",
    hour: "afternoon", cloud: 1, mist: 0.6, fort: 1, won: 0, you: 0,
    map: { snow: true, low: 2.6, rivers: [{ u: 100, w: 40, d: 2.6 }], things: [["castle", 150, -60, 1.5], ["spire", 170, -20, 60, "slate"], ["castle", 60, 140, 0.9], ["tents", 46, 70, -50, 50, 18, "canvas", "ridge"]] },
    brief: "Peter the Great is besieging Narva with nearly forty thousand men behind a long line of earthworks. Charles XII of Sweden, eighteen years old, has marched up with ten thousand. At two in the afternoon a snowstorm blows straight into the Russians' faces, and the Swedes attack out of it.",
    after: ["The Swedes broke the Russian line in two places, and in the blinding snow the Russian army fell apart. Thousands surrendered. Charles was the wonder of Europe. Peter went home to rebuild his army, and nine years later beat him at Poltava.", "Here the Tsar's lines held, and the young King's war ended before it began."],
    sides: [
      { name: "Sweden", lead: "King Charles XII", cos: [{ uni: "swedish", muster: { musketeer: 16, pike: 6, grenadier: 4, sword: 2 }, guns: 2 }] },
      { name: "Muscovy", lead: "the Duke de Croÿ, for Tsar Peter", hold: 999, cos: [{ uni: "muscovite", muster: { musketeer: 34, pike: 10 }, guns: 3, call: { musketeer: "Strelets" } }] },
    ],
  },
];
export const battleById = id => BATTLES.find(b => b.id === id) || null;

// which you've won, and on which side — kept on this computer
const KEY = "reckoning.history.v1";
export function histRecord() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
export function histResult(id, side, won) {
  const r = histRecord(), e = r[id] ||= { won: [0, 0], fought: 0 };
  e.fought++; if (won) e.won[side]++;
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (x) {}
  return e;
}

// the army a battle gives you: your company and the others as history had them, on the side you've chosen, set out as
// pvp.js's army() would be
export function histArmy(b, side) {
  const mine = b.sides[side], theirs = b.sides[1 - side], cos = [...mine.cos.map(c => ({ ...c, al: 0, hold: mine.hold })), ...theirs.cos.map(c => ({ ...c, al: 1, hold: theirs.hold }))];
  const men = c => Object.values(c.muster).reduce((t, n) => t + n, 0);
  return {
    battle: true, vs: "bots", purse: 900,
    hist: { id: b.id, side, cos, b: b.campaign ? b : undefined },
    sides: [mine.cos.length, theirs.cos.length],
    uniform: mine.cos[0].uni, enemyUniform: theirs.cos[0].uni,
    ground: b.fort == null ? "open" : b.fort === side ? "ours" : "theirs",
    muster: { ...mine.cos[0].muster }, guns: mine.cos[0].guns | 0,
    allies: cos.filter(c => c.al === 0).reduce((t, c) => t + men(c), 0),
    enemies: cos.filter(c => c.al === 1).reduce((t, c) => t + men(c), 0),
  };
}
