import { randomUUID } from "crypto";
import { GlobalState, Input, Player, randomAsteroids, TargetKind } from "../src/game";
import { WebSocket } from "ws";
import { initDefs } from "../src/defs";

// Initialize the definitions (Do this before anything else to avoid problems)
initDefs();

const uid = () => {
  let ret = 0;
  while (ret === 0) {
    ret = parseInt(randomUUID().split("-")[4], 16);
  }
  return ret;
};

// This data will ultimately be stored in the database
const sectorList = [1, 2, 3, 4];
const sectorAsteroidResources = [
  [{ resource: "Prifecite", density: 1 }],
  [{ resource: "Prifecite", density: 1 }],
  [{ resource: "Prifecite", density: 1 }],
  [
    { resource: "Prifecite", density: 1 },
    { resource: "Russanite", density: 2 },
  ],
];
const sectorAsteroidCounts = [5, 5, 5, 40];

type ClientData = {
  id: number;
  input: Input;
  angle: number;
  name: string;
  currentSector: number;
  lastMessage: string;
  lastMessageTime: number;
  sectorDataSent: boolean;
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
  clients,
  idToWebsocket,
  sectors,
  warpList,
  targets,
  secondaries,
  asteroidBounds,
  uid,
};
