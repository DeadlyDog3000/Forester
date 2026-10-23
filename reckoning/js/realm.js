// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE REALM: what a crown builds in its towns, what its scholars learn, and the men it trusts with its army and its
// towns. Data, and the few sums the campaign asks of it — campaign.js does the rest.
//
//   Buildings come in chains, a level at a time, each a year's work: the land from peasant farms to great estates,
//   the market to an exchange, the workshops to ironworks, the barracks, the gun foundry, the church to a
//   university, and the walls to a star fort. The higher levels wait on learning.
//   Learning: four branches of a tree, one thing studied at a time, the schools and colleges speeding it.
//   Generals and governors: the men of 1683 to begin with — Luxembourg, Lorraine, Starhemberg, Kara Mustafa,
//   Sobieski's hetmans — and, as they die (in battle, or of age after ten years' service), new men of your
//   choosing, one of three put forward.

// ---- the chains of buildings: a level's name, its cost, what it gives, and the learning it waits on ----
// (inc: thalers a year; rp: learning a year; gar: men to the garrison; morale: your army's nerve; cheap: off
//  the cost of a regiment; gunCast: a gun a year can be cast; rank: the least a town must be)
export const CHAINS = {
  farm: { name: "The land", levels: [
    { n: "Peasant farms", d: "Strips and commons, worked as their grandfathers worked them." },
    { n: "Developed farms", cost: 110, inc: 10, d: "Fields drained and hedged, a mill on the stream." },
    { n: "Improved farms", cost: 210, inc: 22, tech: "rotation", d: "Turnips and clover in the rotation: no field lies fallow." },
    { n: "Great estates", cost: 360, inc: 36, tech: "seeddrill", d: "Enclosed estates, sown in rows by the drill." },
  ] },
  trade: { name: "Trade", levels: [
    { n: "Market cross", d: "A market day once a week." },
    { n: "Market hall", cost: 140, inc: 12, d: "A covered hall, a weigh-house, fairs twice a year." },
    { n: "Trading house", cost: 250, inc: 26, tech: "banking", rank: 2, d: "Merchants' houses dealing far afield, on credit." },
    { n: "Exchange", cost: 420, inc: 44, tech: "jointstock", rank: 3, d: "A bourse: shares, bills and insurance." },
  ] },
  works: { name: "Industry", levels: [
    { n: "Craftsmen", d: "Smiths, weavers and coopers in their own shops." },
    { n: "Workshops", cost: 130, inc: 8, cheap: 2, d: "Masters with journeymen under one roof." },
    { n: "Manufactory", cost: 250, inc: 18, cheap: 4, tech: "labour", rank: 2, d: "A hundred hands, each at one task." },
    { n: "Ironworks", cost: 400, inc: 26, cheap: 6, tech: "coke", rank: 2, d: "Blast furnaces and forges: iron for guns and tools." },
  ] },
  army: { name: "Barracks", levels: [
    { n: "Muster ground", d: "Where the militia drill on feast days." },
    { n: "Drill yard", cost: 120, morale: 0.04, gar: 2, d: "Sergeants drilling the levy every week." },
    { n: "Barracks", cost: 230, morale: 0.08, gar: 4, tech: "linear", rank: 2, d: "A standing garrison, housed and drilled." },
    { n: "Military academy", cost: 380, morale: 0.12, gar: 6, tech: "academy", rank: 3, d: "Officers schooled in fortification and gunnery." },
  ] },
  foundry: { name: "Foundry", levels: [
    { n: "No foundry", d: "Guns must be bought abroad, if at all." },
    { n: "Gun foundry", cost: 200, gunCast: 1, tech: "founding", rank: 2, d: "Bronze guns cast in sand: one a year." },
    { n: "Cannon foundry", cost: 360, gunCast: 2, tech: "fieldart", rank: 2, d: "Iron guns bored from the solid: two a year." },
  ] },
  church: { name: "Learning", levels: [
    { n: "Parish church", d: "The priest teaches a few boys their letters." },
    { n: "School", cost: 120, rp: 1, d: "A grammar school: Latin, sums, a little geometry." },
    { n: "College", cost: 240, rp: 2, tech: "natphil", rank: 2, d: "Lecturers in mathematics and natural philosophy." },
    { n: "University", cost: 420, rp: 3, tech: "enlight", rank: 3, d: "Faculties, a library and an observatory." },
  ] },
  walls: { name: "Defences", levels: [
    { n: "No walls", d: "Open to anyone who comes." },
    { n: "Stone walls", cost: 0, gar: 3, d: "A wall of stone on an earth rampart, towers and a gate: an attacker must batter his way in." },
    { n: "Star fort", cost: 420, gar: 7, tech: "trace", rank: 2, d: "Low, thick bastioned walls that shrug off shot: twice as hard to breach." },
  ] },
};
// each chain's mark: a little engraving, drawn in the ink of the page (stroked in the text's own colour)
const SV = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const MARK = {
  farm: SV('<path d="M12 21V8"/><path d="M12 9c-2-1-3-3-3-5 2 1 3 3 3 5zM12 9c2-1 3-3 3-5-2 1-3 3-3 5zM12 13c-2-1-3.5-3-3.5-5 2 1 3.5 3 3.5 5zM12 13c2-1 3.5-3 3.5-5-2 1-3.5 3-3.5 5zM12 17c-2-1-3.5-3-3.5-5 2 1 3.5 3 3.5 5zM12 17c2-1 3.5-3 3.5-5-2 1-3.5 3-3.5 5z"/>'),
  trade: SV('<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7l-2.5 6h5zM19 7l-2.5 6h5z"/><path d="M2.5 13a2.5 1.5 0 0 0 5 0M16.5 13a2.5 1.5 0 0 0 5 0"/>'),
  works: SV('<path d="M4 20l9-9"/><path d="M11 5l3-2 7 7-2 3z"/><path d="M13 7l4 4"/>'),
  army: SV('<path d="M5 4l12 12M19 4L7 16"/><path d="M4 15l5 5M20 15l-5 5"/><path d="M15 18l2-2M9 18l-2-2"/>'),
  foundry: SV('<circle cx="7" cy="16" r="3.2"/><path d="M8.5 13.5L20 8l1 2.5-11 5"/><path d="M3 20h9"/>'),
  church: SV('<path d="M12 2v5M10 4h4"/><path d="M6 21V12l6-5 6 5v9z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>'),
  walls: SV('<path d="M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12z"/><path d="M10 21v-5a2 2 0 0 1 4 0v5"/>'),
  gun: SV('<circle cx="7" cy="16" r="3.2"/><path d="M8.5 13.5L20 8l1 2.5-11 5"/><path d="M3 20h9"/>'),
};
export const CHAIN_ORDER = ["farm", "trade", "works", "army", "foundry", "church", "walls"];
// (a town's walls cost what its size makes them)
export const wallCost = rank => 90 + rank * 60;
export const levelCost = (chain, lv, rank) => chain === "walls" && lv === 1 ? wallCost(rank) : CHAINS[chain].levels[lv].cost;
// how high a chain can go in a town of this rank: a town takes everything to its second level, a city to its third,
// a great city the lot (walls and the land: any town, all the way)
export const capOf = (chain, rank) => chain === "farm" ? 3 : chain === "walls" ? 2 : Math.min(CHAINS[chain].levels.length - 1, rank + (rank >= 3 ? 1 : 0));

