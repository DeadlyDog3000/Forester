// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// WHAT HAS CHANGED — the update log on the front door, newest first. It is
// kept beside the code it describes, as the first Forester's is.

export const CHANGELOG = [
  {
    v: "0.4", date: "28 September 2026", title: "A painting on the front door",
    items: [
      "The title screen hangs a new picture: the burned cabin at dawn, painted as a Dutch landscape of the 1660s would have painted it.",
      "Father looks like the grain merchant he is: a beard going grey, a heavier brow and jaw. The round cheeks are gone from everyone's faces.",
      "The trees are rebuilt: spruces with ragged, drooping tiers, pines with flat broken crowns, birches with loose clumps of leaves, and no two quite the same green. Walls, timber, stone and bark have grain and weathering instead of flat colour.",
      "Press T for your inventory: a grid of slots showing what is in your hands, what is on you, and at the clearing what is stacked and built. Hover a slot to read it.",
      "No more voices: every line is read, not spoken, and the Voices setting is gone.",
      "The cabin and the burned ruin are now models made in Blender: round logs crossing at the corners, a plank door with iron straps, a boarded roof, and a stone chimney that outlasted the fire.",
      "The stamina bar is twice as long.",
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
      "Fixed: the log stack in the clearing froze the game once it held more than ten logs.",
      "Fixed: the misty morning at the marsh gate and the dusk in the clearing were too dark to see by.",
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
      "VI. The Clearing — an old axe, twenty logs, a door, and the burned cabin raised again.",
      "Play as the Brother or the Sister; the other is beside you all the way.",
      "First person or over the shoulder (V). Progress kept at every chapter and as you work in the clearing.",
      "Music and sound built at runtime, with the first Forester's sound engine underneath.",
    ],
  },
];
