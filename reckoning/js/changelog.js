// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// WHAT HAS CHANGED — the update log on the front door, newest first. It is
// kept beside the code it describes, as the first Forester's is.

export const CHANGELOG = [
  {
    v: "1.90.18", date: "18 October 2026", title: "The council's missions",
    items: [
      "Campaign: playing a nation of the woods, you're no longer offered stone walls to build, or set a mission to raise them. Their towns stand behind palisades, as the help says.",
      "Campaign: a nation of the woods gets its missions from its council, not from \"the Crown\" and \"the court\".",
      "Campaign: a woods nation's force thrown back from your town is its war party, not its army, as everywhere else.",
      "Campaign: building missions read \"Build the drill yard at Berlin\", not \"Raise drill yard at Berlin\".",
    ],
  },
  {
    v: "1.90.17", date: "18 October 2026", title: "Before the town",
    items: [
      "Campaign: right-clicking a woods nation's town attacks the town, even with their war party camped in it. The click used to be taken for the war party, and your army went after it, \"marching to the Cree army\", and never attacked the town.",
      "Campaign: a small enemy army can be fought in the field. Under three regiments, it used to be refused, and your army only marched after it year after year.",
      "Campaign: right-clicking an enemy town more than a year's march away marches on it, and the paper says when your army stands before it. If a town can't be attacked for another reason, you're told why and your army stays where it is. Before, it marched to the spot, said nothing, and never attacked.",
      "Campaign: an army that arrives where it was sent can give battle that year, at the town it was sent against or the army it went after. It marches on again next year. Arriving used to use up the year.",
      "Battles at a palisade: a burning length looks like one. Flames run along the face of the wall, catching at the foot and climbing, where there were three small ones halfway up. The logs blacken to char and smoulder, and the wall sinks as it burns down, until it falls in.",
    ],
  },
  {
    v: "1.90.16", date: "18 October 2026", title: "News of the year",
    items: [
      "Campaign: learning takes years. Each study takes two years at the least, three for what's built on it and four for the furthest. Each costs twice what it did, when a realm with a few colleges learnt something every year. The Learning screen shows the year of study you're in and how many are left.",
      "Campaign: a discovery makes the newspaper. \"A discovery: crop rotation\" takes the headline under a printer's ornament, with how many years your scholars spent at it. If something bigger has the headline, it gets its own ruled box \"From the Learned World\".",
      "Campaign: a war you declare is in the newspaper too (\"War declared on Saxony\"), and a war declared on you heads its column. The paper now carries everything since the last one, not only what happened as the year turned: what you did during the year, a war or a treaty, used to be left out.",
      "Campaign: a new Diplomacy screen (the button at the top, or P). Every crown is listed: at war with you, allied, bound by a pact or truce, or neither. Each shows its regard for you, its towns, its army if your spies know it, and the wars it's fighting. Click one to deal with it.",
      "Campaign: right-click gives orders only to an army you've chosen. It used to march whichever army was last in hand, chosen or not, so a garrison's new army set off after you'd put it down. A chosen army stays chosen after a march order, and Esc puts it down.",
      "Campaign: right-clicking an enemy army more than a year's march off sends your army after it, not just to where it stood. Once you're within a year's march it's held and can't slip away, so you can fall on it next year. If you can't attack it now (already marched this year, a siege, or under five regiments), you're told why and your army stays where it is. Before, it marched to the empty spot while the enemy walked off.",
      "Campaign: an enemy army with one of yours right on it is held. It can't march off to one of your towns as if you weren't there: it stays, to fight its way out or be brought to battle. The paper says when one is held.",
      "Campaign: militia are worth less than musketeers on every count. A militia regiment counts for a little over half a regiment of musketeers in the reckoning of battles fought out and of a garrison's hold, and takes 450 men from its town, not 600. In battle they already shot wider, loaded slower and broke sooner.",
      "Bows: a bowman or a settlement's hunter carries the bow upright in the left hand at their side, not flat at the hip like a stick. Drawing, the bow arm is out straight with the bow upright and canted, the right hand draws the string back to the cheek, and an arrow is on the string.",
      "Battles at a palisade: setting a length alight with your musket in your hands no longer fixes the bayonet. F fixes it only when there's nothing to use near you.",
      "Battles at a palisade: the frame rate no longer drops when it burns. Every length that caught brought a light of its own, and every change in the number of lights rebuilt every lit thing's shader. Two lights now follow the fire nearest you, and the smoke is a little thinner.",
      "Purple smears among the trees, for real this time: the faint colour fringe toward the screen's corners is gone. It split the fine dither of needles thinned near your eyes into red and blue, however it was taken.",
      "XII. Harvest Home: the rye stooks after reaping are pale straw sheaves, each its own shade, with heads of ears at the top, not orange tents. The marker no longer vanishes when there's no settler yet to give farm work: it goes on to the cabin site.",
    ],
  },
  {
    v: "1.90.15", date: "18 October 2026", title: "Seen properly",
    items: [
      "IX. The First Winter: the fire you keep alive through the blizzard burns where you can see it. The hearth had been set back inside the cabin's stone chimney, so the fire burned in the stones, and the firebox looked black and cold all night. It now stands out from the chimney face, with its hearthstone, mantel and kettle. You look down into it, not at the chimney breast.",
      "Felling: standing at a spruce with the axe, its low branches thin away close to your eyes, as its needles do. Before, you looked out through a cage of bare poles round the trunk. The same goes for hiding in among the trees in VIII. Martinmas.",
      "Among the trees, the dither where needles thin out close to your eyes no longer shows purple smears against the sky. The lens's faint colour fringe was splitting the dither's dots into red and blue.",
      "Talking to someone you've walked right up to, you take a step back first. Their face no longer fills the whole screen for the conversation, as the charcoal burner's did in VII.",
      "V. Far, Far Away: as you come to each fork, a marker shows the road on, and points you back if you've taken the wrong track. The hint had always said to go the way the marker points, but there was no marker.",
      "V. Far, Far Away: your sibling's advice at a fork is dropped once you've passed it. Before, it could come late, at the next fork, and tell you the wrong way. And if you walk faster than the talk on the road, the \"three days pass\" moment no longer pulls you back to the middle of the road.",
      "V. Far, Far Away: the \"Look at the ruin\" marker is at the doorway, where you look in, not in the middle of the burned cabin.",
      "IV. The Marsh Gate: the green glow round the little door fades as you come up to it. At the door it had covered half the screen while your sibling spoke. You also stand back from the wall to talk, not with your face in the stones.",
      "VIII. Martinmas: at the fire that night, Henning stands round to your left, and you see him past the flames, not through them.",
      "I. The House by the Harbour: supper has a round rye loaf on a board and pewter plates, where there was a block and white slabs. The candle and the loaf no longer stand between you and Father.",
      "XI. Forester: a settlement begun without Marta's cabin wants only Tomas and Grete's, not a second one for them.",
    ],
  },
  {
    v: "1.90.14", date: "18 October 2026", title: "Follow the marker",
    items: [
      "XI. Forester and XII. Harvest Home: the marker goes where the next piece of work is done. While a site still wants logs and your arms are empty, it's on the log stack (or the woodshed). Once the walls are up and the cabin wants a door, it's on the sawhorse. Before, it stayed on the building site, so following it left you standing there with nothing to do.",
      "The whole story was played through end to end by an automatic tester, at many times normal speed, to find the places where following the marker led nowhere.",
    ],
  },
  {
    v: "1.90.13", date: "18 October 2026", title: "The cabin's doorway",
    items: [
      "VI. The Clearing: the marker for \"Rebuild the cabin\" stands at the cabin's doorway, where you raise it, and not in the middle of the ruin. Following it before led you in among the fallen logs, with nothing to press.",
      "VI. The Clearing: once the walls go up, the objective doesn't flick back to \"Fell spruces… 1 of 20 logs stacked\".",
      "X. The Stranger: while Marta's cabin still wants logs and your arms are empty, the marker is on the stack, where you take them. Before, it stayed on the building site, so following it left you standing there with nothing to put down.",
    ],
  },
  {
    v: "1.90.12", date: "18 October 2026", title: "Name them first",
    items: [
      "Character builder: pressing Into the game without a roleplay name now says \"Give them a name first\" in the name box. Before, the box only turned orange and nothing happened.",
    ],
  },
  {
    v: "1.90.11", date: "18 October 2026", title: "Face to face",
    items: [
      "Character builder: on Face, your character turns to look at you and stays there, instead of slowly spinning until you're looking at the back of their head. Whole still turns slowly, so you can see the clothes all round.",
      "Worlds & colonies: an empty Wide World says \"No one in the world just now: be the first\" instead of \"0 people in the world now\".",
    ],
  },
  {
    v: "1.90.10", date: "18 October 2026", title: "Mountains, not snowfields",
    items: [
      "Campaign 3D map: the eastern Alps are lower as they run out toward Wien. The hills south of the city were a broad field of snow at the western Alps' height, and they're green now.",
      "Campaign 3D map: snow lies on the peaks, not in one smooth white sheet over the whole range. The snowline is higher and ragged, with a broad band of bare grey rock beneath it, so the ranges read as mountains rather than cloud.",
    ],
  },
  {
    v: "1.90.9", date: "18 October 2026", title: "The court moves on",
    items: [
      "Campaign: when the Crown's mission runs out of time, it isn't handed straight back to you word for word in the same gazette. The court lets that kind of task rest for two years and asks for something else.",
    ],
  },
  {
    v: "1.90.8", date: "18 October 2026", title: "Wien has its name",
    items: [
      "Campaign map: every capital is named, even where its country's name runs across it. Wien under \"AUSTRIA\", Dresden under \"SAXONY\" and Warszawa went unnamed before. The name is now written over the country's lettering, haloed so both can be read.",
      "Campaign map: an army standing in a town stands just to the left of it, and a second or third army further left again, so the town's name to its right isn't hidden under them.",
    ],
  },
  {
    v: "1.90.7", date: "18 October 2026", title: "The last of the water",
    items: [
      "The rest of the old water system is gone. The guide no longer has a page on thirst, and getting over the flux no longer tells you to boil your water.",
    ],
  },
  {
    v: "1.90.6", date: "18 October 2026", title: "Clean bark",
    items: [
      "Bark up close no longer glitters. The trunk and boughs of a tree you stand under or beside were covered in a fizz of white specks, the bark's fine furrows lit up as noise. The furrows are shallower now, and their shading fades out wherever they're finer than the screen can show.",
    ],
  },
  {
    v: "1.90.5", date: "18 October 2026", title: "A real notch",
    items: [
      "The cut your axe makes in a tree is a real notch now, not a flat picture stuck on the bark. A wedge is carved into the trunk on your side, with a flat floor and a sloped face of fresh pale wood meeting in a dark crease. It goes deeper with every stroke and fits the trunk's own shape, and it stays in the trunk as the tree comes down.",
    ],
  },
  {
    v: "1.90.4", date: "18 October 2026", title: "No more thirst",
    items: [
      "Water is gone as a need. There's no thirst bar, no dying of thirst, no drinking at the brook, pond or well, and no boiling water at the fire. Canteens are no longer made at the chopping block. Hunger stays as it was.",
      "Your brother or sister no longer whacks at the ground beside the cabin with a hammer, a knock every second, in Seed Before Frost and the chapter after it. They pick stones off the ground quietly instead.",
    ],
  },
  {
    v: "1.90.3", date: "18 October 2026", title: "Hands down",
    items: [
      "Nobody stands with both hands raised by their shoulders any more. That was meant to be arms folded but never looked it. Henning, the townsfolk and everyone else who stood like that now stands at ease.",
    ],
  },
  {
    v: "1.90.2", date: "18 October 2026", title: "At the burner's door",
    items: [
      "The charcoal burner waits outside his hut, at the door toward his fire, instead of stuck inside its walls when you come to speak to him.",
      "His hut's gables are shut: boards behind the split logs, and the logs turned edge-on, so you no longer see through the front of it between them.",
      "Leaves and needles right in front of your eyes are cleared away cleanly now. Before, a fine dotted screen of them lay over the view whenever you stood close to a tree or bush.",
    ],
  },
  {
    v: "1.90.1", date: "18 October 2026", title: "On the walls",
    items: [
      "Part Three: the Danes before Hamburg is fought from the city's own stone walls, not a field redoubt. You and the militia start up on the wall walk beside the gate tower, behind the battlements, with the Danish camp across the field.",
      "Battles at a walled town (in the campaign too): the parapet is chest-high over the walk again. A miscalculation had stood it three metres over the defenders' heads, so all you saw was the stone in front of your face. Defenders now start on the walk and hold it, every company of them, instead of being moved off into the streets among the houses.",
      "The Hamburg watch carry their halberds upright, point to the sky, instead of levelled at whoever is in front of them.",
      "Part Three's chapters show summer in the settlement's bar, not spring.",
    ],
  },
  {
    v: "1.90.0", date: "18 October 2026", title: "Part Three: The Wars",
    items: [
      "The story goes on past the Reckoning. Part Three opens in August 1686: the King of Denmark is before Hamburg, and the city calls on its charter. Choose who goes, then take your company onto the works by the Elbe and fight the Danes yourself, in a full battle with your company to command beside the city's militia.",
      "Then the Emperor's Commission: a colonel of the Duke of Celle's foot offers you command of an army in the Emperor's war in Hungary. Take it, and the campaign opens in 1686 as the Austrian Empire, with you as its general, who never falls in the field. Your own campaigns aren't touched. The Home button (or Home in the menu) takes you back to your settlement whenever you like, and the campaign keeps; chapter XV takes you back to it.",
      "Free Play is now the last chapter, after Part Three. If you're already in Free Play, both new chapters are open to you in Chapters. Part Three comes after Part One and Part Two, so the demo is unchanged.",
      "Campaign map: a walled town is drawn as a little stone fort, with curtain walls and battlements, round towers at the corners, and arrowhead bastions for a star fort.",
    ],
  },
  {
    v: "1.89.4", date: "18 October 2026", title: "A clearer map",
    items: [
      "Campaign map: the trade-good badges over every town are gone from the ordinary map, and show only on the loyalty map (L), where a town's business is what you're looking at.",
      "Campaign map: a walled town has its ring of grey stone and battlements round the town itself, at every zoom, so walls show without the badges.",
    ],
  },
  {
    v: "1.89.3", date: "18 October 2026", title: "Battles at sea, walls you can see",
    items: [
      "Campaign: fleets at war fight when they meet. An enemy fleet that sails up to yours always attacks; before, it often just lay alongside. Two fleets at war that end the year beside each other fight, whoever sailed to whom.",
      "Campaign: a fleet can't slip past an enemy fleet any more. If its course passes yours anywhere along the way (the Channel, say), it's stopped there and the two fight. The same goes for your own fleets sailing past theirs, and the order tells you so.",
      "Campaign: an enemy crossing to your shores is stopped by any fleet of yours in that stretch of sea, not only one lying right on its course. Transports without an escort are caught at sea and lose men, and the rest put back to port.",
      "Campaign: an enemy fleet too weak to fight yours no longer sails up to it only to sit there.",
      "Campaign map: walled towns have a ring of grey stone and battlements round their badge, and the new star forts have points. A crown's capital is no longer drawn walled when it has no walls, so the map and the town's card agree.",
      "Campaign 3D map: ports whose spot fell on the water (Moose Factory, New York, Stockholm, Copenhagen and others) now stand on the nearest shore, houses and all, instead of in the bay.",
    ],
  },
  {
    v: "1.89.2", date: "18 October 2026", title: "Names in view",
    items: [
      "Campaign: on the 3D map, the town names come down toward the roofs as you zoom in, so a town's name stays in view close up instead of floating off the top of the screen.",
      "Campaign: what's waiting for your word (an attack, a peace offer) now comes first in the side panel, above the reminder that your scholars have nothing to study.",
    ],
  },
  {
    v: "1.89.1", date: "18 October 2026", title: "A lighter 3D map",
    items: [
      "Campaign: the 3D map draws its towns about six times faster. Their thousands of houses, roofs, walls and palisade stakes are drawn a kind at a time instead of one by one, which leaves more of each frame for slower computers. The old towns are also cleared from memory properly when the map changes hands.",
      "Campaign: the first-year tip now says how the campaign works rather than what's new in it, and points to the ? button for the rest. The ? help mentions the fortresses walled from the start, and sacking.",
    ],
  },
  {
    v: "1.89.0", date: "18 October 2026", title: "The fortresses of 1683",
    items: [
      "Campaign: the great fortresses of the age start the game walled, as they stood in 1683. That means Vienna, Buda, Belgrade, Kamieniec, Candia, Azov, Strasbourg, Antwerp, Hamburg, Danzig, Riga and Copenhagen. Taking one now means guns and a siege, or a hard storm.",
      "Campaign: on the 3D map, a walled town has its walls: a ring of stone round the houses, with bastions at the angles (more of them for the new star forts).",
      "Campaign: clicking a town in Your towns or on the Victory card now takes the 3D view there too. Before, only the flat map moved, so in 3D nothing seemed to happen.",
    ],
  },
  {
    v: "1.88.5", date: "18 October 2026", title: "Honest marching news",
    items: [
      "Campaign: an enemy army marching on one of your towns from far away now says how many years off it is (\"three years' march off\"), and counts down. Before, it said it would be at the walls next year, every year.",
      "Campaign: an enemy army already on the road keeps marching each year until it arrives, so it comes when the news says it will.",
    ],
  },
  {
    v: "1.88.4", date: "17 October 2026", title: "A tidier bar",
    items: [
      "Campaign: the top bar stays on one line on smaller screens. A long list of enemies shows the first two and how many more, with the whole list when you hover it, and it no longer pushes the buttons onto a second row under the bar.",
      "Campaign: the Learning button on the idle-scholars card is its proper size, not stretched across the card. The Victory card's towns read as links, not white boxes.",
    ],
  },
  {
    v: "1.88.3", date: "17 October 2026", title: "Two crowns, two courts",
    items: [
      "Campaign with a friend: each player keeps their own government and ministers, spies, protectorates and scholars' exchanges, and their own army's state at sea. Before, the two players shared one government, and one player's bribes and protectorates counted for both.",
    ],
  },
  {
    v: "1.88.2", date: "17 October 2026", title: "One click to the place",
    items: [
      "Campaign: the towns your Victory card asks for are links now: click one and the map goes there, with its card open.",
      "Campaign: click a crown in The great powers to open its card.",
    ],
  },
  {
    v: "1.88.1", date: "17 October 2026", title: "The gazette sorts its news",
    items: [
      "Campaign: the year's newspaper puts the new kinds of news where they belong. Winter's toll on your army goes among the wars, and can make the headline. Tribute, protectorates and trade agreements go among the courts. Your generals' new traits, towns sacked or occupied, and the Crown's missions go in your own realm's news.",
    ],
  },
  {
    v: "1.88.0", date: "17 October 2026", title: "General Winter",
    items: [
      "Campaign: winter takes its toll, as in Empire: Total War. An army that sees the year out in another crown's land in the far north (Russia, Scandinavia, the eastern Baltic) or out on the eastern steppe loses about a fourteenth of its men to the cold and sickness, and the news says so.",
      "Campaign: your own land, an ally's or a protectorate's spares it, as does a ship's deck. Charles XII's march on Moscow can be made, but it costs.",
    ],
  },
  {
    v: "1.87.1", date: "17 October 2026", title: "Protectorates keep faith",
    items: [
      "Campaign: a protectorate goes to war with you every time, even when it thinks ill of you or the enemy is an old friend of its own. On submitting, it joins the wars you're already fighting.",
    ],
  },
  {
    v: "1.87.0", date: "17 October 2026", title: "Protectorates",
    items: [
      "Campaign: protectorates, as in Empire: Total War. At war with a crown no bigger than yours, choose it and Demand they submit. The worse the war has gone for them, the likelier they are to accept.",
      "Campaign: a protectorate makes peace and becomes your ally. It pays you tribute every year, a third of what its towns are worth, fights in your wars, and never leaves the alliance or makes war on you. Its card says it's yours.",
      "Campaign: you can release a protectorate, and it stays your ally and thinks the better of you. Declare war on it and it's free.",
    ],
  },
  {
    v: "1.86.3", date: "17 October 2026", title: "No debts from riots",
    items: [
      "Campaign: granting a rising concessions you couldn't afford put the treasury into debt, and a debt makes regiments desert. Now the button is greyed out when the chest hasn't the money.",
      "Campaign: a riot, or a rising that wins, takes a town's year of revenue, but never more than the treasury holds, so it can't leave you in debt either.",
    ],
  },
  {
    v: "1.86.2", date: "17 October 2026", title: "Know your enemy",
    items: [
      "Campaign: the other crowns' generals have traits of their own now, about half of them: Bold, Cautious, Siege engineer, Hero of the nation, or Drunkard. They show on the crown's card under its general, and count in battles left to the generals. An enemy siege engineer makes your walls count for half.",
      "Campaign: the real men of history, yours and theirs, are never made drunkards or floggers by chance.",
      "Story: hiding from the charcoal buyer in the woods gets a little kinder each time he finds you, as the marsh gate does.",
    ],
  },
  {
    v: "1.86.1", date: "17 October 2026", title: "Idle scholars",
    items: [
      "Campaign: when your scholars have nothing to study, a card at the top of the panel says so, with a button that opens Learning. Their year's work no longer goes to waste unnoticed, and a new campaign shows you where to begin.",
    ],
  },
  {
    v: "1.86.0", date: "17 October 2026", title: "Scholars exchanged",
    items: [
      "Campaign: with an ally or a trade partner you can now exchange scholars, as Empire: Total War's crowns traded learning. Letters and books go between the universities, and your scholars' current study comes 2 points nearer (3 with an ally). They think a little better of you for it. Once every five years with each crown.",
      "Campaign: if a campaign can't be saved because the game's storage is full, you're told so, instead of it failing without a word.",
      "Campaign: tested a fleet carrying an army over the Channel, landing it, and the French fleet coming to clear the way for an invasion: all as it should be.",
    ],
  },
  {
    v: "1.85.1", date: "17 October 2026", title: "Smaller saves",
    items: [
      "Campaign: saves are about a sixth of the size. Sixty years of conquest came to nearly a megabyte a campaign; now it's about 150 KB. A long campaign, or several, could fill the space the game is given and stop saving without a word. Older saves load as before.",
    ],
  },
  {
    v: "1.85.0", date: "17 October 2026", title: "Occupy or sack",
    items: [
      "Campaign: take a town from another crown and you choose what becomes of it, as in Empire: Total War. Occupy it, and its people are spared and its trade goes on. Sack it, and your soldiers carry off thalers (more from a big, crowded town), but a third of its people are killed or flee.",
      "Campaign: a sacked town's people don't forget it. Its loyalty suffers for ten years, worst in the first four, and crowns of its faith think worse of you. A sacked town is quick to riot: garrison it, or lighten its taxes.",
    ],
  },
  {
    v: "1.84.1", date: "17 October 2026", title: "The help page brought up to date",
    items: [
      "Campaign: How the campaign works now covers victory and the three years' grace after your last town falls, generals' traits, the other crowns' offers and demands, and the great powers. It no longer speaks of hired transports, which are gone.",
      "Campaign: when you refuse tribute and the other crown backs down, the answer no longer shows as a failure.",
    ],
  },
  {
    v: "1.84.0", date: "17 October 2026", title: "The great powers",
    items: [
      "Campaign: a new card in the panel, The great powers, ranks the crowns of the world as Empire: Total War's faction summary does, by their towns and the people in them. The top six are shown, with yours in gold, and yours below them if you're further down. Its heading says where you stand: 5th of 48, say.",
    ],
  },
  {
    v: "1.83.3", date: "17 October 2026", title: "An easier creep to the marsh gate",
    items: [
      "Story: creeping past the watch is easier. A watchman takes longer to be sure of what he saw, a good deal longer when you're crouched, and forgets you sooner once you're out of sight. He hears a runner from less far off.",
      "Story: at the marsh gate, the watchmen walking the lanes go more slowly and stand longer at each end of their beat, leaving wider gaps to slip through. The gate watchman turns to check the gate more often, and for longer.",
      "Story: each time you're caught at the marsh gate, the next try is a little kinder.",
      "Story: the chase through Hamburg is back as it was in 1.83.1; it was eased by mistake.",
    ],
  },
  {
    v: "1.83.2", date: "17 October 2026", title: "An easier chase",
    items: [
      "Story: the chase through Hamburg is easier. The watch start slower and gain on you more gently, you have a longer start, the man who runs to cut you off from the alley reacts later, the one from the north street comes later, and your breath lasts longer. They must be closer to catch you, too.",
      "Story: each time the watch catches you, the next try is a little easier still: they're a step slower, and you get a step more start.",
    ],
  },
  {
    v: "1.83.1", date: "17 October 2026", title: "Not lost in a day",
    items: [
      "Campaign: losing your last town no longer ends the campaign at once while your army is still in the field. You have three years to take a town back, with a red card at the top of the panel counting them down; retake one and the crown is saved.",
      "Campaign: battles left to your generals favour the bigger army more, as numbers told then. Two to one now wins three times in four, and three to one nearly nine in ten; before, a garrison of 48 lost to 16 one time in five.",
      "Campaign: a nation of the woods with a single town now starts with six companies of its own warriors holding it, so the first raid while the war party is away doesn't end everything.",
      "Campaign: generals take to drink, or to the lash, about half as often.",
    ],
  },
  {
    v: "1.83.0", date: "17 October 2026", title: "The other crowns propose",
    items: [
      "Campaign: the other crowns come to you now, as in Empire: Total War, where before only you went to them. A crown that thinks well of you offers a trade agreement. A friend of your faith, or one fighting your enemies, offers an alliance. Accept, or decline and be thought a little worse of.",
      "Campaign: a strong neighbour that dislikes you may demand tribute: thalers, or war. Pay, and it leaves you in peace five years. Refuse, and it may declare war on you, or it may back down.",
      "Campaign: one proposal a year at most, and none in a crown's first two years.",
    ],
  },
  {
    v: "1.82.3", date: "17 October 2026", title: "Smoother panning",
    items: [
      "Campaign: the map draws three to four times faster as you pan and zoom, about a hundredth of a second a frame where it was a thirtieth. The light wash over the crown under your mouse, and the crossed swords over crowns at war, are worked out once each time the map changes instead of every frame.",
    ],
  },
  {
    v: "1.82.2", date: "17 October 2026", title: "A quicker map",
    items: [
      "Campaign: when towns change hands the map redraws two to three times faster: about an eighth of a second where it was nearly half a second, and more on a sharp screen. Only the crowns a change touched have their borders traced again, not all fifty, and the paper's grain is laid on from one small tile instead of speck by speck.",
      "Campaign: victory never asks you to take a friend's towns now: none of your own league's, and none of an ally's. Austria is sent after Buda and Pressburg, not Munich and Dresden.",
    ],
  },
  {
    v: "1.82.1", date: "17 October 2026", title: "The relief of Vienna",
    items: [
      "Campaign: the Sultan took Vienna within two years in most campaigns, and the Austrian Empire was often gone by 1690. Now the Holy League fights as one until 1700, as Sobieski's Poles came to Vienna with their whole army, and the Habsburgs are stronger. In six test campaigns Vienna held in five, and Austria usually pushed the Turk back down the Danube.",
    ],
  },
  {
    v: "1.82.0", date: "17 October 2026", title: "Generals' traits",
    items: [
      "Campaign: generals earn traits, as in Empire: Total War, and they count in every battle after. Bold, for a win against the odds: better attacking. Cautious, after two defeats: better holding ground, worse attacking. Siege engineer, after storming walls twice: walls count for half against him. Hero of the nation, after six victories: better in every battle, with the men's spirits higher.",
      "Campaign: the camp leaves its mark too. Years of unbeaten service can make a general Beloved of the men. Now and then one turns Drunkard, worse in battle, or Flogger, with the men's spirits lower.",
      "Campaign: traits show on the general's card under Your army, good ones in gold and bad ones in red; hover one for what it does. The news says when one is earned.",
    ],
  },
  {
    v: "1.81.0", date: "17 October 2026", title: "Victory",
    items: [
      "Campaign: victory conditions, as in Empire: Total War. Every crown has its ambition: certain great towns to hold, the nearest and greatest that aren't yours (Edinburgh, Glasgow, Rouen and Paris for England; Copenhagen, Christiania, Königsberg and Danzig for Sweden), and so many towns in all, within sixty years.",
      "Campaign: a Victory card at the top of the panel ticks off each town as you take it and counts the years left. The top bar's town count is now out of your goal, not out of forty.",
      "Campaign: win it and a Victory page says so over the map, after the year's newspaper. If the years run out first, a page says how near you came. Either way you can play on or begin another campaign.",
    ],
  },
  {
    v: "1.80.1", date: "17 October 2026", title: "A bug sweep",
    items: [
      "Campaign: forty years played through as England, and twenty as the Dutch, Russia, Sweden, Castile, the Haudenosaunee and the Cherokee, with no errors along the way. Saves from before government, missions, trade and colonial armies load and take them up.",
      "Campaign: ministers' scandals came nearly every other year. They're rarer now, and a minister caught once lies low for three years before he's caught again.",
      "Campaign: a crown that loses its great cities now loses the men it can no longer keep. A fifth of its army above what its towns can feed melts away each year, where before it kept them all.",
    ],
  },
  {
    v: "1.80.0", date: "17 October 2026", title: "Trade",
    items: [
      "Campaign: trade, as in Empire: Total War. Every town has its good: furs from Canada and Hudson's Bay, fish off Newfoundland and New England, tobacco from the Chesapeake, sugar from the Caribbean, silver from New Spain, timber and iron from the north, grain from the Baltic plains, wool from Britain, cloth from the Low Countries and Germany, wine from France and Iberia, silk from Italy and the Levant. Each is painted with its own icon: on the town's card, in the new Trade card, and on the map beside every town when you're zoomed in.",
      "Each good brings thalers every year. Trade pacts pay more the more goods a partner has that you haven't; the Trade card shows each pact and the goods it brings you.",
      "Blockades: an enemy fleet lying off one of your ports shuts it, so none of its trade gets out. The port is ringed in red on the map, its card says so, and the year's news tells you. Send a fleet to drive the enemy off.",
    ],
  },
  {
    v: "1.79.1", date: "17 October 2026", title: "Corrupt ministers, clean lines",
    items: [
      "Campaign: every minister has a corruption of nought to four, shown in red beside his skill on the Government card and when you choose a new one. The Treasury's costs 3% of your income a point (the card says how many thalers a year), the War minister's makes regiments 3% dearer a point, and a badly corrupt minister of Justice sells verdicts (−1 loyalty in every town). Now and then a corrupt minister is caught with his hand in the treasury: the money's gone, and you turn him out or keep him.",
      "The map: your own crown's land, and the crown you point at or choose, is lit without painting over the map's black lines. It was laid on in strips that overlapped and covered the coasts and frontiers; it's now one even wash that leaves the ink black. Land changing hands spreads the same way.",
    ],
  },
  {
    v: "1.79.0", date: "17 October 2026", title: "Government",
    items: [
      "Campaign: your crown has a government, as in Empire: Total War. An absolute monarchy's heavy taxes anger its towns less, but its scholars are slower. A constitutional monarchy has 10% more income and quicker scholars, and an election every five years that may change a minister. A republic has 15% more income, scholars 20% quicker and more content towns, but a long war wearies them. The Dutch, Venice and Genoa start as republics; England, Scotland, Ireland and Poland as constitutional monarchies; the rest as absolute.",
      "Three ministers, each with a portrait and a skill of one to five stars: the Treasury (income), War (what regiments cost, and the army's morale) and Justice (order in the towns). Change one a year from the Government card, choosing from three candidates.",
      "Revolution: two years with unrest in two towns of every five, and the people rise. Grant them a constitution (or a republic), or crush it at the cost of a quarter of your regiments and the army's spirit.",
    ],
  },
  {
    v: "1.78.0", date: "17 October 2026", title: "Missions from the Crown",
    items: [
      "Campaign: missions, as in Empire: Total War. Now and then the Crown sets you a task with a year to have it done by: take an enemy town, raise a building in one of yours, field an army of so many regiments, beat a crown's army, sign a trade pact, or put so many ships to sea. Do it in time and the reward, in thalers, comes at once, with a lift to the army's spirits; let the time run out and the court is displeased. Two at most at a time, shown on the side panel.",
      "A simpler screen. The top bar has only Learning, Panel, a ? for how the campaign works, and End the year; another campaign and the battles menu are in the Esc menu. The help strip and the long notes are gone from the side panel; the taxes are one line and a slider; a town's reasons for its loyalty fold away under its loyalty, open when it may riot.",
      "The loyalty map's colours lie under the map's ink: the coasts, frontiers and rivers stay drawn over them, and the only lines it adds are between your own towns' countries.",
    ],
  },
  {
    v: "1.77.1", date: "17 October 2026", title: "Tax sliders",
    items: [
      "Campaign: taxes are sliders. The realm's runs Light, Fair, Heavy; a town's own runs Exempt, Light, Fair, Heavy, each stop named under it. Drag it and let go to set the taxes.",
      "Campaign: an enemy town's card no longer tells you how many regiments its crown can bring to it, unless you have a politician of theirs in your pay.",
    ],
  },
  {
    v: "1.77.0", date: "17 October 2026", title: "Colonies, fleets and smooth marches",
    items: [
      "Campaign: the crowns of Europe with towns in the New World have colonial armies there, apart from their armies at home. They're on the map while you're at war with them, defend their colonies, march on yours, and can be attacked and beaten in the open field. Their size is hidden unless you have a politician of theirs in your pay. An army at home can't come over to help, nor the colonial army go home.",
      "Invasions over the narrow seas: an enemy can take ship for a town of yours across the Channel, the North Sea or the Mediterranean. A fleet of yours lying in the way stops them. If they have a fleet they must beat yours first, and you can fight that battle yourself or leave it to your admirals; if they have none, they can't cross at all. Beaten, the invasion fails with men lost on the transports.",
      "Fleet battles: right-click an enemy fleet with yours selected to attack it, or sail toward it if it's too far. A fleet that has sailed up to an enemy this year can still attack it.",
      "Marches are smooth. The campaign worked out the whole map afresh hundreds of times a turn, and the side panel and every order waited on it: a redraw is now ten times quicker, an order is no longer followed by a second's freeze, and a march no longer stalls when it ends. The way an army or fleet goes is drawn as a smooth road round the water, the mark turning gently as it goes.",
      "A new army formed from a garrison, split off, or put aboard ship appears where it stands, instead of marching in from somewhere else.",
      "Pictures (portraits, unit plates, the gazette's woodcut) can no longer be dragged out of their places.",
    ],
  },
  {
    v: "1.76.0", date: "17 October 2026", title: "Aboard, and over there",
    items: [
      "Campaign: armies go aboard your fleets. A fleet off a river port such as London was too far from the army in the town to take it aboard, and the button simply didn't appear. Now it reaches, and you can also click your army and right-click your fleet to embark it. If the fleet can't carry the whole army, as many regiments as it can carry go aboard as an army of their own, and the rest stay ashore. When it can't be done, the fleet's card says why.",
      "Campaign: a new game starts with soldiers in your colonies. Each of your towns over the Atlantic has a garrison: a regiment of foot (two in the larger towns) and the settlers' militia. Your army at home can't come to them.",
      "Battles: watching your company after you fall, the camera stays above the ground. On a hillside it sat in the slope behind the soldier you were watching, and all you saw was earth.",
      "Sieges: a town's walls and towers on a hillside stand clear of the slope. Their tops were set from the lowest ground under them, so at the uphill end and at the corners the hill came through, and you could walk into the wall. The corners where the front meets the sides are now solid too.",
    ],
  },
  {
    v: "1.75.3", date: "17 October 2026", title: "Exempt",
    items: [
      "Campaign: exempt a town from taxes. A town's tax buttons now have a fourth, Exempt: it pays the treasury nothing, its people are grateful (+2 loyalty), and it grows a little faster. Use it on a restless or newly conquered town until it settles. Exemptions stay when you change the realm's taxes.",
    ],
  },
  {
    v: "1.75.2", date: "17 October 2026", title: "Your own ships",
    items: [
      "Campaign: no more hired shipping. An army can't be sent over the water (the Atlantic, the Channel, to an island) for thalers any more; it goes only aboard a fleet of your own. Bring the fleet to the shore where the army stands, embark it, sail over and land. Sending it across the water anyway tells you so.",
    ],
  },
  {
    v: "1.75.1", date: "17 October 2026", title: "Beaten armies stay beaten",
    items: [
      "Campaign: an army you beat loses far more than the men you killed. A rout costs it its wounded left on the field, the men taken prisoner and the men who ran and never came back: at least two fifths of what it brought to the fight, more the more you killed. Won by your generals, the same.",
      "A crown beaten in the field or before your walls finds new men only half as fast for the next two years, so its army can't simply be made up again at once.",
    ],
  },
  {
    v: "1.75.0", date: "17 October 2026", title: "A man at their court",
    items: [
      "Campaign: you no longer know how big another crown's army is. Its mark on the map shows a question mark instead of a count; clicking it or hovering it says its size is unknown; their card says army ?; and the odds of attacking it can't be reckoned. The news of their marches and wars leaves the number out too.",
      "Corrupt a politician: on any crown's card, war or peace, pay 300 thalers to buy a man at their court. From then on you know their army's size everywhere: on the map, on its card, in the odds and in the news. Each crown is bought once.",
      "Another player's army is still shown as it is.",
    ],
  },
  {
    v: "1.74.3", date: "17 October 2026", title: "Off the gun",
    items: [
      "Battles: Shift takes you off a gun you're working. F still does too, and no longer puts you straight back on it (the same press was taking the gun up again), and walking off with W A S D leaves it as well.",
      "While you're on a gun, a sign at the bottom of the screen says so the whole time: look to lay it, click to fire, Shift to leave the gun.",
    ],
  },
  {
    v: "1.74.2", date: "17 October 2026", title: "Answers you can see",
    items: [
      "Campaign: the answer to whatever you do or ask (a crown granting or refusing, a march begun, a regiment raised, an order that can't be carried out) appears as a large card over the map, green with a tick for yes and red with a cross for no. It stays long enough to read, or click it away. It's still written at the top of the side panel too.",
      "Campaign: fleets no longer seem to cross the land. A fleet's dotted course follows the sea round the coasts, as its mark does when it sails; and an army put ashore from a ship, or carried over the water, appears where it lands instead of being seen walking across the sea.",
    ],
  },
  {
    v: "1.74.1", date: "17 October 2026", title: "No more walking on water",
    items: [
      "Campaign: armies march by land, round bays, lakes and seas, not straight across them. The dashed road shows the way they'll go, and the army's mark follows it as it marches; a fleet's follows its course round the coasts.",
      "Where no road joins two places (Britain and the Continent, Ireland, Sicily, the Danish islands), the army takes ship, as it does over the Atlantic: hired shipping for 120 thalers, or free aboard a fleet of your own.",
      "An army sent out onto the water marches to the nearest shore instead; out in the open sea, it's told to take ship.",
    ],
  },
  {
    v: "1.74.0", date: "17 October 2026", title: "Learning you can see",
    items: [
      "Campaign: what you learn changes your battles. Until your crown has studied the socket bayonet, your musketeers and grenadiers can't fix bayonets (F tells you so), and fight hand to hand with the blade alone. Linear tactics makes them load and fire 15% faster. Without field artillery, only one gun follows your army into a battle in the open field; sieges and town fights still get them all.",
      "The other crowns learn as the age did: the bayonet by the later 1690s, platoon fire by the 1700s, light field guns soon after. Another player's crown has what it has studied.",
      "Campaign: Esc opens a pause menu over the map, with Learning, Settings, Controls and Quit to title; the campaign is kept as it stands. Esc first closes whatever else is open (a unit's card, the learning, the loyalty map), and closes the pause menu again.",
    ],
  },
  {
    v: "1.73.1", date: "17 October 2026", title: "Towns under armies",
    items: [
      "Campaign: a town with an army standing on it can be chosen. Click the town's dot and you get the town, not the army, whoever's army it is. Click an army that's already chosen again and you get the town beneath it.",
    ],
  },
  {
    v: "1.73.0", date: "17 October 2026", title: "Fleets together",
    items: [
      "Campaign: fleets join together. Click a fleet of yours, then right-click another of your fleets: it sails to it, and the two become one fleet, with any army aboard carried over. If the other fleet is more than a year's sail off, yours follows it and joins when it arrives.",
      "England starts the campaign with its fleet already at sea: six ships (two ships of the line, two frigates and two sloops) lying off its capital.",
      "Militia wear their own grey homespun in battle, not the crown's coats; only their cuffs and waistcoats are in their side's colour. Their regiment has its own plate, too: a townsman in grey with an old musket.",
    ],
  },
  {
    v: "1.72.0", date: "17 October 2026", title: "The loyalty map",
    items: [
      "Campaign: press L for the loyalty map. Each of your towns' country is coloured by how loyal it is, from deep red (close to rising) through yellow (quiet) to green (content), with its loyalty written under the town and a key in the corner. Press L again to close it.",
      "Click a country on the loyalty map to choose its town and see every reason for and against its loyalty.",
      "Taxes town by town: a town of yours has its own Light, Fair and Heavy under its loyalty. Ease them where a town is restless, and raise them where it's content. Setting the realm's taxes sets every town's again.",
    ],
  },
  {
    v: "1.71.0", date: "17 October 2026", title: "Military access",
    items: [
      "Campaign: your armies cross another crown's land only by its leave, as in the Total War games. A march, an attack or a landing that would cross a crown you aren't at war or allied with is stopped, and you're told whose land is in the way. Choose that crown and press Ask military access: the better they think of you, the likelier they agree, and a trade pact helps. You can give the access up again from the same card.",
      "The other crowns ask yours. When one of them is at war and its road to the enemy runs through your country, its envoy asks leave to cross. Grant it and they think better of you, and their armies can reach towns they couldn't before. Refuse it and they think worse of you, must go another way, and won't ask again for some years. A leave you've granted can be revoked from their card.",
      "Allies cross each other's land freely, and so does anyone at war with you. An army standing in a crown's land when its leave ends can always march out.",
    ],
  },
  {
    v: "1.70.0", date: "17 October 2026", title: "Militia, and garrisons that wait",
    items: [
      "Militia: townsmen called out and handed a musket. A regiment of them costs less than half what musketeers do, in thalers and in upkeep, and every crown can raise them in any town. They're far less skilled: they shoot wide, load slowly, and break sooner. In battle they stand with the musketeers.",
      "Campaign: regiments you raise stay in the town that raised them, as part of its garrison, instead of joining the nearest army. To send them on, choose the town and pick an army under \"Send to\": the garrison marches out, follows that army wherever it goes, and joins it when it gets there. You can still bring an army to the town to take them in.",
      "Campaign: an army you right-click another of yours to join keeps going after it, year after year, and joins it when it arrives. You no longer need to right-click it again.",
      "Campaign: when you move an army, its own mark slides across the map to where you sent it. Fleets do the same.",
    ],
  },
  {
    v: "1.69.0", date: "17 October 2026", title: "Smoke in one",
    items: [
      "Battles: the powder smoke of every volley, and the flash and sparks at every muzzle, are drawn together, all at once, instead of each puff by itself. A great battle's smoke was some hundreds of separate things for the graphics card each frame, and a company's volley was a hitch you could feel. It looks just as it did.",
    ],
  },
  {
    v: "1.68.0", date: "17 October 2026", title: "Loyalty",
    items: [
      "Campaign: towns have loyalty, as in the Total War games. Each town's card lists every reason for and against: your rule, the taxes, its garrison, its church, its governor, your army in its streets, a great city's crowds.",
      "A town you conquer is the hardest to hold. Newly conquered (−3, fading over some six years); its people remembering their own crown (−1, or −2 while you're at war with it); and, if they pray in another church than yours, a people of another faith under your crown (−1, till a generation has grown up). A town of your own won back is glad of it instead: Liberated, +1.",
      "A town that riots two years running rises, as before; and a conquered town that rises and wins opens its gates to its own crown again. The rising's card says so before you choose.",
    ],
  },
  {
    v: "1.67.0", date: "17 October 2026", title: "The gazette",
    items: [
      "Campaign: each year begins with the gazette laid before you, your own crown's paper: The London Gazette, the Gazette de France, the Gaceta de Madrid, the Wienerisches Diarium, the Vedomosti and the rest, dated and numbered. The year's great matter is its headline under a woodcut, and the rest of the news is set out in columns: From the Wars, From the Courts, At Home, From Abroad. Lay it aside to play the year, or read it again from the year's news.",
    ],
  },
  {
    v: "1.66.0", date: "17 October 2026", title: "Two armies into one",
    items: [
      "Campaign: march one of your armies into another to join them. Pick an army up, right-click another of yours, and it marches to it and the two become one army, every regiment of both under the one you marched to. If the other is more than a year's march off, it sets out toward it: right-click again once it's there.",
    ],
  },
  {
    v: "1.65.0", date: "17 October 2026", title: "Take the gun",
    items: [
      "Battles: work your own side's guns. Go to one behind the gabions and press F, and you're the gunner at its breech. It's laid on whatever you're looking at, a ring on the ground shows where the ball will strike, and a click fires it. The crew sponge and load it again, and you with them, so a gun whose crew has fallen can still be served. F to leave it.",
      "A battle with guns says so a few moments in: your guns stand behind the gabions, yours to take.",
    ],
  },
  {
    v: "1.64.0", date: "17 October 2026", title: "Two lines at close quarters",
    items: [
      "Battles: when the steel comes out, the men fight in lines, not one great knot. Each side's men at close quarters take their places along the front a pace and a half apart, face the man across from them, and fight him. No enemy is set on by more than a couple while others stand free, and between blows a man keeps his place instead of circling round behind.",
    ],
  },
  {
    v: "1.63.0", date: "17 October 2026", title: "Armies on the march",
    items: [
      "Campaign, seen close (the 3D view): an army is its own men, not a mark. A company of soldiers in their crown's coats, drawn up in two ranks with muskets shouldered and its colours flying beside them, the count of regiments over them. On the march they step out the way they're bound; halted, they stand at ease. A war party of the woods' nations goes in open order.",
      "Campaign, on the map: an army that moves is seen marching. Yours when you send it, the enemy's at the year's end: a file of its men steps out from where it stood to where it's going. An army on a march of more than a year has its men walking along its road the whole time.",
    ],
  },
  {
    v: "1.62.0", date: "17 October 2026", title: "Every crown in its own coat",
    items: [
      "Every nation's army wears its own uniform and carries its own colours. Scotland's men are Scots: red coats faced white and the blue bonnet, under the saltire. Before, Scotland borrowed England's coats, and fighting England against Scotland put them in the Emperor's grey.",
      "Twenty-one new uniforms, as near as the records of the 1680s and 90s let us: the Empire's Circle regiments, Portugal, Aragon, Milan, Savoy, Venice, Tuscany, the Papal States, Naples, Sicily; the Cossacks and the Crimean Tatars; Hungary's hajdús, Transylvania, Moldavia and Wallachia; Algiers, Tunis, Tripoli and Moulay Ismail's Black Guard of Morocco. Each with its own flag.",
      "Each of the thirteen Native nations in its own dress: the Haudenosaunee in red stroud, the Wabanaki in blue, the Shawnee in black, and so on, every warrior named by his own people.",
    ],
  },
  {
    v: "1.61.2", date: "17 October 2026", title: "Lighter battles",
    items: [
      "Battles no longer slow down as the fighting goes on. A wounded man used to fall apart, for drawing, into the score of pieces he's made of, each with a skeleton of its own; with every man hit the battle drew more. Now his coat darkens with the blood and he stays one.",
      "Each soldier's musket and bayonet are drawn as a few pieces instead of ten, the same for every man: in a great battle that's some five hundred fewer things for the graphics card each frame.",
      "Battles no longer leave themselves behind. Every gabion, cart, bank and staff of a field, and the men themselves, stayed on the graphics card after the battle was over, and the game grew heavier with each one fought until it was restarted. Now they're let go of when the battle ends.",
    ],
  },
  {
    v: "1.61.1", date: "17 October 2026", title: "The Papal States wall Genova",
    items: [
      "Campaign: a crown with a plural name takes a plural verb in the year's news: the Papal States wall Genova, not \"walls\".",
    ],
  },
  {
    v: "1.61.0", date: "17 October 2026", title: "Beachy Head and Barfleur",
    items: [
      "Historical battles at sea: Beachy Head (1690), where Tourville beat the English and Dutch in the Channel, and Barfleur (1692), where the French line fought an allied fleet twice its size. Command the flagship for either side; the other captains fight their own ships. The Dutch ships fly their own colours beside the English.",
      "Sea battles that go quiet end: if no shot strikes home for two and a half minutes, the fleets draw apart, and the day goes to the side that took more of the other's ships, or to neither. Before, two ships could chase each other round the sea for ever.",
    ],
  },
  {
    v: "1.60.12", date: "17 October 2026", title: "Near the Sahara",
    items: [
      "Battles on the Earth are named as English has it: near the Sahara, near the Dzungar Khanate, near the Holy Roman Empire, near Spain. Before, it was \"Near The Sahara\" and \"Near Dzungar Khanate\".",
    ],
  },
  {
    v: "1.60.11", date: "17 October 2026", title: "A pace back from the baskets",
    items: [
      "Battles: you start a pace before your company's line, not three, so the battery's gabions are a few paces ahead of you and the field can be seen over them. Before, you began nose to nose with the baskets.",
    ],
  },
  {
    v: "1.60.10", date: "17 October 2026", title: "Straight in",
    items: [
      "A first game goes straight in: with every save still empty, Begin the story no longer asks which of the six to use. It takes the first, and the save list is there when there's a choice to make.",
    ],
  },
  {
    v: "1.60.9", date: "17 October 2026", title: "The battle's banner",
    items: [
      "Battles: the banner at the top is as wide as its words need. A long name such as Kingdom of France no longer breaks onto a second line, and in a campaign battle both sides read alike: Kingdom of France · 19, Castile · 34.",
      "Campaign: a battle left from the pause menu says so in the year's news, on the battle's own line: (You left the field.)",
    ],
  },
  {
    v: "1.60.8", date: "17 October 2026", title: "Armies side by side",
    items: [
      "Campaign: an enemy army standing on yours is drawn beside it, not on top of it, so both can be seen, and a click on your army picks your army. Before, the enemy's could hide yours and take the click.",
    ],
  },
  {
    v: "1.60.7", date: "17 October 2026", title: "Struck, and retaken",
    items: [
      "Campaign: a ship of yours that struck her colours in a sea battle you went on to win is retaken, and stays in your fleet. Before, she was lost as if the enemy had carried her off. The same holds for theirs when they win.",
      "Sea battles: the tally at the end says only what happened (\"2 sunk; 1 got away\"), and the right way round: beaten, the enemy's ships still hold the sea, not \"got away\".",
    ],
  },
  {
    v: "1.60.6", date: "17 October 2026", title: "Names apart",
    items: [
      "Sea battles: when ships bunch up, their names no longer sit on top of one another. The nearer ship's stays where it is and a farther one's rises above it, so each can be read.",
    ],
  },
  {
    v: "1.60.5", date: "17 October 2026", title: "Back to the muster",
    items: [
      "Campaign: a battle closed at the muster, before a shot was fired (the game quit, or the window reloaded), brings you back to the muster when you return. Before, it counted as leaving the field, and the battle was lost.",
      "Campaign: in a narrow window, the top bar's buttons wrap onto their own lines, End the year above the rest. Before, it could run off the edge of the screen.",
    ],
  },
  {
    v: "1.60.4", date: "17 October 2026", title: "A town left to its garrison",
    items: [
      "Campaign: a town held by its garrison alone, your army too far off to come, is fought with the garrison's men and the guns on its walls, not your army's. Losing it no longer costs your army its guns, its spirit or its general, who were never there.",
      "Campaign: a march on one of your towns says how much of the enemy's army comes (\"23 regiments of its 43\"), and when your army is too far off to help.",
    ],
  },
  {
    v: "1.60.3", date: "17 October 2026", title: "The straits on the map",
    items: [
      "Campaign: the straits of Mackinac and the Detroit river are drawn on the map, the water ways that join Huron to Michigan and to Erie. A lake's ships no longer seem to sail over the land between them.",
    ],
  },
  {
    v: "1.60.2", date: "17 October 2026", title: "One count for the army",
    items: [
      "Campaign: the army is counted the same way everywhere, by its regiments as on its roll and in the bar along the top. When their ranks are thin it says what they come to at full strength too: \"36 regiments (27 at full strength)\". Before, the attack cards counted only the full-strength figure, and the two numbers didn't agree.",
      "How it works: right-click attacks, attacking a town after marching up to it, and field battles against the other player.",
    ],
  },
  {
    v: "1.60.1", date: "17 October 2026", title: "Friend from foe at sea",
    items: [
      "Battles at sea: every ship carries a small label in her side's colour, \"Your frigate\" or \"French ship of the line\", so friend and foe can be told apart across the water. A ship's label turns to struck, sinking or sunk when she's out of the fight.",
      "Your flagship, sailed far out of the fight with nobody at the helm, is brought about by her sailing master and headed back toward the battle.",
    ],
  },
  {
    v: "1.60.0", date: "17 October 2026", title: "Battles in the field between players",
    items: [
      "Campaign for two: at war, fall on the other player's army in the open field, wherever it stands within a year's march. Click their army for its strength and the Attack buttons, or right-click it.",
      "They choose how to meet it: in the field themselves, the two of you in one battle on open ground near the nearest town, or left to their general. Either way both armies take their losses and gain experience, the winner's general grows with the victory, and the beaten army falls back toward home.",
      "Campaign: right-click an enemy army within reach to attack it, as you now can an enemy town.",
      "Campaign: an army that has attacked once this year says so, even after it's been thrown back from the walls.",
    ],
  },
  {
    v: "1.59.5", date: "17 October 2026", title: "Updates that don't stall",
    items: [
      "The app: an update that stalls on a slow connection gives up after a while and is tried again ten minutes later, instead of hanging until the game is closed and leaving you a version behind. The game also looks for updates every few hours while it stays open.",
      "Check for updates in the menu says so if it can't fetch the update, and why.",
    ],
  },
  {
    v: "1.59.4", date: "17 October 2026", title: "Who bought it",
    items: [
      "Buying the game from inside it, or unlocking it with a key bought on the website, tells the shop the name you go by online, if you've chosen one. Nothing else about you is sent.",
    ],
  },
  {
    v: "1.59.3", date: "17 October 2026", title: "Assaults you can start",
    items: [
      "Campaign: an army that marches up to an enemy town's walls can assault it the same year. Before, the march used up the year, and the Attack buttons didn't appear until the next.",
      "Campaign: right-click an enemy town within a year's march to fall on it. The muster before the assault opens, where you can still call it off.",
      "Campaign: when an assault can't be made, the town says why: the army is aboard ship, besieging another town, too small, out of reach, or has already attacked this year.",
      "Calling off an assault no longer gives the army a fresh march for the year if it had already marched.",
    ],
  },
  {
    v: "1.59.2", date: "17 October 2026", title: "Struck or sunk, you can tell",
    items: [
      "Battles at sea: a ship that strikes her colours hauls down her flag and pennant for a white one, lets her sails fly, and carries a white label over her: struck, and for an enemy, a prize.",
      "A ship holed below the waterline carries a red label as she goes down, sinking, and once she's gone the label stays over the wreck for a while: sunk.",
      "The fleets panel says it in words under each ship too: Struck, Sinking or Sunk.",
    ],
  },
  {
    v: "1.59.1", date: "17 October 2026", title: "Your gun crews fire on their own",
    items: [
      "Battles at sea: your flagship's gun crews fire a broadside on their own whenever it's loaded and an enemy is on that beam within range, as your other captains' ships always did. Steer to bring the enemy abeam and the guns do the rest. Q and E still fire at once, at longer range or a wider bearing.",
    ],
  },
  {
    v: "1.59.0", date: "16 October 2026", title: "Fleets on the lakes, and in sight",
    items: [
      "Campaign: the Great Lakes are sailable. A town on them has a dockyard for sloops and frigates, too small for ships of the line, and its ships keep to their lake. Huron, Michigan and Erie are joined by the straits of Mackinac and the Detroit river. Niagara's falls and the rapids keep Ontario and Superior apart, and keep all of them from the sea.",
      "Campaign: the river ports are ports again: London, Hamburg, Bremen, Antwerp, Rouen, Nantes, Bordeaux, Seville, York, Lübeck, Königsberg and Stettin. Inland cities like Florence and Turin are not.",
      "Campaign: fleets are drawn on the land seen close, the 3D view: the ship herself on the water, her pennant in her crown's colours, heading where she's bound, with how many ships are with her.",
      "Campaign for two: you see the other player's fleets, on the map and in the 3D view. At war, you can fall on them. A battle between two players' fleets is fought by the admirals, and both players are told the outcome. Prizes are taken, and the regiments aboard a lost ship are lost with her.",
      "Campaign for two: the other crowns' fleets are built up and repaired once a year, not once for each player. A fleet at war with both players goes after the one whose fleet lies nearest.",
      "Battles at sea where no ship is lost now say so, instead of reporting nought sunk on either side.",
    ],
  },
  {
    v: "1.58.0", date: "16 October 2026", title: "The navy",
    items: [
      "Campaign: build ships in your ports' dockyards: sloops, frigates and, in a city's dockyard, ships of the line. Each has its own painted plate, its guns, the regiments it can carry and its upkeep. They're launched at the year's end, into a fleet lying off the port or a new one of their own.",
      "Campaign: click a fleet, then right-click on the sea to sail it. A year's sailing crosses the Atlantic or the length of the Mediterranean, and the way is found around the land. Ships in a port of yours are repaired.",
      "Campaign: bring a fleet to the shore where an army stands to take the army aboard, if the ships have room. Sail it, then land it on any shore. Hired transports still serve, but cost money, and an enemy fleet may fall on them.",
      "Campaign: the sea powers keep fleets of their own, built up over the years. In war they come for your fleets, and you can attack theirs.",
      "Battles at sea: command your fleet from your flagship. Make or shorten sail with W and S, steer with A and D, fire larboard and starboard broadsides with Q and E. No ship sails into the wind, so turn to bring your guns to bear. Your other captains fight their own ships. Shot in the hull kills crews and sinks ships; shot in the rigging slows them. A ship whose crew is cut down strikes her colours and is taken as a prize. Lose the ships carrying an army, and the army goes down with them.",
      "Or leave a battle at sea to your admirals: the weight of each side's broadsides decides it.",
    ],
  },
  {
    v: "1.57.5", date: "16 October 2026", title: "Thin regiments merged",
    items: [
      "Campaign: at the year's end, thin regiments of the same arm in the same army, or the same garrison, are merged into fuller ones, their experience carried with their men. The army's strength is unchanged; its roll is shorter and truer.",
    ],
  },
  {
    v: "1.57.4", date: "16 October 2026", title: "The books at a glance",
    items: [
      "Campaign: hover over the treasury for the year's account: what comes in from your towns and trade, and what goes out on your regiments' upkeep.",
      "Campaign map: hovering over a town of yours also shows its public order, its garrison and the regiments it's raising.",
    ],
  },
  {
    v: "1.57.3", date: "16 October 2026", title: "Two crowns, many armies",
    items: [
      "Campaign of two: losses in a battle against the other player now fall on the army they have in hand, and no longer swell it when they command more than one.",
    ],
  },
  {
    v: "1.57.2", date: "16 October 2026", title: "Generals who learn",
    items: [
      "Campaign: a general grows in command with every third victory, up to the most a man can have. His card counts his victories.",
    ],
  },
  {
    v: "1.57.1", date: "16 October 2026", title: "Towns for sale",
    items: [
      "Campaign: offer to buy a town from a crown that thinks well of you: its town nearest your lands, never its seat, at a price set by the town's worth. The friendlier they are, the likelier they'll sell.",
    ],
  },
  {
    v: "1.57.0", date: "16 October 2026", title: "Terms of peace",
    items: [
      "Campaign: demand a town as the price of peace. If the war has gone badly for them, an enemy may give up its town nearest your lands, with its country, to have peace.",
      "Campaign: an enemy that's winning may offer peace only if you give up a town nearest its lands. Accept and lose it, or fight on.",
    ],
  },
  {
    v: "1.56.3", date: "16 October 2026", title: "Veterans to the front",
    items: [
      "Campaign: the muster before a battle shows each arm's experience, so you can see which of your regiments are veterans when you choose who takes the field.",
    ],
  },
  {
    v: "1.56.2", date: "16 October 2026", title: "Armies at a glance",
    items: [
      "Campaign map: hover over an army, yours or an enemy's, to see its strength, its general and what it's doing. An enemy army within your reach says so.",
    ],
  },
  {
    v: "1.56.1", date: "16 October 2026", title: "Towns that grow",
    items: [
      "Campaign map: each town's dot is as large as its people, so a town that grows is seen to grow, and a sacked city shrinks. Crowns' seats keep their ring.",
    ],
  },
  {
    v: "1.56.0", date: "16 October 2026", title: "Risings",
    items: [
      "Campaign: a town that riots two years running rises in revolt. Put the rising down with its garrison and any army of yours nearby, or buy peace with concessions. A rising that wins kills the garrison's regiments, costs the town people and burns a year's taxes.",
    ],
  },
  {
    v: "1.55.8", date: "16 October 2026", title: "A word on what's new",
    items: [
      "Campaign: the first time you open a campaign after this update, a note tells you where the new recruiting, garrisons, armies and field battles are.",
    ],
  },
  {
    v: "1.55.7", date: "16 October 2026", title: "Plates in the muster",
    items: [
      "Battles: raising a company for a battle shows each kind of soldier's plate beside it, dressed in the colours you've chosen: Ottoman colours give Janissaries and sipahis, Muscovite streltsy, Polish hajduks and hussars.",
    ],
  },
  {
    v: "1.55.6", date: "16 October 2026", title: "Colonial armies",
    items: [
      "Campaign: armies in North America march as far in a year as they do in Europe. The New World is drawn larger on the map, and marches there had been falling short: Boston to New York took two years, and now takes one.",
      "Campaign: regiments taken from a garrison join the army standing in the town, not your main army. A town's card can take its whole garrison into the army at once.",
      "Campaign: regiments raised in a colony, with no army of yours on that side of the ocean, hold their towns; form a colonial army from them there.",
    ],
  },
  {
    v: "1.55.5", date: "16 October 2026", title: "Tokens on the map",
    items: [
      "Map: a town raising regiments shows a gold token with how many, and a town holding a garrison a paper one with its regiments.",
      "Map: your armies standing together are fanned out a little, so each can be seen and clicked.",
    ],
  },
  {
    v: "1.55.4", date: "16 October 2026", title: "Every army counted",
    items: [
      "Campaign: the army buttons show where each of your armies stands, and hovering one tells its general and what it's doing.",
      "Campaign: the other crowns weigh all your armies together, not only the one you have in hand, when they decide on war and peace.",
    ],
  },
  {
    v: "1.55.3", date: "16 October 2026", title: "Armies on the land",
    items: [
      "The land (3D map): click one of your armies to give it orders, or an enemy army to see it and attack it, as on the map.",
    ],
  },
  {
    v: "1.55.2", date: "16 October 2026", title: "Split the army",
    items: [
      "Campaign: split an army in two from its card. Half of each arm marches off as an army of its own, beside the first; join them again whenever they stand together.",
      "Campaign: a new army formed in a town where another of yours already stands is drawn beside it, not on top of it.",
    ],
  },
  {
    v: "1.55.1", date: "16 October 2026", title: "They come for your armies too",
    items: [
      "Campaign: an enemy army stronger than one of yours, and near it in the open, may fall on it. Fight the battle yourself, or leave it to your general.",
      "Campaign: a won battle in the field costs the beaten army a little less in the rout.",
    ],
  },
  {
    v: "1.55.0", date: "16 October 2026", title: "Battles in the field",
    items: [
      "Campaign: click an enemy army on the map to see its strength and where it's marching. If your army can reach it this year, attack it in the open field, leading the battle yourself or leaving it to your generals.",
      "Campaign: an army beaten in the field loses men, falls back toward home and gives up its march. Stop it before it reaches your walls.",
    ],
  },
  {
    v: "1.54.1", date: "16 October 2026", title: "Your towns",
    items: [
      "Campaign: the Recruitment card is now Your towns, a ledger of every town you hold: its people and how fast they grow, its worth, its public order and its garrison, with the regiments it can raise this year.",
    ],
  },
  {
    v: "1.54.0", date: "16 October 2026", title: "Armies",
    items: [
      "Campaign: command more than one army. Form a new army at any of your towns from its garrison. Each army marches, lays siege and fights on its own, with its own general and its own morale.",
      "Campaign: click an army on the map to give it orders, or pick it from the buttons on the army card. Two of your armies in one place can join into one.",
      "Campaign: new regiments join the nearest of your armies within a year's march; every army near a town comes to its help when it's attacked.",
      "Campaign: choose a general for a new army from its card. An army without one fights the worse for it.",
    ],
  },
  {
    v: "1.53.4", date: "16 October 2026", title: "Plates in the orders",
    items: [
      "Battle: the orders panel shows each arm's plate beside its letter, dressed as your side's way of war.",
      "Western bowmen, crossbowmen and axemen have plates of their own, instead of borrowing the Ottoman archer's.",
    ],
  },
  {
    v: "1.53.3", date: "16 October 2026", title: "Public order",
    items: [
      "Campaign: every town of yours has a public order, shown on its card. Heavy taxes and a great city's crowds sour it; light taxes, regiments in its garrison, a school and an honest governor keep it. A restless town may riot at the year's end: it pays none of its taxes that year, and loses some of its people. The Taxes card warns how many towns may riot.",
    ],
  },
  {
    v: "1.53.2", date: "16 October 2026", title: "The regiment's card",
    items: [
      "Campaign: click a regiment's picture in your army's roll for its card: the plate large, how it fights (fire, melee, pace, and how it stands against horse), what it costs to raise and keep, and how yours of it stand.",
    ],
  },
  {
    v: "1.53.1", date: "16 October 2026", title: "Men to fill the ranks",
    items: [
      "Campaign: a town that fights off an attack on its own no longer costs your field army men when the army is far away. The army loses only the part of it that came to the town's help.",
      "Campaign: the other crowns' armies are as large as their people can keep. Take a crown's great cities and it has fewer men to fill its ranks.",
    ],
  },
  {
    v: "1.53.0", date: "16 October 2026", title: "Garrisons",
    items: [
      "Campaign: regiments can hold your towns. With your army at one of your towns, leave regiments there from the town's card, or take its garrison back into the army. A town's own regiments add to its garrison, fight beside the army when it's attacked, and are lost with it if it falls.",
      "Campaign: new regiments raised far from your army no longer walk across the map to it. They hold the town they were raised in as its garrison until the army comes for them.",
      "Campaign: the taxes you set now change how fast your towns grow, as they were meant to.",
    ],
  },
  {
    v: "1.52.3", date: "16 October 2026", title: "Chevrons",
    items: [
      "Campaign: regiments gain experience in battle, more for a victory, up to three chevrons: blooded, seasoned, veterans. A veteran army fights up to a tenth steadier. New men filling a thin regiment's ranks dilute its experience.",
      "Campaign: a town with a barracks sends its recruits out blooded, one with a military academy seasoned.",
    ],
  },
  {
    v: "1.52.2", date: "16 October 2026", title: "Taxes, and what the enemy fields",
    items: [
      "Campaign: set your crown's taxes: light (three quarters of the towns' worth, and faster growth), fair, or heavy (a quarter more, and slower growth).",
      "Campaign: a crown's card shows what its army is made of, with a picture of each arm. The nations of the woods have their own plates: the bow, the war club and the trade musket.",
    ],
  },
  {
    v: "1.52.1", date: "16 October 2026", title: "The muster rolls",
    items: [
      "Campaign: a Recruitment card lists every town of yours with what it can still raise this year. Click a regiment's picture to raise it there, or the town's name to go to it on the map.",
      "Campaign: hover over a town on the map to see its size, its holder and its people.",
      "Campaign: disband a regiment from the army card. The thinnest of its kind goes, its men go home to a town, and its upkeep is saved.",
      "Campaign: after a battle, the news names the regiments broken in it.",
      "Campaign: towns' people grow a little faster.",
    ],
  },
  {
    v: "1.52.0", date: "16 October 2026", title: "Raised in the towns",
    items: [
      "Campaign: every town has its people now, shown on its card. They grow as the land feeds them: improve the farms and a town can hold more. A town's people make its wealth.",
      "Campaign: regiments are raised in your towns, a kind at a time, as in the great campaigns of the age. Choose a town and recruit musketeers, pikemen, grenadiers (where there's a drill yard), horse (in a city, or where the farms breed horses) and the rest of your crown's arms. Each costs thalers and the town's men, and joins the army at the year's end. A town raises one regiment a year, a city two, a great city three, a barracks one more.",
      "Campaign: your army is a roll of regiments. The army card lists them by arm, with how full each one's ranks are. Battles wear down the arms that fought in them, and thin regiments fill their ranks from your towns each year, fastest on your own land. Each arm has its own upkeep: horse is dear.",
      "Campaign: the muster before a battle offers only the arms your army has, in proportion to its regiments.",
      "Campaign: a picture of every kind of regiment, a uniform plate of the time for each crown's way of war: line musketeers and grenadiers in the West, Janissaries and sipahis for the Ottomans, hajduks, Cossacks and winged hussars in the East, streltsy for the Tsar.",
      "Map: land you take spreads out across the province from your own border, instead of changing colour all at once.",
      "Map: every town is a dot, with no pictures: a town a small dot, a city a larger one, a crown's seat ringed. The ships are gone from the ocean.",
    ],
  },
  {
    v: "1.51.28", date: "16 October 2026", title: "A rose off Biscay",
    items: [
      "Map: the smaller compass rose sits out in the open Atlantic off the Bay of Biscay, clear of the coast and the towns' names.",
    ],
  },
  {
    v: "1.51.27", date: "16 October 2026", title: "Proposals, in their words",
    items: [
      "Campaign: a nation of the woods proposes the fur trade, not a trade pact, in proper grammar: \"The Cherokee propose the fur trade\".",
    ],
  },
  {
    v: "1.51.26", date: "16 October 2026", title: "No colours where none were carried",
    items: [
      "Battle: the woods' nations no longer raise a European regimental colour on a staff behind their line. They carried none.",
    ],
  },
  {
    v: "1.51.25", date: "16 October 2026", title: "War parties on the land",
    items: [
      "The land (3D map): a war party of the woods' nations is drawn as its men in open order, as on the map. Armies' marks now float above the town names instead of covering them.",
    ],
  },
  {
    v: "1.51.24", date: "16 October 2026", title: "War parties, in numbers",
    items: [
      "Campaign: the woods' nations field war parties of a few hundred men, fewer than a crown's regiments, both at the start and as they grow back. The Haudenosaunee no longer outnumber the whole of England's army.",
    ],
  },
  {
    v: "1.51.23", date: "16 October 2026", title: "War parties, in words",
    items: [
      "Campaign: the news speaks of a nation of the woods as it should: \"the Cree's war party marches toward York Factory\", \"the Wabanaki march on Boston!\", \"the Cherokee offer peace\".",
    ],
  },
  {
    v: "1.51.22", date: "16 October 2026", title: "Hearth smoke",
    items: [
      "Battle: a town of the woods' nations is lived in. Thin smoke rises from the smoke holes along its longhouses' roofs.",
    ],
  },
  {
    v: "1.51.21", date: "16 October 2026", title: "Fire spreads",
    items: [
      "Battle: a palisade length that's well alight sometimes catches the lengths either side of it, so a fire set in one place can open a wide gap.",
    ],
  },
  {
    v: "1.51.20", date: "16 October 2026", title: "Know what you march into",
    items: [
      "Campaign: marching on a town of the woods' nations, the muster tells you they'll hold it behind its palisade, and how to get in: by the way in, or through a length you've burnt. The town card says it stands behind a palisade.",
    ],
  },
  {
    v: "1.51.19", date: "16 October 2026", title: "War parties",
    items: [
      "Campaign map: an army of the woods' nations is drawn as a war party, its men scattered in open order, not as battalions in two lines.",
    ],
  },
  {
    v: "1.51.18", date: "16 October 2026", title: "What's new, at a glance",
    items: [
      "What's new: small patch releases are plain cards, so the list is quicker to read. The pictures are kept for the real updates.",
      "Title: the Battles button now says the campaign is there too.",
    ],
  },
  {
    v: "1.51.17", date: "16 October 2026", title: "The fur trade",
    items: [
      "Campaign: with a nation of the woods, a trade pact is the fur trade: beaver pelts down to your posts, and kettles, cloth and trade muskets up to their towns.",
    ],
  },
  {
    v: "1.51.16", date: "16 October 2026", title: "Flags over the land",
    items: [
      "The land (3D map): your towns fly your colours on a staff, gold-edged, as on the map, instead of being ringed.",
      "Campaign: forty towns makes yours the first crown of the world, not merely of Europe.",
    ],
  },
  {
    v: "1.51.15", date: "16 October 2026", title: "Past the Mississippi",
    items: [
      "Campaign: three more nations hold the country past the Mississippi, where the map was empty before: the Pawnee on the Platte and the Loup, the Osage on their river, and the Caddo on the Red and in the piney woods. Each has its towns, Kitkehahki, the Osage Village, Kadohadacho and Hasinai, and leaders of its own.",
    ],
  },
  {
    v: "1.51.14", date: "16 October 2026", title: "No compass circles",
    items: [
      "Map: the Hudson's Bay posts and the French forts hold ground with wandering edges, not perfect circles. The Cree's country lies naturally about James Bay and the lowlands of Hudson Bay, not in a ruled box.",
    ],
  },
  {
    v: "1.51.13", date: "16 October 2026", title: "How the campaign works",
    items: [
      "Campaign: a folding \"How it works\" card in the side panel covers the year's march, ships over the Atlantic, sieges and supply, taking provinces, the woods' nations and their palisades, generals and governors, and leagues.",
    ],
  },
  {
    v: "1.51.12", date: "16 October 2026", title: "Open order",
    items: [
      "Battle: the woods' warriors come on in open order, each man to his own ground, as they fought, not shoulder to shoulder in ranks like a European line.",
    ],
  },
  {
    v: "1.51.11", date: "16 October 2026", title: "They hold the palisade",
    items: [
      "Battle: the warriors of a palisaded town now hold it. They stay inside at the stakes and loose and fire through the gaps as you come on, and only go at you with the club once you're inside, by the way in or through a length you've burnt. Before, they marched out into the open and were shot down without a fight.",
    ],
  },
  {
    v: "1.51.10", date: "16 October 2026", title: "The Great Lakes, true to shape",
    items: [
      "Map: the Great Lakes are drawn far more truly. Superior has the Keweenaw, Michigan has Green Bay and the Door, and Huron has Saginaw Bay, Georgian Bay and the Bruce. Before, they were rough wedges.",
      "Battle: attacking a town of the woods' nations, you're told that its palisade can be set alight.",
    ],
  },
  {
    v: "1.51.9", date: "16 October 2026", title: "The ocean, as the chart-makers drew it",
    items: [
      "Map: the Atlantic is drawn as the Dutch sheets drew their seas. A great compass rose with its lily at the north, thirty-two rhumb lines out across the water, a smaller rose off Portugal, ships under sail on the crossing, and a sea serpent in the deep.",
    ],
  },
  {
    v: "1.51.8", date: "16 October 2026", title: "Two players meet in the town",
    items: [
      "Campaign of two: when one player's army marches on the other's town and you meet on the field, the battle is fought at the town itself, as battles against the computer are: its streets and houses at the defender's end, its walls if it has them, or a village's palisade.",
    ],
  },
  {
    v: "1.51.7", date: "16 October 2026", title: "Towns in their clearings",
    items: [
      "The land (3D map): the woods no longer grow through the towns. Every town stands in its own clearing, larger for a great city.",
      "The land: a town of the woods' nations is drawn as it was, with longhouses inside a ring of palisade and no church.",
    ],
  },
  {
    v: "1.51.6", date: "16 October 2026", title: "Colonial wars",
    items: [
      "Campaign: a crown's field army can only come to a town's help if it's on the same side of the Atlantic. Québec is held by its garrison and New France's own few companies while France's army is in Europe, so the colonies can be fought for. The town card says how many could come.",
      "The crown picker now reads Europe and the New World in 1683.",
    ],
  },
  {
    v: "1.51.5", date: "16 October 2026", title: "The nations of the north",
    items: [
      "The Anishinaabe, Cree and Dakota now look like themselves in the field: long hair parted and braided, a feather at the back, black paint across the eyes, and buckskin leggings. The roach and red paint are for the Eastern nations.",
      "Multiplayer: the Warrior of the lakes is a new outfit in the character builder.",
    ],
  },
  {
    v: "1.51.4", date: "16 October 2026", title: "The war club",
    items: [
      "Battle: the warriors of the woods' nations no longer carry European battle axes. They fight with the ball-headed war club: a curved maple haft with a carved ball and a spike set in it, lighter and quicker than an axe. You can carry one too.",
      "Battle: they're called warriors in the field, whatever they carry.",
    ],
  },
  {
    v: "1.51.3", date: "16 October 2026", title: "Wars that make sense",
    items: [
      "Campaign: a crown fighting several wars has its armies divided among them. The Sultan can't bring his whole army to Vienna, Kraków and Venice at once. Allies fighting the same enemy now count in each other's battles, so the Holy League fights as a league. The Ottomans no longer roll across Europe unopposed, and wars swing both ways.",
      "Campaign: a crown's own seat holds out longest. It falls only on a second good day, unless it's nearly all the crown has left.",
      "Campaign: allies only join wars they can reach. Denmark won't sail off to fight the Haudenosaunee.",
      "Campaign map: an army standing in a town is drawn just below it, so the town isn't hidden.",
      "Words: \"the Papal States' side\", not \"the Papal States's\".",
    ],
  },
  {
    v: "1.51.2", date: "16 October 2026", title: "Worlds: sites that stay put, sheds that fill, buildings that line up",
    items: [
      "Worlds: building sites no longer vanish. Swinging your axe near one of your own sites, say at a tree beside it, used to take the site down and leave its logs on the ground. Now a site only comes down on purpose: look at it and press X twice.",
      "Worlds: a woodshed is a woodshed. Its logs are the ones in your store, stacked in two piles along it that grow and shrink as the store does, not a painted stack that was always full.",
      "Worlds: building snaps. A length of palisade or a gate joins onto the end of the one beside it. A building near another turns square to it and lines up in a row beside it or in front of it, with a step between them, never overlapping. Hold Alt to place freely.",
      "The Woodlands warrior's sash colour can be chosen in the character builder.",
    ],
  },
  {
    v: "1.51.1", date: "16 October 2026", title: "A town is a dot",
    items: [
      "Map: a town is a plain dot again, gold-ringed if it's yours. Only the cities and the crowns' seats are drawn as little pictures.",
    ],
  },
  {
    v: "1.51.0", date: "16 October 2026", title: "Towns drawn as towns, and a larger New World",
    items: [
      "Map: towns are no longer dots and rings. Each is drawn as the engravers drew towns: a crown's seat walled, with corner towers and its great church's spire; a great town a cluster of roofs about its church; a small town two houses and a steeple; a Native town a palisade with a longhouse behind it. Walls appear once a town has them built. Its holder's flag flies over it, gold-edged for your own, and crossed swords still mark the towns in your reach and the ones under threat.",
      "Campaign map: North America is drawn larger, about half again across and up, so the colonies, the Native nations and their towns have room. It's still true to shape at every latitude. Europe and the story's map are unchanged, and your campaigns carry over.",
    ],
  },
  {
    v: "1.50.2", date: "16 October 2026", title: "North America, true to shape",
    items: [
      "Campaign map: North America is now drawn with each latitude at its true width, about a middle meridian at 80°W, as continents were drawn on the sheets of the time. Florida, the colonies, the Great Lakes and Hudson Bay all keep their real proportions, where before the south came out narrow and tall and the north too broad. The projection blends into Europe's across the open Atlantic, so Europe and the story's map are unchanged. Your campaigns carry over.",
    ],
  },
  {
    v: "1.50.1", date: "16 October 2026", title: "North America in proportion",
    items: [
      "Campaign map: North America no longer looks squeezed and tall. The sheet was scaled for Europe's latitude, and the colonies lie well south of it. West of 50°W, out in the open Atlantic, the map is now drawn to their own latitude, so Florida, the coast and the Great Lakes have their proper shape. Europe and the story's map are exactly as they were, and your campaigns carry over.",
    ],
  },
  {
    v: "1.50.0", date: "16 October 2026", title: "The nations of the woods",
    items: [
      "Campaign: the Native nations of North America are now nations you can deal with, ally with and go to war with: the Haudenosaunee, Wabanaki, Cherokee, Muscogee, Choctaw, Shawnee, Illinois, Anishinaabe, Dakota and Cree. 1683's alliances are there: the Covenant Chain binds the Haudenosaunee to England, and New France stands with the Anishinaabe, Wabanaki and Illinois. The Beaver Wars are being fought.",
      "They fight as they did: with the bow, the war club and a few trade muskets, and no artillery or horse. They raise no stone walls and can't besiege a walled town.",
      "Their towns stand behind wooden palisades. Attack one and you fight at the village: longhouses of elm bark, wigwams, cornfields outside, and the palisade round it all with a way in at the front.",
      "Palisades burn. Hold the use key at a length of it to set it alight, and in about twenty seconds it burns through to charred stumps, leaving a gap. Your soldiers will fire any length they reach, and guns can batter it too.",
      "A new soldier: the Woodlands warrior, head shaved but for the scalp lock, with a red roach and an eagle feather, paint across the eyes, breechcloth and leggings of trade stroud, a finger-woven sash, and shot pouch and powder horn. He's also an outfit you can wear in multiplayer.",
      "Their war leaders and sachems have their own names from the records of the time, and their own portraits, painted after Verelst's portraits of the Haudenosaunee leaders of 1710.",
      "The borders between the nations now wander instead of running in ruled lines. A town's card says when your army would have to sail to reach it, and what that costs.",
    ],
  },
  {
    v: "1.49.0", date: "16 October 2026", title: "The New World",
    items: [
      "Campaign: the map now runs west over the Atlantic to the Mississippi and south to Havana. North America is shown as it stood in 1683: England's colonies from New England to Carolina, plus Newfoundland and the Hudson's Bay posts; New France on the St Lawrence and Acadia, with Fort Frontenac and Michilimackinac; Spanish Florida, Cuba and New Spain. 24 new towns, from Boston and Québec to La Habana.",
      "The Native nations hold their own country on the map, in their own names: the Haudenosaunee, Wabanaki, Cherokee, Muscogee, Choctaw, Shawnee, Illinois, Anishinaabe, Dakota and Cree. Their towns are marked too. Their land isn't any crown's to take: armies can cross it, but not seize it. Click it to see whose it is.",
      "Crossing the Atlantic: send your army over the sea and it takes ship. The crossing costs 120 thalers for shipping, takes the year, and lands the army where you sent it. Crowns at war with you can ship armies over too, and you'll hear of it.",
      "The Great Lakes, the St Lawrence, the Hudson, the Mississippi, the Ohio and the Missouri are on the map, along with the Appalachians and the other eastern ranges, in 2D and in the 3D land.",
      "Your old campaigns carry over: their conquests and armies move onto the bigger map. The story's map of Europe is unchanged.",
      "The 3D land no longer flickers along the coasts when seen from high up, and it doesn't rebuild the ground after every conquest.",
    ],
  },
  {
    v: "1.48.1", date: "16 October 2026", title: "Provinces, and armies drawn as the engravers drew them",
    items: [
      "Campaign: taking a town takes its whole province, not a circle round it. That's all the loser's land nearer to that town than to any other of theirs, with wandering borders like old provinces had. Scraps of the loser's land that end up cut off from all their towns go with it.",
      "Campaign map: armies are no longer flags on staffs. Each is a small formation flat on the map: two lines of battalions in the crown's colour, horse on the wings, and the regiment count in italic beneath. It turns to face the way it's marching. Smaller, and it covers far less of the map, in 2D and 3D.",
    ],
  },
  {
    v: "1.48.0", date: "16 October 2026", title: "Armies on the map",
    items: [
      "Campaign: your army is on the map. Click it, then right-click anywhere (on the map or the 3D land) to march there: about 350 km a year, and a long march takes several years. You can only attack, besiege or supply a town within a year's march of your army. Town cards say how far off it is, with a button to march toward it.",
      "Campaign: enemy armies are on the map too, with their regiment counts. When one marches on a town of yours you see it coming a year ahead, a dashed red line to its target. Your army only helps defend a town if it's close by.",
      "Campaign: a simpler side panel. Your army and the crown of a selected town fold down to one summary line (click to open, and it stays as you leave it); the news shows the latest four items, with the rest under Earlier; the help is one line; the action buttons are shorter; the top bar fits on one line.",
      "Battles: the orders page folds down to its heading and the order in force a few seconds after your last order, and opens again at any order key. The first-battle hint is one short line.",
    ],
  },
  {
    v: "1.47.0", date: "16 October 2026", title: "Leagues and convoys",
    items: [
      "Campaign: Europe starts as it stood in 1683. The Holy League (the Emperor, Poland, Venice and the Pope), the Laxenburg Alliance against France, the Dutch–Swedish Association, France's allies Denmark and Brandenburg, the Sultan and his vassals, and the Spanish crowns are all allied from the start. Wars already under way are on too: the Turk against Vienna and Poland, Thököly's rising, and France against Spain.",
      "Campaign: a crown attacked by a neighbour may be joined by its allies, and crowns don't go to war with their own allies.",
      "Campaign: send supplies to a siege. A supply train costs 150 thalers, one a year. The enemy's horse will try to take it on the road: fight that battle yourself among the wagons and their teams, or leave it to the escort. If it gets through you gain fresh regiments, morale and a healthy camp for the year; if it's taken, the escort suffers.",
    ],
  },
  {
    v: "1.46.0", date: "16 October 2026", title: "Escalade",
    items: [
      "Storming a walled town: the attackers now make for a way in instead of stopping at the walls. They raise scaling ladders against the wall and climb onto the walk one man at a time, hack at the gate with axes, and pour through any breach. Musketeers keep firing at the walls while they can see a target, unless ordered to charge.",
      "Defenders at the top of a ladder push it over, throwing down the men on it. You can climb the ladders yourself (hold F at the foot).",
      "Town gates are much stronger: a few men no longer break one down in seconds.",
      "The ground inside walled towns is now level, so houses and streets no longer sit on hillsides. The side walls are built in lengths that follow the ground, with a coping along the top.",
      "Highlight reels removed: no reel after a battle and none behind the menus. You can still watch any battle again in full from Replays.",
    ],
  },
  {
    v: "1.45.1", date: "16 October 2026", title: "The shop opens",
    items: [
      "Forester: Reckoning is on sale: CA$14.99, from the title screen or the game's page. Pay through Stripe's checkout and the game unlocks by itself. Your key works on up to three computers.",
      "The free demo is Part One of the story: the first six chapters, up to \"Ashes\". Battles, duels, the campaign and the Worlds & colonies are in the full game. Buy it and your save carries straight on.",
      "Everyone who played before the shop opened keeps the full game, free, as an alpha supporter. Thank you.",
    ],
  },
  {
    v: "1.45.0", date: "16 October 2026", title: "Horse and siege",
    items: [
      "New horses: shaped, not boxes. A deep body with rounded quarters, a crested neck, a long head with ears, eyes and nostrils, and legs with knees, fetlocks and hooves. Each horse has its own markings (white socks, a blaze or a star) and a trooper's saddle: a bordered saddle cloth, pistol holsters, bridle, bit and stirrups.",
      "Horses gallop slower and more like horses: a longer stride, the neck stretched out and the body rocking with each bound. The tail hangs when the horse stands and streams out at speed.",
      "Hoofbeats: each hoof is heard as it comes down, for your horse and every rider near you. You also hear the tack jingle and the odd snort.",
      "Cavalry fight from the saddle: a trooper charges with his sabre held out at the point, then cuts and thrusts from his horse, and the horse surges into each blow. A pike or bayonet in its chest makes the horse rear.",
      "Campaign: sieges. Lay siege to a walled town instead of assaulting it. Each year the garrison starves and your guns batter the walls. Your camp loses men to sickness, and the enemy may send an army to lift the siege. The town may surrender, or you can storm it whenever you like, and the battle starts with its walls as your guns left them. Star forts take twice as long to batter.",
      "Campaign: your army has a morale level, set by your general's morale and your barracks. Victories raise it; defeats, a fallen general and missed pay lower it. It counts in every battle, whether you fight it yourself or leave it to your generals.",
      "Campaign: generals serve fifty years instead of ten.",
      "Campaign: appointing a governor costs money. The bigger the town and the better the man, the higher the price.",
      "Campaign: the other crowns start with larger armies, rebuild them faster and defend their towns more stoutly.",
      "Battles: no company breaks in the first minute, and one volley no longer makes a whole company run at once.",
      "Felled trees no longer leave stumps.",
    ],
  },
  {
    v: "1.44.3", date: "16 October 2026", title: "Their true faces",
    items: [
      "Campaign: the historical generals and governors now have their real portraits, paintings and engravings of their own time: Luxembourg, Vauban, La Reynie, Lorraine, Starhemberg, Türkenlouis, Jabłonowski, Kara Mustafa, Gordon, Golitsyn, Ascheberg, Dahlbergh, Derfflinger, William of Orange, Morosini, Max Emanuel, Thököly and others. All are public domain, from Wikimedia Commons.",
    ],
  },
  {
    v: "1.44.2", date: "15 October 2026", title: "Whole crowns",
    items: [
      "Campaign: when a crown loses its last town, all of its land now goes to whoever took that town. Before, it could keep land with no towns left, for example when a harbour town fell along with the country around a neighbouring town. Saves where this already happened are fixed when you load them: the leftover land goes to you if you were at war with that crown.",
      "Campaign: the map now redraws reliably when land changes hands.",
    ],
  },
  {
    v: "1.44.1", date: "15 October 2026", title: "Engraved marks",
    items: [
      "Campaign: the buildings in a town are marked with small engraved drawings (a sheaf, scales, a hammer, crossed swords, a gun, a church, a tower) instead of emoji.",
    ],
  },
  {
    v: "1.44.0", date: "15 October 2026", title: "Generals, governors and learning",
    items: [
      "Campaign: a turn is now a year. The top of the map shows the year, and End the year moves it on.",
      "Campaign: build up your towns a level at a time, in chains: the land (peasant farms to great estates), trade (a market hall to an exchange), industry (workshops to ironworks), barracks, a gun foundry, learning (a school to a university) and defences (stone walls to a star fort). Each town takes one piece of work a year, finished at the year's end. You can stop it and get your money back. Bigger towns can build higher.",
      "Campaign: learning. Open Learning at the top of the map: four branches of a tree (agriculture, commerce and industry, war, philosophy) with sixteen things to study, from crop rotation and banking to the socket bayonet, gun founding, the trace italienne and the Enlightenment. They unlock the higher buildings and bring bonuses. Schools, colleges and universities speed it up.",
      "Campaign: generals and governors. You start with the real men of 1683: Luxembourg leading France's army, Vauban governing Strassburg, Lorraine and Starhemberg for the Emperor, Kara Mustafa for the Sultan, Gordon for the Tsar, and others. Generals have command, morale and corruption. Governors have corruption, production and defence. They serve ten years, or until a battle ends it, and then you choose the next man from three put forward, each with his own painted portrait.",
      "Campaign: a governor can rule his town for you: tick the box and he puts its works in hand himself each year.",
      "Campaign: your general's command counts in battles left to the generals, and his morale (with your barracks and the bayonet) in battles you fight yourself. Enemy crowns have generals of their own, shown on their card.",
      "Campaign: guns are an artillery train now. You start with a few and cast more at a foundry, and they're what you can bring to a battle. Lose a battle and you may lose a gun.",
      "Campaign: an enemy only lays siege to a walled town if it has guns. Its card says whether it does.",
      "Campaign: regiments raised now join your army next year.",
      "Campaign: you can call off a march you've ordered, from the muster, before the battle's fought. The army stays free to march again that year.",
      "Campaign: star forts take twice the battering of plain stone walls.",
      "The campaign map is no longer squashed on wide screens.",
      "No friendly fire anywhere: musket balls, arrows, cannonballs and grenades pass your own side's men by. Yours and theirs.",
    ],
  },
  {
    v: "1.43.0", date: "15 October 2026", title: "Storm the town",
    items: [
      "Campaign battles are fought at the town itself. You start outside and push your way in: past the wall if it has one, into its streets, with the square behind the gate and the main street leading in, houses either side, and the church at the end.",
      "A walled town's wall is an earth rampart faced with dressed stone, with towers along it and crenellations along the top. The defenders stand up on the walk behind the parapet and fire down on you, with a gun or two in the embrasures. The gate is shut.",
      "Guns batter walls down slowly. Each hit knocks stones and merlons off, a length that's taken enough hits comes down into a slope of rubble you can climb, and towers take longer. Men at the gate hack and heave at it until it gives, and grenades help.",
      "Guns can be wrecked: a direct hit from a cannonball smashes the carriage and puts the gun out of the fight, and its crew take up their swords.",
      "When a gun's crew are shot down, the nearest of your men step in and serve it, and the enemy's do the same. You can still lay and fire any of your guns yourself (F beside it), or give them orders (0).",
      "Campaign, in peace or war: develop the land of your towns (three times each, more money every time) and build walls round them. Walls take the season to go up. Click one of your towns to see what it has.",
      "Towns only have walls where they've been built, by you or by the crown that holds them. The other crowns wall their own towns over time. The one exception is a crown's last town: its people hold it behind walls to the end. Walled towns are drawn on the map with a fortress outline.",
    ],
  },
  {
    v: "1.42.2", date: "15 October 2026", title: "Real mountains",
    items: [
      "The map of Europe shows its real mountains: the Alps, Pyrenees, Carpathians, Apennines, the Balkan ranges, the Scandinavian mountains, the Atlas, the Caucasus and the rest, shaded as the light falls on them, with snow on the highest peaks. They're the same ranges the land rises into in 3D. Zoom in and the shading is drawn finer for the closer view.",
      "Gone from the map: the sea monster, the ship, the compass rose and its lines across the sea, and the little cartoon hills.",
      "Campaign: coming out of the 3D land, it fades away over the map instead of vanishing at once, and fades in the same way going in.",
      "Campaign with a friend: before you meet on the field, you each choose how many men and which arms you bring, the same way as against the computer. The battle starts once you've both chosen.",
    ],
  },
  {
    v: "1.42.1", date: "15 October 2026", title: "Choose who marches",
    items: [
      "Campaign: when you fight a battle yourself, you choose who takes the field first. Pick how many men (a bigger army can field more) and of which arms: musketeers, grenadiers, pikemen, swordsmen, axemen, bowmen, crossbowmen and cavalry, and how many guns. One click sets it as your army stands, all you can field, or clears it. You can still leave it to your generals from there.",
      "Campaign: the map stays sharp when you zoom in. Once you stop moving, the part in view is drawn again at that zoom instead of a picture stretched up.",
      "Campaign: the 3D land is finer further out too, not only very close in.",
    ],
  },
  {
    v: "1.42.0", date: "15 October 2026", title: "A campaign for two",
    items: [
      "Campaign with a friend: in the camp, challenge a player to a campaign. You each choose a crown, play your seasons side by side, and the season turns when you're both ready. Make war on each other, or alliances, peace and trade pacts, or send gold. The host keeps the campaign to take up again together later.",
      "March on your friend's town and they choose: meet you on the field in a real battle between the two of you, at that town, or leave it to the garrison. Whoever wins the battle takes the town or holds it, and both of you see it on the map.",
      "Campaign: the map has depth. Zoom in far enough and the land rises: hills, woods, rivers and the towns themselves, with your towns ringed and the ones you can march on marked with crossed swords. Zoom out to go back to the map.",
      "Campaign: move over the map with WASD or the arrow keys, zoom with Q and E, and hold Shift to go faster.",
      "Campaign: keep up to three campaigns at once. New campaign, at the top of the map, shows your campaigns to go back to and every crown to begin another with. Starting one no longer throws away the one you have.",
      "A campaign's battle tells the campaign who won as soon as it's decided, not only once you've left the field.",
    ],
  },
  {
    v: "1.41.1", date: "15 October 2026", title: "Your saves, kept safe",
    items: [
      "Lost a game? On the Saves screen, \"Lost a game? Bring back an earlier copy of your saves\" lists the copies of all your saves the app put by before each new version. Choose one and the game restarts with your games, your name online and your records as they were. Your saves as they are now are put by first, so trying one loses nothing.",
      "The app now keeps a copy of everything the game saves (your games, who you are online, your records) in a file of its own, renewed every minute. If the game ever starts with its storage wiped, it brings it all back from that copy by itself: no lost games, and no new stranger in place of you online.",
      "A copy of the saves is now put by at every game update, not only when the app itself is reinstalled. The newest ten are kept, and the fullest of them too, however old. Before, the copies were weeded by their names, which could throw away the newest first.",
      "Online hosting on your own network works again after an update. The updated app had been starting without its link to the page.",
      "The muster is shorter: each kind of soldier's description is a few words, and the colours and sizes of battle take less room. Nothing runs off the side any more.",
    ],
  },
  {
    v: "1.41.0", date: "15 October 2026", title: "Command each arm",
    items: [
      "Command one arm of your company at a time: in a battle, a letter picks it out (L musketeers, O grenadiers, P pikemen, I bowmen and crossbowmen, U swordsmen and axemen, K cavalry), and the number keys then give orders to them alone. Hold the pikes on a hill, send the horse round the flank and keep the musketeers with you. The same letter again gives your orders to the whole company. The page of orders shows which arm you're commanding.",
      "An arm with orders of its own forms its own ranks, behind the rest when they're sent to the same ground.",
      "Troopers no longer get off to hide behind walls, and pikemen keep their block instead of scattering for cover.",
      "Online battles: the host chooses the size of battle (up to A great war), and the other player's muster follows as it changes.",
      "A new reload for the musket: you stand it up before you and hold it by the barrel in the left hand while the right does the work. Your arms bend at the elbow as they work. You see the priming flask tipped to the pan, a powder charge from the bandolier poured down the muzzle, the ball let fall in after it, and the rod drawn, turned and driven home.",
      "Campaign: the map fills the whole screen, with the season's bar and the side panel laid over it (Panel, or Tab, hides the panel).",
      "Campaign: sounds for the campaign table: the map's parchment, the quill and the wax seal on treaties, the drum when armies march or war is declared, guns far off when battles are fought, and church bells when a town is taken or holds.",
      "Campaign: take a crown's last town and all its land is yours, every corner of it. Its name goes from the map.",
      "Campaign: hit back after you're attacked. At war, the enemy's nearest town is always within your army's reach, even if all their towns are far off. When you throw an attack back, their nearest town is picked out on the map for you.",
    ],
  },
  {
    v: "1.40.2", date: "15 October 2026", title: "Rally!",
    items: [
      "Rally your men: when they break and run, get among them and give 1 (On me!), and the ones near you who have it in them come back to the ranks. It works once every few seconds, so a company that's being cut to pieces will break again.",
    ],
  },
  {
    v: "1.40.1", date: "15 October 2026", title: "A fair start",
    items: [
      "Campaign: a new crown gets two years' grace before any neighbour declares war on it.",
      "Campaign: a crown down to its last few towns calls out the levy, so every man in them takes up arms and the garrisons hold far better. A small state like Savoy can now survive its great neighbours instead of being swallowed in its first few years.",
    ],
  },
  {
    v: "1.40.0", date: "15 October 2026", title: "Ride into battle",
    items: [
      "Ride into battle yourself: choose \"On horseback\" under Mount in your arms. You go quicker than any man on foot, your sabre reaches further and hits harder at the gallop, and you're thrown when you fall. It costs 150 thalers from your purse, as any trooper does, and nothing in historical and campaign battles. The other player sees you mounted in an online battle.",
      "Squares: infantry formed in square (Formation → Square) take half the harm from horsemen, and a seasoned enemy officer forms square when your horse comes at his men, then goes back into line once it's past.",
      "Cavalry ride for what horse is good against, the gun crews, men running away and men out on their own, and keep clear of the pikes.",
    ],
  },
  {
    v: "1.39.3", date: "15 October 2026", title: "The rout, and the map",
    items: [
      "A side that breaks is shown breaking: the battle's top bar counts the men running as well as the men standing, and a battle won because the last of them fled ends with \"They break and run!\" (or, the other way, \"Your men break and run\").",
      "Campaign: your towns are ringed in your colour on the map, every enemy town your army can reach is marked with crossed swords (dimmed once you've marched that season), and a town that's about to be attacked is marked in red.",
      "Campaign: when a season ends, its news is laid out at the top: who went to war, which towns fell, who's marching on you.",
      "Map: Riga is Sweden's (the border runs south of it, along the Daugava), Azov the Sultan's, and the Crimea the Khan's.",
      "The \"First Blood\" achievement says what it's for: winning a battle or a duel.",
    ],
  },
  {
    v: "1.39.2", date: "15 October 2026", title: "Deployed for you",
    items: [
      "Deployment is automatic now. Your officer puts your company on the best ground near where it starts: higher if there's height to be had, near cover, out of the water, and never marched forward into the enemy. Fixed: the manual deployment showed a black screen, because the battle's fade-in waited until you'd finished placing your men.",
    ],
  },
  {
    v: "1.39.1", date: "15 October 2026", title: "A bigger field, smoother",
    items: [
      "Big battles run several times faster. Each soldier used to be drawn as twenty-odd separate pieces, and now he's one, so a field of a hundred and fifty men runs about five times smoother. A man's coat still darkens when he's wounded.",
      "Companies can now be up to 90 men each, for the great battles against other players.",
      "Vienna's vines are vines now, not green boulders taller than the men.",
    ],
  },
  {
    v: "1.39.0", date: "15 October 2026", title: "Cavalry, and the field before the fight",
    items: [
      "Cavalry: troopers on horseback with pistol and sabre, at 150 thalers each. They gallop, charge home at full tilt and ride on through to come again, and they're death to men caught in the open. Pikes are death to them, and when a trooper falls his horse bolts riderless. Enemy commanders raise them too, and the historical armies have their horse: Sobieski's hussars at Vienna, the Great Elector's cuirassiers at Fehrbellin, the Sultan's sipahis.",
      "Deploy before every battle: the camera rises over the field and you click where your company should stand, anywhere in the gold ring on your side. Against another player you both deploy, with half a minute each.",
      "Tactics count. Every man has nerve: seeing comrades fall beside him and being hit shakes him, and quiet, or you near him, steadies him. Shaken men break and run, and a side that's all running has lost. Cheap levies break first and pikes and grenadiers hold best, so a mob charging a steady line that fires into it comes apart before it gets there. Men who run a long way arrive winded and strike weakly, and a blow from the flank or behind, or on a running man, does half as much again.",
      "Bigger battles against other players: choose the size in the muster, from a skirmish to a great war (5,000 thalers), and it's fought at the larger of the two choices. Companies can now be up to 70 men.",
      "No more forts in battles against other players. It's always the open field.",
      "Fixed: blows on the other player's soldiers in an online battle often did nothing. Over a real connection the soldier stands a step or two away from where your screen shows him, and the blow was thrown out.",
      "Your battles go on the Highlights only if you tick the box for it on the result screen.",
      "The map of Europe has its borders of 1683, drawn as an engraver would, instead of in squares. Riga and Livonia are Sweden's along the Daugava, Brescia and Bergamo Venice's, Abruzzo Naples', Slavonia, the Banat and Dobruja the Sultan's, Ingria and Karelia Sweden's, Bremen-Verden Sweden's, Magdeburg Brandenburg's, and Royal Hungary only the narrow strip it was.",
      "Big battles run smoother: men far off are animated less often, and only men near you cast shadows.",
    ],
  },
  {
    v: "1.38.0", date: "14 October 2026", title: "The campaign",
    items: [
      "A campaign: To Arms → Campaign. Take any of the 34 crowns of 1683, from the Ottoman Empire and France to Tuscany and the Crimean Khanate, and play Europe season by season on the engraved map of the time.",
      "Every town is a province. Declare war, march on an enemy town within your army's reach, and fight the battle yourself on the ground where the town stands, or leave it to your generals. Win and the town and its country are yours. Great cities fight from behind their walls, and in winter the ground is under snow.",
      "Keep your neighbours sweet with envoys and gifts. Trade pacts bring in money, and allies join your wars. You can offer peace, and a beaten enemy may offer it to you, with silver to have it.",
      "The other crowns have their own minds. They make war on each other and the borders move. A neighbour that hates or fears you will declare war, and the more you grow, the more of them will. They march on your towns, and you defend each one yourself or leave it to the garrison.",
      "Raise regiments from your treasury, but pay them, or they desert. Lose every town and your crown is gone; hold forty and Europe is yours, though you can play on. The campaign saves itself as you go.",
    ],
  },
  {
    v: "1.37.0", date: "14 October 2026", title: "Historical battles",
    items: [
      "Historical battles: ten fields of the game's own years, under To Arms → Historical battles. Chocim, Seneffe, Fehrbellin, Lund, Vienna, Sedgemoor, Hamburg, the Boyne, Zenta and Narva, fought with the armies that stood there, in their own coats and under their own colours, at the hour and in the weather of the day. Fight for either side, and lead one company while bots lead the rest.",
      "Each field is shaped like the real one. The Boyne runs between the two kings' armies and Oldbridge stands on the far bank. At Vienna the relief army comes down the Kahlenberg's vineyards towards the Turkish tents, with St Stephen's spire and the city walls beyond. The Bussex Rhine's ditch lies in front of the King's camp at Sedgemoor, by night and in mist. Zenta's bridgehead has the Tisza and the bridge of boats behind it, Narva is in the snow under its castle, and Hamburg fights from its walls with its church spires behind.",
      "Monmouth's rebels carry scythes and pitchforks, and there are two new flags: Monmouth's green 'Fear nothing but God' and King James's Irish harp.",
      "When it's over you learn how it really went, and whether you've changed history. A mark on the list shows the battles you've won.",
      "Ratings begin again: everyone starts at 1000, with a new board of best commanders. From now on only battles and duels against other players count; fighting bots no longer changes your rating, though bots still get sharper as you beat them.",
      "Fixed: the sound cutting out when a lot was going on at once. Every finished shot, cry and clash was still being processed until it was cleared away, and in a big battle the sound fell behind and dropped out. They're let go of at once now, the sound has more room to keep up when the computer's busy, and if it still falls behind, only distant sounds are left out, never yours.",
    ],
  },
  {
    v: "1.36.0", date: "14 October 2026", title: "Your keys",
    items: [
      "Change any key: Settings → Keys → Change keys… Click an action and press the key you want. A key another action had is swapped over to it, so nothing's ever left without one; Reset all puts every key back. The controls list and the key hints in the game show your keys. (Esc and the number keys stay as they are.)",
      "Fixed on Windows: crouching (Ctrl) and walking along a wall could close the game — the game window still had a hidden menu that answered Ctrl+W. On Windows the game's window has no menu at all now; F11 is still full screen, and updates still come by themselves.",
      "Ctrl no longer sets off the browser's own shortcuts (save, find, bookmark, print) while you play in a browser.",
      "Faster on laptops with two graphics chips: the game asks for the stronger one. On Windows, a graphics card the browser would refuse is used anyway, instead of drawing everything in software at a few frames a second.",
      "Better first guesses: built-in AMD graphics start on Balanced, like Intel's, and a computer with no graphics card in use starts on Performance. If the game runs slowly on High for half a minute of play, it steps down to Balanced by itself, once, and tells you.",
      "If the graphics driver keeps giving out, the game drops to the Performance graphics instead of restarting again and again.",
      "The game writes down which graphics card it's using in its log, for when something's slow.",
      "The full game will be CA$14.99.",
    ],
  },
  {
    v: "1.35.1", date: "13 October 2026", title: "The shop, readied",
    items: [
      "The full game will be sold through Stripe's checkout. Buy it from inside the game and it unlocks by itself the moment the payment goes through — no key to copy — and shows you your key for your other computers (each key works on up to three).",
      "Bought from the website instead, your key is shown as soon as you've paid, and it's on your receipt too.",
      "Nothing is for sale yet: the shop opens once it's been set up and tested. Everyone who's played before then keeps the whole game, free.",
    ],
  },
  {
    v: "1.35.0", date: "13 October 2026", title: "Custom battles",
    items: [
      "Custom battles against bots: choose the sides in the muster — 1 v 2, 2 v 2, 3 v 3, 4 v 4, three or four sides each against all the others (1 v 1 v 1, 1 v 1 v 1 v 1, 2 v 2 v 2), or make your own, up to four sides of up to four companies each.",
      "Every company is raised from the same purse, in its side's own colours, and every one but yours has its own officer — your side's as well as the others'. With many companies on the field, the bots' are smaller, so the field never holds more men than the game can keep up with.",
      "Two sides stand at either end of the field behind their works, their companies in a row; three or four sides stand round the field, each company behind a short battery of gabions with its own guns, facing in.",
      "The opening, the score at the top, the highlights and the replays all know the sides: your side against every other.",
      "Replays are filmed steadily: the camera reads ahead in the recording, settles where the action is about to be before it happens, and pans smoothly with it — cutting to a new place only when the fighting has moved on, and keeping to one side of the battle so left stays left. Before, it jumped to every shot as it was fired.",
      "Highlight shots follow each man's smoothed path, led a little ahead of him, instead of his every step; the guns are framed from the gun to where its shot struck, instead of swinging with the barrel as it's laid.",
      "The overhead replay camera drifts with the battle instead of jerking after it.",
      "The opening no longer shows the weapon name in the corner of the picture.",
      "The battle's opening is far less blurred: only what's well away from what the camera's on goes soft, and never all the way.",
      "The opening's camera no longer bobs over the gabions in front of the enemy's line: each shot works out the height it needs over everything along its way before it starts, and glides level.",
    ],
  },
  {
    v: "1.34.1", date: "13 October 2026", title: "No more freezing",
    items: [
      "Battles no longer freeze partway through: once a battle had left enough marks on the ground, a limb torn off by a cannonball or a grenade could become the oldest of them, and clearing it away failed — every frame, so nothing moved again. Fixed; and if anything of the kind ever goes wrong again, the rest of the game carries on instead of stopping dead.",
      "Contact shade (on with the High preset, or in Settings): a soft shadow where things meet — men's feet on the ground, the foot of a wall or a parapet, the corners of the works.",
      "The battle's opening and the replays are filmed with a depth of field: what the camera's on sharp, the rest softened.",
      "The opening's camera rises once over the gabions in its way, instead of bobbing over each one.",
    ],
  },
  {
    v: "1.34.0", date: "13 October 2026", title: "The battle on film",
    items: [
      "A battle opens like a film: the field from high in the air with the place named, along your ranks and along theirs with what each side has brought, a gun or the ground between, and then down out of the sky into your own eyes — with music under it. A duel opens on the two of you, face to face. Any key skips it.",
      "Every battle and duel is recorded as it's fought. When it's over you see its highlights at once — the opening, the volleys that told, the guns, the lines meeting, your kills, the moment you fell, the last man down — slowed where it matters.",
      "Then watch the whole of it as often as you like: pause, slow it, speed it, jump anywhere on the timeline (every man down is marked on it), and see it from the director's eye, behind you, from above, or flying free.",
      "Your battles are sent to the server (Settings can turn that off). The camp has a Highlights tab of the battles lately fought, and your own; the best commanders' board lets you watch any one's best or latest battle.",
      "On a big enough screen, the battles lately fought play behind the To Arms menus, quietly, one after another.",
      "Battles no longer slow to a crawl when the volleys start: there's a limit to how much powder smoke hangs on the field at once (later shots make fewer, bigger clouds, and the oldest thin away first), and fewer old bloodstains are kept. In a big battle the game was drawing nearly two thousand puffs of smoke and stains during a charge.",
      "The enemy fires from the start: a musket now reaches 100 metres, so the two lines are in range of each other as they first stand, their officer gives his first volley within a few seconds, and they answer at once when they start losing men.",
      "Your kills sound heavier: the blow landing, and the man going down.",
      "Two bigger purses: An epic battle (2000 thalers) and A magnificent battle (2500), with room for up to fifty men and four guns a side.",
      "A light boom, like a gun far off, when you open the pause menu.",
    ],
  },
  {
    v: "1.33.1", date: "13 October 2026", title: "One world",
    items: [
      "The wide world is the same world from the day it's made: until someone had built in it, the server laid out a new one every time it started.",
    ],
  },
  {
    v: "1.33.0", date: "13 October 2026", title: "The wide world, worked through",
    items: [
      "Your axe goes into the tree in front of you, not your own cabin behind it: near your buildings a swing hit the nearest wall instead — and a homestead's own walls came down a log at a time. Breaking your own building now takes a second swing, on purpose.",
      "The pickaxe finds the rock in front of you wherever it lies: a rock just over the corner of one stretch of land and the next couldn't be struck at all, however long you swung.",
      "F does what you're looking at: by the town hall, F at a site laid out beside it went to the hall's store instead — your logs went into the chest, and the woodshed never went up.",
      "Raise a building where you stand and you step out of it, not shut inside its walls; and you never come back into the world inside one.",
      "Stone in your pack counts toward breaking ten stone, as much as stone in the store.",
      "A building site's sign fades as you come up to it, instead of filling the view (in the story too).",
      "A new homestead comes along quicker: a cabin takes 24 logs, not 30, and acacias and palms give four logs, scrub two.",
      "With a town hall of your own, its plan says so first, not that something's in the way.",
      "A battle's first few fights are against an easy officer, with a company a little the smaller; he sharpens as you win, and eases off if you lose.",
    ],
  },
  {
    v: "1.32.0", date: "13 October 2026", title: "A sharper enemy",
    items: [
      "The other side's officer is never a fool now — the greenest a capable man, and the best, once your record's a good one, as sharp as any:",
      "With men to spare he comes at the thin end of your line, so his overlaps yours there and folds round it.",
      "He holds his first volley until it'll tell — well inside a musket-shot, not at the end of one.",
      "Charge him and he meets you with every loaded musket at a dozen paces, then goes at you with the steel.",
      "He sends his men in when your line's in disorder — strung out, men off on their own — as well as when it's just fired.",
      "His men choose their marks: a man out in the open before one behind cover, a man already hurt, a gun's crew — and they don't all fire at one man while others go untouched. His grenadiers throw where most of yours stand together.",
      "Your own uniform is worn like the rest of the company's — faded, dusty, a pair of stockings of your own — instead of fresh from the dye-vat and brighter than every man round you.",
    ],
  },
  {
    v: "1.31.1", date: "13 October 2026", title: "Smoke over the field",
    items: [
      "Powder smoke hides what's under it: blood on the ground was drawn on top of the clouds, so the pools showed straight through a gun's smoke.",
      "The smoke is the grey-white of black powder, not a charcoal grey: in a sunlit field a gun's cloud hung in front of you as a black blot. A battle gun's cloud hangs a little less long, too.",
    ],
  },
  {
    v: "1.31.0", date: "12 October 2026", title: "Faces",
    items: [
      "Eyes that look like eyes: the whole eyeball was being tinted the colour of the iris, so every man stared out of two dark beads. Now the whites are white, the iris its own colour round a black pupil, the eye set back in its socket under a thin lid — no more goggling.",
      "Faces with more to them: the sockets deeper, the cheekbones catching the light, the shade under the nose and in the hollow of the cheek, and brows that read.",
      "No more dark mask over the jaw: the shadow a beard casts was being baked into the skin under it, and stayed there when the man was clean-shaven. And the soldiers in a battle go shaven — the little moustache read as a smudge under the nose.",
      "The Ottoman army's men are dark-skinned, with black hair and dark eyes.",
      "Standing about with nothing in hand, people stand easy — breathing, arms hanging — instead of swaying from hip to hip and glancing round.",
    ],
  },
  {
    v: "1.30.1", date: "12 October 2026", title: "The guns' smoke",
    items: [
      "A battle's cannon fire now throws out its flash and its great bank of smoke at the muzzle, as the story's guns always have: the ball's speed was being worked out on the very arrow that pointed the smoke, so the flash and the whole cloud were flung hundreds of paces off across the field, and a gun went off clean.",
    ],
  },
  {
    v: "1.30.0", date: "12 October 2026", title: "The demo and the full game",
    items: [
      "Ready for the shop: Forester: Reckoning will come as a free demo — the story's first chapter, and battles and duels against the bots — and the full game, unlocked with a licence key from the shop: the whole story, battles and duels against other players, and the Worlds & colonies. A page says what's in it, with the way to the shop and a box for the key; the story stops at its second chapter with the save moved on, so once bought it carries straight on.",
      "Nothing is locked yet — the shop isn't open. And everyone who's played before it does — anyone with a save or a battle record — is an alpha supporter and keeps the whole game for nothing, for good.",
    ],
  },
  {
    v: "1.29.1", date: "12 October 2026", title: "No more standing about",
    items: [
      "Men in a battle no longer freeze and stutter in the press: finding a way round things was rationed to one man a frame, so in a melee of forty, re-routing after each other, most of them stood still waiting their turn — the charge crawled, and crawled worse the lower your frame rate. Now eight a frame: they run at their real pace.",
      "The slowed moment, the screen's shake and the hit-pause are for your own blows and kills only: every man going down anywhere on the field set them off, so a big battle kept lurching in and out of slow time.",
    ],
  },
  {
    v: "1.29.0", date: "12 October 2026", title: "Light",
    items: [
      "Shafts of sunlight: look toward a low sun and its light streams out from behind whatever stands in front of it — the trees, the ranks, the powder smoke — strongest in the morning and the evening.",
      "A rim of sky light along the edges of everything turned from you — a man's shoulder, a coat's skirt, a roof's ridge — so men and buildings stand out from the land behind them instead of melting into it.",
      "Sharper: the picture sharpened as much as the smoothing of its edges had softened it, less where an edge is already hard (no halos); and a lens's faint colour fringe toward the corners.",
    ],
  },
  {
    v: "1.28.0", date: "12 October 2026", title: "Your kill",
    items: [
      "When a man goes down to you — your ball, your arrow, your blade — an X marks the place it struck him, white and red, popping in and fading in under a second, and you feel it: a low, dull thud with a muted knock in it, the way a man going down is felt through the ground. In battles, duels, and the story's fights alike; only your own kills, not your company's.",
    ],
  },
  {
    v: "1.27.0", date: "12 October 2026", title: "Every army as it was",
    items: [
      "The armies of the East dress as they did in 1683. The Ottoman Janissaries: the long dolama to the shins, frogged across the breast, a broad sash knotted at the front, yellow boots, a powder horn at the hip, and a turban wound round a red cap — moustached, as Janissaries were. The Muscovite streltsy: long crimson kaftans frogged green, the regiment's fur-trimmed cap, yellow boots and the bandolier — bearded. Sobieski's Polish haiduks: long blue coats frogged red, a red sash, red boots and a tall kolpak with a white plume.",
      "Every army of the West in its own breeches and stockings: the Imperials' red stockings, the Bavarians' white breeches under Max Emanuel's light blue, the Caroleans' buff breeches and blue stockings, the English blue breeches, the French red or grey stockings, the Danes' red — each company's men mostly in its issue, and now and then a man in his own.",
      "Janissary, Strelets and Haiduk are outfits of your own too, with the turban, the fur-trimmed cap and the kolpak among the hats.",
    ],
  },
  {
    v: "1.26.0", date: "12 October 2026", title: "Generalship",
    items: [
      "The other side's officer commands as well as your record has earned: at the start he's rash, on at you and in with the steel as soon as he's near — but the higher your rating, the better the officer. A seasoned one stands off at a good musket-shot and makes his volleys tell, giving fire when his men are loaded and you're in range; holds where he is behind cover when he has the fewer men and lets you come on into it; charges only when it's worth it — when he's clearly the stronger, when your line has just fired and is still loading, or when you're nearly done — and calls a charge off that's going against him, falling back to re-form and take up the firing again.",
      "Against another player, a fort is no longer a toss of a coin: the field is open, unless one company is clearly the smaller (fewer than four men in five of the other's, counting a gun as two) — then the smaller has a fort, walls to make up its numbers, and both players are told why when the battle begins.",
      "If the connection drops while you're mustering for a battle against another player, the game says so, and puts you back in camp — before, it said they'd left the muster. (The game's server was being restarted with each update today, which dropped musters in progress; it's now only restarted when its own workings change.)",
    ],
  },
  {
    v: "1.25.1", date: "12 October 2026", title: "Worlds & colonies",
    items: [
      "The second Online button says what's behind it: Worlds & colonies — the Wide World, a co-op colony, Classic nations, Frontier and Frontier rivals — not just Frontier. The screen it opens is called the same.",
    ],
  },
  {
    v: "1.25.0", date: "12 October 2026", title: "Two ways in",
    items: [
      "The title screen asks one thing: alone, or with others? The Story (single player) on one side — Continue, big, if you've a story going, with New story, Chapters and Saves quietly under it; Begin the story if you haven't — and Online on the other: Battles & duels, and Worlds & colonies (the Wide World, a co-op colony, nations, Frontier). Settings, Controls, Achievements, What's new, Credits and Quit along the bottom. Eleven buttons of the same size were too many to choose from.",
      "Sound in a charge: every sound playing is counted now, and when the field is at its loudest — men dying all round, every musket going — the furthest and quietest (a cry across the field, a far shot) give way so the audio keeps up; the ones near you always play. The audio clock is watched as well, and if it ever falls behind, less is let through until it catches up. Another man's swing is heard from where he is: before, every bot's swing anywhere on the field whooshed at full volume in your ear.",
    ],
  },
  {
    v: "1.24.2", date: "12 October 2026", title: "Arrows that stay in",
    items: [
      "An arrow or a bolt that strikes a man goes in: its point driven to the limb or the body it meets, along the way it flew, and carried by that part of him — it moves with his arm, goes down with him and stays in him as he lies. Before, it stopped a hand's breadth short of him in the air and hung there, fixed to where he'd stood, while he walked off or fell away from it.",
    ],
  },
  {
    v: "1.24.1", date: "12 October 2026", title: "Gore, on or off",
    items: [
      "A Gore switch in Settings (under Content). On, it's all there: the mist and the spray, the blood that stays on the ground, coats soaking dark, pools under the fallen, limbs torn off by cannon and grenades. Off, there is none at all — not a drop: no blood thrown from a blow, no stains, no pools, nobody torn apart; and turned off mid-battle, everything already shed is gone and the fallen are whole. A wounded animal's trail is still there to follow when it's off, as scuffed, kicked-up earth.",
    ],
  },
  {
    v: "1.24.0", date: "12 October 2026", title: "What a battle leaves",
    items: [
      "Wounds bleed as they should: a fine red mist off the wound the way the ball or the blade went, heavier spray, and the blood left on the ground — thrown out behind a man where he was hit, spattered where he stood, every drop that lands soaking in as a spot instead of lying there as a red bead and vanishing. It stays for the whole battle.",
      "A man's coat, shirt and breeches darken with his blood, a little more with every wound.",
      "Where a man falls a pool of blood spreads out from under him over some seconds, and stays.",
      "A cannonball or a grenade that kills a man may tear an arm or a leg from him — flung off tumbling, trailing blood, landing in a pool of its own — and the stump pumps blood in time with what's left of his heart, weaker each time.",
    ],
  },
  {
    v: "1.23.0", date: "12 October 2026", title: "The heart in your ears",
    items: [
      "Near death you hear your own heart — a thick lub and a softer dub — and the edges of your sight beat red with it, quicker and harder the less of you is left (from about a third of your health down). It eases away as you mend.",
      "The spear and the bayonet are held as a pike was: low at the hip in both hands, the point up before the face — and the thrust is a thrust: drawn back a hand's breadth, driven straight out level along its line, held a moment, and recovered. Seen on the other men and on your own body from behind; before, it played a one-handed fist jab, and the weapon waved about in one hand.",
    ],
  },
  {
    v: "1.22.1", date: "12 October 2026", title: "The din of the charge",
    items: [
      "A charge no longer goes quiet. When the muskets stopped and the lines closed, all that was left to hear were the odd blow and cry near you — it sounded as if the sound had cut out. Now there's the din of a melee under them: men roaring, steel on steel and on musket stocks, men knocked down, and the thud of a running line's feet, louder the more of the fighting is about you and fading as it ends.",
    ],
  },
  {
    v: "1.22.0", date: "12 October 2026", title: "The musketeer's coat",
    items: [
      "Soldiers dress as the musketeers of the 1680s did: a coat cuffed in the regiment's facings, a buff belt at the waist, a bandolier over the left shoulder hung with wooden powder chargers, a bullet bag and a priming flask at the hip, and a broad felt hat with a low crown, cocked up on one side.",
      "No two coats alike: each man's cloth from its own dye-vat, faded by the sun, greyed with dust and powder smoke, darkened by rain — the colours muted, as wool dyed with madder, woad and weld really was, instead of bright paint. Breeches and stockings a man's own as often as the issue, the linen long past white, and the mud of the march up his stockings.",
      "In a battle your own man (if you're dressed as one) takes the musketeer's coat, bandolier and hat in your colours. And Musketeer is an outfit of its own now in the look, with its cocked felt hat among the hats.",
    ],
  },
  {
    v: "1.21.0", date: "12 October 2026", title: "The camp",
    items: [
      "To Arms is the camp now: one big Quick Play button for a battle against another player, Battle against bots and Duel beside it — and the camp itself: everyone who's in it right now, their rank and what they're about (in camp, looking for a battle, mustering, in battle), a talk you all share, and the best commanders. Challenge anyone in camp to a battle or a duel with a click; they're asked, and accept or decline.",
      "The muster: matched with another commander, you each equip your own soldier and raise your company from the purse, choose your colours, and say you're Ready — you see when they are, and the battle begins when you both are (or after two minutes). Against bots, the same screen and To the field. Much simpler than the old one-page loadout.",
      "Grenadiers: 120 thalers, the price of two musketeers — a musket and bayonet, and three grenades: lit and lobbed at men twenty paces off, bounding and rolling, and bursting with a flash and a bang, hurting all about — less behind something solid.",
      "Six more armies, each with its colours: the Polish (Sobieski's foot, the white eagle on red), the Ottoman Janissaries (crimson and blue, the white börk, crescents on red), the Dutch (blue faced orange, the Prince's flag), the Muscovite streltsy (crimson faced green, St Andrew's cross), the Spanish tercios (buff faced red, the ragged cross of Burgundy) and the Danish (the Dannebrog).",
      "The battlefield: the very middle left open for the two lines to cross; more cover across the rest of it — walls, rocks, carts, barrels, a farm, a felling, haystacks — and further out to the flanks. The hedges are gone, and so are the country's own bushes and trees: everything on the field that looks like it'd stop a ball does.",
      "Men on the march halt to fire when a man of theirs is in range and in sight, and load as they go on — a company ordered forward no longer walks into the enemy's muskets without a shot.",
      "Battles against another player end on both screens: a man knocked down counts as fallen on the other game at once (he was being struck at as he lay, and the battle couldn't end), every fall is told straight away, both sides stand down when it's over, and if the word that it's over is ever lost, the other game ends it itself.",
    ],
  },
  {
    v: "1.20.0", date: "12 October 2026", title: "The advance",
    items: [
      "The other side's officer advances as the drill had it: a march of some paces with the line kept together, then — once in range — a halt and a volley, and on again, until it's close enough for the steel. Battles come to a decision now; before, his line crept forward at half a pace a second and the fight could stand off for minutes.",
      "Men on the march load where they stand and keep their places, instead of every man with an empty musket breaking off to look for cover — which pulled the line apart and held the whole advance up.",
      "Colours: each side's flag flies on a tall staff behind its line (or over its fort), worked by the wind — the Emperor's black eagle on gold, Saxony's black and gold bars with the green crown of rue, Bavaria's lozenges, Sweden's yellow cross, Brandenburg's red eagle, France's lilies, St George's cross, and Hamburg's white castle on red.",
    ],
  },
  {
    v: "1.19.0", date: "12 October 2026", title: "The Forester server",
    items: [
      "Reckoning has its own server now, in Seattle: duels, battles against another player, and the Wide World — one great shared map, where what you build stays — all find each other there, wherever you're playing from. Nothing to set up: the game knows where it is.",
      "Round shot rebalanced now that guns are bought from the purse: the man a ball strikes is still killed outright, but those about him are hurt by the stones and splinters, not all killed — a single shot was taking three or four men out of a packed line.",
    ],
  },
  {
    v: "1.18.1", date: "12 October 2026", title: "Your gun, in your hands",
    items: [
      "Fixed: your gun (and whatever else you held) unseen for a whole battle. If you'd fallen in the battle before, the free camera at its end remembered your hands as hidden, and put them back that way when you left — so the next battle began with nothing in view.",
    ],
  },
  {
    v: "1.18.0", date: "12 October 2026", title: "Commanders",
    items: [
      "Battle Mode against another player: in To Arms choose Battle Mode, then Against a player. Each of you raises and commands your own company; the first to arrive holds the field and chooses the ground — somewhere on the Earth, by day or by night — and the other's game builds the same. Your orders go to your own men only; your shots, blows, cannon and parries count on both screens; fall while three of yours still stand and you take a man's place, as against bots. Play it on your own network, or on a server you both know.",
      "The treasury: a battle's companies are raised from a purse — the same for both sides — and spent as the commander sees fit. Musketeers (musket and bayonet, 60 thalers), crossbowmen (36), swordsmen with pistols (42), pikemen (28), axemen (26), bowmen (22) and field guns with their crews (160): a few men in the best of arms, or a crowd of bowmen. Against bots choose a skirmish's purse (500), a battle's (900) or a great battle's (1,500); their officer has the same, and spends it his own way. Against a player it's 900 each.",
      "The guns page in the orders: 0 opens it — fire there, fire at will, or abandon the guns (their crews leave them and fall in with the line, swords out; the same key mans them again). The formation and gun pages have a Back on a number key: the orders never want anything but the numbers.",
    ],
  },
  {
    v: "1.17.0", date: "12 October 2026", title: "Serve the guns",
    items: [
      "The guns are served as they were: fired, a gun leaps back on its wheels. The loader sponges out the bore — three strokes of the wet sheepskin — while the gunner stops the vent with his thumb; the gunner brings up the cartridge and puts it in the muzzle; the loader turns his staff end for end and rams it home, a long push and two hard strokes; the gunner pricks it through the vent and primes it from his horn, then crouches behind the trail to lay the gun; both heave it back up into its place at the wheels; and the gunner stands by with the linstock's match glowing. Every step heard — the sponge in the bore, the rammer's thud, the priming wire, the wheels grinding.",
      "Parry warnings are back: the marks round the crosshair show where a blow is coming from whatever you hold — the musket too. With the steel close, right-click brings the musket up crosswise to guard (up over your head, or to a side), and raised just as the blow comes, it parries.",
      "Better faces: a beard and a moustache are their own parts now, so soldiers are mostly clean-shaven, many with a moustache, some bearded — and hair and beards come out the colour they're meant to be (they were always nearly black). Skin no longer comes out orange, in the battle or in the character builder. The builder has a Face choice — beard, moustache or clean-shaven — for the outfits that have one.",
      "Smoke is a dark grey, not black — and still more of it.",
    ],
  },
  {
    v: "1.16.0", date: "12 October 2026", title: "By night",
    items: [
      "Battles by night: about one in three is fought under the moon and stars, the field lit only by a watch-fire behind each line and a lantern by every gun. No one sees far — the soldiers open fire much closer than by day. Others are fought in the morning, the afternoon or the evening light.",
      "The sky going black is fixed. Two causes: a cloud of the dark smoke rolling over your eyes covered the whole sky — now smoke thins to a haze as it comes over you — and a battle could be set over a cave's mouth, and walking into it took the sky away; battles are never set near a cave now.",
      "Your gun no longer vanishes: a number key pressed while the orders page was hidden (after you'd taken a comrade's place, or between rounds) went through to the bar and put your musket away. In a company fight the numbers are only ever orders.",
      "More smoke, and blacker: thicker clouds from every musket and cannon, slower to clear.",
      "Screams that sound like screams: the harsh beating rasp a real scream has, the voice cracking and breaking as it's forced, and a gasp before it. A man going down cries out, catches his breath, and moans or sobs once or twice more, weaker each time; a wound sometimes draws a second, shorter cry through the teeth.",
      "The guns hold their first shot for a few moments, so a crew isn't cut down before the fight has begun.",
    ],
  },
  {
    v: "1.15.0", date: "12 October 2026", title: "The ground between",
    items: [
      "R to load: a musket or a pistol stays empty after it's fired until you set about loading it, and the crossbow until you wind it. A click on an empty gun gives the dry snap of the lock. A bayonet thrust leaves the loading off — R to begin it again.",
      "The lines stand much further apart — over seventy paces — and the field is wider; muskets carry a little further, and a line has to come on to do much harm.",
      "Far more between the lines, and better set: a burnt-out farm with its walls standing to different heights, its chimney stack and its fallen roof-beams; field walls (some with a gap); thick hedges; snake fences; a woodcutter's felling with stumps, trunks and a log stack; boulders; haystacks with stooks round them; a broken-down wagon with its load spilt. Everything is laid out clear of everything else, the two halves of the field get their share, walls and hedges run mostly across the field where they're cover, and each gun's line of fire is left open.",
      "Colliders that fit: each gabion is solid as itself — no more one great box along the battery that blocked its gun gaps; casks, gate leaves, the flagstaff, stumps and the guns themselves (muzzle to trail) are solid now; casks stand where they look.",
      "The guns no longer fire at empty ground: they're laid afresh the moment the men they were on are down, hold their fire with no one there, and fall silent between rounds and when it's over.",
      "Powder smoke is dark: a dirty grey-black, the haze it leaves greyer.",
      "No more odd crouched sword-stance after a blow: fighters come back to their guard.",
      "The pause menu in a fight says Restart duel or Restart battle — and does it, against the same sides (a battle on new ground). Leave says battle or duel too.",
    ],
  },
  {
    v: "1.14.0", date: "12 October 2026", title: "Smoke and steel",
    items: [
      "Everyone moves better in a fight, with motion from a proper animation library fitted to our own people: a swordsman's ready stance and a real cut — a lunge in, the blade across — a flinch from a blow to the body and another to the head, and crouching, still and on the move.",
      "Crouch and you crouch, instead of shrinking; soldiers get down low behind their cover while they load.",
      "When a battle's over — or the last round of a duel — you're loosed into the free camera to look over the field as long as you like (WASD to fly, Space up, C down); Enter to leave it.",
      "Palisades are solid: the stakes stand shoulder to shoulder with planks behind them, no daylight between, and a ball stops in them — it was jumping clean through thin cover between one moment and the next.",
      "More smoke: black powder's thick white cloud rolls out of every musket and hangs, drifting off on the wind, so a volley leaves the line in a fog; a cannon's is far bigger and slower to clear.",
    ],
  },
  {
    v: "1.13.0", date: "12 October 2026", title: "Forts, and the guns' crews",
    items: [
      "Forts: in Battle Mode choose the ground — the open field, your fort to hold, or theirs to take. A redoubt of earth: its front a rampart chest-high to the men behind it, with embrasures for its guns; palisaded flanks and rear, the gate behind, and a breach the last siege left in one flank. The other side throws up a siege battery. Hold it and they come for you; attack it and they stay on the wall, volley as you come, and only go at you with the steel when you're inside.",
      "Every gun has its crew — a gunner and a loader with hangers at their belts. They work it at the drill's pace, ramming and priming at the breech; with one of them down it loads at half speed, and with both, it's silent. They'll leave it only for a man who comes right at it. And F at one of your own guns lays it on where you're looking and fires it.",
      "The bayonet is a socket bayonet now, fixed under the muzzle: F fixes it, for the rest of the fight. You still fire — slower to load and less true with it in the way — and once you've fired, a click is the bayonet, driven straight out. Soldiers in a battle fix theirs before they ever come on.",
      "A line of more than fourteen stands in two ranks.",
      "Your men take up an order down the line, a shout or two back.",
      "A company's faces: fair for by far the most part.",
    ],
  },
  {
    v: "1.12.0", date: "12 October 2026", title: "Fix bayonets",
    items: [
      "The bayonet: the dagger fixes on a musket, and your musket's a pike, thrust and not swung, with a long reach. Soldiers fix theirs as they close, and most of a battle's companies carry them.",
      "Orders are the number keys: the page of orders stays at the side of the field, and its number gives each one while you fight on — no F, nothing in the way. The formation's number turns to the formations. The wheel changes your weapon.",
      "Fall in battle while three of your company still stand, and you're up again in the place of one of them — the one furthest from the fighting — and fight on.",
      "No slowing down or freezing when someone's killed in a fight of companies: a battle goes on at its own pace. No music over a fight either — the field, the shots and the shouting are its sound; a side drum beats the advance.",
      "The guns: steel now, solid from every side (you could see through the barrels), quicker to load and better laid; a round shot goes through a file of men, throws up earth and splinters where it strikes, and bounds on low.",
      "Shots sound as they do out of doors: the lock and the pan a moment first, a hard crack, the boom, and the report going off round the country and back — later and duller the further off it is. A pistol is smaller. A cannon is far louder and deeper than any musket, and its thunder rolls on for seconds.",
      "Loading sounds as iron and steel do: the ramrod sliding through its pipes and down the barrel, the ball rolling down the bore, the lock's tumbler catching — no more beeps. The crossbow's ratchet and nut too.",
      "Cries are human: a voice with breath and roughness in it, its pitch never quite steady, the vowel changing as it goes — and a man who's killed cries out and breaks off into breath (unless it was his head).",
      "A company's faces vary: fair for the most part, weathered or sallow in many, a few darker.",
    ],
  },
  {
    v: "1.11.0", date: "12 October 2026", title: "To arms", img: "art/updates/1.11.0.jpg",
    items: [
      "Battle Mode: take a company into the field against another — your own colours (Imperial, Saxon, Bavarian, Swedish, Brandenburg, French, English or Hamburg's militia), theirs drawn by lot — up to 12 men with you and 20 against you.",
      "Every battle is somewhere new on the Earth as it stood in 1683: any land that's open and level enough, never the sea — the savanna of Brazil one time, the woods of Muscovy the next — named for the realm it's in.",
      "The field is made fresh each time: gabions and earth banks for each side's works, chevaux-de-frise and palisades before them, carts, barrels and fallen trees between, and guns in the batteries firing round shot that bounces, ploughs the ground, and goes through a file of men.",
      "Orders, from a page in a captain's hand, while you fight on: follow me, hold here, advance to where you're looking, take cover, fire at will or hold your fire, a volley at your word, bring down the man you're looking at, charge — and the formation: line, column, square or loose order; in a battle, the guns laid on where you're looking.",
      "Their officer holds his works a while, then brings his men on, volleys, and sends them in with the steel when they're close.",
      "Skirmishes too: any number with you and against you, without the uniforms and the guns, in the ride in the woods.",
      "Fall in battle and the red comes in as ever — then your eye goes to one of your company still fighting, to the end.",
      "The bots are sharper: they take cover while they load, step out of your sights when you aim at them, come at you slanting, and come in with the steel when you're loading.",
    ],
  },
  {
    v: "1.10.3", date: "12 October 2026", title: "Doors that shut",
    items: [
      "Frontier: the cabin's door is there again — it had been swung to nowhere by the gates' hinges — and it opens and shuts with F as before.",
      "Frontier: the cabin is furnished as the one in the clearing is after its first night: its two beds, straw pallets along the wall, and a table and bench.",
      "Frontier: the town hall, the house and the forge have a door that's shut until you open it (F), and you see it from inside as from out; the town hall's lobby is open through to the hall, so the door's in sight from the table.",
      "Frontier: the town hall's walls are where its walls are — you could walk a pace or more beyond the front of it, and through its lobby — and its floor stops at the wall.",
      "The spear is thrust, never swung: drawn back at the hip and driven straight out — on your screen, on your body, and by anyone else who carries one.",
    ],
  },
  {
    v: "1.10.2", date: "12 October 2026", title: "Heard, and seen going",
    items: [
      "Loading is heard again — every step of it, for the musket and the pistol, which had gone silent; and the bow and the crossbow have theirs: the arrow drawn from the quiver and nocked, the bow drawn creaking; the windlass ratcheting round, the string caught on the nut, a bolt laid in.",
      "The ramrod comes as it should: drawn up out of its pipes under the barrel, after the powder and the ball, turned end for end, rammed home, and slid back.",
      "Loading on the move is slower: walking, running, or cramped down in cover.",
      "A musket or pistol ball is a ball now: you see it go, a quick grey streak, slowing and falling as it flies, and it hits whatever's in its way — cover stops it. And a smoothbore is as true as it was: a hand's breadth or two at fifty paces aimed with care, much wider from the hip or running; a pistol wild past a few paces. Their shots are the same: no more luck of the dice.",
    ],
  },
  {
    v: "1.10.1", date: "12 October 2026", title: "A friend in the house",
    items: [
      "PvP finds a friend on your own network: every copy of the game that's looking keeps a little place on its own computer, hears the others', and you all meet at the same one — no address to type. (The first time, your Mac may ask whether Forester: Reckoning may accept incoming connections: say yes, on both computers.)",
      "The search takes its time — ten seconds before it says nobody's come yet — and keeps looking after that. Fight a bot instead whenever you like.",
    ],
  },
  {
    v: "1.10.0", date: "12 October 2026", title: "Powder, ball and rod", img: "art/updates/1.10.0.jpg",
    items: [
      "The musket, the pistol, the sword, the battle axe and the spear are new, and there's a dagger: shaped as they were made — a walnut stock with its dropped butt and slim wrist, the barrel half sunk in the fore-end, a flintlock with its cock, flint and steel, brass at the butt and the guard; blades forged to a ridge, a turned hilt with its knuckle bow.",
      "Loading is the drill, seen and heard: half cock, the pan primed and the steel snapped shut, the charge poured, the ball rattling down, the ramrod drawn, three strokes, the rod back, and full cock — on the screen in your hands, and on anyone else loading near you.",
      "A long arm is held in both hands, at the shoulder when aimed and slanted across the chest at the ready; the crossbow too.",
      "The loadout has a weight to it: nine in all. A musket takes most of it — beside it, only a dagger — and the lighter you go, the quicker you are on your feet.",
      "The pistol is for close work: quicker to load, but wilder, shorter in reach and lighter in the blow.",
      "With a bow, a gun or a crossbow in your hands the cross is only a dot.",
      "A man shot or cut down falls as a body falls, and what he held drops from his hands. Killed yourself, you go down with it — your eye with your head — the world reddens, and who won is written over it.",
      "Bodies on the ground aren't pushed aside by you walking up to them any more.",
      "New pictures for the musket, the pistol, the battle axe and the dagger.",
    ],
  },
  {
    v: "1.9.0", date: "12 October 2026", title: "The duel", img: "art/updates/1.9.0.jpg",
    items: [
      "PvP, from the title: one against one in a deer ride in the woods, best of three rounds. It looks for anyone else wanting a fight on the servers you know, and if there's nobody, puts you up against a bot as strong as you are — the more you win, the better it gets.",
      "A loadout to take in: a long arm (musket, bow or crossbow), a sidearm (a pistol — new — or more arrows instead), and a blade (sword, battle axe, spear or felling axe), each with its own blow, reach and pace.",
      "Everything is the game's own fighting: the musket loaded with powder, ball and ramrod, the bow drawn, the crossbow spanned, the red mark of a blow coming and the guard to meet it. Your rating and record are kept, and there are two new achievements.",
      "The update log has pictures.",
    ],
  },
  {
    v: "1.8.3", date: "11 October 2026", title: "A tap",
    items: [
      "A tap of F does the quick things — taking logs, opening the store, laying out a site — without holding it down. Felling, building and the like still want it held.",
      "The store's food is counted as it is at the top of the screen, so they agree.",
    ],
  },
  {
    v: "1.8.2", date: "11 October 2026", title: "Back",
    items: [
      "Fixed: having looked at How will you play? and come back to the saves, their Back button did nothing. It takes you back to the title again.",
    ],
  },
  {
    v: "1.8.1", date: "11 October 2026", title: "Real sounds",
    items: [
      "Frontier sounds like the world, not a game: meat and fish spit and sizzle over the town hall's fire; boots knock up the watchtower's ladder; you splash ashore out of a boat; and an alliance asked of you comes as a quiet note, not the ring of a coin.",
    ],
  },
  {
    v: "1.8.0", date: "11 October 2026", title: "How will you play?", img: "art/updates/1.8.0.jpg",
    items: [
      "A new game asks how you'll play. The Story: Hamburg, 1683, the chapters from the first. Free Play: a clearing in the woods and a cabin to raise — your own settlement from the first day, grown into a nation, with no story to it. The Frontier: an island, a continent or the whole Earth on your own — the Frontier's setup, ready for one, kept on this computer (in the desktop app); invite others later if you like.",
      "A hosted game can be for one: Players — 1, just you.",
    ],
  },
  {
    v: "1.7.0", date: "11 October 2026", title: "The crown", img: "art/updates/1.7.0.jpg",
    items: [
      "Raise a town hall in Frontier and you're crowned: King or Queen of the ground round it, with the news of it carried to everyone in the land. In a co-op colony, whoever raises the hall wears the crown, and everyone in the colony is one of its people.",
      "G opens your government — the same window as the settlement's in the story. The Nation: its name and title (King, Queen, Duke, Duchess, Elector, Margrave and the rest — proclaim a new one when you like), its people, settlers, town hall, the ground it claims, its buildings and its store. People: your governors and citizens — make a citizen a governor, or a governor a citizen, or send someone away. Invite: ask anyone here to join, as a citizen or as a governor; they answer Y or N. Realms: every nation in the land.",
      "A citizen builds on the nation's ground and keeps its store — the logs they stack are the nation's, and they can build from it. A governor can do that, ask people in as citizens, rebuild the hall and set the settlers to work. The crown does all of it, and names the governors. Fellow subjects can't hurt one another, and share their gates.",
      "Greenland lies under its ice sheet, as it does, with only a strip of bare coast round it; and the far south is ice.",
    ],
  },
  {
    v: "1.6.0", date: "11 October 2026", title: "Heavy seas",
    items: [
      "The sea isn't the same everywhere now. A lake or a sheltered bay lies calm; out from the land the swell gets up, the further the rougher. On the Earth it's the real seas: the North Atlantic and the waters round the north are rough and white-capped, the warm seas of the tropics gentle, and the Southern Ocean, far to the south, the wildest of all.",
      "A rowboat is for lakes and the coast. Take one out where the swell runs high and the seas break over the gunwale: she ships water faster than you can bail, settles lower and lower, and goes down under you — and you're swimming. Turn back in time and she drains as you bail. Out on the open ocean you need a ship from a shipyard.",
      "Fish from a rowboat: take out the rod (its number) and cast over the side, wherever you are on the water. Take up the oars and the rod goes down in the boat.",
      "Sat in a boat you're sat in it — the game no longer thinks you're swimming because the seat's below the waterline.",
      "On the Earth, the kinds of country meet along ragged, natural lines — the edge of the Sahara, the steppe, the savanna — instead of the straight edges of boxes; and each fades into the next over a good way, not at a line.",
      "Coasts by the climate: the cold shores of the north and of the far south are shingle and rock, the warm ones sand.",
    ],
  },
  {
    v: "1.5.0", date: "11 October 2026", title: "Cold and heat",
    items: [
      "A new gauge under your hunger: the cold and the heat. Out of doors in a cold country — at night, in winter, high up, and worst of all wet from the water — a snowflake's bar fills as the cold gets into you; in a hot country a sun's fills as the heat gets to you. Full, it starts to take your health; let it, and it kills you.",
      "Get warm at a fire (it dries you too), in a cave (the same cool air all the year round), or under a roof out of the wind. Get cool in the shade of a roof, in a cave, or in the water.",
      "What you wear counts. Fur and leather (the Rover) keep out the worst cold, then the long coats; but in the heat they're the worst thing to be wearing. Shirtsleeves (the Craftsman) and a working dress with the sleeves rolled (the Woodswoman) are the coolest, and a brimmed hat shades you; a fur hat warms.",
      "On the Earth it's the real climate: Lapland is cold even at noon in summer clothes, the Sahara bakes by day and is bitter at night, and the rain forest is close and hot.",
    ],
  },
  {
    v: "1.4.0", date: "11 October 2026", title: "Oars in the water", img: "art/updates/1.4.0.jpg",
    items: [
      "A new rowboat, clinker-built: five lapped planks a side, tarred below the waterline with a green top strake, a sheer rising to a sharp stem, a broad transom, ribs, two thwarts and a stern seat, rails along the gunwales and the oars in their tholes. It sits up in the water as a boat does — dry inside — and its grain is its own, not sliding over it as it moves. A rowboat now takes 6 logs.",
      "Rowing as rowing is: each stroke the blades go in at the catch, are pulled through the water, come out and swing forward clear of it. And it sounds like water — the blade going in with a gurgle and a swirl, the water running off it as it lifts, the wash along the hull growing as she gathers way, and the keel grinding on the shallows if you run her in. (No more thud of a hammer.)",
      "Fixed: a rowboat was laid with its bow to the shore, so rowing ran it straight aground; now it's laid bow out to sea, the way you face. And getting in works from wherever the game offers it.",
      "Sat in a boat you face the bow and the boat turns you with it: you can turn your head, a little past your shoulder, but not round behind you.",
      "The stump a tree leaves is that tree's own trunk: as thick as it was where the axe went through, the same bark and colour, turned the way it stood.",
      "Fixed: turning the mouse wheel with the plans open picked a building. The wheel scrolls a window that's open, and changes what's in your hand only when none is.",
      "Fixed: a click on the map, a menu or any window swung your axe or used what you held. Clicks there are the window's now.",
      "Your first town hall can be raised from the logs in your arms as well as the store — before it stands there's nowhere to stack them — and the guide says so, instead of telling you to stack them at a hall you haven't got.",
      "Stone is stone: rocky slopes and the rock of a quarry or a mine wear a rock's own grain, not a mason's wall of blocks; a field's soil is earth; a knapped stone axe is stone. The meadow's flowers no longer speckle the grass pink.",
      "The waypoint's marker on the screen costs next to nothing to draw now.",
    ],
  },
  {
    v: "1.3.2", date: "11 October 2026", title: "Name and username", img: "art/updates/1.3.2.jpg",
    items: [
      "Over each player's head, their roleplay name, and under it, small and grey, their username — and the same in Who's here (Tab).",
    ],
  },
  {
    v: "1.3.1", date: "11 October 2026", title: "Who you are", img: "art/updates/1.3.1.jpg",
    items: [
      "A username: the first time you open the game it asks what you'd like to be called by other players, and keeps it. It's who you are online — people invite you to their games by it (in Invite when hosting, or /invite username in the talk) — and it never changes when you play under another name. Change it on purpose from the multiplayer screen.",
      "And a roleplay name for each game: going into a game, the character builder asks who you play this time. Call yourself anything, as often as you like — your invitations still find you. Who's here (Tab) shows each person's name with their username beside it.",
      "Settings: Chat size — Normal, Large, Larger or Largest, for the talk in multiplayer.",
      "Plaster walls are never quite even now: clouds of the wash paler and dingier, and mended patches. Banners and flags are woven cloth, and shingle roofs lie in rows, not a grid.",
    ],
  },
  {
    v: "1.3.0", date: "11 October 2026", title: "Within the walls",
    items: [
      "Real textures on everything: every wall, roof and floor now wears its own stuff from photographs — brick in its courses with the mortar pale between, stone walls of odd-coloured stones, the boards of a plank wall with their seams and knots, logs with their grain running along them, plaster with its stains, roof tiles row on row, bark, cloth and needles — in the story and the Frontier alike. And the ground under your feet: grass where it's green, leaf litter in the woods, bare earth on the paths and the yards, rock on the steeps.",
      "Fixed: a building you can walk into had lost all of its texture, its walls, roof and floor all drawn alike in plain paint.",
      "The town hall stands at its full size from the first: a log hall with its clock tower, then timber, plaster and brick as you rebuild it. In through its door — a real doorway now, the door stood open on its hinges in a frame of dark timber — and inside: a long table with its benches, the reeve's desk at the far end with the ledger open on it, the store's great chest by the wall (open the store there), barrels, a lantern over the table, and your banner on the back wall.",
      "A house within has its beds along the walls, a table and stools, and a stone fireplace with a pot over the fire; a forge has its brick hearth with the coals aglow, the anvil on its block, the quench barrel and the smith's tools on the wall. Every one has a real doorway to walk through.",
      "Every building stands on cleared ground: no tree grows up through a floor or in front of a door any more, nor a rock in the way, and each has its yard of bare, trodden earth round it and out before the door. Settlers don't go felling the trees that were cleared for a building.",
      "The walls you walk against are each building's own walls, measured from the walls themselves — the grandest town hall and some of the settlement's buildings used to be measured by their posts and trim, and came out wrong.",
    ],
  },
  {
    v: "1.2.1", date: "11 October 2026", title: "In at the door", img: "art/updates/1.2.1.jpg",
    items: [
      "In the story too, walk into the settlement's buildings, in at the door: the bakery, the sawmill, the brickworks, the smelter, the forge, the town hall, the church, the jail, the hospital, a settler's shop.",
      "Every doorway is where the building's door is, even on one whose oven or lean-to stands out to the side.",
    ],
  },
  {
    v: "1.2.0", date: "11 October 2026", title: "The town hall", img: "art/updates/1.2.0.jpg",
    items: [
      "Frontier: the hearth is a town hall now — a small log hall to begin with, still only ten logs from the store — with its fire out in front and your banner beside it. Rebuild it grander as you go (hold F at its door): a timber hall, then timber and plaster, then brick, each from the store, and each claiming more ground round it.",
      "Walk into the town hall, a house or the forge: in at the door, boards under your feet.",
      "The store is a proper menu, as the story's store chest is: what the store holds, and what you carry — click a thing to take it out or put it in. Logs come out an armful at a time, stone five at a time, and the settlers' food as provisions, ready to eat.",
      "Cooking, as in the story: hold F at the town hall's fire to roast the fish you've caught and the meat of a beast you've brought down. Roast meat is eaten from your pack (T, click it) and mends you; raw food is a little, and brings the fever.",
      "Hunger, as in the story: it falls as you go, and when it's gone it wears your health down till you eat.",
      "Fixed: putting fish in the store took logs out of it instead.",
      "Fixed: the hand on the screen is the colour of the rest of you — it was a shade lighter, being drawn without the shading painted into the body.",
      "The hats are the game's own now — a burgher's hat, a woodsman's, a gentleman's, an apprentice's cap, a watchman's, a tricorn, a fur hat, a bonnet, a goodwife's cap, a watchwoman's — any of them on any outfit, made as the outfits' own are.",
    ],
  },
  {
    v: "1.1.0", date: "11 October 2026", title: "Dressed for it", img: "art/updates/1.1.0.jpg",
    items: [
      "The character builder has outfits now, not just colours: for men the Burgher, Woodsman, Craftsman, Apprentice, Gentleman (the long coat of a man of standing), Watchman (the city's coat and sash) and Rover (fur and leather); for women the Burgher's wife, Woodswoman, Goodwife and Watchwoman. Every one in the colours you choose — coat, breeches or skirt, waistcoat, sash, shirt, stockings.",
      "Hats to choose from, made for the time: a tricorn, a broad felt hat, a tall capotain, a plumed cavalier's hat, a knitted cap, a straw hat, a fur cap, a linen coif or a kerchief — or the outfit's own, or none. Each is fitted to the head it's on, turns with it, and comes in your colour.",
      "Settlers coming to live with you dress as working folk: no watchmen's sashes or rovers' furs among them.",
    ],
  },
  {
    v: "1.0.0", date: "11 October 2026", title: "Out of your depth",
    items: [
      "Swimming, properly. Out of your depth you swim: laid along the water with your head up, the arms in a breaststroke — out together in front, a wide sweep, drawn back in — and the legs in a frog kick. In first person you see your own two arms stroking; everyone else sees you swim. Your axe or bow goes on your back while you're in the water, and comes back to your hands on the shore.",
      "The water takes your strength fast, and gives none back till you're out: the bar drains as you swim (faster with a hard stroke, Shift; slower treading water). When it runs out you go under — everything goes dark — and you come to on the last dry ground you stood on, spent and coughing (and a little hurt, in the story).",
      "A swimmer rides the swell, rising and falling with the waves.",
      "The English Channel is open sea again, wide from the Scillies to the Narrows of Dover: England is an island, as it should be.",
    ],
  },
  {
    v: "0.99.8", date: "11 October 2026", title: "The wide world, told true",
    items: [
      "The lobby describes the wide world as it is now: the whole Earth at its full size, forty kilometres across, every continent, sea and mountain range where it lies.",
    ],
  },
  {
    v: "0.99.7", date: "11 October 2026", title: "Mouths in the hills",
    items: [
      "A cave's hill is the colour of the country round it — sand in the desert, dry grass on the savanna, snow up high — not always green moss.",
      "Caves open onto dry ground you can walk up to, never straight onto the sea.",
    ],
  },
  {
    v: "0.99.6", date: "11 October 2026", title: "Degrees and leagues",
    items: [
      "On the big map (J), the pointer tells you where it is: on the Earth its latitude and longitude and the kind of country there (\"54°N 8°E · the sea\"), on any other land the country.",
      "The map's scale bar grows with the view: fifty paces close in, then a thousand paces, a league, five leagues, a hundred leagues across the whole world.",
      "The game's name card no longer sits over the corner of the big map.",
    ],
  },
  {
    v: "0.99.5", date: "11 October 2026", title: "Where you are",
    items: [
      "Frontier: cross into new country and its name comes up — the taiga, the broadleaf woods, the high meadows, desert — and on the Earth, the great feature of the land you're in: \"The taiga — Siberia\", \"Desert — the Sahara\", \"Rain forest — the Amazon\". You're told where you've begun, too, when you arrive on the Earth.",
      "The Earth's great grasslands are open grass now, as they should be: the prairies of the Great Plains, the pampas, the steppe of the Ukraine and of Tartary.",
      "The welcome on the Earth says you're on the Earth (it said lake country).",
    ],
  },
  {
    v: "0.99.4", date: "11 October 2026", title: "A quicker look",
    items: [
      "The big map (J) opens and redraws in a moment on a large land: it used to stall the game for a third of a second every time it was drawn on the Earth, looking for buildings square by square across the whole world.",
    ],
  },
  {
    v: "0.99.3", date: "11 October 2026", title: "Solid ground",
    items: [
      "Fixed: anything standing on low ground — a building in a hollow, a tree in a valley, a rock by a lake — could be walked straight through. Everything that's solid is now solid however low or high it stands.",
      "Fixed: out in the forest of the story, away from the road, you could walk straight through the trees. Every trunk in the woods is solid now.",
      "Fixed: the settlement's buildings are solid exactly at their own walls, at whatever angle they were set down. You used to walk a metre into some walls and stop short of others; now you come right up against them, and round their corners. Your people keep a little off them as before.",
    ],
  },
  {
    v: "0.99.1", date: "11 October 2026", title: "Out of its depth",
    items: [
      "A horse won't swim out of its depth: ridden into the sea or a lake, it stops where the water's up to its belly and won't be driven further. Get down (X) to swim, or ride round.",
    ],
  },
  {
    v: "0.99.0", date: "11 October 2026", title: "Horseback",
    items: [
      "Frontier: build a stable (B; sixteen logs and four stone) — a lean-to with two stalls, hay, and a horse standing in it. At its open front, F to take the horse out and ride: better than twice as fast as walking, which on the big Earth is the difference between an afternoon and a week. X gets you down anywhere and the horse finds its own way home; or F at the stable to put it back in its stall.",
      "Everyone sees you on horseback: up in the saddle, the horse under you going at your pace.",
      "The big map of a large land is drawn a few rows at a time in the background while you play, so the first look at it no longer freezes the game for a second.",
      "The sea names on the world map sit out in open water now, clear of the coasts and the edge of the sheet.",
      "Behind the scenes: if the server ever fails over one thing a player does, it writes it down and carries on — it used to hang up on that player without a word.",
    ],
  },
  {
    v: "0.98.1", date: "11 October 2026", title: "Rock and bough", img: "art/updates/0.98.1.jpg",
    items: [
      "Frontier: the rocks are solid where the rock is — their own lumpy outline as they sit on the slope, not a circle round them — so you come right up against the stone, and don't stop short of it in thin air.",
      "Scots pines have a proper crown now: a flat-topped head and boughs standing out under it, each a cloud of needles, instead of one blob on a pole. Oaks are broad, low-crowned and thick in the bole.",
      "The caves you've come across are marked on the map, a dark arch in the hillside.",
      "Someone down a cave is out of sight of those up top, name and all — and those up top of them.",
    ],
  },
  {
    v: "0.98.0", date: "11 October 2026", title: "Under the hill",
    items: [
      "Frontier: caves, on the Earth and on every other land. Here and there a mouth of rock in a hillside, facing down the slope; walk into it and you're in a warren of great halls and tunnels deep under the hill, dark but for your lantern and a few old torches. Seams of good stone in the walls give twice what a rock up top does (the pickaxe), and the cave has its own map (J) of the halls you've stood in. Walk out into the daylight at the end of the first hall.",
      "Down a cave, the world up top can't reach you: no beast comes for you there, no one above can strike you, and your axe won't fell the trees over your head.",
      "Frontier: the Earth is far bigger — eight, twelve or eighteen kilometres across (small, middling, large), up from under five.",
      "The mountains are jagged now: knife-edged ridges breaking into teeth, crags on the crests, the valleys smooth between.",
      "The sea stands higher up the shore, and the Earth's coasts wander in bays and points instead of running square along the old grid.",
      "Zoomed in on the big map (J), the land is drawn again at the scale you're looking at, piece by piece: every wood, contour and cove sharp, however close you go — and on a big land, you can go a good deal closer.",
      "Fixed: the walls of buildings in Frontier were solid in the wrong places when a building stood at a slant — invisible corners you bumped on and gaps you could walk through. They're now exactly the building's own walls, at any angle (and they're drawn turned on the map too).",
      "Fixed: trees on high ground could be walked straight through. Every trunk is solid now, however high up the hill.",
    ],
  },
  {
    v: "0.97.0", date: "11 October 2026", title: "By invitation",
    items: [
      "Hosting a game, choose who may join: Public, for anyone who finds it, or Private, for only the people you invite. Put their names in Invite, with commas between.",
      "A private game is only on the list for its host and the people invited — marked Invited, and at the top — on the internet and on your own network alike. Nobody else sees it, and nobody else can join it.",
      "The host can invite more people while the game goes on: /invite Name in the talk (or several: /invite Ann, Bert).",
      "A private game with invitations out stays on the server for twelve hours after the last person leaves, not ten minutes, so the people invited can still come.",
    ],
  },
  {
    v: "0.96.0", date: "11 October 2026", title: "Boats and ships",
    items: [
      "Frontier: build a rowboat (B; eight logs from the store) and lay it on the water by the shore. F to get in, W to row, S to back water, A and D to pull round, and F to step ashore when you're in by the land. It rides the swell, and its oars swing as you row.",
      "Frontier: build a shipyard — a great slipway running down into deep water, the ribs of a hull on it, a timber shed and a crane — at the water's edge, its front to the water. At it, hold F to build a ship (120 logs and 20 stone from the store): a two-masted ship of the day comes off the slipway. Take her helm and sail: W to make sail, A and D to steer, far faster than any rowboat. Up to seven others can come aboard as crew, and go where she goes; F to go ashore when she's in close.",
      "The boats are the server's, so everyone in the game sees them on the water, and sees them move; they're kept with the world.",
    ],
  },
  {
    v: "0.95.0", date: "11 October 2026", title: "Waymarks and swell",
    items: [
      "Right-click anywhere on the big map (J) to set a waypoint there. A tall beam of light stands up out of the place, seen from far off; a red flag on the screen shows the way and how far; and it's on the map and the minimap too. Right-click it on the map again to take it away. It goes when you get there.",
      "The water moves: long swells roll across the sea and the lakes in Frontier, lifting and dropping the surface, catching the light, with white water breaking on the crests of the bigger ones — more in a wind, more again in the rain. The pond in the woods has its own gentle swell, and the ducks and your fishing float ride it.",
      "The animal shapes have been tidied: a kangaroo's tail rests on the ground behind it, and a fox's and a wolf's hang back as they should.",
    ],
  },
  {
    v: "0.94.0", date: "11 October 2026", title: "The beasts of the world",
    items: [
      "Frontier's land is alive: wild beasts all round you wherever you go, a dozen and more in sight of any player, in herds where they go in herds. The server keeps them, so everyone in the game sees the same ones.",
      "Each country has its own. On the Earth map, where they really live: beavers by the northern rivers, moose, wolves and bears in the taiga of Canada and Russia; bison on the American plains; lions, zebras, antelope, elephants and giraffes on the African savanna; camels in the deserts; kangaroos across New Holland; tigers in India and the Indies, jaguars, monkeys and capybaras in the Amazon; reindeer and musk oxen on the tundra, polar bears on the ice, and penguins in the far south. On the other maps, by the kind of country: deer, boar and hare in the woods, wild horses on the steppe, ibex in the mountains.",
      "They graze and wander, hear you coming (less if you creep), and bolt with their herd. Lions, tigers, jaguars, wolves, bears and elephants don't always run: get close and they may come for you.",
      "Everyone in Frontier has a bow and two dozen arrows. Bring a beast down and hold F to dress it: its meat goes into your pack, food for the store at the hearth.",
    ],
  },
  {
    v: "0.93.0", date: "11 October 2026", title: "Every kind of country",
    items: [
      "Frontier's land has biomes now, each with its own ground, its own grass and its own trees: ice and tundra, the taiga, heath, broadleaf woods, steppe, maquis, desert, savanna, rain forest, marsh, and the high meadows above the tree line.",
      "On the Earth map they lie where they really do, from the latitude, the height, the rain belts and the deserts: rain forest in the Amazon, the Congo and the Indies, savanna across East Africa and the Sahel, desert in the Sahara, Arabia and the Gobi, broadleaf woods in Germany, maquis round the Middle Sea, taiga across Siberia, tundra and ice toward the poles. On the other maps the land is warmer and colder, wetter and drier across it: woods, heaths, meadows, marshes and mountains.",
      "New trees for them: the oak with its broad round crown, the savanna's flat-topped acacia, the rain forest's tall giants, palms on warm shores and round oases (with their fronds drooping), and grey-green desert scrub. Each fells, and leaves its own stump.",
      "The map shows the biomes, washed in as a map-maker would.",
      "The Earth map no longer has the realms of 1683 lettered on it: there are no nations on it. It's lettered with the great features of the land instead — the Sahara, the Himalaya, the Amazon, the Steppe, the Rocky Mountains — and the seas.",
      "On an Earth map, before you've a homestead, you're asked where in the world you'd like to begin: click anywhere on land, and you start there.",
      "The Wide World is the Earth at its full scale: forty kilometres across. A world already saved is laid out again at the new scale, with everything built where it stood on the globe.",
      "A birch's logs are white, as its bark is.",
      "Swinging the pickaxe, your second hand stays on the haft with the first, at its end, all through the stroke.",
    ],
  },
  {
    v: "0.92.1", date: "10 October 2026", title: "The angler's rod",
    items: [
      "The fishing rod is a 1600s angler's rod: a long, slender rod of hazel in four lengths whipped together with thread, a leather grip, no reel, and a horsehair line tied to its top. It bends in an arc all along its length with a fish on it, not at one joint.",
      "No float, as in the old way of it: a bare hook with a worm on it. Watch the line where it goes into the water. A nibble twitches it; when it's drawn away under and the top of the rod pulls down, strike.",
      "A tree falling keeps its texture: the bark's grain no longer slides over it as it tips and comes down.",
      "Each kind of tree leaves its own stump. A spruce's is dark red-brown and scaly, with shallow roots spread out. A pine's is thick-plated, grey at the foot and fox-orange above, the cut beaded with resin and a drip run down the side. A birch's is slim and low, white with black marks, its bark peeling back in curls, the cut pale and often dark at the heart.",
    ],
  },
  {
    v: "0.92.0", date: "10 October 2026", title: "Lines in the sea",
    items: [
      "Frontier has fishing: everyone has a rod (its number takes it out). Stand at the edge of a lake or the sea, face the water, and click to cast; strike when the float goes right under, and play the fish in. What you catch goes into your pack, two food a fish, to put in the store at the hearth for your settlers. It's the same fishing as at the settlement's pond.",
      "Tested in a game with two players, with the real keys and clicks: a guest fells a tree, takes the logs, adds them to the host's building site, breaks a rock into their pack and empties it at the hearth; and in a co-op colony, a guest takes logs from the stack and adds them to the host's site.",
    ],
  },
  {
    v: "0.91.1", date: "10 October 2026", title: "Into your pack",
    items: [
      "Frontier: what you gather goes into your own pack, not straight into the stores, as in the settlement. Stone from the rocks, and what you loot from a fallen player's sack, ride on your back (T shows them) until you empty them into the store at the hearth or a woodshed (F there: \"Put in the store\"). A site raised takes its stone from the store first, then from your pack. Fall, and it's what's in your arms and your pack that spills, not your stores at home. Logs you hand to someone come out of your arms.",
      "Adding logs to a building site works again, in Frontier and at the settlement's own sites: the site's F wasn't being counted, so it never finished. Tested by carrying logs from the store to a woodshed's site three times and raising it.",
      "A building site no longer shows a pale ghost of the building. It's laid out as in the settlement: stakes at its corners with a cord between them, a sign of what it has and still wants, and the logs heaped beside it. No grass grows inside the cord.",
      "Every stump is its own: as thick as the tree was, with its kind's bark (a birch's white, a spruce's dark red-brown), cut on a slant with its growth rings showing, a fringe of torn splinters where it broke over, its roots running into the ground, and moss on some.",
      "The axe sounds like an axe going into a tree: a short, dull thwack with the crunch of the cut fibre and a slap back off the trees, not a ringing knock.",
      "No more being spun round: the browser now and then reports one false, enormous movement of the mouse just as it's locked, or as the window comes back into focus, and that turned you round in an instant. Those are ignored now.",
    ],
  },
  {
    v: "0.91.0", date: "10 October 2026", title: "Rod, pack and bow",
    items: [
      "Fishing wants a rod. The first time you come down to the pond, your brother or sister hands you one and tells you how (and you can make another at the chopping block from a log). Take it out with its number, or F on the shore.",
      "Fishing is done with your own hands now: click to cast, and the float flies out and lands with a plop. Watch it: a nibble only dips it. When it's pulled right under, click at once to strike. Too soon or too slow, and the fish is off with the bait. Struck in time, the rod bends, the perch thrashes on the water as you play it in to the bank, and it swings in on the line, flapping, into your pack. Right-click reels in.",
      "Your pack is a grid now, as in Diablo: every thing takes the room it takes. An axe is two squares by two, the bow and the rod one by four, a fish one by two, a pile of stone one square (a dozen to it). Your tools, the bow and its arrows sit in the grid with everything else. Drag a thing to move it; drop it on another to change them over. A sack gives ten by four; a backpack from hides, more.",
      "Settlers whose work is hunting really hunt: out to the deer ride with a bow, a beast picked out and stalked, the bow drawn and a real arrow loosed. If it falls, they dress it where it lies and carry the meat and the hide home; if they miss, it bolts, and they try again.",
      "Things sound as they would: putting something in your pack is the flap lifted and the thing sliding in against canvas, with the buckle's clink, and taking something out the same the other way. Drinking is swallows, not chewing. A pot coming to the boil bubbles. The float's plop, a fish's splash, and the swish of the line are all their own.",
      "You're told how to boil water: the guide on thirst says so (hold F at any lit fire to boil a pot), and your brother or sister reminds you when you're parched.",
      "New pickaxe pictures: the head is fixed on the haft, as a pickaxe's is, and each one shows what it's made of.",
    ],
  },
  {
    v: "0.90.0", date: "10 October 2026", title: "Notches and quilts",
    items: [
      "Every stroke of the axe leaves a notch in the trunk, at waist height on the side you're at, cut a little deeper each time.",
      "The well's roof sits on its posts now, on a ridge pole across their tops. It had been turned crosswise and floated over the well.",
      "Boulders and the rocks you break look like rock, rough-grained with specks and hairline cracks, not like a mason's wall of squared stones.",
      "Beds look like beds: a frame of peeled logs with corner posts and a railed headboard, a fat straw tick, a thick wool quilt with a sheet turned down over it, and a plump pillow. Straw pallets have a striped wool blanket. All of the bedding is drawn as cloth, not as wood.",
      "What you hold in your hands keeps its own grain. Before, the axe's haft and the rest seemed to slide through their texture as you turned.",
      "Settlers swinging an axe swing from the shoulders, not wrung round at the waist.",
      "Swinging the pickaxe, your hands stay at your chest and the head goes back over your shoulder. Your arms no longer fly up into the air.",
      "You hew a door at the sawhorse with the logs in your arms first, and only then from the stack.",
      "Once there's a woodshed, the old stack's ground by the cabin is free to build on. It had still kept buildings off it after the stack was gone.",
      "B puts away a piece of furniture you're placing in the cabin, as Escape does.",
      "You can't walk about in the middle of a scene, such as sitting at the fire. A menu opened and closed during a scene used to let you go.",
      "M twice now gives you back the mouse properly. Taken again too soon after letting go, the lock used to be refused, and you were left turning with a cursor that stopped at the edge of the screen.",
      "The brook runs smoothly out of the pond and into its pool. It used to kink at its bends and to start out of nothing, short of the pond.",
      "Grass keeps further off the paths and the road.",
    ],
  },
  {
    v: "0.89.2", date: "10 October 2026", title: "The right tool",
    items: [
      "Frontier gives you a wooden pickaxe as well as the axe (2 takes it out), and the grey rocks are broken with it, as in the settlement. Swing the axe at a rock and you're told to take out the pickaxe; swing the pickaxe at a tree and you're told to take out the axe.",
      "A bow you've made yourself is called your hunting bow, not Henning's old bow.",
    ],
  },
  {
    v: "0.89.1", date: "10 October 2026", title: "Your own things",
    items: [
      "A guest in someone's co-op colony keeps their own things between visits: the tools they've made, the bow and arrows, what's in their pack and their own chest, their skills, and their purse. They're kept on the guest's computer for that host's colony, and given back on joining again. Before, a guest started with nothing every time.",
    ],
  },
  {
    v: "0.89.0", date: "10 October 2026", title: "Shot across the field",
    items: [
      "Bows, crossbows and muskets count in Classic battles. Leading the attack on someone's settlement, your arrows, bolts and balls strike its defenders: the settlers standing to it, and its ruler. Come to an ally's aid, they strike the raiders. A shot to the head counts double, as always.",
      "Frontier: a building site offers something only when there's something to do: add the logs you carry, or, when it has all its logs, hold F to raise it. The heap of logs beside it shows how far along it is.",
      "Frontier: a site can be taken down by whoever laid it out (or the host, in co-op). Swing at it twice, and the logs already brought are left on the ground.",
    ],
  },
  {
    v: "0.88.0", date: "10 October 2026", title: "The host's word",
    items: [
      "Everyone in a co-op game can lay out buildings again (B), in a colony and in Frontier. The running of the settlement stays the host's: the government, research, sending for people, jobs and laws, and who works which field. In Frontier, whoever put a building up, or the host, can take it down.",
      "The host can send someone away or ban them. Esc, then People here (Tab in Frontier), lists everyone in the game, with Send away and Ban beside each name for the host. In the talk, the host can also type /kick, /ban or /unban and a name. Someone sent away can come back; someone banned can't, until the host unbans them.",
    ],
  },
  {
    v: "0.87.0", date: "10 October 2026", title: "Logs to carry",
    items: [
      "In Frontier, felling and building work as they do in the settlement. A felled tree's logs lie where it comes down. F takes them up, six in your arms at most. Stack them at the hearth or a woodshed (F there), or take logs back out of the store there to carry somewhere.",
      "Every building but the hearth is laid out as a site: a pale frame with its corner posts and its ground outlined. Bring it its logs (F to add what you carry; the heap beside it grows as they come). When there are enough, hold F to raise it, and any stone it needs is taken from the store then. The hearth is still lit at once, from the store.",
      "Your settlers bring the logs they cut to any site that wants them before they take the rest to the store, as the settlement's haulers do.",
      "Frontier's goals say how: lay it out, carry its logs to the site, hold F to raise it. In co-op, a guest is asked to help the host build rather than to press B.",
    ],
  },
  {
    v: "0.86.0", date: "10 October 2026", title: "The host's settlement",
    items: [
      "In co-op, the settlement is the host's, and the host runs it. In a colony, only the host lays out plans (B), opens the government (G), researches, sends for people, sets jobs and laws, and takes buildings down. In Frontier co-op, the host places the buildings, takes them down and says who works where. Guests fell, carry, help raise what's planned, hunt, fight, and make their own tools. If a guest tries something that's the host's to do, they're told so.",
      "Looking at a building offers only what can be done there: climb a watchtower, trade at a market, open or shut a cabin's door, or put someone to work a field. The descriptions that came up as if F would do something are gone.",
      "Frontier: look at a field and press F to choose which of your people farms it. They keep to it until you let them go, and the others go where they're wanted.",
      "Frontier: you can go into a cabin you've built. F at the door swings it open on its hinges, and the walls have the doorway in them as the clearing's cabin does.",
      "Frontier: the logs, stone and food at the top show the same pictures as the settlement's, just under the objective.",
      "T opens the inventory in Frontier again. Enter is for talking.",
      "Hints that send you to break stone first tell you to make a pickaxe (two logs at the chopping block) if you haven't one.",
    ],
  },
  {
    v: "0.85.1", date: "10 October 2026", title: "A word in the ear",
    items: [
      "Every line that goes up in the multiplayer talk is heard: a slip of paper and a light tap when someone says something, and a softer slip for the game's own notices (someone coming or going, going to bed, a settler on the way). No musical notes. It's in every mode, and the interface sounds setting turns it off with the rest.",
    ],
  },
  {
    v: "0.85.0", date: "10 October 2026", title: "The same plans",
    items: [
      "Frontier's build menu (B) is the settlement's own Plans window: the same parchment, the same rows with their pictures, what each is for and what it costs, and greyed out when you're short (with how much short).",
      "Placing a building in Frontier is as it is in the settlement. The building itself is shown pale green where it will stand (red where it won't do), with its ground outlined. Hold R to turn it smoothly (Y the other way), click or F to set it, and B to put the plan away. A palisade keeps the angle of the last length you laid.",
      "Settlers in Frontier come out of the woods, from fifty or sixty paces off, and walk in to the hearth. They no longer appear beside it. You're told when one is on the way.",
      "The hammer's face strikes the work now, not the back of its head, in your hands and on your body.",
    ],
  },
  {
    v: "0.84.4", date: "10 October 2026", title: "In harm's way",
    items: [
      "In a co-op colony the raiders fight the guests too. One squares up to a guest who comes near, just as one does to the host, with the red mark as he winds up. The blow is taken in the guest's own game, so a guest's guard blocks and parries it. A parry throws him off his stroke in the host's game. A guest who is down is left alone till they're up.",
      "A blow struck by a guest turns that raider on the guest, not on the host across the clearing.",
      "The box with the game's name (and in Frontier, your logs, stone and food) has moved down to the bottom-left corner. It no longer covers the objective.",
    ],
  },
  {
    v: "0.84.3", date: "10 October 2026", title: "A place by the fire",
    items: [
      "In a co-op colony, anyone can bed down for the night by a lit fire or in any cabin the colony has built (F there, at night). The cabin's one bed is no longer the only place to sleep, so a guest always has somewhere, and the night passes once everyone's lying down.",
      "A guest's arrows and musket balls strike the host's raiders: the hit counts in the host's game, a shot to the head double, and the raider goes down for everyone.",
    ],
  },
  {
    v: "0.84.2", date: "10 October 2026", title: "Everyone to bed",
    items: [
      "Sleeping works in a co-op colony. Before, a guest going to bed was done in the host's game: the host's screen went dark and the host was moved to the bed, while the guest got nothing. Now each of you goes to bed on your own (F at a bed, at night). The screen dims and you wait, and everyone is told who's in bed (\"Guesty has gone to bed, 1 of 2\"). When the last of you lies down, the night passes for everyone and you all wake in the morning. A step gets you up again if you change your mind.",
    ],
  },
  {
    v: "0.84.1", date: "10 October 2026", title: "Heard across the room",
    items: [
      "The multiplayer list now really finds games hosted on other computers on your network. Its listening was cut off the instant it began, so only your own games, and ones you'd typed an address for, ever showed up. Now it listens for a couple of seconds each time it looks, every few seconds while the list is open.",
    ],
  },
  {
    v: "0.84.0", date: "10 October 2026", title: "Side by side",
    items: [
      "Co-op colonies: what your friend does is told to them, not to you. Before, a message that came a moment after their action (a hide laced, a drink, a find) turned up on the host's screen. The host's own character also stopped to do their work, and the host's pack and thirst were used for it. Now all of it is theirs: their pack, their work, their messages.",
      "Co-op: chests, the chopping block, the kitchen, the traders and the news stand open on the screen of the person who used them. Before, they opened for the host. What you take from or put in the stores is counted as added or taken, so two people at the stores at once both count.",
      "Co-op hunting works for everyone. Guests now see the host's deer, hares and boar moving as they do there, and the beasts hear guests walking. A guest's arrow brings the beast down in the host's game, and the guest dresses it (F) for their own meat and hide.",
      "A hunting bow can be made at the chopping block from two logs, and arrows from a log and a stone (a dozen at a time), so you can hunt without the story's bow. The canteen is two logs now.",
      "At any lit fire you can boil a pot of water and drink it (F when you're thirsty). It never makes you ill.",
      "In co-op, the objective has a second line just for you: the next thing you should do, with the key to press. Drink, eat, make a bow, make arrows, make a canteen, help raise the building that's going up, tan a hide or go hunting.",
      "The tanning rack has a front. The flesh side of the hide faces it, and the stool, the scraping beam and the vat of bark liquor stand there on trodden ground. Behind it are only the frames, the props and the dark back of the hide. You work it from the front.",
      "No more wildflowers in the grass.",
      "The multiplayer list finds games on your network by itself, looking again every few seconds while it's open, without flickering.",
      "Your arms in first person are the colour of the character you built, skin, sleeves and cuffs. Before, they were always the default.",
      "The old chiptune sounds left over from the first Forester are gone: the beeps on buttons, the chirping birds and the buzzing insect loop. In their place there are crickets at night, crows by day and owls after dark. In the game itself, the menus' sounds are a rustle, a knock or a quill, never musical notes. The lobby's music stops when you go into a game.",
    ],
  },
  {
    v: "0.83.0", date: "10 October 2026", title: "Black powder",
    items: [
      "Musket and cannon smoke has been made again to behave like black powder. Each shot throws a dense white jet out of the muzzle that brakes hard within a couple of paces and rolls over into a lumpy cloud, lit on top and grey underneath. It hangs there, swelling and thinning, lifting a little and drifting off down the wind until it's a haze you can see through, and then gone.",
      "A musket's smoke lingers for several seconds, and a little puff goes up out of the flintlock's pan. A cannon's lingers for the better part of half a minute, leaving a wide, faint haze over the ground and a wisp from the touch-hole.",
      "The flash is now a burst of light and a spray of sparks, there and gone. Muskets no longer make a new light for it, which could stall the game for a moment.",
      "The smoke is dimmed to the light there is, so it doesn't glow at dusk or at night.",
    ],
  },
  {
    v: "0.82.0", date: "10 October 2026", title: "Sworn to come",
    items: [
      "Allies come to each other's defence in Classic. When a nation is attacked, every one of its allies who's playing is told, with a call to arms in the nations screen (N). Press Go to their aid and you ride into your ally's settlement, as their game has it, while the raid is on.",
      "There you fight beside their people. Your blows are drawn back a moment and land on whichever raider is in front of you, and you appear to them by their fire with your name in green over your head. When the raiders are beaten off you go home, with your ally in your debt. Press N twice to go home sooner.",
      "A battle can have more than one guest now. A ruler leading the attack and the allies come to stop them are all in it together, and each sees the others.",
      "The game's tutorial cards no longer pop up in someone else's settlement in the middle of a fight.",
    ],
  },
  {
    v: "0.81.1", date: "10 October 2026", title: "Every newcomer",
    items: [
      "The roughly one-in-seven chance that a newcomer brings an illness with them now applies however a settler arrives. Before, it only covered someone coming up the road to your first settlement. Now it also covers someone sent for to a settlement out in the forest, and the gunsmith from Suhl.",
      "You're told who has brought what, and where, so you can keep them apart.",
    ],
  },
  {
    v: "0.81.0", date: "10 October 2026", title: "A clearer front door",
    items: [
      "The title menu has been rearranged. The three things you came for are large and first: Continue (with your game and save under it), New Game and Multiplayer.",
      "Everything else (Chapters, Saves, Achievements, Settings, Controls, What's new, Credits and Quit) sits in a neat grid of smaller buttons beneath, all in one style. Before, eleven buttons were stacked in a column in two different styles.",
      "A soft shadow behind the menu keeps it readable against the painting, and the buttons lift as the pointer passes.",
      "The menus work from the keyboard: the up and down arrows move between buttons, with a clear outline on the one that's chosen, and Enter presses it.",
    ],
  },
  {
    v: "0.80.0", date: "10 October 2026", title: "Something to aim for",
    items: [
      "Objectives in multiplayer's Frontier games. The board in the corner now leads you through making a homestead, one thing after another, with how far along you are. Fell your first logs, then raise a hearth, a cabin, your first settler, a field, a woodshed, stone, a palisade and gate, a watchtower, six settlers, a forge, an alliance or a claim war, and finally twelve settlers.",
      "Each one done is called out with a chime, and the next goes up on the board.",
      "Co-op colonies and Classic nations already had the full game's board, and still do.",
    ],
  },
  {
    v: "0.79.0", date: "10 October 2026", title: "Colours",
    items: [
      "Custom flags for nations in Classic. Open the nations screen (N) and press Make your flag. Choose a field and a second dye from the period's dyes, a pattern (pale, fess, bend, chevron, quartered, saltire, cross, border, chequy, stripes or wavy) and an emblem (a crown, a tower, a stag's antlers, a key, a star, a ship and twenty more). Watch it take shape, or press Something else for a fresh one.",
      "Raise it and it flies from a tall pole by your fire, the cloth rippling in the wind.",
      "Every other nation sees your flag beside your name, and when you march on someone, their flag flies over their settlement.",
    ],
  },
  {
    v: "0.78.0", date: "10 October 2026", title: "The woods, heard",
    items: [
      "Stronger ambience. The forest now has a sound of its own. The wind in the leaves comes and goes in gusts and moves from one side of you to the other, and it's quieter in winter's bare woods and muffled once you're indoors.",
      "Real birdsong, each species singing its own song from somewhere among the trees: the blackbird's fluty phrases, the chaffinch's tumbling trill, the great tit's 'tea-cher, tea-cher', the wood pigeon's soft coo-COO-coo, crows, and the cuckoo in spring and summer.",
      "There's a full chorus at dawn that thins through the day and falls silent at night. Birds are fewer in winter and in the rain.",
      "When the wind gets up, old trunks creak somewhere nearby.",
      "It plays in the woods and in multiplayer's open country, not in the caves or the city. The Ambient sounds setting still turns it off.",
    ],
  },
  {
    v: "0.77.0", date: "10 October 2026", title: "The sounds of the screens",
    items: [
      "Every button now answers with a short, dry wooden tick, and a softer one when the pointer finds it. A greyed-out button gives a low double knock instead.",
      "Books and boards open and close with a pair of plucked notes: the inventory, the plans, the guide, crafting and the rest.",
      "A new task on the board is heard as well as seen: the scratch of a quill and two chimed notes. It won't sound more than every twenty seconds or so, because free play's advice changes often.",
      "Making something at the chopping block rings bright. A skill rising gives three notes, and every tenth level, and every achievement, gets a little fanfare.",
      "All of it is made in code like the rest of the game's sound, and follows your volume and the mute.",
    ],
  },
  {
    v: "0.76.0", date: "10 October 2026", title: "Hearth and daylight",
    items: [
      "A real fireplace in your cabin. The fire used to burn loose on the floor. Now it sits in a proper firebox: a raised hearthstone with its kerb, jambs laid in courses, an oak mantel beam and a breast running up into the chimney. Inside are iron firedogs with the logs across them, a floor of ash, and a crane with the kettle swung over the flames.",
      "It's rough stone in the log cabin, and brick against the chimney stack once you've remodelled it into a house.",
      "Real cave exits. You don't press a key at a patch of light any more. At the end of the first hall there's a ragged arch of rock with daylight pouring through it and a pool of light on the floor. Walk up into it and you're out.",
      "Going in works the same way: walk into the black of the cave mouth and you're in. F still works at both.",
    ],
  },
  {
    v: "0.75.1", date: "10 October 2026", title: "Plainer trades",
    items: [
      "Settlers' companies are less gaudy. Their awnings, banners and sign boards now use the dyes a country trade of 1683 could actually get: madder red, woad blue, weld yellow, walnut black, lichen purple, rust, and cloth left undyed. All of them are faded by the weather.",
      "Shops opened before this update fade to match. The wares on their counters are quieter too.",
    ],
  },
  {
    v: "0.75.0", date: "10 October 2026", title: "Your own likeness",
    items: [
      "A character builder for the story. Start a new game, choose the Brother or the Sister, and shape how they look before you begin: height and build, skin, hair, eyes and head, and every piece of their clothes, with the same presets, swatches and colour pickers as multiplayer.",
      "Their sibling is family, so they share your skin, hair and eyes.",
      "Change your look any time from the pause menu (Your look). It's kept with that save.",
    ],
  },
  {
    v: "0.74.0", date: "10 October 2026", title: "Spoils",
    items: [
      "Player looting in multiplayer. When a player is cut down, a third of what they carried (logs, stone and food) spills into a sack on the ground where they fell. It no longer goes straight to whoever killed them.",
      "Anyone can loot it with F, the killer or a passer-by, and the one who fell can run back for it. It lies there for three minutes.",
      "A big haul makes the news. There's a new achievement, Spoils, for looting someone else's sack.",
    ],
  },
  {
    v: "0.73.0", date: "10 October 2026", title: "Leather",
    items: [
      "Tanning racks. Build one for 8 logs. It has two frames to stretch hides on, a vat of bark liquor and a scraping beam with the fleshing knife left on it.",
      "Hold F at the rack to scrape a hide and lace it up on a frame, from your pack or the stores. Over a few minutes it turns from raw pink to brown, and then you take the leather off.",
      "There's a new job, the tanner, who works the rack with the hides your hunters bring to the stores.",
      "Leather makes a leather canteen (two pieces) that holds six drinks instead of four.",
      "Leather also makes a buff coat (five pieces), the thick oiled leather coat soldiers wore under their armour. Every blow takes a fifth less off you.",
      "Leather and hides sell at the market.",
    ],
  },
  {
    v: "0.72.0", date: "10 October 2026", title: "Water",
    items: [
      "Thirst. Out in the woods there's a blue bar under your hunger. It runs down faster than hunger does, and faster still when you run.",
      "Drink at the brook or the pond by pressing F at the water's edge, wherever you stand along it. Drink at a well too. Unboiled brook and pond water may give you the flux. A well's water seldom does.",
      "Make a canteen at the chopping block from a plank and a log: a little wooden costrel on a cord that holds four drinks. Press its number at the water or a well to fill it, by the fire to boil what's in it, or anywhere else to drink. Boiled water never makes you ill.",
      "The flux stops your wounds mending, wears you down and makes you thirstier until it passes.",
      "When you're thirsty your wounds don't mend. Low on water or food, you slowly weaken. With no water at all, you die of thirst, sooner than you'd starve.",
      "There's a new page in the guide (H) on thirst.",
    ],
  },
  {
    v: "0.71.1", date: "10 October 2026", title: "A finer gun",
    items: [
      "The cannon has been made again. The barrel is cast bronze, shaped the way the founders turned it. It has a button on the cascabel at the back, a base ring and two reinforces stepping down, a long chase, a moulded ring near the front and a swelling muzzle with a dark bore. There are two lifting handles shaped as dolphins on top and a touch-hole with its pan.",
      "The carriage is shaped oak. Its side pieces slope down from the axle to a trail resting on the ground, ironed along their tops, with iron straps over the trunnions and a ring at the trail's end. Two twelve-spoked wheels have iron tyres and hub rings. The rammer and sponge hang along the side.",
    ],
  },
  {
    v: "0.71.0", date: "10 October 2026", title: "Cannon",
    items: [
      "Cannon. Research Artillery (military, after Matchlock Muskets) and you can build one for 8 iron and 4 planks. It's a long iron gun with a swelling muzzle on an oak field carriage, with two spoked wheels, a trail, and a rammer and sponge leaning against it. Lay it out facing where trouble will come from.",
      "Press F at it to be the gunner. Look to aim, as far round as the trail will swing and as high as the quoin allows, then click to fire.",
      "When it fires there's a flash, a cloud of powder smoke and a boom that rolls off through the woods, and the gun jumps back on its carriage. The ball flies a real arc and cuts through every raider in its path. It skips along the ground, throwing up earth, and then lies where it stopped.",
      "Then it has to be sponged and loaded again, which takes a few seconds, and every ball is cast from one iron out of the stores.",
      "In a raid, if you aren't at the gun and the settlement has a watchman, the watch lay it on the nearest raider in front of it and fire it themselves.",
      "Press F again to leave the gun.",
    ],
  },
  {
    v: "0.70.0", date: "10 October 2026", title: "Fire",
    items: [
      "Every fire in the game has been made again: the campfire, hearths, the charcoal clamp, candles and torches. The flames used to be solid cones. Now they move like real fire: tongues lick up and break off at the top, white-gold at the heart and red at the edges, and they never look quite the same twice.",
      "Embers float up from a good fire, drifting and winking out. A big fire sends up a slow column of smoke that spreads as it rises.",
      "A fire that's gone out shows no flame.",
    ],
  },
  {
    v: "0.69.1", date: "10 October 2026", title: "A proper crossbow",
    items: [
      "The crossbow has been made again, as a German hunter of the day would carry one. It has a shaped walnut stock with its butt dropped for the cheek, bone inlay on the sides and along the top, and a steel bow swept back and lashed to the front with cord. There's a cord string, a horn nut that holds it, a long trigger lever underneath, a stirrup, sights, and a windlass on the side.",
      "It's in your hands now, right hand at the trigger and left under the front of the stock. The steel bow bends back as it's spanned, and the string is drawn back to the nut. The bolt in the groove has an iron head and two red vanes.",
      "Aim and it comes up to your cheek, the butt beside your face and the sights in front of your eye. Wind it and you tip it up and turn the crank, with your hand going round on the knob.",
      "Other players see you carrying the same crossbow.",
    ],
  },
  {
    v: "0.69.0", date: "10 October 2026", title: "At the head of your men",
    items: [
      "Real battles in Classic. When you send a war party, you can lead it yourself. You march down the road with your men and come up the enemy's road into their own settlement, as their game has it: their houses, their people, their watch and their ruler, all moving as they are.",
      "Fight there with your axe. Your blows are drawn back a moment before they land, the same as any raider's, so a defender who's watching can guard or parry them. You fight beside your own men while the enemy's watch and settlers fight back. Your health is your own, and if you're cut down your men carry you home.",
      "Press N twice to fall back down the road. When all your men are down or gone, you fall back with them. Either way you wake at home in your own settlement, and the war party's plunder and losses follow you there.",
      "Defending, you'll see their ruler at the head of the band, named in red over their head. Cut them down and the rest break.",
      "The fire sounds lighter: a soft breath of flame under small dry crackles and the odd snap, where before it was a heavy roar. It also gets quieter as you walk away from it.",
      "Music in the lobby: livelier tunes, one after another, through the game list, hosting and the character builder. The title tunes have shorter breaks between them too.",
    ],
  },
  {
    v: "0.68.0", date: "10 October 2026", title: "Nations",
    items: [
      "Classic is now the full game for every player. Each of you plays your own settlement as a nation, with everything free play has: the same building, stores, research, settlers, laws, Europe and raiders. Your nation is kept in a save of its own, so you can carry it on the next time you play Classic.",
      "N opens the nations: every other player's nation, with its ruler, its people, its day, its buildings and what it knows.",
      "Trade any goods: logs, stone, planks, bricks, ore, iron, tools, rye, bread or Deutschmarks. What you offer is set aside until they answer, and comes back if they refuse. Ask for nothing and it's a gift.",
      "Offer an alliance, and break one if you must. Declare war on a nation that isn't your ally. You can't attack anyone who isn't here, and once a peace is made it can't be broken for ten minutes.",
      "At war, send a war party. Choose how many of your people go; the watch go first. They walk down your road and come up the enemy's as a real raid in their game, fought with every weapon and wall they have. Those who fall don't come back. The rest bring home whatever they carried off.",
      "Sue for peace, or the war burns itself out after forty minutes. Everyone hears the news of wars, peaces, alliances, trades and war parties.",
      "The old map-based mode stays as Frontier rivals: a homestead each on a new map, with claim wars.",
      "In a colony you host, and in your nation, what you carry and your skills are now kept with that game's save.",
    ],
  },
  {
    v: "0.67.0", date: "10 October 2026", title: "Sickness, and the world of 1683",
    items: [
      "More than the fever now. People can come down with a winter cough, the flux, the ague, consumption, the smallpox, or the plague, and some are far deadlier than others. A cough is a misery that passes. The plague kills.",
      "Some sicknesses catch. They go round the people who share a house, so one case can become five. Survive the smallpox or the plague and you won't take it again. A hospital with a doctor keeps the sick apart and saves more of them.",
      "When you take in a newcomer, there's about a one-in-seven chance they bring something with them up the road. You'll be told what it is.",
      "Graves, the news and people's moods now name what they're sick with, or what took them.",
      "The Earth map is now the world as it was in 1683. The realms of the day are named where they lay: the Holy Roman Empire, the Tsardom of Muscovy, the Ottoman Empire, Safavid Persia, the Mughal and Qing empires, New France, New Spain, Rupert's Land, New Holland and more. The seas carry their old names too, such as the Western Ocean, the Mar del Sur and the Mare Magellanicum.",
      "Map names no longer pile on top of each other. The great realms are lettered first, and a smaller one moves aside to make room.",
    ],
  },
  {
    v: "0.66.0", date: "10 October 2026", title: "The Earth",
    items: [
      "A new country to play in: the Earth. The whole world made small, with every continent, island and ocean where it really is, taken from Natural Earth's maps. The great mountain ranges rise where they stand: the Himalaya, the Andes, the Rockies, the Alps. The Sahara, Arabia, the Gobi and the Australian outback are desert, and the far north is tundra and snow.",
      "Choose it when you host a game (Country: The Earth). It's always drawn big enough to walk across continents, whatever the size. The wide world is the Earth too.",
      "Its map is a map of the world: the countries named where they lie, the oceans named, the land drawn in its colours, and you somewhere on it. You start somewhere temperate, never in the desert or the snow.",
    ],
  },
  {
    v: "0.65.0", date: "10 October 2026", title: "Crossbows",
    items: [
      "Crossbows. Make one at the chopping block once the settlement has a forge, from two planks, two iron and a hide. Make its bolts there too, eight at a time.",
      "Right click raises it to your eye and sights down the bolt; click looses it. A bolt flies flat and fast and hits harder than any arrow, so it brings down a deer or a raider where an arrow might not. Loosed from the hip it goes wider.",
      "Then it has to be spanned again: you wind the crank, the string comes back to the nut, and a fresh bolt goes into the groove, a few seconds each time. It's slower than the bow, and it pays for it.",
    ],
  },
  {
    v: "0.64.0", date: "10 October 2026", title: "Achievements",
    items: [
      "Achievements: thirty-six of them, across the story, your colony, yourself and games with others. Some are kept secret till you earn them. They're kept across every save. A gilt card comes in at the corner when you earn one.",
      "The book of them (Achievements, on the front screen and in the pause menu) shows what you've earned and when, what's still to do, and how far along you are.",
      "Whatever you'd already done before there were achievements counts. It's earned the first time you play, and told on one card.",
    ],
  },
  {
    v: "0.63.1", date: "10 October 2026", title: "A better likeness",
    items: [
      "The character builder, made over. It's in tabs now: presets to start from, body, face and hair, and clothes. The figure stands in a portrait painter's light and casts a shadow. Turn them by dragging or with the arrows, look closer with the wheel, and switch between the whole figure and the face. Choosing face and hair takes the view in close by itself.",
      "More to choose: build (slight to broad) and head size alongside height, eye colour, and the colour of the shirt and stockings. Every colour has a picker beside its row, so it can be any colour at all, not only the dyes of the time.",
      "Six presets to start from: a merchant's son, a woodcutter, a farm girl, a woodswoman, an old soldier and a burgher's wife.",
    ],
  },
  {
    v: "0.63.0", date: "10 October 2026", title: "Claim wars",
    items: [
      "Claim wars in Classic. From the list of who's here (Tab), declare a claim war on a neighbour's homestead, and everyone in the game hears of it. Hold their hearth, with none of theirs standing at it, and it slips toward you; their people at the hearth win it back. Take it, and the hearth, everything built on that ground and everyone living there are yours, with half of what was in their stores.",
      "A war lasts twenty minutes. Hold out that long and your homestead is safe, and it can't be fought over again for a while. A war only goes forward while the defender is in the game: no one loses their home while they're away. Your watchmen fight for the hearth with you.",
      "The news (N): the wars declared, homesteads taken, alliances made, who struck whom down, and the homesteads that are growing. Each one is called out in the corner as it happens. A contested claim shows in red on the map.",
      "In a co-op colony, everyone hears the colony's news and its word of its people, not only the host.",
    ],
  },
  {
    v: "0.62.1", date: "10 October 2026", title: "Surveyed",
    items: [
      "The maps are surveyed now. Hills are shaded from the north-west light and drawn with contour lines, every fifth one heavier, so you can see the lie of the land: the rise behind the clearing, the hollow the pond sits in.",
      "Zoom in on the settlement (the wheel, on the map) and every building has its name written beside it, sites included. Fields show their furrows.",
      "Ground you haven't walked yet is no longer blank paper. It shows faintly, as country you've only heard of.",
      "Multiplayer maps are drawn the same way, with the woods stamped in tree by tree and the coast inked. Every lake, hill, wood and sea has a name of its own, the same for everyone in the game.",
    ],
  },
  {
    v: "0.62.0", date: "10 October 2026", title: "The colony, together",
    items: [
      "Co-op is now the whole game. The host plays real Free Play, and everyone who joins comes into that colony: the same clearing, settlers, buildings, stores, research, government, traders, raiders and seasons, all working exactly as they do on your own.",
      "Everything a guest does happens in the host's game, by the game's own rules. They can fell trees, take and stack logs, lay out plans with B, work on sites, start research and send for people from G, set jobs and laws, and anything else F does. Everyone sees the trees come down and the buildings go up.",
      "The host's colony is kept in a save of its own, so hosting never touches your story games. You can carry on with it the next time you host.",
      "In a game with others the world doesn't stop when you open the pause menu or read a tip. It carries on for everyone.",
      "Classic and Frontier (on new maps) are still there. Frontier homesteads now have fields and farmers, and settlers who need feeding.",
    ],
  },
  {
    v: "0.61.1", date: "9 October 2026", title: "Meadows and footings",
    items: [
      "Grass and wildflowers on the multiplayer maps: thick in the open meadows, thin under the trees, and none on the sand, the rocks or the snow. What you build stands on bare ground.",
      "Buildings on a slope stand level on a stone footing, instead of hanging in the air at one corner.",
      "Settlers go home to bed when night falls and come out again in the morning. Watchmen stay on watch after dark, with a torch.",
      "If the connection to a game drops, the game tries to get you back in where you were. Only if that fails do you go back to the lobby.",
      "The multiplayer keys are listed under Controls.",
    ],
  },
  {
    v: "0.61.0", date: "9 October 2026", title: "Neighbours",
    items: [
      "Settlers in multiplayer. Build a cabin (beds for two) or a house (beds for four), and people come to your hearth to live in them, up to twelve. In Co-op they join the colony; in Classic they belong to your nation.",
      "They work without being told. Woodcutters go out to the trees near home, fell them and carry the logs back to your woodshed or hearth. When logs are plentiful, some turn quarryman and bring back stone. Build a watchtower and two of them keep watch. They go for anyone hostile on your ground, and they fight well.",
      "Everyone in the game sees the same settlers doing the same work. Talk to one (F) to hear how it's going. In Classic, an enemy's settlers can be killed, but only while their owner is in the game. Hurt them and they run.",
      "Co-op and Classic replace the names Co-op and PvP. Co-op is one colony with one store and one hearth for everyone. Classic is a nation each.",
    ],
  },
  {
    v: "0.60.0", date: "9 October 2026", title: "Into the woods together",
    items: [
      "Multiplayer, from the new button on the front screen. It lists the games you can join, and you can host your own.",
      "Two ways to play. In Co-op, you build one colony together, with one store of logs and stone, one hearth, and no harm between you. In Classic, each player is a nation of their own: build, trade, make treaties, or make war on the neighbours.",
      "Every game is a new map, grown from a number, so no two are the same. When you host, you choose the country: an island, an archipelago of islets with shallows to wade between, a continent with a coast down one side, highlands with snow on the peaks, or lake country. You also choose the size, up to two kilometres across, and you see the land before you start. The map (J) shows all of it.",
      "A character builder on the way in: four bodies, skin, hair, coat, breeches or skirt, waistcoat, apron, hat and height, turned about in front of you. Everyone else sees you as you made yourself, with your name over your head.",
      "Fell trees and break rocks for logs and stone. Build a hearth to claim the ground round it, then cabins, a woodshed, a house, a well, palisades and gates, a watchtower to climb, a forge that makes your axe bite deeper, and a market to trade logs for stone. Trees and rocks grow back in time.",
      "In Classic, an axe works on people as well as trees. Hold your guard up to turn a blow. A fall costs you a fifth of your logs and stone, to whoever felled you, and you wake at your hearth. Break someone's woodshed and half of their store is yours. Newcomers are safe for their first minute.",
      "Alliances: ask someone from the list of who's here (Tab). Allies can't hurt each other, their gates open for each other, and they can build on each other's ground. Up to eight to an alliance. Talk with Enter, to everyone or, with Tab as you type, to your allies only.",
      "Nothing of yours can be broken while you're away from the game. No one can raid a homestead whose owner isn't there to defend it.",
      "In the desktop app, you can host a game on your own computer. Friends on the same network see it in their list by themselves. Others can join by your address. The game also lists games on any server whose address you type in.",
      "The wide world, one great land six kilometres across, shared by everyone, with mountains in it, is ready in the game. It opens once its server is up.",
    ],
  },
  {
    v: "0.59.2", date: "9 October 2026", title: "Work you can hear",
    items: [
      "You hear your people at work from where they are: each axe blow, hammer stroke, spadeful and saw stroke lands with the swing, louder or softer and to one side or the other depending on where you stand. Before, a few unplaced knocks played wherever you were.",
      "Your own spade sounds like digging, not chopping.",
    ],
  },
  {
    v: "0.59.1", date: "9 October 2026", title: "The sound of work",
    items: [
      "An axe into a trunk sounds like one: the crack of the blow, the ring of the blade, the knock of the wood and the crunch of torn fibre, a little different every stroke.",
      "A tree going over creaks as it leans, its fibres snap faster and faster, and it gives a last loud crack. Then it comes down with a heavy thud, branches breaking and a long hiss of needles, from where its crown hits the ground.",
      "The fire crackles and pops over a low rush, instead of a hiss.",
      "Taking something up, building, hammering, coins, digging and anything heavy hitting the ground all have new sounds made from wood, metal, earth and cloth. Before, several were electronic beeps.",
    ],
  },
  {
    v: "0.59.0", date: "9 October 2026", title: "Players",
    items: [
      "New music, played by a small band of the time: a lute, a harp, a recorder, a fiddle, a bass viol, a drone and a frame drum. The lute and harp are plucked strings, the recorder is breathed with a chiff as it speaks and a vibrato as it holds, and the fiddle and viol are bowed strings with a fiddle's body in their tone. It replaces the soft held chords that played before.",
      "Seventeen tunes in the old modes, each a melody over its chords in two strains, AABB. The players arrange them as they go: who takes the tune each time round, a second voice under the long notes, the lute picking out the chords or strumming them, the drum coming in for a dance. They slow a little into the last bars. So a tune is never quite the same twice.",
      "There's music for everything the game had before (the title, home in Hamburg, the woods, unease, dread, grief, flight and hope) and for the settlement now. Working tunes by day, quieter airs at evening, the night's and the winter's own, a dance on a church-day afternoon once there's a church, and a fight when raiders or rebels are in. In the settlement there's a rest between tunes, often a long one, so the woods have their quiet too.",
    ],
  },
  {
    v: "0.58.0", date: "9 October 2026", title: "Faces and hands",
    items: [
      "Everyone's face is better modelled. The jaw draws in to the neck, so a head grows out of the shoulders instead of sitting on them like a ball. The brow, the eye sockets, the cheekbones, the nose and its wings, the lips and the chin all stand out more, the eyelids sit naturally over the eyes instead of staring, and the lips and cheeks are no longer smudged with colour.",
      "Hands have thumbs, and a man's wrist shows below a short shirt frill instead of a long white sleeve.",
      "The watch's helmets are dark polished steel. They were a pale grey that looked white in daylight.",
      "Chopping a tree throws chips of bark and heartwood from the cut with every stroke, wherever you chop, and a shower of them when it goes. Before, the chips started inside a big spruce's trunk where you couldn't see them, and the trees in the first clearing threw none at all.",
      "Beds are counted the same way everywhere. Newcomers no longer arrive for two beds that don't exist, only to be unhappy for having no bed. The settlement bar shows people against beds, and turns red with the reason when there are more people than beds.",
      "Every item on the settlement bar names itself when you hover over it with a menu open.",
      "The first time you play, the graphics are set to suit your machine: High on Apple's own chips and on a real graphics card, Balanced on older Intel laptops.",
      "Restart chapter asks you to click again before it throws away what you've done. A small Saved mark shows in the corner when the game is kept, at most once a minute. The loading screen shows the title painting.",
      "The Controls screen lists every key, matching the list in the game. The Credits name the libraries and typefaces the game is made with. On a short window, the title menu fits without scrolling.",
    ],
  },
  {
    v: "0.57.2", date: "9 October 2026", title: "Fields by the road",
    items: [
      "The open country where the road leaves Hamburg is meadow: green in the hollows, drier on the rises, with grass growing thick across it. Before, the fields between the city and the woods were bare khaki ground with a tuft here and there.",
    ],
  },
  {
    v: "0.57.1", date: "9 October 2026", title: "Books and glazing",
    items: [
      "Bookcases are real bookcases: an open case with four boards, and on them books of every height and colour, ledgers lying flat, a box or two, and gaps where something's been taken down. Before, they were a flat board painted in coloured stripes. Father's counting room has two, and so do the houses you furnish.",
      "Every window along Hamburg's streets has a frame, a wooden cross and leaded panes, lit or dark, instead of a plain glowing rectangle.",
      "The clothes chests in the bedroom sit snug against the beds, out of the way of where you wake.",
    ],
  },
  {
    v: "0.57.0", date: "9 October 2026", title: "Front of house",
    items: [
      "The title menu is tidier. Every button is one width, Continue shows its chapter and save on a quiet second line, and the version is under the title.",
      "Long screens fit the window. Settings, Controls, Chapters and the update log scroll inside their own panel, with Back always in sight, and the scrollbars are in the game's colours instead of a white system bar.",
      "Settings is laid out in sections (Controls, Sound, Display, Look, Performance), each setting on one line with its value beside it.",
      "The lines under each screen's heading are readable over the painting, and the chapter list drops its doubled numbering.",
      "The FPS counter sits in the bottom corner, off the health bar. On the map, the bar for marking out new ground sits at the bottom, off the map's title.",
      "The children's bedroom in Hamburg, where the game begins, is furnished: a clothes chest at the foot of each bed, a peg rail with Father's old coat, a shirt and a cap, a shelf with a book and a jug, and skirting boards. The window shows the sky over the yard instead of a flat white pane.",
      "Plaster walls everywhere have a less regular grain, with no repeating pattern on a big wall. Red blankets and cloths no longer take a brick pattern.",
    ],
  },
  {
    v: "0.56.6", date: "9 October 2026", title: "Elbow room",
    items: [
      "Settlers keep a little room between them. Two who stop to talk now stand a natural distance apart, and anyone sent to the same spot eases aside, instead of standing inside one another.",
    ],
  },
  {
    v: "0.56.5", date: "9 October 2026", title: "A quieter forest floor",
    items: [
      "The forest floor is a soberer brown. The needle litter and old leaves were a bright orange in the sun, and each facet of the ground stood out sharply from the next in a patchwork. Now the shades sit closer together, so the ground reads as one floor, with the moss, bracken and dry grass laid over it.",
    ],
  },
  {
    v: "0.56.4", date: "9 October 2026", title: "Fewer burials",
    items: [
      "A raid is less likely to leave several settlers dead. Once one has been killed, the rest keep further back and the raiders don't press it, so a second death in the same raid is much rarer and a third very rare. Before, one bad raid could take a quarter of the town.",
    ],
  },
  {
    v: "0.56.3", date: "9 October 2026", title: "The turning year",
    items: [
      "The grass and the ground change with the year. In spring they're fresh and bright. The green starts going over in late summer, and through autumn the sward turns straw-coloured in patches and the ground under it warmer and duller, until the snow comes.",
    ],
  },
  {
    v: "0.56.2", date: "9 October 2026", title: "Summer nights",
    items: [
      "On a still summer night, fireflies drift low over the grass all round you. Each one glows up and fades in its own slow rhythm. None come out in rain or wind.",
      "The shops' signboards are painted on both sides, so the name reads properly from behind. They and the banners are lit by the day like everything else, so they don't glow in the dark any more.",
      "In the free camera, the sky stays round the view. Before, if you flew off a way, the sky showed as a great dome sitting on the town.",
    ],
  },
  {
    v: "0.56.1", date: "9 October 2026", title: "Fawns",
    items: [
      "In spring and at the start of summer, some of the roe does have a fawn with them. It's small and dappled with pale spots, keeps at its mother's heels, grazes beside her, and bolts with her at her flank when she's startled. There's not much meat on one.",
    ],
  },
  {
    v: "0.56.0", date: "9 October 2026", title: "Washing day",
    items: [
      "On a fine day a few of the houses have their washing out on a line beside the house: shirts pegged up by the shoulders, a sheet, an apron, all blown out and flapping in the wind, more on a windy day. Each house has its own washing days. It's taken in before the rain and by night, and the line stands empty in winter.",
    ],
  },
  {
    v: "0.55.9", date: "9 October 2026", title: "Raids that end",
    items: [
      "Once raiders give it up and make off, they don't turn back on you for standing near them. Only if you hit one does he fight. And any still hanging about long after slip away into the woods. Before, a raider making off past you could lock the whole raid open, with the settlement cowering for days.",
    ],
  },
  {
    v: "0.55.8", date: "9 October 2026", title: "Lighter woods",
    items: [
      "The game stays quicker the longer you play. Each tree the woodcutters take out of the forest was drawn as eight separate pieces, and over a few days dozens of them doubled the work of drawing a frame. Now each is drawn in one piece for its crown and one for its trunk, and a busy settlement's frames take about a third less time.",
      "A tree that grows back from a stump falls properly when it's felled again, and sways in the wind again. Before, it was down the instant it was cut, and stood stock still.",
      "A woodcutter sent to a tree they can't get to leaves it for another, rather than standing at the edge of the wood all day. With no tree to be had, they lend a hand hauling.",
    ],
  },
  {
    v: "0.55.7", date: "9 October 2026", title: "Butterflies",
    items: [
      "On a fine day in spring and summer, butterflies go about the clearing's grass and flowers: whites, brimstones, a red admiral now and then, and blues. They flutter in their jinking way and rest a moment, wings up, before they're off again.",
    ],
  },
  {
    v: "0.55.6", date: "9 October 2026", title: "Squirrels",
    items: [
      "Red squirrels live in the woods round about you. They bound from tree to tree over the forest floor and sit up now and then to look about, the tail curled over the back. Come near and one is off to the nearest trunk and up it in a spiral, to wait there until you've gone a way. They keep in at night and in a downpour.",
    ],
  },
  {
    v: "0.55.5", date: "9 October 2026", title: "Voices in the woods",
    items: [
      "The woods have voices of their own. A tawny owl calls from somewhere off in the trees at night, a long hoo and then the quavering answer. By day a woodpecker drums on a dead branch now and then, more often when you're out among the trees. Neither calls in the rain, and the woodpecker is quiet in winter.",
      "The guide has a page on what the woods give, ceps and blackberries, shown the first time the mushrooms come up near you.",
    ],
  },
  {
    v: "0.55.4", date: "9 October 2026", title: "Ceps",
    items: [
      "In autumn, after rain, clusters of ceps come up on the forest floor under the trees round about you. Pick them (F) and eat them as they are, or stew three with a little rye in the kitchen (Mushroom stew). Left alone, they go over in a day or two. Traders will take them too.",
    ],
  },
  {
    v: "0.55.3", date: "9 October 2026", title: "Struck",
    items: [
      "Now and then in a summer storm the lightning comes down on a tree near you: a blinding flash, the crack at once, and the tree goes over burning at the crown. Its logs lie where it fell, there for the taking.",
    ],
  },
  {
    v: "0.55.2", date: "9 October 2026", title: "Stooks",
    items: [
      "The day a field is reaped, the sheaves stand on the stubble in stooks, leaned together in rows to dry. They're carried in by the next day.",
    ],
  },
  {
    v: "0.55.1", date: "9 October 2026", title: "In out of the rain",
    items: [
      "In a downpour, settlers with nothing that needs doing, and the children, go indoors and wait for it to ease before they come out again. The work goes on in the wet.",
      "The map's key shows the brook with the pond.",
    ],
  },
  {
    v: "0.55.0", date: "9 October 2026", title: "The brook",
    items: [
      "A brook runs out of the pond, over the lowest of its bank and away east through the trees to a boggy pool in a hollow. The water runs in it, carried downstream in ripples and little streaks of foam, with rushes along the banks and thick round the pool. You hear it as you come near. It's shallow enough to wade, and freezes still in winter. It's on the map, and nothing is built in it.",
      "The windows in the Hamburg house are less glaring at dusk.",
    ],
  },
  {
    v: "0.54.8", date: "9 October 2026", title: "Limestone",
    items: [
      "The stalagmites in the cave are pale limestone. Before, they came out moss-green, as if they had been standing out in the rain.",
    ],
  },
  {
    v: "0.54.7", date: "9 October 2026", title: "Round their fire",
    items: [
      "Raiders in a camp sit on the logs round their fire until they see you, and the fourth stands keeping watch with his arms folded, facing out into the trees. Before, they stood bunched up round the fire all together.",
    ],
  },
  {
    v: "0.54.6", date: "9 October 2026", title: "Your collar",
    items: [
      "Look straight down and you see your neckcloth at your collar, where before there was a patch of bare skin, the inside of a neck with no head on it.",
    ],
  },
  {
    v: "0.54.5", date: "9 October 2026", title: "The Lord's day",
    items: [
      "Every fourth day is the Lord's day. In the morning the church bell rings, and the settlers of the church's own creed leave what they're doing and go in to the service, coming out again an hour or two later.",
    ],
  },
  {
    v: "0.54.4", date: "9 October 2026", title: "Water for the day",
    items: [
      "First thing in the morning, if there's a well, some of the settlers go and draw the day's water, winding the bucket up and carrying it home before work.",
    ],
  },
  {
    v: "0.54.3", date: "9 October 2026", title: "Evenings",
    items: [
      "In the evening, before the dark, settlers come and sit on the logs round the fire for a while, facing the flames, four at a time.",
      "Settlers with nothing to do find each other and talk, turning to face each other and talking with their hands, rather than each standing alone.",
    ],
  },
  {
    v: "0.54.2", date: "9 October 2026", title: "After the rain",
    items: [
      "When a shower clears in the daytime, with the sun low enough to throw one, a rainbow stands in the sky opposite it for a little while, red outside and violet within, and then fades.",
    ],
  },
  {
    v: "0.54.1", date: "9 October 2026", title: "Children at play",
    items: [
      "The settlement's children play. They chase each other round the fire, run about the clearing, crouch over something in the grass, or go and stand at their mother's side and chatter. Before, they only wandered about the fire and stood.",
      "A settler sent to dig out an old stump they can't get to, penned in by trees or over a bank, gives up on it rather than standing at it all day, and after two tries it's left alone.",
    ],
  },
  {
    v: "0.54.0", date: "9 October 2026", title: "Clouds",
    items: [
      "The sky has clouds. On a fair day there's a scatter of them, white on the sun's side and grey beneath. Ahead of rain they thicken into a low grey lid, and they drift across, quicker on a windy day. At dusk they take the colour of the sunset, and at night they're dim shapes against the dark. Before, the sky was a plain gradient with nothing in it.",
    ],
  },
  {
    v: "0.53.9", date: "8 October 2026", title: "On the ice",
    items: [
      "When the pond freezes over you can walk out across it, on the ice, not wading along its bed beneath. It goes back to water at the thaw.",
      "The rushes round the pond die back with the year: straw-coloured in autumn, brown in winter.",
    ],
  },
  {
    v: "0.53.8", date: "8 October 2026", title: "The turn of the year",
    items: [
      "The birches keep the seasons. They're green through spring and summer, yellow into autumn, gold and then rust, and bare by winter. The bushes brown with them, and in autumn leaves come fluttering down off the birches round you, carried on the wind, and lie a while where they land. The spruce and the pine stay green all year.",
    ],
  },
  {
    v: "0.53.7", date: "8 October 2026", title: "Wildflowers",
    items: [
      "Wildflowers grow in the clearing's grass and along the pond's banks in spring and summer: white, yellow and mauve in spring, with blue and red in summer, in drifts that change slowly from one kind to another, nodding in the wind.",
      "Ripe rye has slim golden ears nodding over, and the straw is a deeper gold. Before, close up, the ears looked like pale little flags.",
    ],
  },
  {
    v: "0.53.6", date: "8 October 2026", title: "Gulls",
    items: [
      "Gulls wheel over the harbour at Hamburg, on long easy turns over the water and the quays, a few wingbeats and then a glide.",
    ],
  },
  {
    v: "0.53.5", date: "8 October 2026", title: "Trails",
    items: [
      "The beasts leave tracks in the snow, as people do: a deer's and a boar's little cloven slots and a hare's pad marks, a trail you can follow through the woods in winter.",
      "A wounded deer or boar bleeds as it runs, leaving a trail of drops on the ground to follow it by, heavier while the wound is fresh.",
    ],
  },
  {
    v: "0.53.4", date: "8 October 2026", title: "Hamburg's chimneys",
    items: [
      "Most of the houses in Hamburg have a chimney stack up through the roof, brick or stone, and they smoke: thin by day and thicker toward evening, drifting off the rooftops over the streets.",
    ],
  },
  {
    v: "0.53.3", date: "8 October 2026", title: "The Elbe",
    items: [
      "The Elbe at Hamburg is real water now. It's grey-green and silty, it holds the sky and the dark of the quays and ships along it, the sun glints off it, and a slow swell runs on it. Before, it was a flat blue sheet.",
    ],
  },
  {
    v: "0.53.2", date: "8 October 2026", title: "The house by the harbour",
    items: [
      "The family's house in Hamburg has windows on the inside. Small leaded panes in deep frames look onto the street from the hall, and onto the yard from the bedroom and the counting room, bright with the day and dark at night. Before, every room was a closed box.",
      "And it's furnished like a merchant's house. A dresser of pewter plates stands in the hall, a strongbox and a map of the Elbe are in the counting room, and the bedroom has a rag rug between the beds, a stool with a candle at their heads, a washstand with its basin and jug, and a cross over the door.",
    ],
  },
  {
    v: "0.53.1", date: "8 October 2026", title: "Life on the water",
    items: [
      "The pond moves. A duck going somewhere leaves a wake of spreading rings, wading sends rings out round your legs, and now and then a fish rises out in the middle, more often at dusk.",
      "Frogs croak round the margin from dusk into the night in spring and summer, and the ducks quack to each other by day.",
      "The guide has a page on the pond and fishing, shown the first time you come to it. The fire offers to roast your fish as well as your meat.",
    ],
  },
  {
    v: "0.53.0", date: "8 October 2026", title: "Gone fishing",
    items: [
      "You can fish the pond. Stand on the shore, look out at the water and hold F. You take up a rod, the float goes out, and you watch it bob. Nibbles dip it, and if one has taken, it goes right under at the end. Fish bite best at dawn and dusk, slowly at midday and poorly at night, a little better in the rain. Not when the pond's frozen.",
      "A perch is a new food. Roast it at the fire, fry it in the kitchen (Fried perch), or simmer two with a little rye for Fish soup. Traders will buy it too.",
      "Settlers open their doors. A log cabin's door swings open as its people go in for the night and shuts behind them, then opens again in the morning as they come out. Before, they vanished on the doorstep.",
      "The pond has its name and a key entry on the map.",
    ],
  },
  {
    v: "0.52.2", date: "8 October 2026", title: "The moon",
    items: [
      "There's a moon. It comes out with the stars, a pale disc with a soft halo, and it waxes and wanes, full every eighth night and dark between. Behind cloud it's only a glow.",
      "A raider squared up to you who can't get at you, and won't be put down, gives up in the end like the rest.",
    ],
  },
  {
    v: "0.52.1", date: "8 October 2026", title: "Fewer graves",
    items: [
      "Your brother or sister can no longer be killed in a raid, in the fighting at a camp, or in a rising. Before, they could be cut down while working among the settlers and buried at the edge of the clearing with no name on the cross. Now they're knocked down and get up again.",
      "Raids are much less murderous. A settler beaten down gets up and takes cover with the rest rather than going back in, and fewer of those cut down die. A band of six could kill nine people in a raid you weren't there for. Now it's one or two.",
      "A rising ends. Once nobody's left standing against the rebels, they come looking for you, and if you've shut yourself in your cabin they take the settlement. Fewer die in the street fighting. Before, the rebels could stand about the fire for days with nobody to fight.",
      "A carter with nothing to cart lends a hand hauling, or does a few odd jobs, rather than standing by the cart all day.",
    ],
  },
  {
    v: "0.52.0", date: "8 October 2026", title: "The pond",
    items: [
      "There's a pond in a hollow at the edge of the deer ride, east of the clearing. Its still brown-green water holds the sky and the dark of the trees round it, stirs in the wind, and is pocked by the rain. A fringe of rushes stands round it, lily pads lie on it with white flowers in summer, and a pair of mallards paddles about, dabbling, making off to the far side if you come close. It freezes over in winter.",
      "The deer and the boar come down to it to drink when nobody's by it.",
      "You can wade the margin, slowly and sloshing, but not out into the middle. The banks are damp and mossy, with thick grass.",
      "The pond is on the map. Houses, fields, camps and settlements never go in it.",
      "The fire in the middle of the clearing sends up a thin column of smoke, thicker when it's built up for the night.",
      "A raid can't go on forever. A raider no longer fights you through the cabin wall while you're inside; he goes back to the stores. One caught on a house or the woodpile steps round it. A raid that drags on breaks off, and they make for the road. Before, one raider standing at your wall could keep the whole settlement cowering by the fire for days.",
    ],
  },
  {
    v: "0.51.2", date: "8 October 2026", title: "Footprints and puddles",
    items: [
      "You leave footprints in the snow, left and right, pointing the way you went, and so does everyone who walks near you. They fill in slowly, and quickly while it's still snowing.",
      "Rain lands. Little rings spread on the ground round about you where the drops come down, more of them the harder it rains.",
      "Grass in autumn only fades toward straw rather than turning straw-coloured all at once against the green ground.",
    ],
  },
  {
    v: "0.51.1", date: "8 October 2026", title: "Birds",
    items: [
      "There are birds in the sky. Little flocks of finches bound over the clearing, a burst of wingbeats and then a dip with the wings shut. Crows row steadily across, and now and then a buzzard wheels high overhead on still wings. At dusk the bats come out and flicker about the clearing. In winter only the crows are left, and in a downpour or the dark there's nothing flying.",
      "A tree coming down, or a shot, puts the birds up out of the woods round about, and they scatter away from you.",
    ],
  },
  {
    v: "0.51.0", date: "8 October 2026", title: "Grass and rye",
    items: [
      "There's grass. The clearing is a sward of it, thick tufts stirring in the wind with the trees. Under the forest it grows in drifts of old dry grass, and here and there a tuft on the moss. None grows on a path or the road, under a house, round the fire where everyone walks, or on the cobbles once the town is paved. It lies under the snow in winter and turns to straw in autumn. It grows round about you wherever you walk. At the lowest forest detail there is none.",
      "Rye looks like rye. A sown field comes up as a green flush of shoots, then knee-high green stalks. When it's ripe it stands waist-high in gold, with the ears nodding, and the whole field ripples in the wind. Before, every plant was a little green spike, and a field took a couple of hundred separate pieces to draw. Now it takes three.",
    ],
  },
  {
    v: "0.50.2", date: "8 October 2026", title: "Wind in the trees",
    items: [
      "The forest moves. Every tree bends from its foot, the crown most, each to its own slow beat; a tall spruce rocks slowly and a bush quickly. The gusts roll across the woods in waves. On a still day it's barely a stir; on a wet, windy one the crowns lean and toss. The trees you can fell move with the rest until the axe takes them.",
      "Snowflakes are soft round flakes. Before, one falling close past your eye showed as a white square.",
      "Nobody new comes up the road wearing the name of someone buried at the edge of the clearing. Before, the day after Liesel was laid in the ground, a new Liesel could turn up and stay. There are many more names to go round as well, so the road never runs out of newcomers.",
    ],
  },
  {
    v: "0.50.1", date: "8 October 2026", title: "Smoke and breath",
    items: [
      "Chimneys smoke. A house's hearth smokes in the morning while the bread is on, in the evening, and all day in the cold, as does your own cabin's, more thickly when you've lit the fire. The bakery, the forge and the smelter smoke while they're working, and the brickworks' kiln day and night. Each plume rises, spreads and thins out downwind, leaning further on a wet, windy day. It shows pale against the dusk and the stars, and faint against a bright sky.",
      "In the cold you can see breath. In winter, and on autumn mornings and nights, everyone near you breathes out a little white cloud every few seconds, more often when they're walking. So do you, more often when you've been running.",
    ],
  },
  {
    v: "0.50.0", date: "8 October 2026", title: "Weather",
    items: [
      "The sky has weather now, and every day its own. Spring has showers, summer has thunderstorms, and autumn has long rains and mist. Winter snows some days and not others, and harder some days than others. Before, every day was the same clear sky, and every winter day snowed at the same hour.",
      "Rain comes in a spell during part of the day. The cloud gathers grey ahead of it, the light goes flat and the distance closes in. It slants in the wind, and you hear it hiss on the leaves, with big drops falling off them now and then. Under your own roof it becomes a drumming on the shingles, and no rain falls indoors or in the cave.",
      "The ground darkens as the rain soaks in, then dries out slowly after.",
      "In a summer storm, lightning lights up the clearing, and the thunder comes after it. A near strike is a crack followed by a long roll; a far one is only a grumble.",
      "Some mornings, mostly in autumn, a mist lies over the clearing until the sun burns it off.",
      "A felled tree falls the way a tree does. The hinge holds it at first and it barely leans, then it goes faster and faster until it hits the ground hard, bounces on its branches and lies still, throwing up needles and twigs where the crown lands. A tall tree takes longer to come down than a short one. Before, it swung down in a second on a fixed curve.",
      "No daylight shows through the seams of your cabin any more. There's clay between the logs and boards under the roof.",
      "Your cabin's candlelit window at night is in the window itself. Before, it hung on the wall beside it and glowed orange all day.",
    ],
  },
  {
    v: "0.49.1", date: "8 October 2026", title: "The right work in their hands",
    items: [
      "Settlers move like the work they're doing. A sawyer works a bucksaw, left foot forward and rocking into each stroke, where before they hammered. A brickmaker mixes the clay, a smelter shovels charcoal into the furnace, and a doctor leans over the sick and tends them rather than hammering at them.",
      "Weeding the rye, gathering kindling, picking mushrooms, gathering herbs and setting a snare are all done stooped over the ground, a hand going down to pick and back up. Before, they stood upright with both arms held straight out.",
      "Whittling a spoon or carving pegs is done head down over the work, with small knife strokes away from the body.",
      "A long skirt drapes when its wearer stoops or kneels, rather than being thrown out in front of the knees like a board.",
    ],
  },
  {
    v: "0.49.0", date: "8 October 2026", title: "Grazing",
    items: [
      "Animals feed as they should. A grazing deer leans onto its forelegs and puts its muzzle right down in the grass, a boar roots with its snout on the ground, and a hare drops its nose to the turf. The mouth works as they feed, with a nibble, a pull and a moment's chewing. Before, a deer's head stopped nearly half a metre above the grass, eating air.",
      "They browse the bushes too. Now and then one goes over to a bush in the woods or along the road and feeds at it: a deer reaches into the leaves, while a boar roots at its foot and a hare nibbles the low shoots. A deer or boar that finds a bramble in fruit, out of your sight, has the blackberries before you do, and the bramble is picked clean for a few days.",
      "The roe deer has its proper neck, long enough to reach the grass at its feet and the leaves of a bush.",
      "The hare's hop is slower and longer. At an amble it makes a lazy hop of a couple of feet about once a second and sits between hops; at full tilt, long bounds two or three times a second. Before, it was a frantic patter of short ones.",
    ],
  },
  {
    v: "0.48.2", date: "8 October 2026", title: "Sitting down",
    items: [
      "People sit down at the tavern table, or by the fire, and get up again, over most of a second, the way a person does, instead of dropping into the seat in the blink of an eye.",
    ],
  },
  {
    v: "0.48.1", date: "7 October 2026", title: "The horse's paces",
    items: [
      "The horse you ride has its paces. It walks in four beats, trots on the diagonals and gallops with the hinds and then the fores, each chosen by how fast you're going. Before, it galloped at every speed, just smaller when slow. The stride lengthens with the pace and a hoof on the ground sweeps back as fast as you go, so the hooves don't slide. Each leg folds at the knee as it comes forward, the head nods with the stride, and there are four hoofbeats to a stride.",
      "Its coat and saddle blanket were drawn with a wood grain, like a plank. The coat is plain hide now, and the blanket is cloth.",
    ],
  },
  {
    v: "0.48.0", date: "7 October 2026", title: "How people move",
    items: [
      "Walking and running are rebuilt from how a real stride moves: hip, knee and ankle through each step. In a walk the heel strikes, the knee gives a little as the weight comes on, the heel lifts, the toe pushes off and the knee folds to carry the foot through. The body is lowest when both feet are down and highest over the standing foot, and the hips sway over it. The pelvis turns with the leg, the chest turns against it, the arms swing and the head stays level.",
      "A run lands on a bent knee, kicks the back heel up and drives the knee high, with the arms pumping at the elbow and a forward lean. It's lowest at mid-stance and in the air between steps; before, it was the other way round.",
      "Feet stay where they're put. A walk or run plays exactly as fast as the person moves over the ground, so a planted foot no longer skates. In everything done standing (idling, talking, the guard, felling, hammering, reaping, sowing, digging, stirring, punching, a blow taken, every held pose), each foot is pinned flat to the ground and the knees bend to keep it there, instead of sliding or hanging in the air.",
      "Bodies turn the right way. Felling a tree, a punch, reaping, sowing, digging and throwing the earth aside all twist the body round, where before they bent it sideways at the waist. The axe swing in particular was a sideways lurch, and is now a turn through the hips and shoulders.",
      "Shoe buckles stay on the shoes. They were weighted half to the shin and slid off the foot as it moved.",
      "A crowd no longer breathes in step. Everyone starts their idle, their talk and their held poses at their own point in the loop, at their own slightly different tempo.",
      "People turning where they stand no longer spin on the spot. The head leads, the body comes round at a person's pace and the feet step round with it.",
      "Deer and boar have knees. A walk is four beats, each hoof in turn with three on the ground; a trot moves the diagonal pairs together; a gallop has the hinds and then the fores, a long stride and a moment in the air. Each leg folds as it swings forward instead of dragging stiff through the ground, and a hoof on the ground sweeps back as fast as the animal goes, so it doesn't slide.",
    ],
  },
  {
    v: "0.47.2", date: "7 October 2026", title: "The count on its own line",
    items: [
      "While the Free Company is coming, its count of days and your checklist (walls, arms, the watch, the camps, the Amtmann) sit on a line of their own under the objective, not lost at the end of a long one.",
    ],
  },
  {
    v: "0.47.1", date: "7 October 2026", title: "Hints that fit",
    items: [
      "If you stand a while on the hunt in the deer ride, your sibling now tells you how to hunt: crouch, walk, draw with the right mouse button. The hint was written for an older wording of the task and never came up. The same goes for putting things in the chest and for staying hidden at Martinmas.",
      "Every task in the story now has a hint. They were all checked against the hints, and those three had none.",
    ],
  },
  {
    v: "0.47.0", date: "7 October 2026", title: "Firewood, and the forest",
    items: [
      "Winter no longer takes you by surprise. On the first day of autumn your sibling tells you how many logs the winter will want: a log a day for every hearth, over winter's two days. If the stack is still short on the last day of autumn, they warn you again. Both warnings also go into the news.",
      "From the first day of autumn until winter's out, that firewood is kept back. Haulers won't carry it to building sites, and the sawmill, brickworks and the other works won't burn it. They wait, and say so, until the stack holds enough. Building goes on with whatever is over.",
      "When firewood is short, the objective says so first: how many days are left, how many logs the hearths want and what's on the stack. Before, it sat behind clearing the ground and making room to grow.",
      "Martinmas is fairer. The hiding place kept its marker only until you were near the trees, so a player who stopped when it vanished stood at the very edge, where the charcoal buyer comes to look, and was caught every time. Now the marker stays until you're in among the trees, he looks from a little further off, and the objective says to crouch (C).",
      "The first winter's night has six dry logs under the bench instead of three. Feeding the fire early, before it burns low, no longer means the fire dies before dawn and you play the whole chapter again.",
      "The whole story was played through, chapter by chapter, by a test that follows the marker as a new player would. It found the two problems above, and no errors.",
      "A new graphics setting, Forest detail. Full draws whole trees all round you, as before. Medium draws plainer ones past the next stand. Low keeps whole trees only where you're standing. It's the biggest boost after shadows, and it doesn't pull the fog in. The Balanced and Performance presets use it.",
    ],
  },
  {
    v: "0.46.0", date: "7 October 2026", title: "The Free Company",
    items: [
      "The Reckoning has a last account to settle. Some while into free play (once Father's name is restored, or in the third year), Jakob rides up the road with news: Brandt is out of the cells, and has spent everything he had left on a free company under a Captain Wolff. They mean to burn the place where the ledger was hidden.",
      "You have nine days to make ready, and the objective keeps count. Put up eight lengths of wall, get four blades into hands, raise a watch of three and clear the raiders' camps; every camp left standing sends its men to join the company. For 60 DM, Jakob will have the Amtmann put his own men on the lower road, and four fewer of Wolff's will get past.",
      "They come up the road at dusk, in two waves, with Wolff in a red coat leading the second. He comes looking for you. He's quicker and harder than any raider, guards well, and takes four times their beating. Cut him down and the rest break and run.",
      "Go down yourself, or let him get away, and they'll come back in six days, fewer by every one you put in the grass. Win, and they leave four good swords behind. The next morning the Amtmann rides up with the Council's bounty and a charter, and the raiders keep away a while.",
      "Nobody asks your leave to open a shop in the middle of a fight any more.",
    ],
  },
  {
    v: "0.45.0", date: "7 October 2026", title: "Supply lines",
    items: [
      "A new job, the carter, open once you have a second settlement. A carter keeps watch on every settlement's food and logs. When one is running short and another has plenty to spare, they load a handcart there, pull it along the road and unload it where it's wanted. Food goes first, then logs, and logs matter more in winter, when every hearth burns them.",
      "You can watch them on the road with the cart behind them, full of sacks or logs. Each trip goes into the news. A settlement is never stripped bare: a carter only takes what leaves it at least six days' food, or fifteen logs.",
      "When a settlement is short of food, the objective now says a carter would bring it, if you have none.",
    ],
  },
  {
    v: "0.44.5", date: "6 October 2026", title: "Fits the screen",
    items: [
      "The front menu fits a laptop's screen: the title was cut off at the top and the buttons ran off the bottom. It's set a little closer together when the window is short, and never crops the top.",
      "In the government's People list, the words after each name (their temper, their faith, a mark against them) are readable on the parchment. They were pale and nearly invisible. The list fits without scrolling sideways.",
      "Two settlers with the same name, sent for together before that was mended, are now told apart: the second is \"the younger\". Their opinions, feuds and shops could otherwise be muddled between them.",
    ],
  },
  {
    v: "0.44.4", date: "6 October 2026", title: "Readable, and the whole map",
    items: [
      "The tech tree is readable: what you haven't learned yet was dark on dark, and its names couldn't be read at all. The next things you can study are paper plates with a red edge, and the learned ones are green.",
      "The map grows with your land: Nova Aquilia, all the ground you've claimed and the raiders' camps are all on it now, where some had run off the top. Your first settlement is marked with its own name, not \"The Clearing\". The map's close key no longer sits under the frame counter.",
      "The cave is properly dark. An even warm light from outside was falling on every rock face, so the whole cave looked flat brown. Now the rock is lit only where your lantern and the torches reach.",
      "The undersides of eaves and little roofs aren't so black by day: the light thrown back up off the ground is a little brighter.",
    ],
  },
  {
    v: "0.44.3", date: "6 October 2026", title: "The right stuff",
    items: [
      "Every material in the game checked, model by model. The trees you fell now have real bark and needles; they were taken for sawn timber and for nothing. The fletching on arrows, the grip on the bow, rope, sails and flags are cloth. A ship's hull is timber. The bakery's oven is clay, not timber, and a burned house's timbers are charred wood. The raider's leggings had lost their cloth to a misread name, and have it back.",
      "Paths take the snow in winter: a thin, trodden cover, so the ways still show. They were left bare brown in the middle of the snow. They have their own surface now too: mottled earth, and cobbles in a brick town.",
      "Brick towns' roofs are only flecked with lichen. Whole roofs had gone olive green.",
      "The deer's coat is a duller brown. In the sun it looked orange.",
      "The camps' lean-tos are covered in hides that look like hides, not boards.",
    ],
  },
  {
    v: "0.44.2", date: "6 October 2026", title: "Polish",
    items: [
      "Fire looks like fire: tongues of flame, white-hot at the root and orange where they thin away, a warm glow round them, and sparks going up from a big one. The same goes for the fire in the clearing, the hearths, the torches, the camps and the cave.",
      "The cave is darker and cooler, so the warm light is the lantern's and the torches'. The rock runs in seams, with a rusty one here and there. The lantern is held out ahead, so it lights the way, not the axe in your hand.",
      "Proper icons in the plans for the well, the town hall, the church, the shrine, the jail, the hospital, the stable and the news stand. The well was a key, and the rest were all a cabin.",
      "The objective is set smaller, so it takes less of the screen.",
    ],
  },
  {
    v: "0.44.1", date: "6 October 2026", title: "Steel and slow time",
    items: [
      "Every raider (in a raid, at a camp or in the caves) takes two whole seconds to wind up a blow. The red mark by the crosshair shows which way it's coming, and grows as it nears. A glint flashes on the blade the moment before it lands. Guard that side just before it lands to parry, or step back out of reach and let it whistle past.",
      "Raiders at the camps and in the caves now fight as raid raiders do. They guard a side (the grey mark), so strike from another, and your guard blocks and parries them.",
      "Fights feel like fights now. A blow that lands holds for a heartbeat. A parry throws sparks and slows time for a moment, so you can strike back. The last blow on a man slows everything right down. Blows you take and give shake the view, and a man you cut bleeds.",
    ],
  },
  {
    v: "0.44.0", date: "6 October 2026", title: "Camps in the woods",
    items: [
      "Raiders' camps: a band has made camp in the woods near each of your settlements: a fire, lean-tos of hides, and a stash of what they've taken. Each one is marked on the map (J) with a red cross. They sit by the fire until they see you; crouch (C) to get closer first. Put them all down, and F at the stash takes it: money, ore and metal, meat, arrows, and the logs and rye they stole, back into the stores. Clearing the camp near your first settlement puts its next raid off a few days. Some days later another band moves in somewhere else.",
      "Raiders camped down in the caves keep a stash by their fire too, a richer one, and they're dressed as raiders now, not as townsmen.",
      "Better surfaces everywhere: the grain of wood, stone, brick, bark, plaster and cloth now catches the light as real relief, not just as colour. Weather shows on things too. Each log and board is its own shade, and timber greys where the rain gets at it. Rain streaks run down plaster walls. Moss and lichen grow on stone, brick and tiles where they face the sky or sit low and wet. The relief is turned off with the shadows on the lowest graphics setting.",
    ],
  },
  {
    v: "0.43.1", date: "5 October 2026", title: "The watch, in uniform",
    items: [
      "The watch has a tab of its own in the government menu (G, Watch). It shows the steps to having a watch, ticked off as you do them: research Policing, build a jail, put someone on the watch. It says what the watch does, and who is on it.",
      "The uniform is chosen there. The colour swatches were blank before: the menu's own button style covered them, so you couldn't see what you were picking. They show their colours now, the one chosen is ringed, its name is beside it, and a picture shows a man and a woman of the watch in it.",
      "The watch wear the uniform properly now. Women on the watch were dressed as housewives, in an apron and bonnet; they wear the uniform too, with a skirt the colour of the breeches. The steel helmet looked like a black felt hat; it's bright steel, with a crest and a brim swept up front and back. Choosing no sash takes the sash off. The tricorn keeps the waistcoat and sash, instead of turning them into an ordinary townsman.",
      "Anyone put on or taken off the watch, or indoors when you changed the uniform, changes into the right clothes as soon as they're out.",
    ],
  },
  {
    v: "0.43.0", date: "4 October 2026", title: "Read all about it",
    items: [
      "A news stand: research Broadsheets (a root of the tech tree, cheap and quick) and build one (B). F at it to read the settlement's own broadsheet. It covers who was born, died, came or left; who sold what to the pedlar, and what the thieves sold on the quiet; thefts and who the watch caught; quarrels, fights and feuds; the day's taxes; what was built, rebuilt or pulled down; raids, hardship, and word from abroad. It's sorted by day, and you can read one settlement at a time or one kind of news at a time. The news is kept from now on, so it's there to read whenever you build the stand.",
      "Fixed: your settlers went on working while the game was paused. Their stone, planks and bread kept coming in, and their day ran on with nobody moving. Their work keeps the game's own time now: paused, nothing gets done.",
      "Fixed: once the trees on the settlement's own ground were all felled or cleared for building, the woodcutters stood about all day doing nothing, and the woodshed ran dry. Now they go out to the forest past the edge of your ground. The trees they fell there grow back in time, as yours do.",
      "Fixed: several people sent for at once could all arrive with the same name.",
    ],
  },
  {
    v: "0.42.4", date: "4 October 2026", title: "Gone means gone",
    items: [
      "Fixed: a construction site you pulled down came back a minute or two later. A hauler still carrying logs to it put it back when they arrived. A pulled-down site stays down now, and the logs that were on their way go back on the stack.",
      "Fixed: animals' coats, the raiders' furs and hides had the wrong grain on them: the game took brown fur for wood or brick. Fur and hide are plain now.",
    ],
  },
  {
    v: "0.42.3", date: "4 October 2026", title: "Steady frames",
    items: [
      "Fixed the flickering on buildings for good, after finding it by measurement rather than by eye. Buildings were drawn from both sides at once, so the back of one face fought the face behind it. The gable ends were two triangles laid back to back, which could both end up facing the same way. And timber and iron trim lay exactly on the plaster under it. Buildings are now drawn from the outside only, gables are solid wedges, and trim is always drawn in front of the wall it's fixed to.",
    ],
  },
  {
    v: "0.42.2", date: "3 October 2026", title: "No snow indoors",
    items: [
      "Fixed: snow lay on the loft floor of your house. No snow falls anywhere under the roof now.",
      "Fixed: window frames and doorways flickered. The frames sat exactly level with the edges of the plaster round them, and the two fought to be drawn. They now stand a little into the opening, covering the edge. The timber framing on the settlers' houses had the same trouble where the posts, rails and braces crossed; they're spaced apart now.",
    ],
  },
  {
    v: "0.42.1", date: "3 October 2026", title: "Chips and shops",
    items: [
      "Chips of wood fly from the cut when you chop a tree, pale heartwood and dark bark, and a shower of them when it comes down. They lie on the ground a while.",
      "Fixed: settlers never started businesses in a settlement that had grown. They only looked for room for a shop in the old clearing and right beside the paths, and when those were full they gave up without a word. They look over all your ground now, including everything you've marked out. A settler with 12 DM of their own who is doing well may start one any morning (with the law that a shop needs your leave, they come and ask you).",
    ],
  },
  {
    v: "0.42", date: "3 October 2026", title: "Stairs, stone and ore",
    items: [
      "Fixed, properly this time: the stair in the house. It runs along the right-hand wall with its foot toward the middle of the room, so you walk straight onto it and climb toward the front, onto the loft. There's a rail along the well and across its far end.",
      "Tobias the pedlar buys ore and metal now, for the foundries in Lübeck: copper, tin and iron ore, and copper, tin, bronze and iron. Sell out of the stores into the treasury, or out of your own pack into your purse.",
      "The stores hold 50 stone, and twice as much for every step the town hall is rebuilt: 100 in timber, 200 in brick, 400 in stucco. The bar at the top shows how full they are. With the stores full of stone, the quarrymen stand idle.",
      "Animals live out in the woods now, not only at the deer ride: deer, hares and the odd boar, each with its own patch of forest. They keep well away from your settlements and turn back if they stray close. Hunt them as you would at the ride.",
      "Talking to a settler tells you which settlement they belong to.",
      "The objective is for the settlement you're standing in, with a word on any other that needs you: one running out of food, or one with empty beds.",
      "No more dust when you strike a rock: just the chips.",
      "Hands are plain again: the fingers are gone.",
    ],
  },
  {
    v: "0.41.2", date: "3 October 2026", title: "One edge",
    items: [
      "The map draws the edge of your land once, round the outside of all of it. Where ground you've marked out meets the old clearing, another piece of marked-out ground or a settlement, no dashed line runs through the middle any more.",
    ],
  },
  {
    v: "0.41.1", date: "3 October 2026", title: "The town hall",
    items: [
      "The town hall does something now, more the grander it is (logs, then timber, brick, stucco):",
      "Its clerk collects the wage taxes: 15% more for each step it has been rebuilt. Taxes & trade (G) shows how much the clerk found.",
      "Its council settles feuds. They burn out sooner, blood money costs half, and old grudges fade faster.",
      "Word sent from it brings people up the road for less: 2 DM off sending for someone for each step, down to 4 DM.",
      "Settlers bring their goods to it, as they do to the stores, when it's nearer.",
      "Everyone is a little prouder of the place, from +3 to +6 contentment for having a say in how it's run.",
      "And a brick town hall is still the charter you need to rebuild in the city style, and to be called a City.",
    ],
  },
  {
    v: "0.41", date: "3 October 2026", title: "Tools and uniforms",
    items: [
      "Fixed: settlers' hands and skin stretched out with their arms. Everyone's arms are now their own, so a hand hanging against the hip no longer drags the hip, the coat or a pocket flap along when it reaches out.",
      "The watch wears a uniform, and you choose it: G, then Taxes & trade, then The watch's uniform. Pick the coat, the breeches, the waistcoat, a morion helmet with a sash or a tricorn with its colour. Everyone on the watch changes into it at once, and anyone set to the watch puts it on.",
      "Every settlement has its own yard: a chopping block to make tools at and a sawhorse to hew doors on, both using that settlement's own logs. Its stack, or its woodshed once it has one, takes logs in and gives them out. Each woodshed shows its own settlement's logs, and the first settlement's stack no longer wanders off to a woodshed built somewhere else.",
      "The government menu (G) is the government of the settlement you're standing in: its people, its families, its stores and its food. The treasury, research and laws are the nation's, the same from anywhere. Sending for someone picks the settlement you're in.",
      "All the tools rebuilt to match the rest of the forest: faceted, plainly shaped, each showing what it's made of. A pickaxe is a fire-hardened wooden point, two stone wedges lashed on, or a forged crescent of copper, bronze or iron. A hammer is a wooden mallet, a lashed stone or a forged head. The axe, the spade with its T-grip and treads, the sickle with its bright inner edge, the saw with its teeth and cut-through handle, the knife, the swords with their fullers and turned guards, the spear, the club and the battle-axe all have ground edges where they cut.",
      "Strike a rock with a pick and chips of it fly out, in its own colour, with a puff of grit, and lie a moment where they land. A pick too soft for the rock throws only a few, and breaking a rock throws plenty.",
      "Fixed: you couldn't get onto the stair to the loft. Its first step is now within reach, and anything standing in the stair's corner is moved out of the way.",
      "Township's description said settlers take their goods to the town hall on their own. They don't, and never did. It now says what it really does: it unlocks the town hall (a brick one is the charter you need to rebuild in the city style, and to be called a City) and the quarryman's trade.",
    ],
  },
  {
    v: "0.40.1", date: "3 October 2026", title: "Upstairs",
    items: [
      "Your house has an upstairs. A steep stair in the corner by the door climbs to a loft under the roof, with a bed and its red blanket, a chest, a stool by the window and a rail round the stairwell.",
      "The windows are real. Thirteen glazed, leaded windows, five downstairs and eight in the loft, and you can look out of every one, across the clearing and into the forest. The timbers inside step round them.",
      "Fixed: a beam ran across the doorway inside the rebuilt house. The rail now stops either side of the door.",
    ],
  },
  {
    v: "0.40", date: "3 October 2026", title: "Faces and families",
    items: [
      "Everyone has been rebuilt from the skin out. Faces are sculpted in one piece: a brow and eye sockets, cheekbones, a real nose, lips, a jaw and a chin, with colour in the cheeks and the eyebrows painted on. The eyes have an iris and pupil and a lid over them. Hands have fingers and a thumb. Hair is combed in strands from the crown to a clean hairline, and beards grow from the skin. Coats hang open in folds to the knee, split up the back, with pocket flaps and buttoned cuffs. Breeches are buckled at the knee, and shoes have heels and buckles. Skirts are gathered and full, with a darker hem, and aprons hang over them. Women wear a kerchief crossed at the breast and a linen coif with a frill. Tricorns have their brims pinned up properly. Shade gathers under brims and in folds and eye sockets.",
      "Raiders dress like the forest men they are: a shaggy mantle of skins over the shoulders, a leather jerkin and a ragged tunic, a rope belt, bare arms with leather bracers, legs bound in strips, furs round the ankles, a fur cap, wild hair and beards.",
      "Children grow up. A child grows over three years (24 days), getting taller and losing the big head of a little one. Then they're grown, and take up hauling: F beside them to set their work. And children are born: a family with a man and a woman, well fed and content, may have a child, a son or a daughter with a name of their own.",
      "A Families tab in the government (G). Every family, its people, and what it thinks of each of the other families, from close friends to out for blood. Click a family to see who each of them likes least and most, and every reason: a quarrel over a borrowed axe, taking a cousin's side, another creed, hard times, good times, a generous neighbour, time healing. Feuds are marked in red.",
      "Settlers quarrel less often and less bitterly, and old grudges soften a little every day unless a feud keeps them up. Good times, working side by side and sharing a faith win them round.",
      "Rebuild your cabin as a house and the outside changes too: a two-storey house in timber and plaster with a red tile roof, like the settlers' own, with your door and a chimney over your hearth, and a boarded ceiling inside.",
      "Crafting shows everything you can make with what's built. Recipes you're short of are greyed out, with what's missing in red. Copper, bronze and iron tools stay hidden until you have a forge, and it tells you how many more recipes a forge would open.",
      "A new felling axe: a bearded head forged thin to a bright honed edge, with a wedge in its eye and a cord whipped under it, on a curved oval hickory haft with a knob at the end.",
      "A stump goes when a tree grows back on it.",
      "Settlers earn money of their own. Once a day each takes a break to make something in their own time: kindling, a basket of mushrooms, a bunch of herbs, a rabbit skin, a whittled spoon or carved pegs. When Henning or Tobias is in, they take it to him and sell it for their own purse. None of it comes out of the settlement's stores, and none of it is taxed. The People tab shows what they have to sell and what they've saved.",
      "Thieves take goods as well as coin now: rye, loaves, meat, planks, stone, bricks or iron out of the stores. They hide it, and sell it on the quiet to the next trader. You may hear that someone was seen selling planks to Tobias, and wonder where they came by them. With a jail and a watchman, the watch may catch them in the act: the money goes back to the treasury and the thief to the jail.",
      "The name of what's in your hand shows for a moment right below its slot whenever you change it, with the wheel or 1-9. Hover over anything on the bar, in the inventory or in a chest, and its name shows right below it.",
      "Policing can be researched from the start (15 DM, in the Military Philosophy tree): the jail and the watch, to catch thieves, no longer wait on Trading, Currencies and Marketing.",
      "Fixed: a ripe field could still be reaped in the middle of winter. Nothing is reaped or sown till spring.",
      "Planks and bricks have pictures of their own: a stack of sawn boards and a pile of red bricks, instead of a door and a stone.",
    ],
  },
  {
    v: "0.35", date: "3 October 2026", title: "Rough edges",
    items: [
      "The charcoal burner's camp, mended. The turf on the clamp lies flat against it, overlapping like scales, instead of sticking out at all angles, and the vents are glowing holes in its side, not balls floating off it. His ladder is one ladder, rungs and rails together, leant up the clamp. The poles of his hut lean in and cross at the top. His fire is a real little fire with sticks burning in it and a kettle on a hook, not a flat orange disc. The charcoal sacks are coarse cloth tied at the neck, not wooden balls, and the baskets are wicker with charcoal heaped in them.",
      "Every settlement keeps its own people and its own stores. A new settlement starts with a cart's worth of logs and rye and nobody living in it: raise cabins there, then send for people to settle it (G, People: choose the trade and where they go). They live, work and eat there, from its own stores, and its store chest is its own. The treasury, the research and the laws stay the nation's, shared. The bar at the top shows the stores of whichever settlement you're standing in.",
      "Fixed: the Nation tab (G) showed nothing. It shows the food again, with how many mouths there are and what each eats in a day.",
      "A gunsmith: once your settlement reaches fifty souls, Matthias comes up the road from Suhl and sets up his bench. He makes muskets to order, a hundred DM each and a quarter of an hour of play apiece, one at a time. Order one for yourself out of your own purse and collect it at his bench, or order them for the settlement's armoury out of the treasury. Your musket: right mouse to raise it to your eye, click to fire (a loud bang, a cloud of smoke, and it hits hard: a raider anywhere, double in the head), then six slow seconds of loading. In a raid, the armoury's muskets go to the watch first: they fire from range, then club with the empty musket while they reload.",
      "Cut down bushes and ferns: swing the axe or a blade at one and it comes down in a scatter of leaves, and stays down.",
      "Look at a grave and its cross says who lies there, how they died, and on what day.",
      "Rye and rye seed have different pictures now: a sheaf for the rye, the seed corn for seed.",
      "The inventory (T) shows your tools: the axe, the pickaxe, the spade, the hammer, your own sword, your backpack, the bow and your arrows, each by its making, with what it does and a bar showing how worn it is (and how many strokes it has left). Hands shows what you're really holding: the blade, the pick, the bow or food.",
      "Snow lies on the ground, the trees, the roofs and the woodpiles, but not on people or on what they hold: no more snowy heads, shoulders, axes or hands.",
      "At a trader you choose who pays: the treasury or your own purse. From the treasury, what you buy goes to the stores and what you sell comes out of them, as before. From your purse, what you buy goes in your pack and what you sell comes out of it, and the money is yours. The settlement's own purchases (the saw, the woodcutters' axe heads, iron tools) are paid from the treasury. Rye and rye seed can be carried now, and put in the store chest.",
      "Eat straight out of your inventory (T): click any food on you to eat it. Blackberries and roast meat have their proper names there now.",
      "The bar at the bottom holds only what you carry. The settlement's bread is no longer on it: take bread from the store chest to eat it.",
      "Fighting is harder. A raider draws his blow back for a full second before it lands, and all that time a big red mark by the crosshair shows the side it's coming from: up for a blow from above, left or right for the sides. Raise your guard on that side (right mouse) just before it lands to parry; held up all along, it only blocks, and costs you breath. Your blows no longer stop his once he's started it, so you can't just hack away, and he moves his guard to the side you're on more often. Raiders are tougher (85 health) and hit harder.",
      "Raiders can be shot down: an arrow strikes anywhere on a man, feet to head, not only his middle, and an arrow in the head does double.",
      "Your brother or sister wants you to make a stone pickaxe before you go down into the cave, since a wooden one won't touch copper. The marker and the objective take you to the chopping block for it first: a wooden pick, the grey stone round the clearing broken with it, and then the stone pick. Then the cave.",
      "Fixed: you could pick blackberries in the snow. In The First Winter there's no settlement to say it's winter, so the brambles didn't know; now they go bare whenever snow is lying, as well as in the settlement's winter.",
      "In the free camera the mouse wheel sets its pace: roll it up to fly faster (up to twenty times as fast, for crossing the country) and down to creep (down to a quarter, for close work).",
      "The pickaxe only ever swings overhead, down into the rock, whichever way you've turned (and the arrow by the crosshair that shows the side of your next stroke stays away while you hold it). Seen from outside, you swing it overhead too.",
      "Fixed on Windows: crouching with Ctrl while walking forward closed the game, because Ctrl+W was the app's Close Window shortcut, and Ctrl+M minimised it. On Windows the menu has no Ctrl shortcuts now. F11 and Alt+F4 still work.",
      "The mouse wheel goes along the bar at the bottom: down for the next thing, up for the one before, round and round. It takes up tools, weapons, the bow and food, and passes over things you can't hold, like logs and arrows.",
      "The charcoal burner lives in a different hut: a ridge pole on crossed poles at each end, two bark-slab roofs coming down to the ground, gables of upright split logs with the doorway toward his fire, and sods along the eaves.",
      "Fixed: with food in your hand, being given the axe (or taking up a blade, the pickaxe or the bow) left the food in your hand and the axe hidden behind it, and a click took a bite instead of a swing. Taking up anything now puts the food away, and if the axe was already out behind it, pressing its number shows it again instead of putting it away.",
      "Fixed: when the watch came for Father, he could walk to you and keep on walking, and the scene never went on. Now a scene waits a few seconds at most for anyone walking into place, then carries on. The same goes for the Amtmann, Kessler and Jakob in the last chapters.",
      "Fullscreen in the settings: tick it for the whole screen, untick it for a window. It's remembered, and the game goes back to fullscreen at your first click next time. F11 still works too.",
      "Rye takes longer to come: a field stands a stage every two days, four days from sowing to ripe (Agriculture and weeding still bring it on sooner). A harvest gives sixty rye now, seventy-two with a well, so the fields still feed you.",
      "Fields snap against each other properly. A field snapped onto the first one you ever dug was always refused, because a circle kept clear round that field kept other fields away too. And a field is now checked as the rectangle it is, not a circle round its corners, so it can lie right up against its neighbours. Aim near a field and it goes on the nearest side where it really fits.",
      "If the graphics give out (some Windows graphics drivers drop them), the game saves what you have, starts again by itself and puts you straight back into your game, instead of freezing or closing. A small slip in the background no longer closes the app either: it's written in the log (Help → Show the error log) and the game carries on.",
      "Fixed for Windows: the app wouldn't open at all, because its data folder had a colon in its name, which Windows doesn't allow. If anything ever stops it starting now, it says so in a box instead of quietly closing.",
      "The bow, made real. The draw comes easily at first and harder the further back it comes, and the limbs creak as you pull. Held, the aim wanders, a little more the longer and harder you hold, and the arrow goes where the bow was really pointing. Hold Shift at full draw to hold your breath and steady it for a few seconds; it costs wind, and you shake worse after. The string goes with a deep twang and a slap. The bow kicks forward and rolls in your hand, the string shivers, your drawing hand flies back past your ear, and the view jolts. Then your hand goes back over your shoulder to the quiver and brings the next arrow to the string. A part draw let go is let down gently, not shot. You walk slowly with a bow drawn, and can't run. Arrows flex and wobble just off the string, and straighten as they fly.",
      "Food goes in your hand now: press its number to take it out, click to take a bite, and press the number again to put it away. It stays in your hand while there's more of it.",
      "Fixed: heads that wound round and round, or ended up looking over their own shoulders. Your sister, and anyone else turning to look at you, now turns her head only as far as a neck goes.",
      "Fixed: rebuilding the cabin in The Clearing didn't take its twenty logs off the stack.",
      "The charcoal burner's clamp is one turfed mound now, lumpy and patched green and brown, with its foot following the ground. Its glowing vents are set into its side, and his ladder leans against it.",
      "New animations for everyone in the game. In a fight, people stand in a real guard, weapon or fists up and the weight rocking, and step sideways round each other instead of walking forward while sliding sideways. Blows come from the side or straight down from overhead, with the wind-up showing before the blow lands. Anyone hit flinches: the head snaps back and the body twists away.",
      "Anyone knocked down goes over backwards instead of snapping flat, and gets up the same way.",
      "Settlers carrying logs, sheaves or sacks keep their arms round the load while they walk. Farmers dig with the spade driven in by the foot, reap stooped with the sickle swept low, and sow with the seed cast wide in an arc. Grubbing out stumps is spade work too.",
      "In first person, reaping has its own stroke now: a sickle swept low through the stalks. Picking berries, pulling an arrow out, gathering moss or picking up a stone shows your hand reaching out, closing round it and pulling back. Each piece of work in a field sounds like itself: the spade's bite, the sickle's swish, the seed falling.",
      "Fixed: restarting a chapter (or going back to the title) while in the free camera left the HUD hidden. Starting any chapter now always puts you back in yourself. While the free camera is on, a banner says so, and ; brings you back even with a menu open.",
    ],
  },
  {
    v: "0.33", date: "2 October 2026", title: "Duels and daily bread",
    items: [
      "Fights are one-on-one. A raider who comes at you squares up to you alone: he stops to fight instead of making for the stores, circles you, steps back out of reach and closes again, and doesn't let go until one of you is down. Hit another one and he turns on you, and the first lets you be.",
      "Settlers pair off with raiders, one each, and fight it out the same way, circling and stepping back out of a wind-up. Anyone without a raider to pair with waits a few steps off, ready to step in when one falls. Rebels in a rising, and the bandits in the cave, fight the same way.",
      "Farmers carry the reaped rye to the store chest in sheaves, and the baker fetches it from there in a sack and carries it to the oven.",
      "Food by the day: each settler (and your brother or sister) eats five rye, or three loaves, or two meat a day. Your kitchen's dishes are a whole day's food, and come first, then bread, then meat, then rye. A field now gives forty rye (forty-eight with a well), and a baking turns four rye into six loaves, so bread goes more than twice as far. Henning sells rye by the twenty-five, and his salt pork is twelve meat.",
      "Harvest Home puts food first: your brother or sister explains what everyone eats in a day and what the days' food on the board means, and the chapter asks you to reap the rye, put someone in the fields as a farmer, and lay in five days' food before the rest. The chapter opens with three days' food in the stores and 10 DM in the chest, whatever state the summer left you in.",
      "Tobias the pedlar sells food: a sack of 25 rye, 15 loaves of Lübeck bread, and smoked herring (ten meat). He still has his salt pork and rye seed.",
      "The settlement bar shows your rye seed, the meat in the stores, and how many days the food will last everyone, in red when it's under two.",
      "Fields snap together: a new field near one already dug sets itself edge to edge and square with it, so the fields make one patchwork.",
      "Rye seed: sowing a new field takes a seed, and every harvest gives back a third of one. You start with three, and Henning sells them for 3 DM.",
      "Tools wear out. Every stroke wears a tool, and better makings last longer: wooden 60 strokes, stone 120, copper 200, bronze 300 and iron 450. A bar under each tool in the hotbar shows what's left, and turns red when it's nearly gone. A worn-out axe or spade leaves you the old one from the block; anything else has to be made again.",
      "In build mode, Y turns what you're placing the other way (R still turns it, and Shift+R still reverses it).",
      "Fixed: once you had a woodshed, the old log stack by the cabin was gone, but it still stood there invisibly, blocking the way and showing on the map. Now it goes with it.",
      "With no farmer in the settlement, the fields aren't left to rot: whoever stands in for the farmer (the hauler, or anyone grown) reaps and sows them too. Hunters bring home four meat from a kill instead of two.",
      "Settlers dig new fields now. A field you stake out used to sit there until you dug all three strips yourself; now the farmer turns it over a strip at a time with the spade and sows it. With no farmer, the hauler does it, or anyone grown. You can still dig it yourself (hold F).",
      "The map shows your settlement as it stands: every building in its real shape and turn, sites still being built as dashed outlines, paths as tracks, and fields coloured bare, growing or ripe.",
    ],
  },
  {
    v: "0.32", date: "2 October 2026", title: "In your hands",
    items: [
      "First-person hands that move with you. Whatever you hold sways behind you as you turn and catches up, bobs in a figure of eight with your stride, and rides lower and tilted when you sprint. It drops as you land from a jump and floats as you fall, rolls as you step sideways, and rises and falls with your breath when you stand still.",
      "Taking something out (the axe, a blade, the bow, a tool for a job) brings it up into view from below instead of popping it into your hands.",
      "Strokes land with weight: the view turns with the swing, and when the blade bites (a tree, a rock, a raider) the stroke checks for a moment and the jolt runs up your arms.",
    ],
  },
  {
    v: "0.31", date: "1 October 2026", title: "The kitchen",
    items: [
      "The app updates itself now: when a new version of the game is out, it downloads in the background and asks whether to restart into it. There's no need to install the app again. Help → Check for updates looks straight away.",
      "Better animation all round. People walk and run with knees that fold as the leg comes through, feet that push off and lift, hips and shoulders turning against each other and the head held level. Standing, they breathe and shift their weight, and glance about. Felling has a real wind-up, a fast stroke and a follow-through, and hammering lifts slowly and comes down hard. Every held pose breathes instead of standing frozen.",
      "Deer and boar rock as they gallop, nod their heads as they walk, and look up from grazing to glance about. Shot running, they carry on a stride or two before going down, legs kicking.",
      "Landing from a jump or a drop: the view dips as your knees take it, harder the further you fell, with a thud underfoot.",
      "The cave is where a fork in the road runs out now: the track that used to stop at a fallen spruce goes on to the cave mouth.",
      "A couple of days into free play, your sister tells you about the cave and asks you to dig ore there to sell to Henning and Tobias. Until you have a forge, she warns you can't use it yourselves: neither of you knows how to forge yet. It's marked until you get there.",
      "Better animation: the axe swing has a proper wind-up, a jolt on the wood and a follow-through; fist fights are fought with fists up in a guard, jabs and crosses; people eat with a spoon at the eatery's tables, the cook stirs the pot, and anyone you talk to turns and talks with their hands. People standing about turn their heads to look at you as you pass close. Deer and boar nod as they walk and rock as they gallop.",
      "Cinematic shading (Settings, on unless you choose Performance): shadows are softer shade instead of black, the darkest corners are lifted a little and cooled, light is warmed, fires and lit windows glow softly, and the picture has a gentle vignette and a fine film grain.",
      "A key to the map: press K for it beside the minimap, and it's always in the corner of the big map (J).",
      "Ore and caves are drawn properly on the map now: a lump of rock with copper's green flecks, tin's pale crystals or iron's rust streaks, and a cave as a hillside with its timbered mouth.",
      "Step into a tree and its branches thin away around you, so you can see out through them while you stand hidden in among them.",
      "The mouse lock in the app: the game waits longer for the lock, asks for it again at your next click, and the moment it comes, turning no longer stops at the edge of the screen.",
      "The charcoal burner's camp, rebuilt: a proper beehive clamp under its turf with the fire glowing through its vents, a ladder up it and a wattle windbreak, the next clamp half stacked, a cone hut of poles and bark, his fire with a kettle on a crane, heaps and baskets and sacks of charcoal, and soot trodden into the ground. The smoke drifts up soft now.",
      "A miss that lands near game sends it bolting away from where the arrow came from.",
      "An arrow that strikes a beast is spent: it breaks, and doesn't come back to the quiver. You can still pull your misses out of the ground.",
      "Blackberry brambles round the clearing and along the road: hold F to pick a handful. They fruit again a few days later, and stand bare in the winter.",
      "Jumping costs breath. Winded, you can't jump at all, and when you're nearly spent it's only a hop.",
      "Every tree gives two logs. A good saw, and Sawing and Sawmills, now make felling quicker instead of giving extra logs.",
      "The waypoint marker holds steady: one route to each objective, kept unless it really changes, and it glides across the screen instead of jumping between spots.",
      "Credits, on the main menu.",
      "The road no longer looks like wooden planks: its brown was being mistaken for timber and given wood grain. It has the plain earthy grain of the ground now.",
      "The roads melt into the ground now: their edges fade out over a wider band, and the grass along them and up the middle takes the colour of the ground there (litter, moss, dry grass, stone) instead of one green everywhere. The roads to new settlements fade in the same way.",
      "Two new settings: Saturation (from washed out to vivid) and Pixelation (from off up to 8×, for big hard pixels).",
      "Everyone's shoulders are joined on properly now: a broad shoulder line across the top of the chest that the arms grow out of, instead of arms hanging off a narrow neck. The arms hang closer to the body too.",
      "The kitchen stays locked until you rebuild your cabin as a house (B, inside the cabin). Until then there's only the fire.",
      "A kitchen in your house: rebuild your cabin in timber and plaster, and there's a brick range beside the hearth with a pot and a pan on it, a work table with a board and a knife, crocks on a shelf and herbs drying. F at the range opens the recipes.",
      "Cooking, properly: the meat is cut up on the board, then into the pan or the pot. Watch the gauge and take it off the heat (Space) in the green. Too soon and it's underdone or raw; too late and it's dry, or burnt black. Turn what's in the pan once, about halfway (F); keep the pot stirred (F) or it catches on the bottom.",
      "Eight dishes, from roast venison and fried hare to venison stew, boar with blackberries and wild boar stew. Some want rye or bread from the stores, or blackberries.",
      "Every dish is judged when it's plated: stars out of five, and the reasons. Good meat badly overcooked might be two stars, and the card tells you why.",
      "A meat for every beast: venison from the deer (rich, but dries fast), hare (delicate, quick to ruin) and boar (fat and filling; it must be cooked through). Each has its own taste, tenderness and filling.",
      "Wild boar in the woods: heavy, hard to bring down, worth two hides. Wound one when you're close and it comes for you.",
      "A Cooking skill (P): a truer eye for when a dish is done, a wider moment to take it off, better dishes, and new recipes as it rises.",
      "Tobias the pedlar buys your dishes. He tastes each one and decides what he'll pay.",
      "Put dishes in the store chest and your people eat them, the best first. Settlers who eat well are happier, and a bad meal sours their day.",
      "Eateries: a settler may open one instead of a shop, with tables and benches outside and a pot on a tripod. The owner buys meat and bread from the other businesses, or goes hunting and fetches rye, then cooks. The meals are as good as the cook. At midday settlers go and eat there, sitting down at the tables. You can buy a meal too.",
      "Families and feuds, as in the first Forester: everyone has a family name, and some newcomers are kin. People form views of each other. Let one sour far enough and the two families take up a feud and come to blows on sight; sometimes someone dies. The watch can lock up whoever starts it, or you can pay blood money to end it (F by anyone in it). Left alone, it burns out.",
      "New sounds: the sizzle and spit of a pan, a pot bubbling, the knife on the board, a spoon round the pot, a pan tossed, a plate set down, fists landing. New hand animations: stirring with a ladle, and turning with a spatula.",
    ],
  },
  {
    v: "0.30", date: "30 September 2026", title: "A country of its own",
    items: [
      "Settlers can die now, and not only in raids: a fever left untreated, days on end with nothing to eat or no wood for the hearth, the fighting in a rising, or the dark in the caves. The weakest go first. Each is buried by the graves, and the settlement mourns.",
      "A raider's victim no longer gets up and goes back to work once the raid is over.",
      "Dark Fantasy (Settings): a darker, colder, greyer world with the mist in close, drawn at low resolution in big hard pixels.",
      "Hares hop now, instead of walking like little deer: a bound, a pause, and another bound, long low leaps when they bolt.",
      "Caves: a mouth in a hillside out in the forest, and behind it hall after hall of dark rock, thick with copper, tin and iron. Your lantern and a few old torches light the way. Sometimes raiders have made their camp down there.",
      "A second settlement: after forty minutes of play you're asked whether to found one. Say yes and a road is cut through the forest to a new clearing, with its name on a signpost.",
      "Settlers earn wages selling their wares to the pedlar, and you tax them (G, Taxes & trade). A tenth of every tax is yours. High taxes make them unhappy, though the contented mind less.",
      "Companies: a settler who has saved enough may start one (Bread, Meats, Lumber, Stone, Ironmongers or Goods). Each has its own name, colours, pattern, emblem and banner. They fell their own timber and build a shop, and you can buy there cheaply. There's a business tax, and laws: forbid businesses, or make them ask your leave and show you the spot.",
      "A rising: keep the settlement miserable (under 35) and, after twenty minutes of play, the unhappiest take up arms with red rags on their arms. The loyal fight them in the streets. Lose, and they take the treasury and strike down the taxes.",
      "Horses: research Horses, build a Stable, and ride at more than twice walking speed. X gets you down.",
      "A backpack: prey drop hides, and four make a Hide backpack at the chopping block. Your pack holds 6 slots to start, 12 with the backpack, then 18 and 27 as you stitch better ones.",
      "Hunters: a new trade. They go out to the deer ride and bring back meat and hides.",
      "A cabin rebuilt in timber and plaster is a House, and sleeps 3. Your own cabin can be rebuilt as one too (B, inside), with plastered walls, a boarded floor and room for settlers in the spare beds.",
      "Claim new ground by drawing: hold the left button on the map and draw out from the settlement's edge round the ground you want, and back.",
      "The land rolls: hills, ridges and hollows. Paths and fields lie along the slope, and buildings are dug into it.",
      "Stumps can be dug up (hold F), and nothing grows there again.",
      "A building on a slope has its ground dug out for it: a level pad cut into the hill, with a bank of bare earth round it.",
      "Watchmen can be asked to follow you (F beside one, Follow me). They go wherever you go, down into the caves too, and fight at your side.",
      "Once you've found the cave, it's on your map. Inside, the map (J) and minimap show the halls you've been in, and the ore in them.",
      "Ten stones in the alley by the marsh gate now, along its whole length, instead of three.",
      "Fixed: what people held (axes, torches, lanterns, spades) wasn't in their hands at all, but hung beside them. It's gripped in the fist now.",
      "In first person your own body is there: look down and you see your chest, your coat and your other arm, joined up with the arm that holds your axe.",
      "Fixed: the ore in the caves was invisible. Fixed: coming back from the free camera left you crouched and slow.",
      "Paths are a quarter quicker to walk on. Settlers no longer clip through walls.",
      "Harder raiders: tougher, quicker, harder-hitting, more of them, and a parry stuns them for less time. Once Policing is known, only the watch fights them; everyone else takes cover.",
      "Everything yields less: fields give 4 rye (5 with a well), a loaf takes 2.5 rye, trees give fewer logs, and works and ore rocks make less. Food fills you less.",
      "No reaping or sowing in winter, and nobody tells you to. Your sibling only worries about food when the bread is short too.",
      "Logs from a tree felled far out stay where it fell, and haulers gather up logs left lying about, and dig out the stumps left in the settlement when they've nothing to carry. You still stack the woodshed yourself.",
      "Research advice names the whole path (\"Research Land Ownership, then Township, for a town hall\"), so it can always be done.",
      "; flies a free camera, with no HUD. Right-click is no longer a second F.",
      "Your breathing is softer, like breath and not like grass.",
      "Trees keep their own shape when you start felling them (no more turning into a fir the moment you swing), and every tree falls its own way: taller ones slower, birches quicker, with a twist, a roll and a bounce as it lands.",
      "Trees don't grow back where you've built: not through paths, fields, walls, shops or roads. Stumps under anything you lay out are grubbed up with it.",
    ],
  },
  {
    v: "0.29", date: "30 September 2026", title: "More room for logs",
    items: [
      "Woodsheds can be made bigger. Look at one (V) and build on a second bay (holds 70 logs), then a third (120). Each bay is the shed again, built on beside it, and the logs fill all of them.",
      "You can walk all around the quarry, and into its pit. Only the rock face round the back and the crane's post are solid.",
    ],
  },
  {
    v: "0.28", date: "30 September 2026", title: "Room to grow",
    items: [
      "Fixed: F (and Space, Enter and Escape) stopped working after the first guide card. It works again.",
      "You choose where the settlement grows. At 8 people, then 13, 19, 26 and 34, you earn a claim. Open the map (J), click Mark out new ground, and drag a line through the trees beyond the edge. The ground between your line and the settlement is yours to clear and build on. The map shades it green if it will do, red if not and why, and counts the trees on it. A claim can't be too big: 10 to 45 paces of line, and 1000 square paces at most.",
      "The settlement no longer grows by itself in rings. Everyone but the farmers fells the trees on new ground, and the road is always left open for newcomers.",
      "The map is fast: the forest, roads and fog are drawn once and only the piece in view is copied out, so the minimap no longer stutters as you walk, and the big map drags and zooms smoothly.",
    ],
  },
  {
    v: "0.27", date: "30 September 2026", title: "The guide",
    items: [
      "A guide: the first time you meet each part of the game (building, stone, tools, the forge, the stores, settlers, fields, research, trade, hunger, wounds, skills, winter, raiders), the world stops and a page explains how it works, step by step. H opens the guide book to read any of them again.",
      "Stone, ore and metal in your own pack count towards a building, a repair or a rebuild. You no longer need to put them in the stores first.",
      "Path strips snap together end to end. Nearly in line, they run straight on. At an angle, they meet in a clean corner with rounded ends and no gap.",
      "A quarry can be staffed as soon as it stands. The quarryman's work no longer waits on Township. Any work building you can build, you can put someone to.",
      "Only haulers carry logs and stone to building sites, and the game now says so. A site tells you when nobody is hauling.",
      "The settlement's stores are kept outside now, in a store chest under a little roof, built as one of the summer's tasks. The chest in your cabin is yours: what you put in it you can sell, and that DM goes into your own purse. Arrows cost 4 DM a dozen, from your purse.",
      "Your sibling asks you to raise a cabin for Tomas and Grete.",
      "Farmers really farm: they reap, sow and weed the strips, and you can reap and sow by hand beside them.",
      "B puts the plans away. Buildings turn smoothly while R is held, with no snapping. Paths are low-poly strips of trodden earth.",
      "It's much easier to walk around cabins and buildings. The charred beams are gone from the cabin.",
      "The map of Europe shows your settlement by the name you gave it.",
    ],
  },
  {
    v: "0.26", date: "30 September 2026", title: "What it costs",
    items: [
      "Dying costs you now: whatever killed you — a raider, the plague, hunger — you wake in your bed with every skill a sixth down (15% of all your skill points). Hunger can kill, in the end.",
      "Settlers can die in a raid. The dead are buried in a row of crosses at the edge of the clearing, and everyone mourns for three days.",
      "Cook your meat: hold F at the fire. Eat it raw and you take the plague — the health bar goes green, nothing mends, and it can kill you. A hospital cures it.",
      "Skills are much harder to raise: the first levels come in an afternoon, the last take a lifetime.",
      "Ambitions, in G: eight long aims for the settlement — a village, walls, an age of iron, a market town, brick, standing against a crown — each with a reward. The last is Father's name, written back into the rolls in Hamburg.",
      "The settlers work the metals too: miners bring up copper and tin as well as iron, the smelter smelts them, and the smith casts bronze. Your own tools can take what they need from the stores.",
      "Everything in the stores is to hand from the chest in your cabin: take five at a click, and shift-click to put things in.",
      "Research gates what you can build in every chapter, not only in free play — and what isn't known yet isn't shown at all.",
      "Walls are laid out as sites now: stakes and a line, logs carried to them, then raised. The plans show the building itself as you place it, not lines on the ground.",
      "Rebuilding is offered only when you inspect a building (V). Paths can be laid from the start. F closes any menu. Tab shows every key.",
      "The menus are set like a book of the age: laid paper, a double rule in ink, fleurons at the corners, rubric red.",
      "A digging animation, and one for sowing. The swing mark is a short, pale bracket. A better pickaxe. The sister holds her axe level, and the settlers turn their blades into the trunk.",
      "The deer ride is restocked through the day. The log stack sits on the bare ground.",
      "Much quicker: the forest is drawn in tiles, with plainer trees in the distance and none past the haze — about six times faster on the same machine. The minimap slides smoothly under you.",
      "Your saves are safer: the app puts a copy by before every update (Help, Show save backups), keeps a log of errors, and a save that can't be read falls back on its last good copy.",
    ],
  },
  {
    v: "0.25", date: "29 September 2026", title: "Flesh and iron",
    items: [
      "Hunger: a bar under your health, below the map, and both always in sight. Eat by pressing the number of what you carry — bread from the store, meat, berries — and you raise it to your mouth and chew. Go too long without and your breath won't come back and your wounds won't close.",
      "Skills, on P: Strength, Toughness, Healing, Endurance and Archery, each from 1 to 100, and each grows by doing it. The tougher you are, the less a blow takes from you and the less it rattles you.",
      "A blow now lands: a red flash, a hard jolt of the view, and then you gasp for breath a while, the view trembling with it. Your breathing is louder and clearer.",
      "Tools: make a wooden pickaxe at the chopping block from two logs, and break the grey rocks round the clearing for stone. Stone makes a stone pick, which breaks the green copper rock out west; smelt the ore at a forge, cast copper and tin into bronze there, make a bronze pick, and go after the red iron rock deep in the woods. Copper and iron axes fell quicker. Your brother or sister shows you how.",
      "More to make at the block: copper and iron spades dig the fields quicker; a mallet, then stone, copper and iron hammers raise buildings and hew doors quicker; and a sword of your own — wooden, copper, iron — for when they come up the road.",
      "Every new cabin wants a door hewn for it at the sawhorse, as the first one did.",
      "A chest in the cabin: nine places to keep things. After the hunt, and after the sowing, you're asked to put the meat and the seed away in it.",
      "When Henning hands you the bow, the game stops and a picture shows how to shoot.",
      "An arrow by the crosshair shows which way your next stroke will come: left, right or overhead.",
      "The hunt wants three beasts brought down, not one.",
      "Guards see further, and when they catch a glimpse of something they come over to look. The watchman at the marsh gate keeps his post.",
      "When someone comes up the road, the people about turn to watch them come.",
      "Rebuilding in timber, brick or stucco costs a great deal of what it's built of, and no money.",
      "The forest floor is low-poly now, like everything else: needle litter, moss, bracken, dry grass, bare earth and stone on the banks. Things only take a grain — wood, stone — where it fits; cloth and paint keep their own colour.",
      "Nothing in the game speaks of the clearing before you reach it. The old axe stays yours once you take it. The charred beam is gone.",
      "The minimap draws five times quicker. There's a Quit button on the front screen of the app.",
      "Fixed: you could end up boxed in with no way out. Now you step out to the nearest clear ground.",
      "Bronze, as the first Forester has it: break the pale tin rock south-west of the clearing with a stone pick, smelt it at a forge, and cast one copper with one tin there for two bronze. Every tool and the sword have a bronze making between copper and iron — and the iron rock now wants a bronze pick.",
      "Your own sword and axe show their making: a wooden blade, copper, bronze, iron.",
      "Fixed: grass showed between the cabin's floorboards.",
    ],
  },
  {
    v: "0.24", date: "29 September 2026", title: "Closer",
    items: [
      "The map of Europe zooms: scroll, or the + and −, and drag to move about. The cities' names keep their size as you come in, so more of the towns find room.",
      "Zoom far enough and the parchment gives way to the land itself, in three dimensions: the true coasts, the mountains where the ranges run — the Alps, Pyrenees, Carpathians, the Scandinavian fells, the Apennines, the Balkans, the Atlas, the Caucasus, the Anatolian plateau — and the country as it grows: tundra in the far north, taiga and pine through Scandinavia and Muscovy, oak and beech woods among the fields of the middle, olive and cypress round the Mediterranean, grass steppe on the Pontic and Hungarian plains, desert beyond the Atlas, rock and snow on the heights. Come right down and the woods are trees.",
      "The cities stand on it — houses and a church, named, in their masters' colours — and the borders are drawn on the ground. Click a city or a stretch of country there as on the map. Scroll out again and you're back on the parchment, where you were.",
      "Click a city on the map to see who holds it — and who held it in 1683, if it has changed hands. The crowns are named in English on the map now; the seas and the title keep their Latin.",
    ],
  },
  {
    v: "0.23", date: "29 September 2026", title: "A map of 1683",
    items: [
      "Europe (G) is the real Europe now: the true coasts, and each piece of land given to the crown that held it in 1683 — Denmark with Norway and Holstein, Sweden round the Baltic from Finland to Pomerania, the Spanish Netherlands, Royal Hungary and the Ottoman rest, Podolia lost to the Turk, the Cossacks on the Dnieper. The Dutch Republic and Morocco join the crowns.",
      "And it is drawn as a map of the time was drawn: engraved in sepia on old paper, the coasts water-lined, each crown coloured by hand along its borders, hills in profile, rivers, the great towns, the names in Latin — GALLIA, SUECIA, MOSCOVIA, OCEANUS GERMANICUS — a compass rose with its rhumb lines, a ship, a sea serpent, a cartouche, a scale of German miles, and the degrees round the frame counted from Ferro.",
      "Cities on the map: a hundred of them under their names of 1683 — Wien, Kiøbenhavn, Constantinopolis, Danzig, Chyhyryn — each a dot, the crowns' seats ringed in the colour of whoever holds them. Click a crown to see its cities.",
      "Wars between the crowns take a province at a time, and the borders visibly move; a city in a province taken changes hands, and word comes of it — \"The Austrian Empire takes München and Augsburg from Bavaria!\" A saved game's old conquests, drawn on the old map, are cleared.",
      "The borders of 1683 put right: Stettin Swedish, Silesia the Habsburgs', Pomerania and Ducal Prussia Brandenburg's, Leipzig and Dresden Saxony's.",
    ],
  },
  {
    v: "0.22", date: "29 September 2026", title: "The sick, and the hospital",
    items: [
      "Settlers fall ill now and then — more often when a crown near you has the plague, in a cold winter, or if they're sickly; less if they're hardy, or there's a well. A sick settler keeps to their bed and can't work, and feels it (−10).",
      "The Hospital (Physick): with a doctor at work in it — a new trade, and Physicking the skill of it — the ill are up in a day or two instead of most of a week.",
    ],
  },
  {
    v: "0.21", date: "29 September 2026", title: "Walls, and Europe",
    items: [
      "Europe, in G: the first Forester's map of 1683 — thirty-three crowns, their coastlines inked — with your home in the woods beyond Hamburg. It lives: the crowns go to war with each other and the borders move, plague and famine fall on them, and word of it reaches you on a card.",
      "Each crown has a view of you, set by its faith and yours. Send an envoy to warm it; once it's friendly, a trade pact brings a DM a day in customs. The crowns near enough to march — Denmark, Sweden, Brandenburg, the Empire, Saxony, Poland, England, France, Bavaria — can be at war with you: declare it, or have it declared on you if they come to hate you.",
      "At war, it isn't bandits that come up your road but a crown's soldiers — more of them, with swords, in its colours, every few days. Beat them at your gate twice and it sues for peace and pays for it; or buy peace yourself.",
      "Walls, as the first Forester's Defending gives them: a palisade of sharpened logs, laid a length at a time (three logs each) — each new length joins on where the last one ends — and gates in it. With Defending II, stone walls.",
      "Gates stand open, and are shut when raiders come. Raiders can't walk through a wall: they hack at it, and a length that's taken enough is broken through — rubble, and a way in. Look at it and press V to mend it.",
      "Fixed: the settlement's buildings could be walked straight through — by you, the settlers and the raiders. So could the burned cabin's walls, the fire, the log stack, the chopping block and the furniture in the cabin.",
    ],
  },
  {
    v: "0.20", date: "29 September 2026", title: "Faith and law",
    items: [
      "The seven faiths of 1683, as the first Forester has them, in the proportions they walked out of a North German wood: Lutheran, Catholic, Reformed, Mennonite, Jewish, Orthodox, Muslim. Each settler holds one, and it shows: Catholics keep the holy days and give alms, the Reformed work harder, Mennonites won't take up a weapon, a Jewish settler arrives with capital, the Orthodox fast.",
      "A state creed, proclaimed in G, Faith & law: its own are glad of it, everyone else resents a state church not their own. Under it, with its church standing, dissenters may slowly come over — some never do.",
      "A church or a shrine is raised to one faith: the state creed, or the biggest congregation. A new building, the Shrine (Consecration): somewhere of their own to pray. Having nowhere weighs on a village; being the only one of a faith weighs on a person.",
      "The law: a miserable settler may take from the stores in the night (never a Lutheran or a Mennonite). A new building, the Jail (Policing): with a watchman on the job the thief is caught, what they took comes back, and they're held a day and disgraced.",
      "The Edict of Expulsion: every dissenter from the state creed out on the road at once. It asks twice.",
      "Faith shows in the People tab too, beside temperament and mark.",
    ],
  },
  {
    v: "0.19", date: "29 September 2026", title: "People, as the first Forester has them",
    items: [
      "Skills: every settler has the first Forester's eleven — Woodcutting, Quarrying, Farming, Building, Smithing, Crafting, Fighting and the rest — from 1 to 100. They come knowing their trade a little, and learn by doing it: a master works in a little under half the time, and a master working nearby teaches faster.",
      "Training: pay out of the treasury to raise someone a level in the skill of their work (G, People).",
      "Temperaments, one each for life, from the first Forester's six pairs: industrious or idle, hot- or even-tempered, gregarious or solitary, stout-hearted or timid, generous or grasping, hardy or sickly. Each bends their work, their fighting, their mood or how the winter takes them.",
      "Marks, for what happened to them here: hardened for standing up to raiders, bitter for being beaten down and left lying, contented after a long run of good days.",
      "A mood of their own: the settlement's contentment, and then their own — temperament, mark, a bed of their own, work they're good at. Two miserable days and they go back down the road; you're warned the day before.",
      "Send for someone: pick a trade in G, People, pay 12 DM, and if there's a bed free they come up the road with the trade already in their hands.",
      "The People tab shows it all: temperament and mark, a mood bar (hover for why), what each is best at. Click a name for their whole sheet.",
    ],
  },
  {
    v: "0.18", date: "28 September 2026", title: "Look closer, and learn to build",
    items: [
      "Six saves, as in the first Forester: Saves on the title screen shows each one — who, how far, the settlement and its day, when you last played — to continue, start over, delete, or export to a file and import back (into any save, or on another computer). New Game asks which save to use. The game you had already is save 1.",
      "Fixed: a settlement with buildings in it could freeze the game solid a moment after starting — every building kept putting itself up again, over and over.",
      "V: look at a building and press V to see it up close — what it's for, who works there, what it costs to keep — and rebuild it in the next style or pull it down, for half its logs and stone back (three quarters, knowing Ownership). An unfinished site gives back all it was given.",
      "Upkeep, as in the first Forester but lighter: every work that must be tended — the well, the bakery, the forge, the market, the quarry, mine, sawmill, smelter, brickworks, the town hall and the church — costs half a DM a day. Cabins, fields, paths and the woodshed cost nothing. Short of it, the works stand idle until it's paid.",
      "More is learned than given: the woodshed wants Tree Cutting, the well Replanting and the brickworks Masonry. A new settlement starts with cabins, fields and paths.",
      "The settlement has its sounds again: felling, building and hauling had been silent. Settlers' work is only heard near them.",
    ],
  },
  {
    v: "0.17", date: "28 September 2026", title: "From above, from the left, from the right",
    items: [
      "Fixed: starting a chapter after playing one in the woods could leave the screen black.",
      "Strokes and guards have a direction. Look even slightly up and you strike from above; turn your view left or right and you swing from that side. Your guard goes the same way.",
      "Round the crosshair in a fight: a white mark for your side, a red one flashing where a raider's blow is about to come from, and a grey bracket on the side the raider in front of you is guarding.",
      "Parry by having your guard on his side as he swings — raise it, or move it there, just in time. A guard on the wrong side catches nothing. Strike where he isn't guarding, or he turns it aside.",
      "Raids are loud: war cries up the road, yelling and screaming through the settlement, a cry for every blow — and a ringing clang when steel meets steel.",
      "Out of breath, you hear yourself breathing, faster and harder the more spent you are.",
      "Fixed: on the first day the board told you to set someone to farming when there was nobody to ask.",
    ],
  },
  {
    v: "0.16", date: "28 September 2026", title: "Blades, guards and a health bar",
    items: [
      "Health: a bar of its own above your breath — ten red segments and a heart, with a pale trail showing what the last blow took. It mends slowly once nothing has hit you for a while. Run out and you go down, and come to by the fire with the raiders gone and some of the stores with them.",
      "Raiders come armed — knives, clubs, axes, now and then a sword — and carrying torches against the dusk.",
      "Parry: hold right-click with the axe or a weapon out to raise your guard. Raise it just as a raider swings and you turn the blow aside and leave him off balance; hold it up all along and you block most of it, at the cost of breath. Raiders and settlers parry too.",
      "Every grown settler fights: with a sword or a spear if the smith has made them, an axe if they fell trees, and their fists if not. Children hide by the fire. A settler beaten down gets up again when it's over.",
      "Swords, as in the first Forester's tree: once the settlement knows Spears, Swords or Battle Axes, the smith forges them, turn and turn about with tools, until there's one for every pair of hands. Hilts make them cheaper, Blades makes them bite harder. Take the best one from the hotbar.",
      "Your brother or sister gives you a hint when you've been at one thing a good while, and speaks up when you're hurt, out of arrows, or empty-handed in a raid — and in the settlement, now and then, says what it needs.",
      "Any tree can be felled now, not just the big ones by the cabin.",
      "Every action takes a moment and fills the little wheel — hold F. Let go before the next.",
      "Hewing the door shows the saw going; building, raising and making furniture show the hammer; carving and dressing game show the knife.",
      "Swinging an axe makes a whoosh, not a click.",
      "Logs look like logs: bark round the sides and growth rings on the sawn ends — on the stack, in the woodshed, at the building sites and where a tree fell.",
      "No more chins standing out on everyone's faces.",
      "The front door of the house in Hamburg is an old, weathered oxblood rather than bright red.",
      "The objective in the corner is bigger.",
      "Fixed: sprinting while your brother or sister talked on the road could hide what they were saying while the voice went on.",
    ],
  },
  {
    v: "0.15", date: "28 September 2026", title: "Raiders on the road",
    items: [
      "Raiders: from the second week a band comes up the road at dusk, every week or so and bigger as the settlement grows. They make for the stores and run back down the road with logs, rye and money.",
      "Stop them with the axe — three strokes — or a couple of good arrows, and whatever they were carrying goes back in the stores. They fight back: a blow knocks you back, winded, and drops what you're carrying.",
      "While they're about, settlers take cover by the fire, and nobody goes to bed. A settlement that has been robbed is less content for days.",
      "The watch: once the settlement knows Policing, a settler can be put on watch, and goes after raiders with you.",
      "Free play has the deer and hares back in the forest, every day.",
      "The Reckoning: when the men come up the road, everyone at the fire turns to look, and watches them all the way up.",
    ],
  },
  {
    v: "0.14", date: "28 September 2026", title: "A bow you draw, a forest you can walk, and a settlement that grows",
    items: [
      "The bow: hold right-click to draw — the view closes in on the middle of the screen — and let go to loose. Hold it at full draw too long and your arms start to shake, and the shot with them.",
      "A real crosshair: it opens wide with the bow out and closes in as you draw, and turns red over anything you can hunt. Never over a person.",
      "No more fence round the deer ride or the cabin: once you live there, you can walk a long way into the forest all round it.",
      "The settlement grows: when the buildings fill what room there is, your brother or sister says so, the edge moves out into the forest, and everyone — you too — turns to felling the trees past the old edge until the ground is clear to build on.",
      "Felled trees grow back, in every chapter, out of sight. Cleared ground stays cleared.",
      "After Henning gives you the bow, you have to walk back to the cabin before your brother or sister can see it.",
      "Choosing someone's work from the list works with the mouse now — the click no longer grabs the mouse back into the game.",
      "The view no longer turns by itself when the cursor rests near the edge of the window.",
      "Both arms come in from the right when you hold the axe.",
      "Conversations stay on top: the stamina bar, tips and hints no longer cover what is being said while you run.",
      "On Balanced or Performance graphics the sky no longer goes black.",
      "The money is Deutsche Mark now — DM — as in the first Forester. Selling the house on the Deichstraße brings in 70 DM, to spend on research.",
      "A second trader: Tobias the pedlar, out of Lübeck, comes up the road every fourth day with arrows, tools, iron, stone and salt pork, and buys planks, bricks and meat. Henning still comes every third day, and both come from the harvest on.",
      "The government says where DM comes from — the traders, and when each is next due, or a market — and the board tells you when you're short.",
      "A sign over every building site: its logs and stone, planks or bricks so far, and when it's ready for your hands.",
      "The woodshed: once it's up, the old stack and its platform are cleared away and the logs go in under its roof — and it's only as full as your store.",
      "The log stack by the cabin shows how full the store really is, and making furniture says what it cost.",
      "Tasks already done come off the board: rye reaped by the farmers counts as reaped, and a cabin with room already standing takes Jan and Liesel in.",
      "Press G for the government — the game tells you so, once you have a settlement.",
      "Paths: choose Path in the plans (B) and lay a trodden way between the houses a strip at a time, free — the plan stays up for the next strip until you press Esc. They turn to cobbles once the town is brick, and you hear the difference underfoot.",
      "Right-click picks things up again with the bow out (arrows too); it only draws when you are not looking at something to take.",
    ],
  },
  {
    v: "0.13", date: "28 September 2026", title: "The chase by night, stones to throw, and breath you can feel",
    items: [
      "The chase through Hamburg now happens that night, under the street lamps, after the square empties — and the marsh gate that follows is a misty night too.",
      "The chase is longer and harder: four of the watch now, one coming down the north street after the bell, and you have to run the whole length of the narrow alley with them on your heels.",
      "The watchman who used to plant himself in the mouth of the alley, so nobody could get past, now races you to it from round the corner. Get there first and the way is always open.",
      "Stones in the alley: pick one up (F) and click to throw it. The nearest watchman who hears it land goes to see what it was, looks about, and goes back — leaving a gap.",
      "In tense moments — the chase, creeping past the watch, hiding from the charcoal buyer — and whenever you are out of breath, your view rises and falls with your breathing.",
      "Talking to someone is an action now: hold F for a moment, and they stop what they are doing and turn to you while you speak.",
      "The watchman by the marsh gate is easier to pass: he sees less far, sweeps a narrower arc, and every so often turns to check the gate behind him — that's your moment.",
      "FPS boosters in Settings: graphics presets (High, Balanced, Performance), render scale, auto resolution that drops when the frame rate falls, soft, hard or no shadows, draw distance, a frame cap, and an FPS counter.",
    ],
  },
  {
    v: "0.12", date: "28 September 2026", title: "The government: your nation, Forester's tech tree, and everyone in it",
    items: [
      "Press G for the government. The Nation page names your settlement and what it has become — camp, hamlet, village, town or city — with its people and beds, how content they are and why, days of food and of firewood, the treasury, what the scholars know, everything in the stores, and every building by its style.",
      "The tech tree is the first Forester's own, node for node: Growth, Military Philosophy, Industry and Exploration, sixty-six technologies at Forester's prices, paid in Marks and researched over time. Click a lit node to begin; search for anything by name.",
      "In free play, building waits on knowledge as it does in Forester: Baking for the bakery, Trading for the market, Township for the town hall, Masonry, Millwork, Mining and Smelting for the works, Ministry for the church. The plans say what each still needs.",
      "What is learnt is put to work: quicker felling, more logs from every tree, saplings that grow back twice as fast, crops that ripen sooner, three to a cabin, faster walking once there are horses, busier quarries and mines, a blast furnace's double iron, better market prices, and less hunger. The trades and forces Reckoning hasn't built yet are learnt now and used when they come.",
      "The People page lists everyone in the nation — you, your family and every settler — with their work, where they sleep, what they are doing right now and what they have, and a button to set their work.",
      "Contentment matters: where people are unhappy — hungry, cold, or without a bed — nobody new will stay.",
    ],
  },
  {
    v: "0.11", date: "28 September 2026", title: "From cabin to city: the works, and rebuilding in the style of the age",
    items: [
      "The works: a quarry for stone, a sawmill for planks, a brickworks, a mine for iron ore, a smelter for iron, and a forge whose tools make everyone a quarter quicker. Each wants a pair of hands.",
      "A market that sells your surplus for Marks every day, a town hall, and a church.",
      "Rebuild what you've built, in the style of its age: F at the front of a cabin, bakery or any works to rebuild it in timber and plaster as Hamburg does, then in red brick as the Hanse does, then — once the town hall is brick and you hold a charter — in stucco and glass, as a city builds now. The well becomes a fountain.",
      "As the town grows grander the ground between the houses is cobbled, and then paved, with street lamps round the square.",
      "Talk to someone (F) and choose their work from a list: every trade open to them, what it takes in and puts out, and how many are at it already.",
      "Buildings can want stone, planks or bricks as well as logs; haulers bring them from the stores, or you can.",
      "The board tells you the next step: open a quarry, build a sawmill, rebuild a cabin in timber, raise a town hall.",
    ],
  },
  {
    v: "0.10", date: "28 September 2026", title: "The year goes round: night, winter, bread and Henning's cart",
    items: [
      "At dusk everyone stops work and goes home — two to each cabin, and anyone without a bed lies down by the fire. Your brother or sister sleeps on the other pallet in your own cabin.",
      "An eight-day year: spring, summer, autumn and winter. In winter the snow comes in, nothing grows, and every hearth burns a log a day; two cold nights with the stack empty, and someone goes back down the road.",
      "The bakery: a baker turns two rye into three loaves, and a loaf feeds twice what grain does. Everyone eats bread first.",
      "Henning's cart comes up the road every third morning. Sell him logs, bread and rye for Marks, and buy rye, arrows, a better saw (a log more from every tree) or iron axe heads (quicker felling).",
      "The board at the top names the season and says what the settlement needs next, firewood before winter included.",
      "The blizzard night in The First Winter has three more logs to burn.",
      "Buildings are drawn in the style of their age: the models for timber-frame, brick and modern houses are made, ready for upgrading.",
    ],
  },
  {
    v: "0.9", date: "28 September 2026", title: "Hunting, footsteps, and a sharper watch",
    items: [
      "Before you dig, you hunt: Henning gives you his old bow and a dozen arrows, and the woods east of the cabin open. Creep up on the roe and the hares, draw, and let go; pull your arrows back out of wherever they land.",
      "Footsteps sound like what you're walking on: grass, leaves and needles, the dirt of the track, cobbles, floorboards, snow, the marsh. You hear other people's too, and the watch walks heavy.",
      "People carrying a lantern or a torch walk properly now, instead of gliding. The charcoal buyer walks faster.",
      "The watch sees you more easily: a wider eye, farther even when you crouch, and they hear you walk up behind them.",
      "Martinmas is harder: the charcoal buyer is quicker and sharper, and before he goes he stands at the edge of the trees and swings his lantern across them.",
      "No more stone ledge round the foot of the cabin.",
      "The hands have no thumbs sticking out, and the camera is first person only.",
    ],
  },
  {
    v: "0.8.1", date: "28 September 2026", title: "Jakob's map, and fixes",
    items: [
      "Jakob gives you a map at the end of your errand — a copy of the one on the counting-house wall — and shows you how to read it. Until then there is no map.",
      "On the map (J), the mouse wheel zooms in on whatever is under the cursor, and dragging moves the sheet.",
      "The marker no longer points through houses: when there's no straight way, it stands on the next corner of the way there. The distance is the whole way.",
      "Fixed: the game could stop when Father crossed the room to you on the night they came for him.",
      "You can't sprint while the stamina bar is red. It turns red when you're winded, amber when you're getting low.",
      "What people say while you walk now sits above the stamina bar, instead of behind it.",
    ],
  },
  {
    v: "0.8", date: "28 September 2026", title: "The end of the story: Harvest Home and The Reckoning",
    items: [
      "Chapter XII, Harvest Home: two more come up the road with nowhere to sleep. Raise them a cabin, reap the rye, set someone to new work and furnish your own cabin — then the harvest supper, and Henning's news.",
      "Chapter XIII, The Reckoning: they come for you with a warrant. Bring everyone to the fire, and stand there with them. Jakob comes up the road with your father's ledger — and the choice of where home is.",
      "Free play is now chapter XIV. The board at the top says what the settlement needs next.",
      "Talk to a settler (F) to change their work: felling, carrying, or the fields.",
      "Hunger: everyone eats rye every day. A day with none and you're warned; two, and the newest to come goes back down the road.",
      "Every night of the story now ends in bed in the cabin, the naming night of chapter XI included.",
    ],
  },
  {
    v: "0.7", date: "28 September 2026", title: "A roof over you: into the cabin, and to bed",
    items: [
      "The cabin can be entered: the door swings in on its hinge (F to open or shut it), and inside there's a plank floor, a stone hearth under the chimney, and two straw pallets along the wall.",
      "Nights end in bed now, not out by the fire: after the talk at the fire, go in and lie down. The blizzard night of The First Winter is kept inside, at the hearth, with the door shut on the snow.",
      "Furnish the cabin: press B while you're inside for a bed, a table, a bench, a chest, a shelf or a rye barrel, made from logs off the stack (a pallet costs rye). Walk it into place and turn it with R.",
      "In free play, your bed takes you through the night to morning.",
      "People walk round things instead of through them: tables, carts, the well, the cabin walls, and you.",
      "Fixed: in The First Winter nothing told you what to do after splitting the firewood. The task list now shows, with a marker to the block, the nearest moss and the wall in turn. Chapter XI marks its tasks too.",
      "Chapter numbers show beside their numerals: X (10).",
      "The gables of the cabin sit down on the top log; no daylight between them.",
    ],
  },
  {
    v: "0.6", date: "28 September 2026", title: "The settlement: X. The Stranger, XI. Forester, and free play",
    items: [
      "Chapter X, The Stranger: in spring a widow and her son come up the road. Plan them a cabin (B), and raise it with logs you fell and carry — Marta carries too.",
      "Chapter XI, Forester: high summer, six of you. Reap the rye, build a well and a woodshed, dig a second field — then name the place, at the fire, with everyone there. The tutorial ends here.",
      "Free play: the settlement is yours. Days turn to night and back; stumps grow back into trees; fields ripen; people come up the road when there are beds and bread.",
      "Plans (B): cabins, a woodshed, a well, fields. A building follows your eye as a green ghost (red where it won't fit); R turns it.",
      "Settlers work: woodcutters fell and stack, haulers carry logs from the stack to building sites, farmers keep the fields.",
      "Fixed: you could only dig a strip of the field from its very middle. Now anywhere along it will do.",
      "Fixed: the ground round the rebuilt cabin looked like planks.",
      "The stamina bar sits just above the hotbar.",
    ],
  },
  {
    v: "0.5", date: "28 September 2026", title: "Part Two begins: Seed Before Frost",
    items: [
      "Chapter VIII, Martinmas: a cart comes up the road at dusk. Put out the fire, get into the trees, and keep out of the charcoal buyer's lantern while he counts everything you have. Then Henning comes to the fire with a name, and a warning.",
      "Chapter IX, The First Winter: snow on the ground, on the roof and on every bough. Split firewood, pull moss from under the snow to chink the walls — and then keep the fire alive through a blizzard night until dawn.",
      "A hotbar along the bottom of the screen: what you have to hand, in nine slots. Press 1 to 9 to pick one — the axe's slot takes it out or puts it away.",
      "The cursor is a small hollow square: yellow over something you can use, turning slowly green as you use it.",
      "The axe is in your own two hands, your sleeves running back to your shoulders, and it swings across in front of you, side-on, the head leading.",
      "Snow: it lies on whatever faces the sky, and falls, lightly or in a blizzard.",
      "The map is explored as you go: what you have not seen is blank parchment, and the ink spreads as you walk. What you have seen is remembered.",
      "Wrong turns on the road are barred a few steps in; your brother or sister still tells you why.",
      "Dialogue and narration write themselves out a letter at a time, each with a small click. Press Space once to finish a line, again to move on.",
      "Trees now hide you from anyone looking for you.",
      "Fixed: the watchman at the marsh gate walked straight into the cart.",
      "A new chapter, VII. Seed Before Frost, the first of Part Two: Roots. The morning after the cabin stands, you carry wood down the smoking track to the charcoal burner's camp and trade it for rye seed and a spade — if he will trade with a stranger who talks like Hamburg. Then dig your first field beside the cabin, and sow it before the frost.",
      "Henning, the charcoal burner, and his camp: a kiln smoking under its turf, his lean-to, his woodpile, at the end of the fourth fork on the road.",
      "Chapters you have not reached yet are no longer shown in the Chapters list at all.",
      "Doors creak as they open, and shut with a thud and the click of the latch. A line of dialogue arrives with a soft tick.",
      "Fixed: people's clothes came apart from their bodies when they twisted or bent. Coats, waistcoats and cuffs now move with the body under them.",
      "Fixed: you stood up at the table instead of sitting on the bench.",
      "Fixed: your brother or sister stood in your way when the men came to the door, and walked into the table afterwards.",
      "Fixed: the red front door was made of bricks. It is painted wood again.",
      "Fixed: cobbles covered the harbour where the water should be.",
      "Fixed: you could not leave the cabin by the road.",
    ],
  },
  {
    v: "0.4", date: "28 September 2026", title: "A painting on the front door",
    items: [
      "The title screen hangs a new picture: the burned cabin at dawn, painted as a Dutch landscape of the 1660s would have painted it.",
      "Father looks like the grain merchant he is: a beard going grey, a heavier brow and jaw. The round cheeks are gone from everyone's faces.",
      "The trees are rebuilt: spruces with ragged, drooping tiers, pines with flat broken crowns, birches with loose clumps of leaves, and no two quite the same green. Walls, timber, stone and bark have grain and weathering instead of flat colour.",
      "Press T for your inventory: a grid of slots showing what is in your hands, what is on you, and at the cabin what is stacked and built. Hover a slot to read it.",
      "No more voices: every line is read, not spoken, and the Voices setting is gone.",
      "The cabin and the burned ruin are now models made in Blender: round logs crossing at the corners, a plank door with iron straps, a boarded roof, and a stone chimney that outlasted the fire.",
      "Everyone is new, made in Blender: you, your brother or sister, Father, Jakob, the magistrate, the watch, Frau Albers and the people of Hamburg. Each has a real face (eyes, brows, nose, lips, a beard where they wear one), clothes of 1683 — long coats with deep cuffs and a cravat, or a laced bodice, full skirt and apron — and a skeleton that walks, runs, sits, swings an axe, and holds a torch, a lantern or the magistrate's writ. The crowd is still varied: each townsperson wears their own colours.",
      "Real textures everywhere: photographed wood grain, lime plaster, fieldstone, brick, clay roof tiles, bark, spruce needles and woven cloth, laid over every building, tree, model and piece of clothing. Hamburg's streets are real cobbles; the woods have a forest floor of needles and moss; the marsh is a meadow.",
      "Nights, dusk and mist are no longer too dark to see: a candle-lit room is dim, not black.",
      "Your brother or sister teaches you the game as you go: how to walk and look, open doors, run, crouch and lean, use the map and inventory, swing the axe and stack the logs — each the first time you need it, in their own words, with the keys shown underneath. Once you have learned a thing they do not say it again.",
      "A new map, drawn as a map of 1683 would be: ink on parchment, the forest stamped tree by tree, roads in brown, water hatched, the town in red. Press J for the whole map, with its title, compass rose and scale.",
      "The road is a real country road now: a narrow cart track, two wheel ruts with grass up the middle, stones kicked to the sides, its edges ragged. The forks are fainter tracks that the grass is taking back.",
      "Running costs breath everywhere now, not only in the chase. The stamina bar shows while you are short of it.",
      "The road out of Hamburg winds, and forks seven times. Your brother or sister knows the way and tells you at each fork, and calls you back if you take the wrong track. The first forks have signposts; every wrong track ends at a fallen tree.",
      "Look back from the start of the road and Hamburg is there across the fields: its walls and bastions, windmills, a sea of roofs, and the five green spires.",
      "The fellable spruces and the ships in the harbour are Blender models now.",
      "You can see the axe in your hands, and it swings the way a felling axe does: back over the shoulder and level through the trunk.",
      "Skirts and coat-tails swing with the legs when people walk.",
      "Fixed: a tree felled on the edge of the cabin's ground could drop its logs where you could not reach them. Logs now always land within reach, and logs left on the ground are kept in the save.",
      "Press M to take the mouse into the game and look around, and M again to let it go without pausing. Where the browser will not lock the mouse, M looks around with the cursor hidden instead, and resting the cursor at the edge of the screen keeps turning.",
    ],
  },
  {
    v: "0.3", date: "28 September 2026", title: "On the website, and ready for Blender",
    items: [
      "Forester: Reckoning now has its own page on the DeadlyDog Productions website, and the early build can be played from there.",
      "A Graphics setting: High keeps the soft shadows and full resolution; Low turns shadows off and renders fewer pixels, for laptops that struggle in the woods.",
      "Models made in Blender can now replace the built-in ones. Export a .glb into reckoning/models/, list it in manifest.json, and the cabin, the ruin, the spruces, the ships and every character can be swapped without touching the code.",
      "This update log.",
    ],
  },
  {
    v: "0.2", date: "28 September 2026", title: "Fairer, clearer, louder",
    items: [
      "The marsh gate can actually be passed. The gatehouse wall had nearly sealed the way to the small door; there is a proper passage now.",
      "The watch is fairer: they see less far, turn less, take longer to be sure of you and forget you sooner. Two more watchmen walk the streets further out, so wandering off is noticed.",
      "The small door beside the marsh gate is dressed in pale stone, has a lantern over it, and glows through walls while you are making for it.",
      "The front door of the house was being hidden by a strip of wall. You can see it now — it is painted red.",
      "Every light has something making it: candles on the table, the desk, the mantel and by the door, and street lamps on posts along the streets.",
      "The first evening is an ordinary evening. Nobody warns you. The knocking comes as a surprise.",
      "Lean round corners with Q and E. Talk, take and open things with F (or right click).",
      "Hold Z to zoom in.",
      "A minimap in the corner: you, your brother or sister, the watch and which way they are looking, and where you are going.",
      "The chase through the square is a real chase: faster watchmen, one who cuts you off, and breath that runs out.",
      "Getting caught brings up a red screen, a different line every time, and a quote that writes itself in underneath.",
      "Voices: everyone speaks their lines aloud, each with their own voice. (They are your browser's voices; turn them off in Settings.)",
      "Flies in the day, moths round the lamps at dusk, fireflies in the woods at night — and now and then one past your ear.",
      "The menus and the HUD are dark green.",
      "Better-made people: shaped bodies, faces with eyes and brows, hands, buttons and buckles, coats with tails, skirts with hems, hats that look like hats.",
      "The harbour opens onto water that goes to the horizon.",
      "Fixed: the log stack by the cabin froze the game once it held more than ten logs.",
      "Fixed: the misty morning at the marsh gate and the dusk at the cabin were too dark to see by.",
    ],
  },
  {
    v: "0.1", date: "27 September 2026", title: "The first build",
    items: [
      "Forester's story, lived in first person in 3D: Part One, Ashes, in six chapters.",
      "I. The House by the Harbour — Hamburg, 1683. An errand for Father, down to the warehouse on the quay, and home for supper.",
      "II. Papers and Torches — the knocking at night, the magistrate's writ, and Father taken.",
      "III. The Square at Dawn — the crowd that had bought our bread, watching in silence.",
      "IV. The Marsh Gate — through the lanes, past the watch, to the small door in the wall.",
      "V. Far, Far Away — the long road into the old woods, until the bells fade.",
      "VI. — what waits at the end of the road, and the work of making it home.",
      "Play as the Brother or the Sister; the other is beside you all the way.",
      "First person or over the shoulder (V). Progress kept at every chapter and as you work.",
      "Music and sound built at runtime, with the first Forester's sound engine underneath.",
    ],
  },
];
