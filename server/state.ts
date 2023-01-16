import { randomUUID } from "crypto";
import { GlobalState, Input, Player, randomAsteroids, TargetKind, sectorBounds, TutorialStage, removeCargoFractions, SectorKind, Ballistic, Asteroid, Missile, Collectable, Mine } from "../src/game";
import { WebSocket } from "ws";
import { defs, Faction, initDefs, UnitKind } from "../src/defs";
import { CardinalDirection } from "../src/geometry";
import { initMarket } from "./market";
import { NPC } from "../src/npc";
import { Checkpoint, Station, User } from "./dataModels";
import { awareSectors, peerMap, PeerSockets, waitingData } from "./peers";
import { insertRespawnedPlayer, insertSpawnedPlayer } from "./server";
import { ISector, Sector } from "./sector";
import { HydratedDocument } from "mongoose";
import { mapHeight, mapWidth, ResourceDensity } from "../src/mapLayout";

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

const sectorList: number[] = [];
const sectorAsteroidResources: ResourceDensity[][] = [];
const sectorAsteroidCounts: number[] = [];

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

const clients: Map<WebSocket, ClientData> = new Map();
const idToWebsocket = new Map<number, WebSocket>();
// Targeting is handled by the clients, but the server needs to know
// Same pattern with secondaries
// BTW I do not like this design
const targets: Map<number, [TargetKind, number]> = new Map();
const secondaries: Map<number, number> = new Map();
const secondariesToActivate: Map<number, number[]> = new Map();
const knownRecipes: Map<number, Set<string>> = new Map();

enum ServerChangeKind {
  Warp,
  Respawn,
  Spawn,
}

const serializeAllClientData = (ws: WebSocket, player: Player, key: string, kind: ServerChangeKind): SerializedClient | null => {
  const client = clients.get(ws);
  if (!client) return null;
  const target = targets.get(client.id);
  const secondary = secondaries.get(client.id);
  const toActivate = secondariesToActivate.get(client.id);
  const recipesKnown = knownRecipes.get(client.id) || new Set();

  return {
    clientData: serializableClientData(client),
    target,
    secondary,
    toActivate,
    recipesKnown: Array.from(recipesKnown),
    player,
    key,
    kind,
  };
};

type SerializedClient = {
  clientData: SerializableClientData;
  target: [TargetKind, number] | undefined;
  secondary: number | undefined;
  toActivate: number[] | undefined;
  recipesKnown: string[];
  player: Player;
  key: string;
  kind: ServerChangeKind;
};

