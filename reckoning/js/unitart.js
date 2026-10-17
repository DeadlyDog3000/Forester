// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// THE REGIMENTS' PLATES — a uniform plate of the time for each arm, as each
// crown's way of war dressed it (art/units/<way>-<arm>.jpg). Shared by the
// campaign and the battle's orders.

const HAVE = new Set(["west-musketeer", "west-pike", "west-grenadier", "west-cavalry", "west-sword", "east-musketeer", "east-bow", "east-sword", "east-cavalry", "steppe-musketeer", "steppe-cavalry", "steppe-sword", "steppe-bow", "steppe-pike", "tsar-musketeer", "tsar-pike", "tsar-cavalry", "tsar-axe", "woods-bow", "woods-axe", "woods-musketeer", "west-bow", "west-crossbow", "west-axe"]);
// (a battle's coats to the way of war they belong to)
// (the way a uniform's army fights and is drawn, by the dress its men wear: the janissary's the East's, the haiduk's the
//  steppe's, the strelets' the Tsar's, the warrior's the woods')
const WAYS = { ottoman: "east", algerine: "east", tunisian: "east", tripolitan: "east", moroccan: "east", polish: "steppe", hungarian: "steppe", transylvanian: "steppe", moldavian: "steppe", wallachian: "steppe", muscovite: "tsar", cossack: "tsar", tatar: "steppe",
  native: "woods", native_north: "woods", haudenosaunee: "woods", wabanaki: "woods", cherokee: "woods", muscogee: "woods", choctaw: "woods", shawnee: "woods", illinois: "woods", anishinaabe: "woods", dakota: "woods", cree: "woods", pawnee: "woods", osage: "woods", caddo: "woods" };
export const wayOfUniform = key => WAYS[key] || "west";
// the plate for an arm, in a way of war — or the West's, or the nearest of kin, or none
export function plateOf(way, kind) {
  for (const k of [kind, ...({ crossbow: ["bow"], axe: ["sword"], sword: ["axe"], bow: ["crossbow"], militia: ["musketeer"] }[kind] || [])]) {
    if (HAVE.has(`${way}-${k}`)) return `art/units/${way}-${k}.jpg`;
    if (HAVE.has(`west-${k}`)) return `art/units/west-${k}.jpg`;
  }
  for (const w of ["east", "steppe", "tsar", "woods"]) if (HAVE.has(`${w}-${kind}`)) return `art/units/${w}-${kind}.jpg`;
  return null;
}