// ---- learning: four branches ----
export const TECHS = {
  rotation: { n: "Crop rotation", br: "farm", cost: 3, d: "Turnips and clover in the fields. Improved farms." },
  seeddrill: { n: "The seed drill", br: "farm", cost: 5, req: ["rotation"], d: "Sowing in rows. Great estates." },
  enclosure: { n: "Enclosure", br: "farm", cost: 6, req: ["seeddrill"], d: "The commons hedged in: +15% from the land everywhere." },
  banking: { n: "Banking", br: "trade", cost: 4, d: "Bills of exchange and deposit. Trading houses." },
  labour: { n: "Division of labour", br: "trade", cost: 4, d: "Each hand at one task. Manufactories." },
  jointstock: { n: "Joint-stock companies", br: "trade", cost: 6, req: ["banking"], d: "Shares and ventures. Exchanges; trade pacts bring half again." },
  coke: { n: "Coke smelting", br: "trade", cost: 6, req: ["labour"], d: "Iron smelted with coke. Ironworks." },
  bayonet: { n: "The socket bayonet", br: "army", cost: 3, d: "The blade fixed round the muzzle, the musket still firing. Until it's learnt, your musketeers can't fix bayonets in battle. Your men stand firmer (+5% nerve)." },
  linear: { n: "Linear tactics", br: "army", cost: 4, req: ["bayonet"], d: "Three ranks, platoon fire: your musketeers and grenadiers load and fire 15% faster in battle. Barracks." },
  academy: { n: "Military academies", br: "army", cost: 6, req: ["linear"], d: "Schooled officers. Military academies; generals serve two years longer." },
  founding: { n: "Gun founding", br: "army", cost: 3, d: "Casting bronze guns. Gun foundries." },
  fieldart: { n: "Field artillery", br: "army", cost: 5, req: ["founding"], d: "Lighter guns that keep up with the army: without it, only one gun follows it into a battle in the open field. Cannon foundries." },
  trace: { n: "The trace italienne", br: "army", cost: 5, req: ["founding"], d: "Bastions and ravelins. Star forts." },
  natphil: { n: "Natural philosophy", br: "learn", cost: 3, d: "Newton and Boyle. Colleges." },
  cameral: { n: "Cameralism", br: "learn", cost: 5, req: ["natphil"], d: "Government by ledgers: governors' corruption halved." },
  enlight: { n: "The Enlightenment", br: "learn", cost: 7, req: ["cameral"], d: "Reason in all things. Universities." },
};
export const BRANCHES = [["farm", "Agriculture"], ["trade", "Commerce & industry"], ["army", "War"], ["learn", "Philosophy"]];
export const canStudy = (done, id) => !done[id] && (TECHS[id].req || []).every(r => done[r]);

