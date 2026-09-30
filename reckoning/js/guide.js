// ===========================================================================
//  THE GUIDE — each thing the game asks of you, explained the first time you meet it
//  (a card that stops the world; afterwards it stays in the guide book, H, to read again)
// ===========================================================================
// each: a kicker, a title, and the steps — <b> for the thing to do, <kbd> for a key
export const GUIDE = {
  building: {
    kicker: "The settlement", title: "How to build",
    steps: [
      "Press <kbd>B</kbd> for the plans and <b>choose a building</b>. Only what your people know how to build is shown; research teaches them more (<kbd>G</kbd>).",
      "Walk the outline to where you want it. <b>Hold <kbd>R</kbd> to turn it.</b> Green means it fits; red means something is in the way.",
      "<b>Click</b> to lay it out as a building site. <kbd>B</kbd> again puts the plans away without building.",
      "Every site wants <b>logs</b> first. Take them from the stack (<kbd>F</kbd>) and carry them to the site (<kbd>F</kbd> again). Settlers whose job is <b>hauler</b> carry logs and stone to the sites for you. Nobody else does. With no hauler, it is all on you.",
      "Some want <b>stone, planks or bricks</b> as well. You can put them in from the stores and your own pack, or your haulers bring them from the stores.",
      "A cabin or house also wants a <b>door</b>. Hew one at the sawhorse.",
      "When the site has everything, <b>hold <kbd>F</kbd> at it</b> to raise it.",
    ],
  },
  materials: {
    kicker: "The settlement", title: "Stone, and what builds with it",
    steps: [
      "Stone comes from the <b>grey rocks</b> around the clearing. You need a pickaxe to break them. Make one at the chopping block (<kbd>F</kbd>, <i>Make tools</i>).",
      "Swing at a rock with the pickaxe in hand (<kbd>Left click</kbd>). A few strokes and it breaks. <b>The stone goes into your pack</b> (<kbd>T</kbd>).",
      "When you work at a site, <b>stone in your pack counts</b>, along with what is in the stores.",
      "Rocks grow back in time. The map (<kbd>J</kbd>) shows where they are.",
      "Put what you carry into the <b>store chest</b> and your settlers can use it for their own work.",
    ],
  },
  tools: {
    kicker: "Tools", title: "Pickaxes, and what they break",
    steps: [
      "Tools are made at the <b>chopping block</b> by the cabin. <kbd>F</kbd> there shows what you can make right now.",
      "<b>Wooden pickaxe</b>: 2 logs. Breaks grey stone.",
      "<b>Stone pickaxe</b>: 2 logs and 3 stone. Breaks the green-flecked <b>copper</b> rock and the pale <b>tin</b> rock in the woods.",
      "Ore must be <b>smelted at a forge</b> before it is any use. Build a forge, stand beside it, and hold <kbd>F</kbd>.",
      "At the forge, <b>copper and tin</b> cast together make <b>bronze</b>. A bronze pickaxe breaks the rust-red <b>iron</b> rock, deep in the forest to the south.",
      "Axes, spades, hammers and swords go up the same way: <b>wood, stone, copper, bronze, iron</b>. Each is quicker and stronger than the last.",
    ],
  },
  forge: {
    kicker: "The forge", title: "Smelting, and bronze",
    steps: [
      "Stand beside the forge with ore in your pack and <b>hold <kbd>F</kbd></b> to smelt it: copper ore to copper, tin ore to tin, iron ore to iron.",
      "With <b>copper and tin</b> both in your pack, the forge will <b>cast bronze</b>. One of each makes two.",
      "Give a settler the <b>smith's</b> work (<kbd>F</kbd> beside them) and they cast bronze from the stores, and later iron tools and arms, by themselves.",
      "The metal goes into your pack. Take it to the chopping block to make better tools.",
    ],
  },
  hunger: {
    kicker: "Your body", title: "Hunger",
    steps: [
      "The <b>lower bar</b> under the map is your hunger. It falls slowly all day, faster when you run or work.",
      "To eat, <b>press the number</b> of the food's slot on the hotbar (<kbd>1</kbd>–<kbd>9</kbd>).",
      "Hungry, you <b>tire quickly</b> and your wounds do not mend. Starve, and you die.",
      "<b>Never eat raw meat.</b> It gives you the plague. Cook it first at the fire (<kbd>F</kbd>, <i>Cook the meat</i>).",
      "The settlement's <b>bread</b> is on your hotbar too, when there is some in the stores.",
    ],
  },
  hurt: {
    kicker: "Your body", title: "Wounds",
    steps: [
      "The <b>upper bar</b> under the map is your health. It comes back slowly by itself, <b>as long as you are fed</b>.",
      "A hard blow shakes you and leaves you breathing hard. <b>Toughness</b> (<kbd>P</kbd>) makes that pass faster.",
      "If you die, you wake in your bed. But you <b>lose 15% of every skill</b>.",
      "The plague stops wounds healing at all. A hospital with a doctor cures it faster.",
    ],
  },
  skills: {
    kicker: "Your body", title: "Skills",
    steps: [
      "You get better at what you do. <b>Strength</b> from swinging an axe or blade and landing it. <b>Toughness</b> from taking blows. <b>Healing</b> from every wound that mends. <b>Endurance</b> from running until you're winded. <b>Archery</b> from hitting what you shoot at.",
      "Each goes from 1 to 100, slowly. Every level is harder to get than the one before.",
      "Press <kbd>P</kbd> to see them all: what each does for you, and how to raise it.",
    ],
  },
  chest: {
    kicker: "The cabin", title: "Your own chest",
    steps: [
      "This chest is <b>yours</b>, not the settlement's. Click a thing in your pack to put it in; click it again to take it out.",
      "What you keep here you can <b>sell</b> to Henning or the pedlar. That money goes into <b>your own purse</b>.",
      "The settlement's stores are separate. They are in the <b>store chest</b> outside, once it is built.",
    ],
  },
  stores: {
    kicker: "The settlement", title: "The store chest",
    steps: [
      "Everything the settlement owns is here: bread, stone, planks, ore, metal, tools.",
      "<b>Click</b> a store to take up to five into your pack. <b>Click</b> something you carry to put it in.",
      "Settlers only work with what is in the stores. Put your stone and ore in here, and the smith, the builders and the rest can use it.",
    ],
  },
  trade: {
    kicker: "Trade", title: "Buying and selling",
    steps: [
      "There are <b>two purses</b>. <b>Your own</b> is what you earn by selling from your own chest in the cabin. The <b>treasury</b> is the settlement's.",
      "Sell logs, bread and rye from the stores and the money goes to the <b>treasury</b>. The treasury pays the day's keep and research.",
      "Some things only your own purse can buy, such as <b>arrows: 4 DM a dozen</b>.",
      "To earn for yourself, put meat, ore or metal <b>in your cabin chest</b>. The traders will offer to buy it from there.",
    ],
  },
  settlers: {
    kicker: "Your people", title: "Settlers and their work",
    steps: [
      "Every settler has a <b>job</b>. Stand beside one and press <kbd>F</kbd> to change it: woodcutter, farmer, hauler, miner, smith and more.",
      "Only <b>haulers</b> carry logs and stone to building sites. Woodcutters fell and stack; the rest keep to their own work.",
      "Works need a building (a quarry, a forge, a mine) and something to work with from the <b>stores</b>. Without them the worker waits, arms crossed.",
      "Each day, <b>every work costs a DM</b> of keep from the treasury. If the treasury is short, the works stand idle.",
      "Unhappy people leave. <kbd>G</kbd>, <i>People</i>, shows how each of them feels and why.",
      "<b>More cabins bring more people.</b> Each cabin has room for a family.",
    ],
  },
  inspect: {
    kicker: "The settlement", title: "Looking at a building",
    steps: [
      "Look at a building and press <kbd>V</kbd> to see it up close: what it does, its upkeep, and its condition.",
      "From there you can <b>mend</b> it, <b>rebuild</b> it in a better style (this costs materials, not money), or <b>pull it down</b>.",
      "A <b>woodshed</b> is made bigger there too: build on a second bay, then a third, and it holds more logs.",
    ],
  },
  research: {
    kicker: "Government", title: "Research",
    steps: [
      "Press <kbd>G</kbd> for your government. The <b>research</b> tab is where your people learn new things.",
      "Research costs DM from the treasury and takes a few minutes. One thing at a time. Most new buildings, crafts and arms are unlocked here.",
      "Anything not yet researched is <b>hidden</b> from the plans (<kbd>B</kbd>).",
    ],
  },
  field: {
    kicker: "Farming", title: "Fields",
    steps: [
      "A new field is dug in <b>three strips</b>. Hold <kbd>F</kbd> at each one with the spade.",
      "Then <b>sow</b> the rye, again holding <kbd>F</kbd>. It grows over a few days: shoots, then green, then gold.",
      "When it is gold, <b>reap</b> it (<kbd>F</kbd>). The rye goes into the stores, and the field is ready to sow again.",
      "<b>Farmers</b> do all of this for you. Nothing can be sown in winter, and a well nearby makes the rye grow better.",
    ],
  },
  winter: {
    kicker: "The seasons", title: "Winter",
    steps: [
      "In winter every hearth burns <b>a log a day</b> from the stores.",
      "If the stores run out of logs, people go cold. <b>Two cold days in a row, and someone leaves.</b>",
      "Fell trees before the snow and fill the woodshed. Nothing can be sown until spring.",
    ],
  },
  expand: {
    kicker: "The settlement", title: "Room to grow",
    steps: [
      "The settlement earns more ground as it grows: at <b>8 people</b> (you and yours counted), then at 13, 19, 26 and 34.",
      "When it does, open the map (<kbd>J</kbd>) and click <b>Mark out new ground</b>.",
      "<b>Hold the left button and draw</b>: start on the settlement's edge, draw out round the ground you want, and bring the line back to the edge. What your line rings is what you claim. The map shows it, with how many trees stand on it.",
      "It can't be too big: not too far out, and no more than 1000 square paces at once. Red means it won't do, and says why.",
      "Click <b>Claim it</b>. Everyone but the farmers starts felling the trees on it, and you can help. Once the trees are down, you can build there.",
      "The road stays open. Newcomers still walk up it into the settlement.",
    ],
  },
  business: {
    kicker: "Your people", title: "Taxes and companies",
    steps: [
      "Settlers sell what they make to the pedlar and keep the money. You tax it: <kbd>G</kbd>, <b>Taxes &amp; trade</b>. <b>A tenth of every tax is yours</b>, and the rest goes to the treasury.",
      "Higher taxes make people unhappier, though the contented mind them less.",
      "A settler who has saved enough may <b>start a company</b>: Bread, Meats, Lumber, Stone, Ironmongers or Goods. Each has its own name, colours and banner. They fell their own timber and build a shop, usually beside a path.",
      "Shops pay a <b>business tax</b>, cheer everyone up, and sell to you for less than the pedlar (<kbd>F</kbd> at the counter). But owners give part of their time to their own trade, so the settlement's stores fill more slowly.",
      "You make the laws: forbid businesses altogether, or make everyone ask your leave first. They come to you and show you where they want to build.",
    ],
  },
  horse: {
    kicker: "Horses", title: "Riding",
    steps: [
      "Once your people know <b>Horses</b> (research, <kbd>G</kbd>), you can build a <b>Stable</b> (<kbd>B</kbd>).",
      "At the stable's open front, <kbd>F</kbd> takes a horse out. You ride it as you walk: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, and <kbd>Shift</kbd> to gallop. It is more than twice as fast.",
      "On horseback you can't swing an axe or crouch.",
      "<kbd>X</kbd> gets you down anywhere, and the horse finds its own way back to the stable.",
    ],
  },
  raid: {
    kicker: "Danger", title: "Raiders",
    steps: [
      "Armed men will come up the road. They break what is in their way and kill whoever they catch.",
      "<b>Walls</b> (a palisade, later stone) slow them down. A gate lets your own people through. Broken walls can be mended (<kbd>V</kbd>).",
      "Fight with what you hold. <b>The way you look is the way the blow goes</b>, and the mark beside the crosshair shows it. <kbd>Right click</kbd> raises your guard: put it on the side the red mark shows, just as he swings, and you parry him.",
      "A smith with iron makes spears, swords and axes for your settlers, and they will fight beside you.",
    ],
  },
};
// the order the book lists them in
export const GUIDE_ORDER = ["building", "materials", "tools", "forge", "stores", "settlers", "field", "inspect", "research", "trade", "chest", "hunger", "hurt", "skills", "winter", "expand", "business", "horse", "raid"];
