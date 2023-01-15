import mongoose from "mongoose";
import { Reply, Request } from "zeromq";
import { initFromDatabase } from "./misc";
import { initInitialAsteroids, initSectorResourceData, initSectors, initStationTeams, sendServerWarp, SerializedClient } from "./state";
import Routes from "./routes";
import { startWebSocketServer } from "./websockets";
import { setupTimers } from "./server";
import { Player } from "../src/game";
import { mapGraph, mapHeight, mapWidth, peerCount } from "../src/mapLayout";
import assert from "assert";

interface IPeer {
  name: string;
  ip: string;
  port: number;
  wsPort: number;
  updated: Date;
  sectors: number[];
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
  sectors: {
    type: [Number],
    default: [],
  },
});

const Peer = mongoose.model<IPeer>("Peer", peerSchema);

// Get our name from the command line options
const name = process.argv[2];
const port = process.argv[3];
// For development
const ip = "127.0.0.1";
const wsPort = parseInt(process.argv[4]);

const peerNumber = parseInt(process.argv[5]);
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
  await Peer.findOneAndUpdate({ name }, { ip, port, updated: Date.now(), sectors, wsPort }, { upsert: true });
};

// Global stuff
const peerMap = new Map<string, Request>();
const socket = new Reply();

let interval: NodeJS.Timer | null = null;

const setupSelf = async () => {
  await setPeer();
  // Probably will just protect this with iptables
  await socket.bind(`tcp://${ip}:${port}`);
  syncPeers();
  interval = setInterval(() => {
    setPeer();
    syncPeers();
  }, 20 * 1000);
};

const serversForSectors = new Map<number, string>();

// Roughly keeps things synced
const syncPeers = async () => {
  const peers = await Peer.find({ name: { $ne: name } });
  peers.forEach(async (peer) => {
    if (peerMap.has(peer.name)) {
      return;
    }
    console.log(`Connecting to peer ${peer.name} at ${peer.ip}:${peer.port}`);
    const peerSocket = new Request();
    peerSocket.connect(`tcp://${peer.ip}:${peer.port}`);
    peerMap.set(peer.name, peerSocket);
    peer.sectors.forEach((sector) => {
      serversForSectors.set(sector, peer.name);
    });
    // dispatch messages from the socket
    for await (const [key] of peerSocket) {
      console.log(`Received data from ${peer.name}`, key.toString());
      sendServerWarp(key.toString(), `ws://${peer.ip}:${peer.wsPort}`);
    }
  });
  for (const name of peerMap.keys()) {
    if (!peers.find((peer) => peer.name === name)) {
      peerMap.get(name)?.close();
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
    for await (const [msg] of socket) {
      const data = JSON.parse(msg.toString()) as SerializedClient;
      // console.log("Received data from client", data?.key, name);
      // console.log(data);
      waitingData.set(data.key, data);
      await socket.send(data.key);
    }
  });

if (wsPort === 8080) {
  Routes();
}

export { peerMap, waitingData, serversForSectors };