// ---- the men of 1683: generals and governors, as they stood that year ----
// (port: their portrait, in art/portraits/hist/; town: a governor's seat — given only if the crown holds it)
// stats 1–5: a general's command (how he fights a battle), morale (how his men stand) and corruption (how much of the
// pay sticks to his fingers); a governor's corruption, production (what the town yields and builds) and defence
export const HISTORICAL = {
  france: [
    { g: 1, name: "François-Henri de Montmorency, duc de Luxembourg", short: "Luxembourg", port: "luxembourg", st: [5, 4, 3], d: "“The Upholsterer of Notre-Dame”, for the captured flags he sent there. Hunchbacked, brilliant, feared." },
    { name: "Sébastien Le Prestre de Vauban", short: "Vauban", town: "Strassburg", port: "vauban", st: [1, 4, 5], d: "The king's engineer: he has fortified a hundred towns and taken fifty." },
    { name: "Gabriel Nicolas de La Reynie", short: "La Reynie", town: "Paris", port: "lareynie", st: [2, 4, 3], d: "First lieutenant-general of police of Paris: lanterns in the streets, order in the city." },
  ],
  austria: [
    { g: 1, name: "Charles V, Duke of Lorraine", short: "Lorraine", port: "lorraine", st: [5, 5, 1], d: "A duke without a duchy, the Emperor's best general. He will relieve Vienna." },
    { name: "Ernst Rüdiger von Starhemberg", short: "Starhemberg", town: "Wien", port: "starhemberg", st: [1, 3, 5], d: "Commander of Vienna's garrison: he will hold the city two months against the Turk." },
  ],
  hre: [{ g: 1, name: "Louis William, Margrave of Baden-Baden", short: "Türkenlouis", port: "baden", st: [4, 5, 2], d: "“Türkenlouis”: he will win twenty-five battles against the Turks." }],
  poland: [
    { g: 1, name: "Stanisław Jan Jabłonowski", short: "Jabłonowski", port: "jablonowski", st: [4, 4, 3], d: "Great Crown Hetman: he will lead the right wing at Vienna." },
    { name: "Marcin Kątski", short: "Kątski", town: "Kamieniec", port: "katski", st: [2, 3, 4], d: "General of the artillery, master of the guns at Vienna." },
  ],
  ottoman: [
    { g: 1, name: "Merzifonlu Kara Mustafa Pasha", short: "Kara Mustafa", port: "karamustafa", st: [3, 3, 5], d: "Grand Vizier: ambitious, proud, and on his way to Vienna with the whole army of the Sultan." },
    { name: "Abdurrahman Abdi Arnavut Pasha", short: "Abdi Pasha", town: "Buda", port: "abdipasha", st: [2, 2, 5], d: "An old Albanian soldier: he will die defending Buda's walls." },
  ],
  russia: [
    { g: 1, name: "Patrick Gordon", short: "Gordon", port: "gordon", st: [4, 4, 2], d: "A Scots soldier of fortune in the Tsar's service: the best officer in Muscovy." },
    { name: "Vasily Vasilyevich Golitsyn", short: "Golitsyn", town: "Moskva", port: "golitsyn", st: [3, 5, 2], d: "The regent Sophia's chancellor and favourite: a learned, westward-looking prince." },
  ],
  sweden: [
    { g: 1, name: "Rutger von Ascheberg", short: "Ascheberg", port: "ascheberg", st: [4, 4, 2], d: "Field marshal, veteran of every Swedish war since Breitenfeld." },
    { name: "Erik Dahlbergh", short: "Dahlbergh", town: "Riga", port: "dahlbergh", st: [2, 4, 5], d: "Engineer and draughtsman: Sweden's Vauban." },
  ],
  brandenburg: [{ g: 1, name: "Georg von Derfflinger", short: "Derfflinger", port: "derfflinger", st: [4, 4, 2], d: "A tailor's apprentice who became the Great Elector's field marshal: he beat the Swedes at Fehrbellin." }],
  dutch: [{ g: 1, name: "William III, Prince of Orange", short: "Orange", port: "orange", st: [3, 5, 1], d: "Stadtholder and captain-general: Louis XIV's most stubborn enemy." }],
  england: [{ g: 1, name: "Louis de Duras, Earl of Feversham", short: "Feversham", port: "feversham", st: [2, 3, 3], d: "The king's general: a Frenchman with an English title." }],
  castile: [{ name: "Ottone Enrico del Caretto, Marquis of Grana", short: "Grana", town: "Brussel", port: "grana", st: [2, 3, 3], d: "Governor of the Spanish Netherlands, holding them against France with too few men." }],
  venice: [{ g: 1, name: "Francesco Morosini", short: "Morosini", port: "morosini", st: [4, 4, 2], d: "Defender of Candia: he will take the Morea and fire on the Parthenon." }],
  savoy: [{ g: 1, name: "Victor Amadeus II, Duke of Savoy", short: "Victor Amadeus", port: "victoramadeus", st: [3, 4, 2], d: "Seventeen years old and already scheming: he will end his days a king." }],
  bavaria: [{ g: 1, name: "Maximilian II Emanuel, Elector of Bavaria", short: "Max Emanuel", port: "maxemanuel", st: [3, 5, 3], d: "“The Blue King”: dashing, extravagant, and first through the breach at Belgrade." }],
  saxony: [{ g: 1, name: "John George III, Elector of Saxony", short: "John George", port: "johngeorge", st: [3, 4, 2], d: "“The Saxon Mars”: he will lead his own army to Vienna." }],
  denmark: [{ name: "Ulrik Frederik Gyldenløve", short: "Gyldenløve", town: "Christiania", port: "gyldenlove", st: [3, 3, 3], d: "Viceroy of Norway, a king's natural son: he founds towns and forts." }],
  hungary: [{ g: 1, name: "Imre Thököly", short: "Thököly", port: "thokoly", st: [3, 5, 3], d: "“King of the Kuruc”: leader of the Protestant rising against the Habsburgs." }],
  crimea: [{ g: 1, name: "Murad Giray", short: "Murad Giray", port: "muradgiray", st: [3, 4, 3], d: "Khan of Crimea: his Tatar horse ride with the Sultan's army." }],
  cossacks: [{ g: 1, name: "Ivan Samoylovych", short: "Samoylovych", port: "samoylovych", st: [3, 3, 4], d: "Hetman of Left-bank Ukraine: rich, careful, and the Tsar's man." }],
  transylvania: [{ g: 1, name: "Michael I Apafi", short: "Apafi", port: "apafi", st: [2, 2, 3], d: "Prince of Transylvania, a vassal of the Turk, who prefers his books to war." }],
};
// (which historical portraits are on disk: the rest are shown as an engraved name until they are)
export const HAVE_PORT = new Set(["abdipasha", "apafi", "ascheberg", "baden", "dahlbergh", "derfflinger", "feversham", "golitsyn", "gordon", "gyldenlove", "jablonowski", "johngeorge", "karamustafa", "katski", "lareynie", "lorraine", "luxembourg", "maxemanuel", "morosini", "muradgiray", "orange", "samoylovych", "starhemberg", "thokoly", "vauban", "victoramadeus"]);

