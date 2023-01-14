import { randomUUID } from "crypto";
import {
  GlobalState,
  Input,
  Player,
  randomAsteroids,
  TargetKind,
  mapSize,
  sectorBounds,
  TutorialStage,
  removeCargoFractions,
  SectorKind,
} from "../src/game";
import { WebSocket } from "ws";
import { defs, Faction, initDefs, UnitKind } from "../src/defs";
import { CardinalDirection } from "../src/geometry";
import { initMarket } from "./market";
import { NPC } from "../src/npc";
import { Checkpoint, User } from "./dataModels";
import { peerMap, waitingData } from "./peers";

// Initialize the definitions (Do this before anything else to avoid problems)
initDefs();
initMarket();

const uid = () => {
  let ret = 0;
  while (ret === 0) {
    ret = parseInt(randomUUID().split("-")[4], 16);
  }
  return ret;
};

const sectorList = new Array(mapSize * mapSize).fill(0).map((_, i) => i);
// const sectorAsteroidResources = sectorList.map((_) => [{ resource: "Prifecite", density: 1 }]);
// const sectorAsteroidCounts = sectorList.map((_) => 15);

// sectorAsteroidResources[0] = [
//   { resource: "Russanite", density: 1 },
//   { resource: "Hemacite", density: 1 },
// ];
// sectorAsteroidResources[1] = [
//   { resource: "Aziracite", density: 1 },
//   { resource: "Hemacite", density: 1 },
// ];
// sectorAsteroidResources[2] = [
//   { resource: "Aziracite", density: 1 },
//   { resource: "Hemacite", density: 1 },
// ];
// sectorAsteroidResources[3] = [
//   { resource: "Russanite", density: 1 },
//   { resource: "Hemacite", density: 1 },
// ];

// sectorAsteroidResources[5] = [
//   { resource: "Prifecite", density: 1 },
//   { resource: "Russanite", density: 1 },
// ];
// sectorAsteroidResources[6] = [
//   { resource: "Prifecite", density: 1 },
//   { resource: "Russanite", density: 1 },
// ];

// sectorAsteroidCounts[6] = 35;
// sectorAsteroidCounts[1] = 22;
// sectorAsteroidCounts[2] = 22;

// sectorAsteroidCounts[12] = 30;
// sectorAsteroidCounts[15] = 30;

const allResources = [
  { resource: "Prifecite", density: 1 },
  { resource: "Russanite", density: 1 },
  { resource: "Aziracite", density: 1 },
  { resource: "Hemacite", density: 1 },
];

// const sectorFactions: (Faction | null)[] = sectorList.map((_) => null);
// sectorFactions[0] = Faction.Scourge;
// sectorFactions[3] = Faction.Scourge;

// sectorFactions[1] = Faction.Rogue;
// sectorFactions[2] = Faction.Rogue;
// sectorFactions[5] = Faction.Rogue;
// sectorFactions[6] = Faction.Rogue;

// sectorFactions[12] = Faction.Alliance;
// sectorFactions[13] = Faction.Alliance;
// sectorFactions[8] = Faction.Alliance;
// sectorFactions[4] = Faction.Alliance;
// sectorFactions[9] = Faction.Alliance;

// sectorFactions[14] = Faction.Confederation;
// sectorFactions[15] = Faction.Confederation;
// sectorFactions[11] = Faction.Confederation;
// sectorFactions[7] = Faction.Confederation;
// sectorFactions[10] = Faction.Confederation;

const friendlySectors = (faction: Faction) => {
  const ret: number[] = [];
  return ret;
  // for (let i = 0; i < sectorFactions.length; i++) {
  //   if (sectorFactions[i] === faction) {
  //     ret.push(i);
  //   }
  // }
  // return ret;
};

// const sectorGuardianCount = sectorList.map((_) => 0);

// sectorGuardianCount[0] = 6;
// sectorGuardianCount[3] = 6;

// sectorGuardianCount[1] = 6;
// sectorGuardianCount[2] = 6;
// sectorGuardianCount[5] = 15;
// sectorGuardianCount[6] = 15;

