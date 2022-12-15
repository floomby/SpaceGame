import { addCargo, availableCargoCapacity, Mutated, Player } from "../game";
import { Position, Rectangle } from "../geometry";
import { armDefs, ArmUsage } from "./armaments";
import { clientUid as uid } from "../defs";
import { defs } from "./shipsAndStations";
import { recipeMap } from "../recipes";

type CollectableDef = {
  sprite: Rectangle;
  radius: number;
  name: string;
  description: string;
  canBeCollected: (player: Player, knownRecipes: Map<number, Set<string>>) => boolean;
  collectMutator: (player: Player, discoverRecipe: (id: number, what: string) => void) => void;
  model: string;
  modelIndex?: number;
  light: [number, number, number];
};

const collectableDefs: CollectableDef[] = [];
const collectableDefMap = new Map<string, { index: number; def: CollectableDef }>();

type LootEntry = { index: number; density: number };

class LootTable {
  private totalDensity = 0;
  private entries: LootEntry[] = [];

  addEntry(name: string, density: number) {
    this.entries.push({ index: collectableDefMap.get(name)!.index, density });
    this.totalDensity += density;
  }

  process() {
    let roll = Math.random() * this.totalDensity;
    let index = 0;
    while (index < this.entries.length && roll > this.entries[index].density) {
      roll -= this.entries[index].density;
      index++;
    }
    if (index < this.entries.length) {
      return this.entries[index].index;
    }
    return null;
  }
}

const defaultLootTable = new LootTable();

const initCollectables = () => {
  collectableDefs.push({
    sprite: { x: 320, y: 64, width: 64, height: 64 },
    radius: 26,
    name: "Spare Parts",
    description: "Collect spare parts to repair stations",
    canBeCollected: (player) => {
      return !player.npc && availableCargoCapacity(player) > 0;
    },
    collectMutator: (player) => {
      addCargo(player, "Spare Parts", 5);
    },
    model: "spare_parts",
    light: [3.0, 2.0, 2.0],
  });
  collectableDefs.push({
    sprite: { x: 320, y: 320, width: 64, height: 64 },
    radius: 26,
    name: "Bounty",
    description: "Extra credits",
    canBeCollected: (player) => {
      return !player.npc;
    },
    collectMutator: (player) => {
      player.credits += 100;
    },
    model: "bounty",
    light: [0.0, 4.0, 0.0],
  });
  collectableDefs.push({
    sprite: { x: 256, y: 512, width: 64, height: 64 },
    radius: 26,
    name: "Ammo",
    description: "Extra ammo",
    canBeCollected: (player) => {
      return true;
    },
    collectMutator: (player) => {
      for (let i = 0; i < player.arms.length; i++) {
        const armDef = armDefs[player.arms[i]];
        if (armDef.usage === ArmUsage.Ammo) {
          const slotData = player.slotData[i];
          slotData.ammo = armDef.maxAmmo;
        }
      }
    },
    model: "ammo",
    light: [2.0, 3.0, 2.0],
  });

  collectableDefs.push({
    sprite: { x: 320, y: 512, width: 64, height: 64 },
    radius: 26,
    name: "Energy",
    description: "Restore energy",
    canBeCollected: (player) => {
      const def = defs[player.defIndex];
      return player.energy < def.energy;
    },
    collectMutator: (player) => {
      const def = defs[player.defIndex];
      player.energy = def.energy;
    },
    model: "energy",
    light: [4.0, 4.0, 0.0],
  });

  collectableDefs.push({
    sprite: { x: 320, y: 768, width: 64, height: 64 },
    radius: 26,
    name: "Health",
    description: "Restore health",
    canBeCollected: (player) => {
      const def = defs[player.defIndex];
      return player.health < def.health;
    },
    collectMutator: (player) => {
      const def = defs[player.defIndex];
      player.health = Math.min(def.health, player.health + 80);
    },
    model: "health",
    light: [2.0, 1.0, 1.0],
  });

  const recipeFor = (what: string) => {
    if (!recipeMap.has(what)) {
      throw new Error(`Unknown recipe ${what}`);
    }
    return {
      sprite: { x: 256, y: 768, width: 64, height: 64 },
      radius: 26,
      name: `Recipe - ${what}`,
      description: `Learn a new recipe for ${what}`,
      canBeCollected: (player, knownRecipes) => {
        if (player.npc) {
          return false;
        }
        if (knownRecipes.has(player.id)) {
          const recipes = knownRecipes.get(player.id)!;
          return !recipes.has(what);
        }
        return false;
      },
      collectMutator: (player, discoverRecipe) => {
        discoverRecipe(player.id, what);
      },
      model: "recipe",
      light: [3.0, 2.5, 2.5],
    } as CollectableDef;
  };

  for (const recipe of recipeMap.keys()) {
    collectableDefs.push(recipeFor(recipe));
  }

  for (let i = 0; i < collectableDefs.length; i++) {
    const def = collectableDefs[i];
    collectableDefMap.set(def.name, { index: i, def });
  }

  for (const recipe of recipeMap.keys()) {
    defaultLootTable.addEntry(`Recipe - ${recipe}`, 1);
  }

  defaultLootTable.addEntry("Bounty", 2);
  defaultLootTable.addEntry("Health", 6);
  defaultLootTable.addEntry("Energy", 3);
  defaultLootTable.addEntry("Ammo", 4);
  defaultLootTable.addEntry("Spare Parts", 2);
};

const createCollectableFromDef = (index: number, where: Position) => {
  const def = collectableDefs[index];
  return {
    id: uid(),
    position: { x: where.x, y: where.y },
    radius: def.radius,
    heading: Math.random() * Math.PI * 2,
    speed: 0,
    index,
    framesLeft: 600,
  };
};

export { LootTable, defaultLootTable, collectableDefs, collectableDefMap, initCollectables, createCollectableFromDef };
