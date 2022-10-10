import {
  Rectangle,
  Position,
  GlobalState,
  Player,
  Asteroid,
  TargetKind,
  l2NormSquared,
  EffectTrigger,
  EffectAnchorKind,
  availableCargoCapacity,
  addCargo,
  uid,
  Missile,
} from "../src/game";

enum Faction {
  Alliance = 0,
  Confederation,
}

const getFactionString = (faction: Faction) => {
  switch (faction) {
    case Faction.Alliance:
      return "Alliance";
    case Faction.Confederation:
      return "Confederation";
  }
};

enum UnitKind {
  Ship,
  Station,
}

enum SlotKind {
  Normal,
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
  team: number;
  radius: number;
  kind: UnitKind;
  hardpoints?: Position[];
  dockable?: boolean;
  slots: SlotKind[];
  cargoCapacity?: number;
  deathEffect: number;
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
  missileIndex?: number;
  cost: number;
  stateMutator?: (
    state: GlobalState,
    player: Player,
    targetKind: TargetKind,
    target: Player | Asteroid,
    applyEffect: (trigger: EffectTrigger) => void,
    slotIndex: number
  ) => void;
  // effectMutator?: (state: GlobalState, slotIndex: number, player: Player, target: Player | undefined) => void;
  equipMutator?: (player: Player, slotIndex: number) => void;
  frameMutator?: (player: Player, slotIndex: number) => void;
};

type AsteroidDef = {
  resources: number;
  sprite: Rectangle;
  radius: number;
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
};

const defs: UnitDefinition[] = [];
const defMap = new Map<string, { index: number; def: UnitDefinition }>();

const armDefs: ArmamentDef[] = [];
const armDefMap = new Map<string, { index: number; def: ArmamentDef }>();

const asteroidDefs: AsteroidDef[] = [];

const missileDefs: MissileDef[] = [];

const initDefs = () => {
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
    team: 0,
    radius: 16,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal],
    cargoCapacity: 100,
    deathEffect: 3,
  });
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
    team: 1,
    radius: 16,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal],
    cargoCapacity: 100,
    deathEffect: 3,
  });
  defs.push({
    name: "Starbase",
    description: "Strong starbase",
    sprite: { x: 0, y: 32, width: 256, height: 256 },
    health: 1000,
    speed: 0,
    energy: 1000,
    energyRegen: 0.5,
    primaryReloadTime: 10,
    primaryDamage: 15,
    team: 0,
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
  });

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    defMap.set(def.name, { index: i, def });
  }

  let missileIndex = 0;
  armDefs.push({
    name: "Empty normal slot",
    description: "Empty normal slot (dock with a station to buy armaments)",
    kind: SlotKind.Normal,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  armDefs.push({
    name: "Empty utility slot",
    description: "Empty utility slot (dock with a station to buy armaments)",
    kind: SlotKind.Utility,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  armDefs.push({
    name: "Empty mine slot",
    description: "Empty mine slot (dock with a station to buy armaments)",
    kind: SlotKind.Mine,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  armDefs.push({
    name: "Empty large slot",
    description: "Empty large slot (dock with a station to buy armaments)",
    kind: SlotKind.Large,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  armDefs.push({
    name: "Empty mining slot",
    description: "Empty mining slot (dock with a station to buy armaments)",
    kind: SlotKind.Mining,
    usage: ArmUsage.Empty,
    targeted: TargetedKind.Empty,
    cost: 0,
  });
  armDefs.push({
    name: "Basic mining laser",
    description: "A low powered mining laser",
    kind: SlotKind.Mining,
    usage: ArmUsage.Energy,
    targeted: TargetedKind.Targeted,
    energyCost: 0.5,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      if (targetKind === TargetKind.Asteroid && player.energy > 0.5) {
        target = target as Asteroid;
        if (target.resources > 0 && l2NormSquared(player.position, target.position) < 500 * 500 && availableCargoCapacity(player) > 0) {
          player.energy -= 0.3;
          const amount = Math.min(target.resources, 0.5);
          target.resources -= amount;
          addCargo(player, "minerals", amount);
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
        target = target as Player;
        if (l2NormSquared(player.position, target.position) < 700 * 700) {
          player.energy -= 35;
          target.health -= 30;
          slotData.sinceFired = 0;
          applyEffect({
            effectIndex: 1,
            from: { kind: EffectAnchorKind.Player, value: player.id },
            to: { kind: EffectAnchorKind.Player, value: target.id },
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
  armDefs.push({
    name: "Javelin Missile",
    description: "An unguided missile",
    kind: SlotKind.Normal,
    usage: ArmUsage.Ammo,
    targeted: TargetedKind.Untargeted,
    maxAmmo: 30,
    missileIndex: missileIndex++,
    stateMutator: (state, player, targetKind, target, applyEffect, slotId) => {
      const slotData = player.slotData[slotId];
      if (player.energy > 1 && slotData.sinceFired > 45 && slotData.ammo > 0) {
        player.energy -= 1;
        slotData.sinceFired = 0;
        slotData.ammo--;
        const id = uid();
        const def = defs[player.definitionIndex];
        const missile: Missile = {
          id,
          position: { x: player.position.x, y: player.position.y },
          speed: player.speed + 1,
          heading: player.heading,
          radius: 8,
          team: def.team,
          damage: 10,
          target: 0,
          definitionIndex: missileIndex - 1,
          lifetime: 600,
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

  for (let i = 0; i < armDefs.length; i++) {
    const def = armDefs[i];
    armDefMap.set(def.name, { index: i, def });
  }

  asteroidDefs.push({
    resources: 100,
    sprite: { x: 256, y: 0, width: 64, height: 64 },
    radius: 24,
  });

  missileDefs.push({
    sprite: { x: 64, y: 0, width: 32, height: 16 },
    radius: 8,
    speed: 15,
    damage: 10,
    acceleration: 0.2,
    lifetime: 600,
    deathEffect: 2,
  });
};

enum EmptySlot {
  Normal = 0,
  Utility = 1,
  Mine = 2,
  Large = 3,
  Mining = 4,
}

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
  initDefs,
  getFactionString,
};
