import { randomUUID } from "crypto";
import {
  GlobalState,
  Input,
  Player,
  randomAsteroids,
  TargetKind,
  sectorBounds,
  TutorialStage,
  removeCargoFractions,
  SectorKind,
  Ballistic,
  Asteroid,
  Missile,
  Collectable,
  Mine,
  TransferableAction,
} from "../src/game";
import { WebSocket } from "ws";
import { defs, Faction, initDefs, UnitKind } from "../src/defs";
import { CardinalDirection } from "../src/geometry";
import { initMarket } from "./market";
import { NPC, npcReconstructors } from "./npcs/npc";
import { Checkpoint, Station, User } from "./dataModels";
import { awareSectors, peerMap, PeerSockets, removeNetworkAwareness, waitingData } from "./peers";
import { insertRespawnedPlayer, insertSpawnedPlayer } from "./server";
import { ISector, Sector } from "./sector";
import { HydratedDocument } from "mongoose";
import { mapHeight, mapWidth, ResourceDensity } from "../src/mapLayout";
import { DelayedAction } from "../src/defs/delayedAction";

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
  tutorialNpcId?: number;
};

const serializableClientData = (client: ClientData): SerializableClientData => {
  client = { ...client };
  (client as unknown as SerializableClientData).tutorialNpcId = client.tutorialNpc?.player.id;
  client.tutorialNpc = undefined;
  (client as unknown as SerializableClientData).sectorsVisited = Array.from(client.sectorsVisited);
  return client as unknown as SerializableClientData;
};

const repairClientData = (client: SerializableClientData): ClientData => {
  const ret = { ...client } as unknown as ClientData;
  ret.sectorsVisited = new Set(client.sectorsVisited);
  return ret;
};

const getTutorialNpc = (client: ClientData, state: GlobalState): NPC | undefined => {
  if (client.tutorialNpc) return client.tutorialNpc;
  const id = (client as unknown as SerializableClientData).tutorialNpcId;
  if (id === undefined) return undefined;
  return state.players.get(id)?.npc;
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

const serializeAllClientData = (ws: WebSocket, player: Player, key: string, kind: ServerChangeKind): SerializableClient | null => {
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

type SerializableClient = {
  clientData: SerializableClientData;
  target: [TargetKind, number] | undefined;
  secondary: number | undefined;
  toActivate: number[] | undefined;
  recipesKnown: string[];
  player: Player;
  key: string;
  kind: ServerChangeKind;
};

const deserializeClientData = (ws: WebSocket, data: SerializableClient) => {
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

setInterval(() => {
  for (const [sectorId, sector] of sectors) {
    if (sector.dynamic && (sector.creationTime || 0) + 1000 * 60 * 60 * 3 < Date.now()) {
      let hasPC = false;
      for (const player of sector.players.values()) {
        if (player.isPC) {
          hasPC = true;
          break;
        }
      }
      if (!hasPC) {
        sectors.delete(sectorId);
        removeNetworkAwareness(sectorId);
      }
    }
  }
}, 1000 * 60 * 60 * 30);

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
      sectorChecks: [],
      dynamic: false,
      creationTime: Date.now(),
    });
  });
};

const sectorFactions: (Faction | null)[] = new Array(mapWidth * mapHeight).fill(null);
const sectorGuardianCount = new Array(mapWidth * mapHeight).fill(0);
const sectorHasStarbase = sectorList.map((_) => false);
const factionSectors: number[][] = new Array(Faction.Count).fill([]);