// sectorGuardianCount[12] = 24;
// sectorGuardianCount[13] = 15;
// sectorGuardianCount[8] = 15;
// sectorGuardianCount[4] = 6;
// sectorGuardianCount[9] = 6;

// sectorGuardianCount[14] = 15;
// sectorGuardianCount[15] = 24;
// sectorGuardianCount[11] = 15;
// sectorGuardianCount[7] = 6;
// sectorGuardianCount[10] = 6;

// const sectorHasStarbase = sectorList.map((_) => false);
// sectorHasStarbase[5] = true;

// sectorHasStarbase[12] = true;

// sectorHasStarbase[15] = true;

type ClientData = {
  id: number;
  input: Input;
  angle: number;
  name: string;
  currentSector: number;
  lastMessage: string;
  lastMessageTime: number;
  sectorsVisited: Set<number>;
  inTutorial: TutorialStage;
  tutorialNpc?: NPC;
};

type SerializableClientData = Omit<ClientData, "sectorsVisited" | "tutorialNPC"> & {
  sectorsVisited: number[];
};

const serializableClientData = (client: ClientData): SerializableClientData => {
  if (client.inTutorial) {
    throw new Error("Cannot serialize client data while in tutorial");
  }
  client = { ...client };
  client.tutorialNpc = undefined;
  (client as any).sectorsVisited = Array.from(client.sectorsVisited);
  return client as unknown as SerializableClientData;
};

const repairClientData = (client: SerializableClientData): ClientData => {
  const ret = { ...client } as unknown as ClientData;
  ret.sectorsVisited = new Set(client.sectorsVisited);
  return ret;
};

/*
    x ->  
  y 0  1  2  3
  | 4  5  6  7
  v 8  9  10 11
    12 13 14 15
*/

// UNSAFE
const sectorInDirection = (sector: number, direction: CardinalDirection) => {
  if (sector >= mapSize * mapSize) {
    return null;
  }
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
// Targeting is handled by the clients, but the server needs to know
// Same pattern with secondaries
// BTW I do not like this design
const targets: Map<number, [TargetKind, number]> = new Map();
const secondaries: Map<number, number> = new Map();
const secondariesToActivate: Map<number, number[]> = new Map();
const knownRecipes: Map<number, Set<string>> = new Map();

const serializeAllClientData = (ws: WebSocket, player: Player, key: string) => {
  const client = clients.get(ws);
  if (!client) return null;
  const target = targets.get(client.id);
  const secondary = secondaries.get(client.id);
  const toActivate = secondariesToActivate.get(client.id);
  const recipesKnown = knownRecipes.get(client.id) || new Set();

  return JSON.stringify({
    clientData: serializableClientData(client),
    target,
    secondary,
    toActivate,
    recipesKnown: Array.from(recipesKnown),
    player,
    key,
  });
};

type SerializedClient = {
  clientData: SerializableClientData;
  target: [TargetKind, number] | undefined;
  secondary: number | undefined;
  toActivate: number[] | undefined;
  recipesKnown: string[];
  player: Player;
  key: string;
};

const deserializeClientData = (ws: WebSocket, data: SerializedClient) => {
  // console.log("Deserializing client data for key", data);
  console.log(waitingData);
  const client = repairClientData(data.clientData);
  const sector = sectors.get(client.currentSector);
  if (!sector) {
    console.warn("Missing sector", client.currentSector);
    return;
  }
  clients.set(ws, client);
  idToWebsocket.set(client.id, ws);
  if (data.target) {
    targets.set(client.id, data.target);
  } else {
    console.warn("Missing client target");
  }
  if (data.secondary) {
    secondaries.set(client.id, data.secondary);
  } else {
    console.warn("Missing client secondary");
  }
  if (data.toActivate) {
    secondariesToActivate.set(client.id, data.toActivate);
  } else {
    console.warn("Missing client toActivate");
  }
  if (data.recipesKnown) {
    knownRecipes.set(client.id, new Set(data.recipesKnown));
  } else {
    console.warn("Missing client recipesKnown");
  }
  sector.players.set(client.id, data.player);
  // BROKEN
  const sectorInfo = {
    sector: client.currentSector,
    resources: [],
  };
  ws.send(
    JSON.stringify({
      type: "warp",
      payload: {
        to: client.currentSector,
        asteroids: Array.from(sector.asteroids.values()),
        collectables: Array.from(sector.collectables.values()),
        mines: Array.from(sector.mines.values()),
        sectorInfos: [sectorInfo],
      },
    })
  );
};

const serverWarps = new Map<string, WebSocket>();

const serverChangePlayer = (ws: WebSocket, player: Player) => {
  const key = uid().toString();
  const serialized = serializeAllClientData(ws, player, key);
  serverWarps.set(key, ws);
  console.log(peerMap);
  peerMap.get("sheppard")!.send(serialized);
};

const sendServerWarp = (key: string, to: string) => {
  if (!serverWarps.has(key)) {
    console.warn("No server warp for key", key);
    return;
  }
  try {
    const ws = serverWarps.get(key)!;
    ws.send(JSON.stringify({ type: "changeServers", payload: { to, key } }));
  } catch (e) {
    console.error("Error sending server warp", e);
  }
};

const getPlayerFromId = (id: number) => {
  const ws = idToWebsocket.get(id);
  if (!ws) return null;
  const client = clients.get(ws);
  if (!client) return null;
  return sectors.get(client.currentSector)?.players.get(id);
};

const sectors: Map<number, GlobalState> = new Map();
const sectorTriggers: Map<number, (state: GlobalState) => void> = new Map();
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
    projectileId: 1,
    delayedActions: [],
    sectorKind: SectorKind.Overworld,
  });
});

