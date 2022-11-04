import { Position, Rectangle } from "../geometry";

const computeBrakeDistance = (acceleration: number, speed: number) => {
  return (speed * speed) / (2 * acceleration);
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

const defs: UnitDefinition[] = [];
const defMap = new Map<string, { index: number; def: UnitDefinition }>();

const initShipsAndStations = () => {
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
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Mine],
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
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Mine],
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
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Normal, SlotKind.Mine, SlotKind.Mine],
    cargoCapacity: 1600,
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
  // Spartan - 9
  defs.push({
    name: "Spartan",
    description: "A durable heavily armed ship",
    sprite: { x: 256, y: 640, width: 128, height: 128 },
    health: 1200,
    speed: 8,
    energy: 500,
    energyRegen: 0.4,
    primaryReloadTime: 8,
    primaryDamage: 40,
    radius: 48,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Normal, SlotKind.Mine],
    cargoCapacity: 400,
    deathEffect: 2,
    turnRate: 0.05,
    acceleration: 0.1,
    healthRegen: 0.1,
    price: 5000,
    warpTime: 150,
    warpEffect: 7,
    sideThrustMaxSpeed: 4,
    sideThrustAcceleration: 0.1,
    scanRange: 13000,
  });

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    defMap.set(def.name, { index: i, def });
    if (def.acceleration !== undefined) {
      def.brakeDistance = computeBrakeDistance(def.acceleration, def.speed);
    }
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

export { UnitKind, SlotKind, UnitDefinition, EmptySlot, defs, defMap, initShipsAndStations, computeBrakeDistance, emptySlotData, emptyLoadout };