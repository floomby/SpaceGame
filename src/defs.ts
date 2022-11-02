// FIXME The mining laser and their effects (in src/effect.ts) are implemented very poorly from both a code and functionality perspective

import {
  GlobalState,
  Player,
  Asteroid,
  TargetKind,
  EffectTrigger,
  EffectAnchorKind,
  availableCargoCapacity,
  addCargo,
  Missile,
  Mutated,
} from "../src/game";
import { Rectangle, Position, l2NormSquared } from "./geometry";
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

enum UnitKind {
  Ship,
  Station,
}

enum SlotKind {
  Normal = 0,
  Utility,
  Mine,
  Large,
  Mining,
}

type UnitDefinition = {
  name: string;
  description: string;
  sprite: Rectangle;
  health: number;
  speed: number;
  energy: number;
  energyRegen: number;
  primaryReloadTime: number;
  primaryDamage: number;
  radius: number;
  kind: UnitKind;
  hardpoints?: Position[];
  dockable?: boolean;
  slots: SlotKind[];
  cargoCapacity?: number;
  deathEffect: number;
  turnRate?: number;
  acceleration?: number;
  healthRegen: number;
  price?: number;
  warpTime?: number;
  warpEffect?: number;
  brakeDistance?: number;
  sideThrustMaxSpeed?: number;
  sideThrustAcceleration?: number;
  repairsRequired?: number;
  scanRange?: number;
};

enum ArmUsage {
  Empty,
  Energy,
  Ammo,
}

enum TargetedKind {
  Empty,
  Targeted,
  Untargeted,
}

type ArmamentDef = {
  name: string;
  description: string;
  kind: SlotKind;
  usage: ArmUsage;
  targeted: TargetedKind;
  energyCost?: number;
  maxAmmo?: number;
  cost: number;
  stateMutator?: (
    state: GlobalState,
    player: Player,
    targetKind: TargetKind,
    target: Player | Asteroid,
    applyEffect: (trigger: EffectTrigger) => void,
    slotIndex: number,
    flashServerMessage: (id: number, message: string) => void,
    whatMutated: Mutated
  ) => void;
  // effectMutator?: (state: GlobalState, slotIndex: number, player: Player, target: Player | undefined) => void;
  equipMutator?: (player: Player, slotIndex: number) => void;
  frameMutator?: (player: Player, slotIndex: number) => void;
};

type AsteroidDef = {
  resources: number;
  sprite: Rectangle;
  radius: number;
  mineral: string;
};

type MissileDef = {
  sprite: Rectangle;
  speed: number;
  damage: number;
  radius: number;
  lifetime: number;
  acceleration: number;
  // TODO this should be easier to use (having all these indices is error prone)
  deathEffect: number;
  turnRate?: number;
  hitMutator?: (player: Player, state: GlobalState, applyEffect: (effectTrigger: EffectTrigger) => void) => void;
};

type CollectableDef = {
  sprite: Rectangle;
  radius: number;
  name: string;
  description: string;
  canBeCollected: (player: Player) => boolean;
  collectMutator: (player: Player) => void;
};

const computeBrakeDistance = (acceleration: number, speed: number) => {
  return (speed * speed) / (2 * acceleration);
};

const defs: UnitDefinition[] = [];
const defMap = new Map<string, { index: number; def: UnitDefinition }>();

const armDefs: ArmamentDef[] = [];
const armDefMap = new Map<string, { index: number; def: ArmamentDef }>();

const asteroidDefs: AsteroidDef[] = [];

const missileDefs: MissileDef[] = [];

const collectableDefs: CollectableDef[] = [];
const collectableDefMap = new Map<string, { index: number; def: CollectableDef }>();

let maxMissileLifetime = 0;