const initInitialAsteroids = () => {
  for (let i = 0; i < sectorList.length; i++) {
    const sector = sectors.get(sectorList[i])!;
    const stationsInSector = Array.from(sector.players.values()).filter((a) => {
      const def = defs[a.defIndex];
      return def.kind === UnitKind.Station;
    });
    // const asteroids = randomAsteroids(sectorAsteroidCounts[i], sectorBounds, sectorList[i], uid, sectorAsteroidResources[i], stationsInSector);
    const asteroids = randomAsteroids(10, sectorBounds, Math.floor(Math.random() * 100), uid, allResources, stationsInSector);
    for (const asteroid of asteroids) {
      sector.asteroids.set(asteroid.id, asteroid);
    }
  }
};

const tutorialRespawnPoints = new Map<number, Player>();

const saveCheckpoint = (id: number, sector: number, player: Player, sectorsVisited: Set<number>, isLogoff = false) => {
  console.log("Checkpoint saving is disabled due to server rework!");
  return;

  if (player.health <= 0) {
    console.log("Warning: attempt to save checkpoint of dead player");
    return;
  }
  // Shouldn't be necessary, but I am nervous
  removeCargoFractions(player);
  const data = JSON.stringify(player);
  Checkpoint.findOneAndUpdate({ id }, { id, sector, data }, { upsert: true }, (err) => {
    if (err) {
      console.log("Error saving checkpoint: " + err);
      return;
    }
    const toPush = {};
    if (isLogoff) {
      (toPush as any).logoffTimes = Date.now();
    }
    User.findOneAndUpdate({ id }, { $set: { id, sectorsVisited: Array.from(sectorsVisited) }, $push: toPush }, { upsert: false }, (err) => {
      if (err) {
        console.log("Error saving user: " + err);
        return;
      }
    });
  });
};

export {
  // ClientData,
  // SerializableClientData,
  // serializableClientData,
  // repairClientData,
  SerializedClient,
  deserializeClientData,
  sectorList,
  // sectorAsteroidResources,
  // sectorAsteroidCounts,
  allResources,
  // sectorFactions,
  // sectorGuardianCount,
  // sectorHasStarbase,
  clients,
  idToWebsocket,
  sectors,
  sectorTriggers,
  warpList,
  targets,
  secondaries,
  secondariesToActivate,
  knownRecipes,
  tutorialRespawnPoints,
  uid,
  sectorInDirection,
  saveCheckpoint,
  friendlySectors,
  initInitialAsteroids,
  getPlayerFromId,
  serializeAllClientData,
  sendServerWarp,
  serverChangePlayer,
};
