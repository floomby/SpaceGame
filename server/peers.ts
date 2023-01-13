import mongoose from "mongoose";
import { Reply, Request } from "zeromq";
import { initFromDatabase } from "./misc";
import { initInitialAsteroids } from "./state";
import Routes from "./routes";
import { startWebSocketServer } from "./websockets";
import { setupTimers } from "./server";

interface IPeer {
  name: string;
  ip: string;
  port: number;
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
// Will just keep using this port for now
const sectors = JSON.parse(process.argv[4]) as number[];

// Sets ourselves in the database
const setPeer = async () => {
  await Peer.findOneAndUpdate({ name }, { ip, port, updated: Date.now(), sectors }, { upsert: true });
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

// Roughly keeps things synced
const syncPeers = async () => {
  const peers = await Peer.find({ name: { $ne: name } });
  peers.forEach((peer) => {
    if (peerMap.has(peer.name)) {
      return;
    }
    console.log(`Connecting to peer ${peer.name} at ${peer.ip}:${peer.port}`);
    const peerSocket = new Request();
    peerSocket.connect(`tcp://${peer.ip}:${peer.port}`);
    peerMap.set(peer.name, peerSocket);
  });
  for (const name of peerMap.keys()) {
    if (!peers.find((peer) => peer.name === name)) {
      peerMap.get(name)?.close();
      peerMap.delete(name);
      console.log(`Disconnected from peer ${name}`);
    }
  }
};

mongoose
  .connect("mongodb://127.0.0.1:27017/SpaceGame", {})
  .catch((err) => {
    console.log("Error connecting to database: " + err);
  })
  .then(async () => {
    console.log("Connected to database");
    await setupSelf();
    await initFromDatabase();
    initInitialAsteroids();
    setupTimers();
    startWebSocketServer();
  });

Routes();
