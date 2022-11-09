import { randomUUID } from "crypto";
import { GlobalState, Input, Player, randomAsteroids, TargetKind, mapSize } from "../src/game";
import { WebSocket } from "ws";
import { armDefs, defs, Faction, initDefs } from "../src/defs";
import { CardinalDirection } from "../src/geometry";
import { market } from "./market";

// Initialize the definitions (Do this before anything else to avoid problems)
initDefs();

// Put the definition info into the marketplace
for (let i = 0; i < defs.length; i++) {
  const def = defs[i];
  if (def.price !== undefined) {
    market.set(def.name, Math.round(def.price * 0.8));
  }
}

for (let i = 0; i < armDefs.length; i++) {
  const def = armDefs[i];
  market.set(def.name, Math.round(def.cost * 0.8));
}

const uid = () => {
  let ret = 0;
  while (ret === 0) {
    ret = parseInt(randomUUID().split("-")[4], 16);
  }
  return ret;
};

// This data will ultimately be stored in the database
// TODO Make the sector list have names like 1-1, 1-2, 2-1, 2-2, etc.
const sectorList = (new Array(mapSize * mapSize)).fill(0).map((_, i) => i);
const sectorAsteroidResources = sectorList.map(_ => [{ resource: "Prifecite", density: 1 }]);
const sectorAsteroidCounts = sectorList.map(_ => 5);

sectorAsteroidResources[0] = [{ resource: "Russanite", density: 1 }, { resource: "Hemacite", density: 1 }];
sectorAsteroidResources[1] = [{ resource: "Russanite", density: 1 }, { resource: "Hemacite", density: 1 }];
sectorAsteroidResources[2] = [{ resource: "Russanite", density: 1 }, { resource: "Hemacite", density: 1 }];
sectorAsteroidResources[3] = [{ resource: "Russanite", density: 1 }, { resource: "Hemacite", density: 1 }];

sectorAsteroidResources[5] = [{ resource: "Prifecite", density: 1 }, { resource: "Russanite", density: 1 }];
sectorAsteroidResources[6] = [{ resource: "Prifecite", density: 1 }, { resource: "Russanite", density: 1 }];

sectorAsteroidCounts[6] = 20;
sectorAsteroidCounts[1] = 12;
sectorAsteroidCounts[2] = 12;

const sectorFactions: (Faction | null)[] = sectorList.map(_ => null);
sectorFactions[0] = Faction.Scourge;
sectorFactions[3] = Faction.Scourge;

sectorFactions[1] = Faction.Rogue;
sectorFactions[2] = Faction.Rogue;
sectorFactions[5] = Faction.Rogue;
sectorFactions[6] = Faction.Rogue;

sectorFactions[12] = Faction.Alliance;
sectorFactions[13] = Faction.Alliance;
sectorFactions[8] = Faction.Alliance;

sectorFactions[14] = Faction.Confederation;
sectorFactions[15] = Faction.Confederation;
sectorFactions[11] = Faction.Confederation;

const sectorGuardianCount = sectorList.map(_ => 0);

sectorGuardianCount[0] = 2;
sectorGuardianCount[3] = 2;

sectorGuardianCount[1] = 2;
sectorGuardianCount[2] = 2;
sectorGuardianCount[5] = 5;
sectorGuardianCount[6] = 5;

sectorGuardianCount[12] = 8;
sectorGuardianCount[13] = 5;
sectorGuardianCount[8] = 5;

sectorGuardianCount[14] = 5;
sectorGuardianCount[15] = 8;
sectorGuardianCount[11] = 5;

const sectorHasStarbase = sectorList.map(_ => false);
sectorHasStarbase[5] = true;

sectorHasStarbase[12] = true;

sectorHasStarbase[15] = true;

type ClientData = {
  id: number;
  input: Input;
  angle: number;
  name: string;
  currentSector: number;
  lastMessage: string;
  lastMessageTime: number;
  sectorDataSent: boolean;
  sectorsVisited: Set<number>;
};

/*
    x ->  
  y 0  1  2  3
  | 4  5  6  7
  v 8  9  10 11
    12 13 14 15
*/

const sectorInDirection = (sector: number, direction: CardinalDirection) => {
  const x = sector % mapSize;
  const y = Math.floor(sector / mapSize);
  if (direction === CardinalDirection.Up) {
    if (y === 0) return null;
    return sector - mapSize;
  } else if (direction === CardinalDirection.Down) {
    if (y === mapSize - 1) return null;
    return sector + mapSize;
  } else if (direction === CardinalDirection.Left) {
    if (x === 0) return null;
    return sector - 1;
  } else if (direction === CardinalDirection.Right) {
    if (x === mapSize - 1) return null;
    return sector + 1;
  }
  return null;
};

const clients: Map<WebSocket, ClientData> = new Map();
const idToWebsocket = new Map<number, WebSocket>();

const sectors: Map<number, GlobalState> = new Map();
const warpList: { player: Player; to: number }[] = [];

sectorList.forEach((sector) => {
  sectors.set(sector, {
    players: new Map(),
    projectiles: new Map(),
    asteroids: new Map(),
    missiles: new Map(),
    collectables: new Map(),
    asteroidsDirty: false,
    mines: new Map(),
  });
});

// Server state

// Targeting is handled by the clients, but the server needs to know
// Same pattern with secondaries
// BTW I do not like this design
const targets: Map<number, [TargetKind, number]> = new Map();
const secondaries: Map<number, number> = new Map();
const secondariesToActivate: Map<number, number[]> = new Map();

const knownRecipes: Map<number, Set<string>> = new Map();

const asteroidBounds = { x: -3000, y: -3000, width: 6000, height: 6000 };

for (let i = 0; i < sectorList.length; i++) {
  const sector = sectors.get(sectorList[i])!;
  const testAsteroids = randomAsteroids(sectorAsteroidCounts[i], asteroidBounds, sectorList[i], uid, sectorAsteroidResources[i]);
  for (const asteroid of testAsteroids) {
    sector.asteroids.set(asteroid.id, asteroid);
  }
}

export {
  sectorList,
  sectorAsteroidResources,
  sectorAsteroidCounts,
  sectorFactions,
  sectorGuardianCount,
  sectorHasStarbase,
  clients,
  idToWebsocket,
  sectors,
  warpList,
  targets,
  secondaries,
  secondariesToActivate,
  asteroidBounds,
  knownRecipes,
  uid,
  sectorInDirection,
};
