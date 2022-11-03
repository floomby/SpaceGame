import { addCargo, availableCargoCapacity, Player } from "../game";
import { Position, Rectangle } from "../geometry";
import { armDefs, ArmUsage } from "./armaments";
import { clientUid as uid } from "../defs";
import { defs } from "./shipsAndStations"

type CollectableDef = {
  sprite: Rectangle;
  radius: number;
  name: string;
  description: string;
  canBeCollected: (player: Player) => boolean;
  collectMutator: (player: Player) => void;
};

const collectableDefs: CollectableDef[] = [];
const collectableDefMap = new Map<string, { index: number; def: CollectableDef }>();

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
  });
  collectableDefs.push({
    sprite: { x: 256, y: 512, width: 64, height: 64 },
    radius: 26,
    name: "Ammo",
    description: "Extra ammo",
    canBeCollected: (player) => {
      return !player.npc;
    },
    collectMutator: (player) => {
      for (let i = 0; i < player.armIndices.length; i++) {
        const armDef = armDefs[player.armIndices[i]];
        if (armDef.usage === ArmUsage.Ammo) {
          const slotData = player.slotData[i];
          slotData.ammo = armDef.maxAmmo;
        }
      }
    },
  });
  collectableDefs.push({
    sprite: { x: 320, y: 512, width: 64, height: 64 },
    radius: 26,
    name: "Energy",
    description: "Extra energy",
    canBeCollected: (player) => {
      const def = defs[player.defIndex];
      return !player.npc && player.energy < def.energy;
    },
    collectMutator: (player) => {
      const def = defs[player.defIndex];
      player.energy = def.energy;
    },
  });

  for (let i = 0; i < collectableDefs.length; i++) {
    const def = collectableDefs[i];
    collectableDefMap.set(def.name, { index: i, def });
  }
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

export { collectableDefs, collectableDefMap, initCollectables, createCollectableFromDef };