const deserializeClientData = (ws: WebSocket, data: SerializedClient) => {
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
  switch (data.kind) {
    case ServerChangeKind.Warp:
      sector.players.set(client.id, data.player);
      const sectorInfo = {
        sector: client.currentSector,
        resources: sectorAsteroidResources[client.currentSector].map((resDen) => resDen.resource),
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
      break;
    case ServerChangeKind.Respawn:
      insertRespawnedPlayer(ws, data.player, client.currentSector);
      break;
    case ServerChangeKind.Spawn:
      insertSpawnedPlayer(ws, data.player, client.currentSector);
      break;
    default:
      throw new Error("Unknown server change kind");
  }
};

const serverWarps = new Map<string, WebSocket>();

// Note: this does not remove the player from the GlobalState object for the current server
const serverChangePlayer = (ws: WebSocket, player: Player, serverName: string, kind = ServerChangeKind.Warp) => {
  const key = uid().toString();
  const serialized = serializeAllClientData(ws, player, key, kind);
  if (!serialized) {
    console.warn("No serialized client data");
    return;
  }
  serverWarps.set(key, ws);
  const server = peerMap.get(serverName);
  if (!server) {
    console.warn("No server for", serverName);
    return;
  }
  server.request.send("player-transfer", serialized, (key: string) => {
    console.log(`Received key from ${server.name}`, key);
    sendServerWarp(key, `ws://${server.ip}:${server.port}`);
  });
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

const initSectors = (serverSectors: number[]) => {
  sectorList.push(...serverSectors);
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
};

const initSectorResourceData = async () => {
  for (let i = 0; i < mapWidth * mapHeight; i++) {
    const sectorInfo = await Sector.findOne({ sector: i });
    if (!sectorInfo) {
      throw new Error("Missing sector info");
    }
    sectorAsteroidResources.push(sectorInfo.resources);
    sectorAsteroidCounts.push(sectorInfo.count);
  }
};

const initInitialAsteroids = () => {
  for (let i = 0; i < sectorList.length; i++) {
    const sector = sectors.get(sectorList[i])!;
    const stationsInSector = Array.from(sector.players.values()).filter((a) => {
      const def = defs[a.defIndex];
      return def.kind === UnitKind.Station;
    });

    const asteroids = randomAsteroids(
      sectorAsteroidCounts[sectorList[i]],
      sectorBounds,
      sectorList[i],
      uid,
      sectorAsteroidResources[sectorList[i]],
      stationsInSector
    );
    for (const asteroid of asteroids) {
      sector.asteroids.set(asteroid.id, asteroid);
    }
  }
};

const stationIdToDefaultTeam = new Map<number, Faction>();

const initStationTeams = async () => {
  const stations = await Station.find({});
  for (const station of stations) {
    stationIdToDefaultTeam.set(station.id, station.team);
  }
};

const tutorialRespawnPoints = new Map<number, Player>();

const saveCheckpoint = (id: number, sector: number, player: Player, sectorsVisited: Set<number>, isLogoff = false) => {
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

type SerializableGlobalState = {
  // Players handled separately
  projectiles: Ballistic[];
  asteroids: Asteroid[];
  missiles: Missile[];
  collectables: Collectable[];
  mines: Mine[];
  asteroidsDirty?: boolean;
  projectileId?: number;
  // delayedActions?: DelayedAction[];
  sectorKind?: SectorKind;
  sectorNumber: number;
};

const serializeGlobalState = (state: GlobalState, sectorNumber: number): SerializableGlobalState => {
  return {
    projectiles: Array.from(state.projectiles.values()),
    asteroids: Array.from(state.asteroids.values()),
    missiles: Array.from(state.missiles.values()),
    collectables: Array.from(state.collectables.values()),
    mines: Array.from(state.mines.values()),
    asteroidsDirty: state.asteroidsDirty,
    projectileId: state.projectileId,
    // delayedActions: state.delayedActions,
    sectorKind: state.sectorKind,
    sectorNumber,
  };
};

const deserializeGlobalState = (state: SerializableGlobalState): GlobalState => {
  return {
    players: new Map(),
    projectiles: new Map(state.projectiles.map((p) => [p.id, p])),
    asteroids: new Map(state.asteroids.map((a) => [a.id, a])),
    missiles: new Map(state.missiles.map((m) => [m.id, m])),
    collectables: new Map(state.collectables.map((c) => [c.id, c])),
    mines: new Map(state.mines.map((m) => [m.id, m])),
    asteroidsDirty: state.asteroidsDirty || false,
    projectileId: state.projectileId || 1,
    delayedActions: [],
    sectorKind: state.sectorKind || SectorKind.Overworld,
  };
};

const insertSector = (state: SerializableGlobalState) => {
  if (sectors.has(state.sectorNumber)) {
    return "Sector already exists on this server";
  }
  const repairedState = deserializeGlobalState(state);
  sectors.set(state.sectorNumber, repairedState);
  return "OK";
};

const transferSectorToPeer = (sector: number, peer: string) => {
  const promise = new Promise<void>((resolve, reject) => {
    const state = sectors.get(sector);
    if (!state) {
      // TODO: We can handle this problem better
      reject("Sector not on this server");
      return;
    }
    const serializableState = serializeGlobalState(state, sector);
    const peerSockets = peerMap.get(peer);
    if (!peerSockets) {
      reject("Peer not found");
      return;
    }
    peerSockets.request.send("sector-transfer", serializableState, (success: string) => {
      if (success === "OK") {
        resolve();
      } else {
        reject("Transfer failed: " + success);
      }
    });
  });
  return promise;
};

export {
  ServerChangeKind,
  // ClientData,
  // SerializableClientData,
  // serializableClientData,
  // repairClientData,
  SerializedClient,
  SerializableGlobalState,
  deserializeClientData,
  sectorList,
  sectorAsteroidResources,
  sectorAsteroidCounts,
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
  saveCheckpoint,
  friendlySectors,
  initInitialAsteroids,
  getPlayerFromId,
  serializeAllClientData,
  sendServerWarp,
  serverChangePlayer,
  initSectors,
  initSectorResourceData,
  initStationTeams,
  stationIdToDefaultTeam,
  insertSector,
  transferSectorToPeer,
};
