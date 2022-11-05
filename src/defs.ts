// FIXME The mining laser and their effects (in src/effect.ts) are implemented very poorly from both a code and functionality perspective

import { ArmamentDef, armDefMap, armDefs, ArmUsage, initArmaments, maxMissileLifetime, mineDefs, missileDefs, TargetedKind } from "./defs/armaments";
import { AsteroidDef, asteroidDefMap, asteroidDefs, initAsteroids } from "./defs/asteroids";
import { collectableDefMap, collectableDefs, createCollectableFromDef, initCollectables } from "./defs/collectables";
import { initProjectileDefs } from "./defs/projectiles";
import {
  defMap,
  defs,
  emptyLoadout,
  EmptySlot,
  emptySlotData,
  initShipsAndStations,
  SlotKind,
  UnitDefinition,
  UnitKind,
} from "./defs/shipsAndStations";
import { initRecipes } from "./recipes";

const uid = () => {
  let ret = 0;
  while (ret === 0) {
    ret = Math.floor(Math.random() * 1000000);
  }
  return ret;
};

enum Faction {
  Alliance = 0,
  Confederation,
  Rogue,
  Count,
}

const getFactionString = (faction: Faction) => {
  switch (faction) {
    case Faction.Alliance:
      return "Alliance";
    case Faction.Confederation:
      return "Confederation";
    case Faction.Rogue:
      return "Rogue";
  }
};

const initDefs = () => {
  initRecipes();
  initShipsAndStations();
  initArmaments();
  initAsteroids();
  initCollectables();
  initProjectileDefs();
};

export {
  UnitDefinition,
  UnitKind,
  SlotKind,
  AsteroidDef,
  Faction,
  EmptySlot,
  ArmUsage,
  TargetedKind,
  ArmamentDef,
  defs,
  defMap,
  asteroidDefs,
  asteroidDefMap,
  armDefs,
  armDefMap,
  mineDefs,
  missileDefs,
  collectableDefs,
  collectableDefMap,
  maxMissileLifetime,
  initDefs,
  getFactionString,
  emptyLoadout,
  createCollectableFromDef,
  uid as clientUid,
  emptySlotData,
};
