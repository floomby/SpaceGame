import mongoose from "mongoose";
import { initFromDatabase } from "./misc";
import { initInitialAsteroids, initSectorResourceData, initSectors, initStationTeams, sendServerWarp, SerializedClient } from "./state";
import Routes from "./routes";
import { startWebSocketServer } from "./websockets";
import { setupTimers } from "./server";
import { Player, SectorKind } from "../src/game";
import { mapGraph, mapHeight, mapWidth, peerCount } from "../src/mapLayout";
import assert from "assert";
import { sectors as serverSectors } from "./state";
import { inspect } from "util";
import axon from "axon";

interface IPeer {
  name: string;
  ip: string;
  port: number;
  pubPort: number;
  wsPort: number;
  updated: Date;
}

const peerSchema = new mongoose.Schema<IPeer>({
  name: {
    type: String,
    required: true,
  },
  ip: {
    type: String,
    required: true,
  },
  port: {
    type: Number,
    required: true,
  },
  pubPort: {
    type: Number,
    required: true,
  },
  wsPort: {
    type: Number,
    required: true,
  },
  // have the schema drop old dates
  updated: {
    type: Date,
    expires: "2m",
    default: Date.now,
  },
});

const Peer = mongoose.model<IPeer>("Peer", peerSchema);

// Get our name from the command line options
const name = process.argv[2];
const port = process.argv[3];
const pubPort = process.argv[4];
// For development
const ip = "127.0.0.1";
const wsPort = parseInt(process.argv[5]);

const peerNumber = parseInt(process.argv[6]);
assert(peerNumber >= 0 && peerNumber < peerCount);

const sectorCount = mapWidth * mapHeight;
assert(sectorCount % peerCount === 0);
const sectorsPerPeer = Math.floor(sectorCount / peerCount);
const sectors: number[] = [];
for (let i = 0; i < sectorsPerPeer; i++) {
  sectors.push(peerNumber * sectorsPerPeer + i);
}

console.log(`Starting peer ${name} with sectors ${sectors} on port ${port} and wsPort ${wsPort}`);

// Sets ourselves in the database
const setPeer = async () => {
  await Peer.findOneAndUpdate({ name }, { ip, port, updated: Date.now(), sectors, wsPort, pubPort }, { upsert: true });
};

type PeerSockets = {
  request: axon.ReqSocket;
  subscriber: axon.SubSocket;
  // Websocket ip and port
  ip: string;
  port: number;
  name: string;
};

// Global stuff
const peerMap = new Map<string, PeerSockets>();
const repSocket = axon.socket("rep") as axon.RepSocket;
const pubSocket = axon.socket("pub") as axon.PubSocket;

let interval: NodeJS.Timer | null = null;

const setupSelf = async () => {
  await setPeer();
  // Probably will just protect this with iptables
  repSocket.bind(`tcp://${ip}:${port}`);
  pubSocket.bind(`tcp://0.0.0.0:${pubPort}`);

  syncPeers();
  setTimeout(() => {
    syncPeers();
  }, 4 * 1000);
  interval = setInterval(() => {
    setPeer();
    syncPeers();
  }, 20 * 1000);
};

const serversForSectors = new Map<number, string>();

// Roughly keeps things synced
const syncPeers = async () => {
  const peers = await Peer.find({ name: { $ne: name } });
  for (const [sector, state] of serverSectors) {
    makeNetworkAware(sector, state.sectorKind!);
  }
  peers.forEach(async (peer) => {
    if (peerMap.has(peer.name)) {
      return;
    }
    console.log(`Connecting to peer ${peer.name} at ${peer.ip}:${peer.port} and ${peer.ip}:${peer.pubPort}`);

    const request = axon.socket("req") as axon.ReqSocket;
    request.connect(`tcp://${peer.ip}:${peer.port}`);

    const subscriber = axon.socket("sub") as axon.SubSocket;
    subscriber.connect(`tcp://${peer.ip}:${peer.pubPort}`);
    subscriber.subscribe("sector-notification");
    subscriber.subscribe("sector-removal");
    subscriber.subscribe("player-sector");
    subscriber.on("message", (topic, data) => {
      if (topic === "sector-notification") {
        const sector = data.sector;
        const server = data.server;
        serversForSectors.set(sector, server);
        awareSectors.set(sector, data.sectorKind);
        return;
      }
      if (topic === "sector-removal") {
        const sector = data.sector;
        serversForSectors.delete(sector);
        awareSectors.delete(sector);
        return;
      }
      if (topic === "player-sector") {
        playerSectors.set(data.id, data.sector);
        return;
      }
    });

    peerMap.set(peer.name, { request, subscriber, ip: peer.ip, port: peer.wsPort, name: peer.name });
  });
  for (const name of peerMap.keys()) {
    if (!peers.find((peer) => peer.name === name)) {
      const sockets = peerMap.get(name);
      if (sockets) {
        sockets.request.close();
        sockets.subscriber.close();
      }
      peerMap.delete(name);
      // remove from the map
      serversForSectors.forEach((server, sector) => {
        if (server === name) {
          serversForSectors.delete(sector);
        }
      });
      console.log(`Disconnected from peer ${name}`);
    }
  }
};

const waitingData = new Map<string, SerializedClient>();

const awareSectors = new Map<number, SectorKind>();
const playerSectors = new Map<number, number>();

for (let i = 0; i < mapWidth * mapHeight; i++) {
  awareSectors.set(i, SectorKind.Overworld);
}

const makeNetworkAware = (sector: number, kind: SectorKind) => {
  awareSectors.set(sector, kind);
  pubSocket.send("sector-notification", { sector, sectorKind: kind, server: name });
};

const removeNetworkAwareness = (sector: number) => {
  awareSectors.delete(sector);
  pubSocket.send("sector-removal", { sector });
};

const setPlayerSector = (id: number, sector: number) => {
  // console.log("Setting player sector", id, sector);
  playerSectors.set(id, sector);
  pubSocket.send("player-sector", { id, sector });
};

mongoose
  .connect("mongodb://127.0.0.1:27017/SpaceGame", {})
  .catch((err) => {
    console.log("Error connecting to database: " + err);
  })
  .then(async () => {
    console.log("Connected to database");
    await setupSelf();
    initSectors(sectors);
    await initFromDatabase();
    await initSectorResourceData();
    await initStationTeams();
    initInitialAsteroids();
    setupTimers();
    startWebSocketServer(wsPort);
    repSocket.on("message", async (topic: string, data: SerializedClient, reply: (data: string) => void) => {
      if (topic === "player-transfer") {
        waitingData.set(data.key, data);
        reply(data.key);
        return;
      }
    });
  });

if (wsPort === 8080) {
  Routes();
}

export { peerMap, waitingData, serversForSectors, awareSectors, playerSectors, makeNetworkAware, removeNetworkAwareness, setPlayerSector };