const initSectorData = async () => {
  for (let i = 0; i < mapWidth * mapHeight; i++) {
    const sectorInfo = await Sector.findOne({ sector: i });
    if (!sectorInfo) {
      throw new Error("Missing sector info");
    }
    sectorAsteroidResources.push(sectorInfo.resources);
    sectorAsteroidCounts.push(sectorInfo.asteroidCount);
    sectorFactions[i] = sectorInfo.faction;
    sectorGuardianCount[i] = sectorInfo.guardianCount;

    if (sectorInfo.faction !== null) {
      factionSectors[sectorInfo.faction].push(i);
    }
  }
  const stations = await Station.find();
  for (const station of stations) {
    sectorHasStarbase[station.sector] = true;
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
  delayedActions?: DelayedAction[];
  sectorKind?: SectorKind;
  sectorNumber: number;
  sectorChecks?: TransferableAction[];
  dynamic?: boolean;
  creationTime?: number;
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
    delayedActions: state.delayedActions,
    sectorKind: state.sectorKind,
    sectorNumber,
    sectorChecks: state.sectorChecks,
    dynamic: state.dynamic,
    creationTime: state.creationTime,
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
    delayedActions: state.delayedActions || [],
    sectorKind: state.sectorKind || SectorKind.Overworld,
    sectorChecks: state.sectorChecks || [],
    dynamic: state.dynamic || false,
    creationTime: state.creationTime || Date.now(),
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
        sectors.delete(sector);
        console.log("Number of players in sector is now: " + state.players.size);
        while (state.players.size > 0) {
          const player = state.players.values().next().value;
          state.players.delete(player.id);
          if (player) {
            if (player.isPC) {
              const ws = idToWebsocket.get(player.id);
              if (ws) {
                serverChangePlayer(ws, player, peerSockets.name);
              } else {
                console.log("Missing websocket for player: " + player.id);
              }
              continue;
            }
            if (player.npc) {
              player.sector = sector;
              player.npcReconstructionKey = Object.getPrototypeOf(player.npc).constructor.name;
              player.input = player.npc.input;
              player.npc = undefined;
              peerSockets.request.send("npc-transfer", player, (success: string) => {
                if (success !== "OK") {
                  console.log("Error transferring npc: " + success);
                }
              });
              continue;
            }
            const def = defs[player.defIndex];
            if (def.kind === UnitKind.Station) {
              player.sector = sector;
              peerSockets.request.send("station-transfer", player, (success: string) => {
                if (success !== "OK") {
                  console.log("Error transferring station: " + success);
                }
              });
              continue;
            }
          }
        }
      } else {
        reject("Transfer failed: " + success);
      }
    });
  });
  return promise;
};

type SerializablePlayer = Player & { sector: number; npcReconstructionKey?: string; input?: Input };

const insertStation = (station: SerializablePlayer) => {
  console.log("Inserting station: " + station.id);
  const state = sectors.get(station.sector);
  if (!state) {
    return "Sector not on this server: " + station.sector;
  }
  delete (station as any).sector;
  state.players.set(station.id, station);
  return "OK";
};

const insertNPC = (npc: SerializablePlayer) => {
  console.log("Inserting npc: " + npc.id);
  const state = sectors.get(npc.sector);
  if (!state) {
    return "Sector not on this server: " + npc.sector;
  }
  delete (npc as any).sector;
  const npcReconstructionKey = npc.npcReconstructionKey;
  delete (npc as any).npcReconstructionKey;
  if (!npcReconstructionKey) {
    return "Missing npcReconstructionKey";
  }
  const constructor = npcReconstructors.get(npcReconstructionKey);
  if (!constructor) {
    return "Bad npcReconstructionKey: " + npcReconstructionKey;
  }
  const input = npc.input;
  delete (npc as any).input;
  if (!input) {
    return "Missing input";
  }
  npc.npc = constructor(npc);
  npc.npc.input = input;
  state.players.set(npc.id, npc);
  return "OK";
};

export {
  ServerChangeKind,
  // ClientData,
  // SerializableClientData,
  // serializableClientData,
  // repairClientData,
  SerializableClient,
  SerializableGlobalState,
  SerializablePlayer,
  deserializeClientData,
  sectorList,
  sectorAsteroidResources,
  sectorAsteroidCounts,
  allResources,
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
  knownRecipes,
  uid,
  saveCheckpoint,
  factionSectors,
  initInitialAsteroids,
  getPlayerFromId,
  serializeAllClientData,
  sendServerWarp,
  serverChangePlayer,
  initSectors,
  initSectorData,
  initStationTeams,
  stationIdToDefaultTeam,
  insertSector,
  transferSectorToPeer,
  insertStation,
  insertNPC,
  getTutorialNpc,
};
