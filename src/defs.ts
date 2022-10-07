import { Rectangle, Position, GlobalState, Player, Asteroid } from "../src/game";

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
};

type ArmamentDef = {
  name: string;
  description: string;
  kind: SlotKind;
  stateMutator?: (state: GlobalState, slotIndex: number, player: Player, target: Player | undefined) => void;
  effectMutator?: (state: GlobalState, slotIndex: number, player: Player, target: Player | undefined) => void;
};

type AsteroidDef = {
  resources: number;
  sprite: Rectangle;
  radius: number;
};

const defs: UnitDefinition[] = [];
const defMap = new Map<string, { index: number; def: UnitDefinition }>();

const armDefs: ArmamentDef[] = [];
const armDefMap = new Map<string, { index: number; def: ArmamentDef }>();

const asteroidDefs: AsteroidDef[] = [];

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
    slots: [
      SlotKind.Normal
    ],
    cargoCapacity: 100,
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
    slots: [
      SlotKind.Normal
    ],
    cargoCapacity: 100,
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
  });

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    defMap.set(def.name, { index: i, def });
  }

  armDefs.push({
    name: "Empty normal slot",
    description: "Empty normal slot (dock with a station to buy armaments)",
    kind: SlotKind.Normal,
  });
  armDefs.push({
    name: "Empty utility slot",
    description: "Empty utility slot (dock with a station to buy armaments)",
    kind: SlotKind.Utility,
  });
  armDefs.push({
    name: "Empty mine slot",
    description: "Empty mine slot (dock with a station to buy armaments)",
    kind: SlotKind.Mine,
  });
  armDefs.push({
    name: "Empty large slot",
    description: "Empty large slot (dock with a station to buy armaments)",
    kind: SlotKind.Large,
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
};

export { UnitDefinition, UnitKind, SlotKind, AsteroidDef, defs, defMap, asteroidDefs, initDefs };