const initDefs = () => {
  initRecipes();

  // Fighter - 0
  defs.push({
    name: "Fighter",
    description: "A basic fighter",
    sprite: { x: 0, y: 0, width: 32, height: 32 },
    health: 100,
    speed: 10,
    energy: 100,
    energyRegen: 0.1,
    primaryReloadTime: 20,
    primaryDamage: 10,
    radius: 16,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal],
    cargoCapacity: 100,
    deathEffect: 3,
    turnRate: 0.1,
    acceleration: 0.1,
    healthRegen: 0.03,
    price: 100,
    warpTime: 90,
    warpEffect: 7,
    sideThrustMaxSpeed: 5,
    sideThrustAcceleration: 0.1,
    scanRange: 4000,
  });
  // Drone - 1
  defs.push({
    name: "Drone",
    description: "A basic drone",
    sprite: { x: 32, y: 0, width: 32, height: 32 },
    health: 100,
    speed: 10,
    energy: 100,
    energyRegen: 0.1,
    primaryReloadTime: 20,
    primaryDamage: 10,
    radius: 16,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal],
    cargoCapacity: 100,
    deathEffect: 3,
    turnRate: 0.1,
    acceleration: 0.1,
    healthRegen: 0.03,
    price: 100,
    warpTime: 90,
    warpEffect: 7,
    sideThrustMaxSpeed: 5,
    sideThrustAcceleration: 0.1,
    scanRange: 4000,
  });
  // Alliance Starbase - 2
  defs.push({
    name: "Alliance Starbase",
    description: "Alliance starbase",
    sprite: { x: 0, y: 32, width: 256, height: 256 },
    health: 1000,
    speed: 0,
    energy: 1000,
    energyRegen: 0.5,
    primaryReloadTime: 10,
    primaryDamage: 15,
    radius: 120,
    kind: UnitKind.Station,
    hardpoints: [
      { x: -86, y: -70 },
      { x: -86, y: 70 },
      { x: 86, y: -70 },
      { x: 86, y: 70 },
    ],
    dockable: true,
    slots: [],
    deathEffect: 4,
    healthRegen: 0.06,
    repairsRequired: 8,
  });
  // Confederacy Starbase - 3
  defs.push({
    name: "Confederacy Starbase",
    description: "Confederacy starbase",
    sprite: { x: 0, y: 288, width: 256, height: 256 },
    health: 1000,
    speed: 0,
    energy: 1100,
    energyRegen: 0.5,
    primaryReloadTime: 10,
    primaryDamage: 15,
    radius: 144,
    kind: UnitKind.Station,
    hardpoints: [
      { x: -93, y: -93 },
      { x: -93, y: 93 },
      { x: 93, y: -93 },
      { x: 93, y: 93 },
    ],
    dockable: true,
    slots: [],
    deathEffect: 4,
    healthRegen: 0.06,
    repairsRequired: 8,
  });
  // Advanced Fighter - 4
  defs.push({
    name: "Advanced Fighter",
    description: "A more heavily armed fighter",
    sprite: { x: 256, y: 256, width: 64, height: 64 },
    health: 250,
    speed: 8,
    energy: 150,
    energyRegen: 0.2,
    primaryReloadTime: 10,
    primaryDamage: 20,
    radius: 30,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal],
    cargoCapacity: 200,
    deathEffect: 3,
    turnRate: 0.07,
    acceleration: 0.09,
    healthRegen: 0.05,
    price: 300,
    warpTime: 120,
    warpEffect: 7,
    sideThrustMaxSpeed: 3,
    sideThrustAcceleration: 0.08,
    scanRange: 13000,
  });
  // Seeker - 5
  defs.push({
    name: "Seeker",
    description: "A lightly armed, but solid ship",
    sprite: { x: 320, y: 256, width: 64, height: 64 },
    health: 250,
    speed: 8,
    energy: 150,
    energyRegen: 0.2,
    primaryReloadTime: 10,
    primaryDamage: 20,
    radius: 30,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal],
    cargoCapacity: 200,
    deathEffect: 3,
    turnRate: 0.07,
    acceleration: 0.09,
    healthRegen: 0.05,
    price: 300,
    warpTime: 120,
    warpEffect: 7,
    sideThrustMaxSpeed: 3,
    sideThrustAcceleration: 0.08,
    scanRange: 13000,
  });
  // Strafer - 6
  defs.push({
    name: "Strafer",
    description: "A fast, lightly armed ship, with a powerful side thruster, that is practically blind",
    sprite: { x: 256, y: 320, width: 64, height: 64 },
    health: 120,
    speed: 14,
    energy: 100,
    energyRegen: 0.1,
    primaryReloadTime: 10,
    primaryDamage: 10,
    radius: 22,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal],
    cargoCapacity: 100,
    deathEffect: 3,
    turnRate: 0.1,
    acceleration: 0.2,
    healthRegen: 0.05,
    price: 200,
    warpTime: 90,
    warpEffect: 7,
    sideThrustMaxSpeed: 11,
    sideThrustAcceleration: 0.45,
    scanRange: 3000,
  });
  // Rogue Starbase - 7
  defs.push({
    name: "Rogue Starbase",
    description: "A weak ramshackle starbase with unique build options",
    sprite: { x: 0, y: 544, width: 256, height: 256 },
    health: 800,
    speed: 0,
    energy: 1100,
    energyRegen: 0.5,
    primaryReloadTime: 10,
    primaryDamage: 15,
    radius: 93,
    kind: UnitKind.Station,
    hardpoints: [{ x: -84, y: -80 }],
    dockable: true,
    slots: [],
    deathEffect: 4,
    healthRegen: 0.06,
    repairsRequired: 8,
  });
  // Venture - 8
  defs.push({
    name: "Venture",
    description: "A slow industrial ship",
    sprite: { x: 256, y: 384, width: 128, height: 128 },
    health: 500,
    speed: 8,
    energy: 400,
    energyRegen: 0.3,
    primaryReloadTime: 10,
    primaryDamage: 30,
    radius: 57,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Normal],
    cargoCapacity: 800,
    deathEffect: 2,
    turnRate: 0.02,
    acceleration: 0.05,
    healthRegen: 0.05,
    price: 300,
    warpTime: 150,
    warpEffect: 7,
    sideThrustMaxSpeed: 2,
    sideThrustAcceleration: 0.05,
    scanRange: 13000,
  });

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    defMap.set(def.name, { index: i, def });
    if (def.acceleration !== undefined) {
      def.brakeDistance = computeBrakeDistance(def.acceleration, def.speed);
    }
  }

  // Empty normal slot - 0
  armDefs.push({
    name: "Empty normal slot",
    description: "Empty normal slot (dock with a station to buy armaments)",
    kind: SlotKind.Normal,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  // Empty utility slot - 1
  armDefs.push({
    name: "Empty utility slot",
    description: "Empty utility slot (dock with a station to buy armaments)",
    kind: SlotKind.Utility,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  // Empty mine slot - 2
  armDefs.push({
    name: "Empty mine slot",
    description: "Empty mine slot (dock with a station to buy armaments)",
    kind: SlotKind.Mine,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  // Empty large slot - 3
  armDefs.push({
    name: "Empty large slot",
    description: "Empty large slot (dock with a station to buy armaments)",
    kind: SlotKind.Large,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  // Empty mining slot - 4
  armDefs.push({
    name: "Empty mining slot",
    description: "Empty mining slot (dock with a station to buy armaments)",
    kind: SlotKind.Mining,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  // Basic mining laser - 5
  armDefs.push({
    name: "Basic mining laser",
    description: "A low powered mining laser",
    kind: SlotKind.Mining,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Targeted,
    energyCost: 0.5,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId, flashServerMessage, whatMutated) => {
      if (targetKind === TargetKind.Asteroid && player.energy > 0.3) {
        target = target as Asteroid;
        if (l2NormSquared(player.position, target.position) < 500 * 500) {
          if (availableCargoCapacity(player) <= 0) {
            flashServerMessage(player.id, "Cargo bay full");
            return;
          }
          if (target.resources <= 0) {
            flashServerMessage(player.id, "Asteroid depleted");
            return;
          }
          whatMutated.asteroids.add(target);
          player.energy -= 0.3;
          const amount = Math.min(target.resources, 0.5);
          target.resources -= amount;
          const asteroidDef = asteroidDefs[target.defIndex];
          addCargo(player, asteroidDef.mineral, amount);
          applyEffect({
            effectIndex: 0,
            // Fine to just use the reference here
            from: { kind: EffectAnchorKind.Player, value: player.id },
            to: { kind: EffectAnchorKind.Asteroid, value: target.id },
          });
        }
      }
    },
    cost: 50,
  });
  // Laser Beam - 6
  armDefs.push({
    name: "Laser Beam",
    description: "Strong but energy hungry laser beam",
    kind: SlotKind.Normal,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Targeted,
    energyCost: 35,
    stateMutator: (state, player, targetKind, target, applyEffect, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      if (targetKind === TargetKind.Player && player.energy > 35 && slotData.sinceFired > 45) {
        if ((target as Player).inoperable) {
          return;
        }
        target = target as Player;
        if (l2NormSquared(player.position, target.position) < 700 * 700) {
          player.energy -= 35;
          target.health -= 30;
          slotData.sinceFired = 0;
          const to =
            target.health > 0
              ? { kind: EffectAnchorKind.Player, value: target.id }
              : { kind: EffectAnchorKind.Absolute, value: target.position, heading: target.heading, speed: target.speed };
          applyEffect({
            effectIndex: 1,
            from: { kind: EffectAnchorKind.Player, value: player.id },
            to,
          });
        }
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 46 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 100,
  });

  missileDefs.push({
    sprite: { x: 64, y: 0, width: 32, height: 16 },
    radius: 8,
    speed: 15,
    damage: 13,
    acceleration: 0.2,
    lifetime: 600,
    deathEffect: 2,
  });
  const javelinIndex = missileDefs.length - 1;
  // Javelin Missile - 7
  armDefs.push({
    name: "Javelin Missile",
    description: "An quick firing, unguided missile",
    kind: SlotKind.Normal,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Untargeted,
    maxAmmo: 50,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 25 && slotData.ammo > 0) {
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const missile: Missile = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: player.speed + 1,
          heading: player.heading,
          radius: missileDefs[javelinIndex].radius,
          team: player.team,
          damage: missileDefs[javelinIndex].damage,
          target: 0,
          defIndex: javelinIndex,
          lifetime: missileDefs[javelinIndex].lifetime,
        };
        state.missiles.set(id, missile);
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 50 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 100,
  });

  missileDefs.push({
    sprite: { x: 64, y: 16, width: 32, height: 16 },
    radius: 8,
    speed: 5,
    damage: 150,
    acceleration: 0.2,
    lifetime: 600,
    deathEffect: 2,
  });
  const heavyJavelinIndex = missileDefs.length - 1;
  // Heavy Javelin Missile - 8
  armDefs.push({
    name: "Heavy Javelin Missile",
    description: "A high damage, slow, unguided missile",
    kind: SlotKind.Normal,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Untargeted,
    maxAmmo: 20,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 45 && slotData.ammo > 0) {
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const missile: Missile = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: player.speed + 1,
          heading: player.heading,
          radius: missileDefs[heavyJavelinIndex].radius,
          team: player.team,
          damage: missileDefs[heavyJavelinIndex].damage,
          target: 0,
          defIndex: heavyJavelinIndex,
          lifetime: missileDefs[heavyJavelinIndex].lifetime,
        };
        state.missiles.set(id, missile);
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 20 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 100,
  });

  missileDefs.push({
    sprite: { x: 96, y: 0, width: 32, height: 16 },
    radius: 8,
    speed: 15,
    damage: 10,
    acceleration: 0.2,
    lifetime: 600,
    deathEffect: 2,
    turnRate: 0.1,
  });
  const tomahawkIndex = missileDefs.length - 1;
  // Tomahawk Missile - 9
  armDefs.push({
    name: "Tomahawk Missile",
    description: "A guided missile",
    kind: SlotKind.Normal,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Targeted,
    maxAmmo: 30,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 45 && slotData.ammo > 0 && targetKind === TargetKind.Player && target) {
        if ((target as Player).inoperable) {
          return;
        }
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const missile: Missile = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: player.speed + 1,
          heading: player.heading,
          radius: missileDefs[tomahawkIndex].radius,
          team: player.team,
          damage: missileDefs[tomahawkIndex].damage,
          target: target.id,
          defIndex: tomahawkIndex,
          lifetime: missileDefs[tomahawkIndex].lifetime,
        };
        state.missiles.set(id, missile);
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 30 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 100,
  });
  // Advanced mining laser - 10
  armDefs.push({
    name: "Advanced mining laser",
    description: "A high powered mining laser",
    kind: SlotKind.Mining,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Targeted,
    energyCost: 0.5,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId, flashServerMessage, whatMutated) => {
      if (targetKind === TargetKind.Asteroid && player.energy > 0.8) {
        target = target as Asteroid;
        if (l2NormSquared(player.position, target.position) < 800 * 800) {
          if (availableCargoCapacity(player) <= 0) {
            flashServerMessage(player.id, "Cargo bay full");
            return;
          }
          if (target.resources <= 0) {
            flashServerMessage(player.id, "Asteroid depleted");
            return;
          }
          whatMutated.asteroids.add(target);
          player.energy -= 0.8;
          const amount = Math.min(target.resources, 3.5);
          target.resources -= amount;
          const asteroidDef = asteroidDefs[target.defIndex];
          addCargo(player, asteroidDef.mineral, amount);
          applyEffect({
            effectIndex: 9,
            from: { kind: EffectAnchorKind.Player, value: player.id },
            to: { kind: EffectAnchorKind.Asteroid, value: target.id },
          });
        }
      }
    },
    cost: 150,
  });

  missileDefs.push({
    sprite: { x: 96, y: 16, width: 32, height: 16 },
    radius: 10,
    speed: 20,
    damage: 0,
    acceleration: 0.1,
    lifetime: 800,
    deathEffect: 10,
    turnRate: 0.3,
    hitMutator: (player, state, applyEffect) => {
      player.disabled = 600;
    },
  });
  const empMissileIndex = missileDefs.length - 1;
  // EMP Missile - 9
  armDefs.push({
    name: "EMP Missile",
    description: "A guided emp missile which disables enemy systems and has a long reload time",
    kind: SlotKind.Normal,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Targeted,
    maxAmmo: 4,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 300 && slotData.ammo > 0 && targetKind === TargetKind.Player && target) {
        if ((target as Player).inoperable) {
          return;
        }
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const missile: Missile = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: player.speed + 1,
          heading: player.heading,
          radius: missileDefs[empMissileIndex].radius,
          team: player.team,
          damage: missileDefs[empMissileIndex].damage,
          target: target.id,
          defIndex: empMissileIndex,
          lifetime: missileDefs[empMissileIndex].lifetime,
        };
        state.missiles.set(id, missile);
      }
    },
    equipMutator: (player, slotIndex) => {
      player.slotData[slotIndex] = { sinceFired: 1000, ammo: 4 };
    },
    frameMutator: (player, slotIndex) => {
      const slotData = player.slotData[slotIndex];
      slotData.sinceFired++;
    },
    cost: 1200,
  });

  for (let i = 0; i < armDefs.length; i++) {
    const def = armDefs[i];
    armDefMap.set(def.name, { index: i, def });
  }

  for (let i = 0; i < missileDefs.length; i++) {
    if (missileDefs[i].lifetime > maxMissileLifetime) {
      maxMissileLifetime = missileDefs[i].lifetime;
    }
  }

  asteroidDefs.push({
    resources: 500,
    sprite: { x: 256, y: 0, width: 64, height: 64 },
    radius: 24,
    mineral: "Prifetium Ore",
  });

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

const emptySlotData = (def: UnitDefinition) => {
  return new Array(def.slots.length).fill({});
};

enum EmptySlot {
  Normal = 0,
  Utility = 1,
  Mine = 2,
  Large = 3,
  Mining = 4,
}

const emptyLoadout = (index: number) => {
  const def = defs[index];
  return [...def.slots] as unknown as EmptySlot[];
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
  armDefs,
  armDefMap,
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
