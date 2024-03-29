import { effectiveInfinity } from "../game";
import { Position, Position3, Rectangle } from "../geometry";

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

type PointLightData = {
  position: Position3;
  color: [number, number, number];
};

type UnitDefinition = {
  name: string;
  description: string;
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
  primaryDefIndex: number;
  mass: number;
  isCloaky?: boolean;
  model: string;
  modelIndex?: number;
  pointLights?: PointLightData[];
  deployment?: number;
};

const defs: UnitDefinition[] = [];
const defMap = new Map<string, { index: number; def: UnitDefinition }>();

const initShipsAndStations = () => {
  // Fighter - 0
  defs.push({
    name: "Fighter",
    description: "A basic fighter",
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
    primaryDefIndex: 0,
    mass: 10,
    model: "fighter",
  });
  // Drone - 1
  defs.push({
    name: "Drone",
    description: "A basic drone",
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
    primaryDefIndex: 0,
    mass: 10,
    model: "drone",
  });
  // Alliance Starbase - 2
  defs.push({
    name: "Alliance Starbase",
    description: "Alliance starbase",
    health: 10000,
    speed: 0,
    energy: 5000,
    energyRegen: 0.5,
    primaryReloadTime: 10,
    primaryDamage: 40,
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
    primaryDefIndex: 0,
    mass: effectiveInfinity,
    model: "alliance_starbase",
    pointLights: [
      { position: { x: 3.1, y: 1, z: 3.3 }, color: [0.0, 5.0, 0] },
      { position: { x: 3.1, y: -1, z: 3.3 }, color: [0.0, 5.0, 0] },
    ],
  });
  // Confederacy Starbase - 3
  defs.push({
    name: "Confederacy Starbase",
    description: "Confederacy starbase",
    health: 10000,
    speed: 0,
    energy: 5500,
    energyRegen: 0.5,
    primaryReloadTime: 10,
    primaryDamage: 40,
    radius: 120,
    kind: UnitKind.Station,
    hardpoints: [
      { x: -60, y: -60 },
      { x: -60, y: 60 },
      { x: 60, y: -60 },
      { x: 60, y: 60 },
    ],
    dockable: true,
    slots: [],
    deathEffect: 4,
    healthRegen: 0.06,
    repairsRequired: 8,
    primaryDefIndex: 0,
    mass: effectiveInfinity,
    model: "confederacy_starbase",
    pointLights: [
      { position: { x: 6, y: 6, z: 5 }, color: [2.0, 0.0, 0] },
      { position: { x: 6, y: -6, z: 5 }, color: [2.0, 0.0, 0] },
      { position: { x: -6, y: -6, z: 5 }, color: [2.0, 0.0, 0] },
      { position: { x: -6, y: 6, z: 5 }, color: [2.0, 0.0, 0] },
    ],
  });
  // Advanced Fighter - 4
  defs.push({
    name: "Advanced Fighter",
    description: "A more heavily armed fighter",
    health: 250,
    speed: 8,
    energy: 150,
    energyRegen: 0.2,
    primaryReloadTime: 10,
    primaryDamage: 20,
    radius: 30,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Mine, SlotKind.Utility],
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
    primaryDefIndex: 0,
    mass: 20,
    model: "advanced_fighter",
  });
  // Seeker - 5
  defs.push({
    name: "Seeker",
    description: "A lightly armed, but solid ship",
    health: 250,
    speed: 8,
    energy: 150,
    energyRegen: 0.2,
    primaryReloadTime: 10,
    primaryDamage: 20,
    radius: 30,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Mine, SlotKind.Utility],
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
    primaryDefIndex: 0,
    mass: 20,
    model: "seeker",
  });
  // Strafer - 6
  defs.push({
    name: "Strafer",
    description: "A fast, lightly armed ship, with a powerful side thruster, that is practically blind",
    health: 120,
    speed: 14,
    energy: 100,
    energyRegen: 0.1,
    primaryReloadTime: 10,
    primaryDamage: 10,
    radius: 22,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Mine, SlotKind.Utility],
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
    primaryDefIndex: 0,
    mass: 8,
    model: "strafer",
  });
  // Rogue Starbase - 7
  defs.push({
    name: "Rogue Starbase",
    description: "A weak ramshackle starbase with unique build options",
    health: 800,
    speed: 0,
    energy: 1100,
    energyRegen: 0.5,
    primaryReloadTime: 10,
    primaryDamage: 15,
    radius: 93,
    kind: UnitKind.Station,
    hardpoints: [{ x: 0, y: 0 }],
    dockable: true,
    slots: [],
    deathEffect: 4,
    healthRegen: 0.06,
    repairsRequired: 8,
    primaryDefIndex: 0,
    mass: effectiveInfinity,
    model: "rogue_starbase",
  });
  // Venture - 8
  defs.push({
    name: "Venture",
    description: "A slow industrial ship",
    health: 500,
    speed: 8,
    energy: 400,
    energyRegen: 0.3,
    primaryReloadTime: 10,
    primaryDamage: 30,
    radius: 57,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Normal, SlotKind.Mine, SlotKind.Mine],
    cargoCapacity: 2600,
    deathEffect: 4,
    turnRate: 0.02,
    acceleration: 0.05,
    healthRegen: 0.05,
    price: 300,
    warpTime: 150,
    warpEffect: 7,
    sideThrustMaxSpeed: 2,
    sideThrustAcceleration: 0.05,
    scanRange: 13000,
    primaryDefIndex: 0,
    mass: 50,
    model: "venture",
  });
  // Spartan - 9
  defs.push({
    name: "Spartan",
    description: "A durable heavily armed ship",
    health: 1200,
    speed: 8,
    energy: 500,
    energyRegen: 0.4,
    primaryReloadTime: 8,
    primaryDamage: 40,
    radius: 48,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Normal, SlotKind.Mine, SlotKind.Utility, SlotKind.Utility, SlotKind.Large],
    cargoCapacity: 400,
    deathEffect: 4,
    turnRate: 0.05,
    acceleration: 0.1,
    healthRegen: 0.1,
    price: 5000,
    warpTime: 150,
    warpEffect: 7,
    sideThrustMaxSpeed: 4,
    sideThrustAcceleration: 0.1,
    scanRange: 13000,
    primaryDefIndex: 0,
    mass: 50,
    model: "spartan",
  });
  // Striker - 10
  defs.push({
    name: "Striker",
    description: "The Striker is optimized for cloaking, but sacrifices firepower and durability",
    health: 230,
    speed: 8,
    energy: 300,
    energyRegen: 0.3,
    primaryReloadTime: 8,
    primaryDamage: 4,
    radius: 16,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Utility, SlotKind.Utility],
    cargoCapacity: 100,
    deathEffect: 3,
    turnRate: 0.07,
    acceleration: 0.12,
    healthRegen: 0.08,
    price: 4000,
    warpTime: 90,
    warpEffect: 7,
    sideThrustMaxSpeed: 5,
    sideThrustAcceleration: 0.1,
    scanRange: 15000,
    primaryDefIndex: 2,
    mass: 8,
    isCloaky: true,
    model: "striker",
  });
  // Smasher - 11
  defs.push({
    name: "Smasher",
    description: "A durable all around ship",
    health: 800,
    speed: 7,
    energy: 220,
    energyRegen: 0.3,
    primaryReloadTime: 15,
    primaryDamage: 20,
    radius: 23,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Mine, SlotKind.Utility],
    cargoCapacity: 250,
    deathEffect: 3,
    turnRate: 0.09,
    acceleration: 0.08,
    healthRegen: 0.06,
    price: 2500,
    warpTime: 120,
    warpEffect: 7,
    sideThrustMaxSpeed: 2.5,
    sideThrustAcceleration: 0.09,
    scanRange: 13000,
    primaryDefIndex: 0,
    mass: 30,
    model: "smasher",
  });
  // Enforcer - 12
  defs.push({
    name: "Enforcer",
    description: "A durable all around ship",
    health: 800,
    speed: 7,
    energy: 220,
    energyRegen: 0.3,
    primaryReloadTime: 15,
    primaryDamage: 20,
    radius: 23,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Mine, SlotKind.Utility],
    cargoCapacity: 250,
    deathEffect: 3,
    turnRate: 0.09,
    acceleration: 0.08,
    healthRegen: 0.06,
    price: 2500,
    warpTime: 120,
    warpEffect: 7,
    sideThrustMaxSpeed: 2.5,
    sideThrustAcceleration: 0.09,
    scanRange: 13000,
    primaryDefIndex: 0,
    mass: 30,
    model: "enforcer",
  });
  // Maintainer - 13
  defs.push({
    name: "Maintainer",
    description: "An utility oriented ship that is poor at combat",
    health: 1500,
    speed: 9,
    energy: 800,
    energyRegen: 0.5,
    primaryReloadTime: 40,
    primaryDamage: 30,
    radius: 33,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Utility, SlotKind.Utility, SlotKind.Utility, SlotKind.Utility, SlotKind.Mine, SlotKind.Mine],
    cargoCapacity: 1300,
    deathEffect: 4,
    turnRate: 0.05,
    acceleration: 0.06,
    healthRegen: 0.1,
    price: 5000,
    warpTime: 180,
    warpEffect: 7,
    sideThrustMaxSpeed: 2,
    sideThrustAcceleration: 0.09,
    scanRange: 13000,
    primaryDefIndex: 1,
    mass: 50,
    model: "maintainer",
  });
  // Infiltrator - 14
  defs.push({
    name: "Infiltrator",
    description: "A tough cloaky ship that can rough up enemies",
    health: 700,
    speed: 8,
    energy: 300,
    energyRegen: 0.4,
    primaryReloadTime: 10,
    primaryDamage: 20,
    radius: 23,
    kind: UnitKind.Ship,
    slots: [SlotKind.Mining, SlotKind.Normal, SlotKind.Normal, SlotKind.Normal, SlotKind.Normal, SlotKind.Normal, SlotKind.Normal, SlotKind.Utility],
    cargoCapacity: 200,
    deathEffect: 3,
    turnRate: 0.09,
    acceleration: 0.07,
    healthRegen: 0.06,
    price: 9000,
    warpTime: 120,
    warpEffect: 7,
    sideThrustMaxSpeed: 2.5,
    sideThrustAcceleration: 0.09,
    scanRange: 13000,
    primaryDefIndex: 0,
    mass: 35,
    isCloaky: true,
    model: "infiltrator",
  });
  // Gun Platform - 15
  defs.push({
    name: "Gun Platform",
    description: "A static gun platform",
    health: 800,
    speed: 0,
    energy: 1100,
    energyRegen: 0.5,
    primaryReloadTime: 10,
    primaryDamage: 15,
    radius: 25,
    kind: UnitKind.Station,
    slots: [SlotKind.Normal],
    hardpoints: [{ x: 0, y: 0 }],
    dockable: false,
    deathEffect: 4,
    healthRegen: 0.1,
    repairsRequired: 8,
    primaryDefIndex: 0,
    mass: effectiveInfinity,
    model: "gun_platform",
    deployment: 120,
    pointLights: [
      { position: { x: 0, y: 0, z: 5 }, color: [2.0, 2.0, 2.0] },
    ],
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

export {
  UnitKind,
  SlotKind,
  UnitDefinition,
  EmptySlot,
  PointLightData,
  defs,
  defMap,
  initShipsAndStations,
  computeBrakeDistance,
  emptySlotData,
  emptyLoadout,
};