// ---- new men: names by tongue, and their portraits by the look of their people ----
const NAMES = {
  fr: [["Henri", "Louis", "Armand", "Charles", "Jacques", "Nicolas", "François", "Claude", "Philippe", "Antoine"], ["de Villars", "de Boufflers", "de Tallard", "de Créqui", "de Montrevel", "de Puységur", "d'Harcourt", "de Saint-Hilaire", "de Bezons", "de La Feuillade", "de Chamlay", "de Rosen"]],
  en: [["John", "Thomas", "William", "Charles", "Henry", "George", "Richard", "Edward"], ["Kirke", "Mackay", "Talmash", "Sackville", "Ginkel", "Ormonde", "Cutts", "Lanier", "Stanhope", "Trelawney"]],
  es: [["Juan", "Francisco", "Diego", "Alonso", "Pedro", "Fernando", "Gaspar", "Antonio"], ["de Velasco", "de Agurto", "Gastañaga", "de Bournonville", "de Leganés", "de Villahermosa", "de Ayala", "de Guzmán"]],
  pt: [["João", "Pedro", "Luís", "Manuel", "Francisco", "António", "Diogo", "Fernão"], ["de Meneses", "de Mascarenhas", "de Sousa", "de Castro", "de Noronha", "Coutinho", "de Távora", "de Almeida", "da Câmara", "Pereira"]],
  sco: [["James", "John", "Archibald", "Alexander", "George", "William", "Patrick", "Hugh"], ["Graham", "Drummond", "Hamilton", "Mackay", "Douglas", "Murray", "Campbell", "Gordon", "Livingstone", "Ramsay"]],
  ga: [["Patrick", "Richard", "Justin", "Daniel", "Thomas", "Hugh", "Theobald", "Donough"], ["Sarsfield", "Talbot", "Butler", "Dillon", "Fitzgerald", "MacCarthy", "O'Neill", "Burke", "Maguire", "O'Brien"]],
  it: [["Antonio", "Carlo", "Enea", "Giovanni", "Ottavio", "Raimondo", "Federico", "Silvio"], ["Caprara", "Piccolomini", "Montecuccoli", "Strassoldo", "Pallavicini", "Carafa", "Gonzaga", "Spinola"]],
  de: [["Johann", "Georg", "Friedrich", "Heinrich", "Wolfgang", "Christian", "Ernst", "Karl"], ["von Schöning", "von Goltz", "von Leslie", "von Dünewald", "von Heister", "von Thüngen", "von Holstein", "von Waldeck", "von Barfus", "von Steinau"]],
  nl: [["Hendrik", "Willem", "Jan", "Godard", "Frederik", "Maurits"], ["van Nassau", "van Ginkel", "van Obdam", "van Weede", "van Wassenaer", "van Coehoorn"]],
  sv: [["Carl", "Erik", "Gustaf", "Nils", "Otto", "Magnus", "Knut", "Axel"], ["Rehnskiöld", "Stenbock", "Lewenhaupt", "Wrangel", "Horn", "Bielke", "Sparre", "Banér"]],
  da: [["Christian", "Frederik", "Hans", "Jens", "Ulrik", "Niels"], ["Schack", "Rantzau", "Ahlefeldt", "Juel", "Arenstorff", "Trampe"]],
  pl: [["Jan", "Stanisław", "Hieronim", "Mikołaj", "Andrzej", "Feliks", "Michał", "Kazimierz"], ["Sieniawski", "Potocki", "Lubomirski", "Sapieha", "Radziwiłł", "Denhoff", "Wielopolski", "Zamoyski"]],
  ru: [["Boris", "Fyodor", "Ivan", "Grigory", "Mikhail", "Vasily", "Aleksey", "Pyotr"], ["Sheremetev", "Romodanovsky", "Dolgorukov", "Trubetskoy", "Shein", "Buturlin", "Khovansky", "Repnin"]],
  hu: [["Miklós", "Pál", "Ferenc", "István", "János", "Ádám"], ["Esterházy", "Bercsényi", "Batthyány", "Pálffy", "Zrínyi", "Károlyi", "Teleki"]],
  ro: [["Constantin", "Șerban", "Gheorghe", "Mihai", "Radu", "Dumitru"], ["Cantacuzino", "Brâncoveanu", "Duca", "Cantemir", "Băleanu", "Ghica"]],
  tr: [["Mustafa", "Ahmed", "Mehmed", "Hasan", "Hüseyin", "Ibrahim", "Süleyman", "Ali", "Ismail", "Osman"], ["Pasha", "Pasha", "Pasha", "Agha", "Bey"]],
  // (the Khan's men: Tatar beys and mirzas of the great clans, not the Sultan's pashas)
  crh: [["Devlet", "Selim", "Kaplan", "Mengli", "Saadet", "Adil", "Bahadır", "Mansur", "Azamat", "Kantemir"], ["Mirza", "Mirza", "Bey", "Bey", "Agha"]],
  ar: [["Hassan", "Muhammad", "Abdallah", "Ali", "Uthman", "Ahmad", "Yusuf"], ["Bey", "Pasha", "Dey", "Agha"]],
};
const TONGUE = { france: "fr", savoy: "fr", england: "en", scotland: "sco", ireland: "ga", castile: "es", aragon: "es", portugal: "pt", naples: "it", sicily: "it", milan: "it",
  venice: "it", tuscany: "it", papal: "it", hre: "de", austria: "de", bavaria: "de", saxony: "de", brandenburg: "de", dutch: "nl", sweden: "sv", denmark: "da", poland: "pl",
  russia: "ru", cossacks: "ru", hungary: "hu", transylvania: "hu", moldavia: "ro", wallachia: "ro", ottoman: "tr", crimea: "crh", algiers: "ar", tunis: "ar", tripoli: "ar", morocco: "ar" };
// (the woods' nations: their leaders known by one name, as the French and English records of the time give them)
const NW_NAMES = {
  p_iroquois: ["Garakontié", "Otreouti", "Teganissorens", "Sadekanaktie", "Tekarihoga", "Ohonsiowanne", "Aradgi", "Tahajadoris", "Hotreouati", "Skanudharoua"],
  p_wabanaki: ["Madockawando", "Mogg", "Kancamagus", "Wanalancet", "Assacumbuit", "Taxous", "Moxus"],
  p_cherokee: ["Moytoy", "Kalanu", "Oukah-Ulah", "Skiagusta", "Tathtowe", "Ostenaco", "Amoscossite"],
  p_creek: ["Brims", "Chekilli", "Tomochichi", "Ouletta", "Chigelly", "Malatchi", "Hoboyetly"],
  p_choctaw: ["Taboca", "Alibamon Mingo", "Shulush Homa", "Mingo Ouma", "Tchakta Mingo", "Pakana Mingo"],
  p_shawnee: ["Opessa", "Kakowatcheky", "Neucheconneh", "Pucksinwah", "Wapatomica", "Kishkalwa"],
  p_illinois: ["Chicagou", "Mamantouensa", "Rouensa", "Chachagouesse", "Kiraoueria", "Peoria"],
  p_anishinaabe: ["Kiskakon", "Sinagos", "Onanguissé", "Kinongé", "Outoutagan", "Miscouaky", "Koutaoiliboe"],
  p_dakota: ["Ouasicoude", "Akipa", "Wabasha", "Shakopee", "Tatankamani", "Ouakantape"],
  p_pawnee: ["Tirawahut", "Kitkehaki", "Skidi", "Lachelesharo", "Pitalesharu", "Tahirussawichi"],
  p_osage: ["Pawhuska", "Clermont", "Cheshewalla", "Tawagahe", "Mad Buffalo", "Big Soldier"],
  p_caddo: ["Bigotes", "Xinesi", "Tinhiouen", "Cocay", "Hasinai", "Dehahuit"],
  p_cree: ["Mouchouaouastiirinioek", "Kiskatinaw", "Maskwa", "Wapistan", "Atihk", "Kakakiw"],
};
const LOOK = { native: "native", fr: "west", en: "west", sco: "west", ga: "west", pt: "west", es: "west", it: "west", de: "west", nl: "west", sv: "north", da: "north", pl: "east", ru: "east", hu: "east", ro: "east", tr: "ottoman", crh: "ottoman", ar: "ottoman" };
// the portraits painted for new men: how many of each look there are, generals (g) and governors (v)
export const POOL = { g: { west: 10, north: 4, east: 8, ottoman: 8, native: 6 }, v: { west: 8, north: 3, east: 6, ottoman: 6, native: 4 } };
const TRAITS = {
  g: ["A veteran of the siege of Candia.", "Rose from the ranks.", "A favourite at court.", "Learned his trade under Montecuccoli.", "Bold to the point of rashness.",
    "Careful of his men's lives.", "Gambles away his pay.", "Never retreats.", "An engineer as much as a soldier.", "Loved by the cavalry.", "A hard drinker, a harder fighter.", "Reads Vegetius in camp."],
  v: ["A lawyer by training.", "Rich from the salt trade.", "Builds churches and bridges.", "Hangs bandits at the crossroads.", "Takes a tenth of every contract.",
    "A careful keeper of accounts.", "Popular with the guilds.", "Distrusted by the clergy.", "A former soldier.", "Married into the old nobility.", "Collects books and debts."],
};
const TRAITS_NW = {
  g: ["Led the war parties against the Illinois.", "Speaks for the young men at council.", "Never retreats.", "Careful of his men's lives.", "Bold to the point of rashness.",
    "Knows every trail between the lakes.", "Trades furs with the French and the English both.", "A hunter before he was a war leader.", "Fights best in the woods, from cover."],
  v: ["Keeps the wampum of the old treaties.", "Chosen by the clan mothers.", "Speaks well at council.", "Distrusts the traders.", "Generous with the town's stores.",
    "Remembers every grievance.", "A peacemaker.", "Keeps the corn stores full against a hard winter."],
};
let seq = 0;
const pick = (a, r) => a[Math.floor(r() * a.length)];
// a man, made up: his name in his crown's tongue, a portrait of his people's look, his stats and a line about him
export function newMan(crown, role, r = Math.random) {
  const nw = NW_NAMES[crown], t = nw ? "native" : TONGUE[crown] || "de", [first, last] = nw ? [nw, [""]] : NAMES[t], look = LOOK[t], kind = role === "general" ? "g" : "v";
  const name = nw ? pick(nw, r) : `${pick(first, r)} ${pick(last, r)}`;
  const n = POOL[kind][look], port = `${kind}-${look}-${String(1 + Math.floor(r() * n)).padStart(2, "0")}`;
  const roll = () => { const x = r() + r() + r(); return Math.max(1, Math.min(5, Math.round(x * 5 / 3 + 0.2))); };
  const st = role === "general" ? [roll(), roll(), Math.max(0, roll() - 1)] : [Math.max(0, roll() - 1), roll(), roll()];
  return { id: `m${Date.now().toString(36)}${(seq++).toString(36)}`, role, name, short: nw ? name : /^(Pasha|Bey|Agha|Mirza)$/.test(name.split(" ").slice(-1)[0]) ? name : name.split(" ").slice(1).join(" "), port, gen: true, st, d: pick((nw ? TRAITS_NW : TRAITS)[kind], r), served: 0 };
}
// the historical men of a crown, made into characters (governors only of towns it holds)
export function historicalOf(crown, holds) {
  return (HISTORICAL[crown] || []).filter(h => h.g || !h.town || holds(h.town)).map(h => ({ id: `h-${h.port}`, role: h.g ? "general" : "governor", name: h.name, short: h.short, port: h.port, hist: true, st: [...h.st], d: h.d, served: 0, town: h.town || null }));
}
// the portrait's file, or null (an engraved name stands in)
export const portOf = m => !m ? null : m.hist ? (HAVE_PORT.has(m.port) ? `art/portraits/hist/${m.port}.jpg` : null) : `art/portraits/${m.port}.jpg`;
// a general's stats by name, and a governor's
export const GSTATS = ["Command", "Morale", "Corruption"], VSTATS = ["Corruption", "Production", "Defence"];
// how many years a man serves before age takes him (Military academies: two more, for generals)
export const SERVICE = 10;
// (a general serves far longer: fifty years at the head of the army, if no battle ends it first)
export const GEN_SERVICE = 50;
