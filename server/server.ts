import { createServer } from "http";
import { createServer as createSecureServer } from "https";
import { WebSocketServer, WebSocket } from "ws";
import {
  GlobalState,
  Player,
  Asteroid,
  Input,
  update,
  applyInputs,
  Ballistic,
  ticksPerSecond,
  maxNameLength,
  canDock,
  copyPlayer,
  randomAsteroids,
  TargetKind,
  EffectTrigger,
  CargoEntry,
  equip,
  Missile,
  purchaseShip,
  effectiveInfinity,
  processAllNpcs,
  serverMessagePersistTime,
  Collectable,
  canRepair,
  removeAtMostCargo,
  isNearOperableEnemyStation,
} from "../src/game";
import { defs, defMap, initDefs, Faction, armDefs, ArmUsage, emptyLoadout, UnitKind, getFactionString } from "../src/defs";
import { appendFile, readFileSync } from "fs";
import { useSsl } from "../src/config";
import express from "express";
import { resolve } from "path";

import { User, Station, Checkpoint } from "./dataModels";
import mongoose from "mongoose";

import { createHash, randomUUID } from "crypto";
import { addNpc, NPC } from "../src/npc";
import { inspect } from "util";
import { depositCargo, manufacture, sellInventory, sendInventory } from "./inventory";
import { market } from "./market";

const uid = () => {
  let ret = 0;
  while (ret === 0) {
    ret = parseInt(randomUUID().split("-")[4], 16);
  }
  return ret;
};

// Initialize the definitions (Do this before anything else to avoid problems)
initDefs();

mongoose
  .connect("mongodb://127.0.0.1:27017/SpaceGame", {})
  .catch((err) => {
    console.log("Error connecting to database: " + err);
  })
  .then(() => {
    console.log("Connected to database");
    // Initialize the server state stuff
    initFromDatabase();
  });

// Server stuff
const credentials: { key?: string; cert?: string; ca?: string } = {};

if (useSsl) {
  credentials.key = readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/privkey.pem", "utf8");
  credentials.cert = readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/cert.pem", "utf8");
  credentials.ca = readFileSync("/etc/letsencrypt/live/inharmonious.floomby.us/chain.pem", "utf8");
}

const wsPort = 8080;
const httpPort = 8081;

// This data will ultimately be stored in the database
const sectorList = [1, 2, 3, 4];

// Http server stuff
const root = resolve(__dirname + "/..");

const app = express();

app.get("/dist/app.js", (req, res) => {
  res.sendFile("dist/app.js", { root });
});

app.get("/dist/require.min.js", (req, res) => {
  res.sendFile("dist/require.min.js", { root });
});

app.get("/dist/require.min.js.map", (req, res) => {
  res.sendFile("dist/require.min.js.map", { root });
});

app.get("/", (req, res) => {
  res.sendFile("index.html", { root });
});

// Rest api stuff for things that are not "realtime"
// check if username is available
app.get("/available", (req, res) => {
  const name = req.query.name;
  if (!name || typeof name !== "string" || name.length > maxNameLength) {
    res.send("false");
    return;
  }
  // check the database
  User.findOne({ name }, (err, user) => {
    if (err) {
      console.log(err);
      res.send("false");
      return;
    }
    if (user) {
      res.send("false");
      return;
    }
    res.send("true");
  });
});

app.get("/sectorList", (req, res) => {
  res.send(JSON.stringify({ value: sectorList }));
});

app.get("/nameOf", (req, res) => {
  const id = req.query.id;
  if (!id || typeof id !== "string") {
    // send error json
    res.send(JSON.stringify({ error: "Invalid id" }));
    return;
  }
  // find the user from the database
  User.findOne({ id }, (err, user) => {
    if (err) {
      console.log(err);
      res.send(JSON.stringify({ error: "Error finding user" }));
      return;
    }
    if (user) {
      res.send(JSON.stringify({ value: user.name }));
      return;
    }
    res.send(JSON.stringify({ error: "User not found" }));
  });
});

app.get("/stationName", (req, res) => {
  const id = req.query.id;
  if (!id || typeof id !== "string") {
    // send error json
    res.send(JSON.stringify({ error: "Invalid id" }));
    return;
  }
  // find the user from the database
  Station.findOne({ id }, (err, station) => {
    if (err) {
      console.log(err);
      res.send(JSON.stringify({ error: "Error finding station" }));
      return;
    }
    if (station) {
      res.send(JSON.stringify({ value: station.name }));
      return;
    }
    res.send(JSON.stringify({ error: "Station not found" }));
  });
});

const salt = "Lithium Chloride, Lanthanum(III) Chloride, and Strontium Chloride";

const hash = (str: string) => {
  return createHash("sha256")
    .update(salt + str)
    .digest("hex");
};

app.get("/register", (req, res) => {
  const name = req.query.name;
  const password = req.query.password;
  if (!name || typeof name !== "string" || name.length > maxNameLength) {
    res.send("false");
    return;
  }
  if (!password || typeof password !== "string") {
    res.send("false");
    return;
  }
  // check the database
  User.findOne({ name }, (err, user) => {
    if (err) {
      console.log(err);
      res.send("false");
      return;
    }
    if (user) {
      res.send("false");
      return;
    }
    const id = uid();
    // create the user
    const newUser = new User({
      name,
      password: hash(password),
      id,
    });
    newUser.save((err) => {
      if (err) {
        console.log(err);
        res.send("false");
        return;
      }
      res.send("true");
    });
  });
});

app.get("/shipsAvailable", (req, res) => {
  const id = req.query.id;
  if (!id || typeof id !== "string") {
    res.send("false");
    return;
  }
  // check the database
  Station.findOne({ id }, (err, station) => {
    if (err) {
      console.log(err);
      res.send("false");
      return;
    }
    if (!station) {
      res.send("false");
      return;
    }
    res.send(JSON.stringify({ value: station.shipsAvailable }));
  });
});

app.get("/init", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== "1d8465217b25152cb3de788928007459e451cb11a6e0e18ab5ed30e2648d809c") {
    res.send("Invalid password");
    return;
  }
  // Create a bunch of stations
  const stationObjects = sectorList
    .map((sector) => {
      switch (sector) {
        case 3:
          return [
            {
              name: `Scallywag's Bunk`,
              id: uid(),
              sector,
              definitionIndex: defMap.get("Rogue Starbase")?.index,
              position: { x: 300, y: -1600 },
              team: Faction.Rogue,
              shipsAvailable: ["Strafer", "Venture"],
            },
          ];
        case 1:
          return [
            {
              name: `Starbase ${Math.floor(Math.random() * 200)}`,
              id: uid(),
              sector,
              definitionIndex: defMap.get("Alliance Starbase")?.index,
              position: { x: -1600, y: -1600 },
              team: Faction.Alliance,
              shipsAvailable: ["Advanced Fighter", "Fighter"],
            },
          ];
        case 2:
          return [
            {
              name: `Incubation Center ${Math.floor(Math.random() * 200)}`,
              id: uid(),
              sector,
              definitionIndex: defMap.get("Confederacy Starbase")?.index,
              position: { x: 1600, y: 1600 },
              team: Faction.Confederation,
              shipsAvailable: ["Drone", "Seeker"],
            },
          ];
        default:
          return [];
      }
    })
    .flat();
  Station.insertMany(stationObjects, (err) => {
    if (err) {
      res.send("Database error" + err);
      return;
    }
    res.send("true");
  });
});

app.get("/resetEverything", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== "1d8465217b25152cb3de788928007459e451cb11a6e0e18ab5ed30e2648d809c") {
    res.send("Invalid password");
    return;
  }
  // Delete all the stations
  Station.deleteMany({}, (err) => {
    if (err) {
      res.send("Database error: " + err);
      return;
    }
    // Delete all the users
    User.deleteMany({}, (err) => {
      if (err) {
        res.send("Database error: " + err);
        return;
      }
      res.send("true");
    });
  });
});

// Test stuff

app.get("/addNPC", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== "1d8465217b25152cb3de788928007459e451cb11a6e0e18ab5ed30e2648d809c") {
    res.send("Invalid password");
    return;
  }
  const sector = req.query.sector;
  if (!sector || typeof sector !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const sectorIndex = parseInt(sector);
  if (!sectorList.includes(sectorIndex)) {
    res.send("Invalid sector");
    return;
  }
  const what = req.query.what;
  if (!what || typeof what !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const team = req.query.team;
  if (!team || typeof team !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  try {
    addNpc(sectors.get(sectorIndex)!, what, parseInt(team), uid());
  } catch (e) {
    res.send("Error: " + e);
    return;
  }
  res.send("true");
});

if (useSsl) {
  app.use(express.static("resources"));

  const httpsServer = createSecureServer(credentials, app);
  httpsServer.listen(httpPort, () => {
    console.log(`Running secure http server on port ${httpPort}`);
  });
} else {
  app.use(express.static(".."));

  const httpServer = createServer(app);
  httpServer.listen(httpPort, () => {
    console.log(`Running unsecure http server on port ${httpPort}`);
  });
}

app.get("/kill", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== "1d8465217b25152cb3de788928007459e451cb11a6e0e18ab5ed30e2648d809c") {
    res.send("Invalid password");
    return;
  }
  const id = req.query.id;
  const sector = req.query.sector;
  if (!id || typeof id !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  if (!sector || typeof sector !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const sectorIndex = parseInt(sector);
  if (!sectorList.includes(sectorIndex)) {
    res.send("Invalid sector");
    return;
  }
  const sectorObject = sectors.get(sectorIndex);
  if (!sectorObject) {
    res.send("Invalid sector");
    return;
  }
  const ship = sectorObject.players.get(parseInt(id));
  if (!ship) {
    res.send("Invalid ship");
    return;
  }
  ship.health = 0;
  res.send("true");
});

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

app.get("/usersOnline", (req, res) => {
  res.send(JSON.stringify(Array.from(clients.values()).map((client) => client.name)));
});

// Websocket server stuff
let server: ReturnType<typeof createServer> | ReturnType<typeof createSecureServer>;
if (useSsl) {
  server = createSecureServer(credentials);
} else {
  server = createServer();
}

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
  });
});

let frame = 0;

// Server state

// Targeting is handled by the clients, but the server needs to know
// Same pattern with secondaries
// BTW I do not like this design
const targets: Map<number, [TargetKind, number]> = new Map();
const secondaries: Map<number, number> = new Map();

const asteroidBounds = { x: -3000, y: -3000, width: 6000, height: 6000 };

for (let i = 0; i < sectorList.length; i++) {
  const sector = sectors.get(sectorList[i])!;
  const testAsteroids = randomAsteroids(5, asteroidBounds, sectorList[i], uid);
  for (const asteroid of testAsteroids) {
    sector.asteroids.set(asteroid.id, asteroid);
  }
}

const initFromDatabase = async () => {
  const stations = await Station.find({});
  for (const station of stations) {
    const def = defs[station.definitionIndex];
    const player: Player = {
      position: station.position,
      radius: def.radius,
      speed: 0,
      heading: 0,
      health: def.health,
      id: station.id,
      sinceLastShot: [effectiveInfinity, effectiveInfinity, effectiveInfinity, effectiveInfinity],
      projectileId: 0,
      energy: def.energy,
      defIndex: station.definitionIndex,
      armIndices: [],
      slotData: [],
      team: station.team,
      side: 0,
      isPC: true,
      v: { x: 0, y: 0 },
    };
    const sector = sectors.get(station.sector);
    if (sector) {
      sector.players.set(station.id, player);
    }
  }
};

// Websocket stuff (TODO Move to its own file)
const wss = new WebSocketServer({ server });

const setupPlayer = (id: number, ws: WebSocket, name: string, faction: Faction) => {
  let defIndex: number;
  if (faction === Faction.Alliance) {
    // defIndex = defMap.get("Fighter")!.index;
    defIndex = defMap.get("Advanced Fighter")!.index;
  } else if (faction === Faction.Confederation) {
    // defIndex = defMap.get("Drone")!.index;
    defIndex = defMap.get("Seeker")!.index;
  } else {
    console.log(`Invalid faction ${faction}`);
    return;
  }

  const sector = faction === Faction.Alliance ? 1 : 2;

  clients.set(ws, {
    id: id,
    name,
    input: { up: false, down: false, primary: false, secondary: false, right: false, left: false },
    angle: 0,
    currentSector: sector,
    lastMessage: "",
    lastMessageTime: Date.now(),
    sectorDataSent: false,
  });

  const player = {
    position: { x: 0, y: 0 },
    radius: defs[defIndex].radius,
    speed: 0,
    heading: 0,
    health: defs[defIndex].health,
    id: id,
    sinceLastShot: [effectiveInfinity],
    projectileId: 0,
    energy: defs[defIndex].energy,
    defIndex: defIndex,
    armIndices: emptyLoadout(defIndex),
    slotData: [{}, {}, {}],
    cargo: [{ what: "Teddy Bears", amount: 30 }],
    credits: 500,
    team: faction,
    side: 0,
    isPC: true,
    v: { x: 0, y: 0 },
  };

  equip(player, 0, "Basic mining laser", true);
  equip(player, 1, "Tomahawk Missile", true);
  equip(player, 2, "Laser Beam", true);

  const state = sectors.get(sector)!;

  state.players.set(id, player);

  targets.set(id, [TargetKind.None, 0]);
  secondaries.set(id, 0);

  // find one checkpoint for the id and update it, upserting if needed
  Checkpoint.findOneAndUpdate({ id }, { id, sector, data: JSON.stringify(player) }, { upsert: true }, (err) => {
    if (err) {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Server error creating default player" } }));
      console.log("Error saving checkpoint: " + err);
      return;
    }

    ws.send(
      JSON.stringify({
        type: "init",
        payload: { id: id, sector, faction, asteroids: Array.from(state.asteroids.values()), collectables: Array.from(state.collectables.values()) },
      })
    );
    sendInventory(ws, id);

    console.log("Registered client with id: ", id);
  });
};

const saveCheckpoint = (id: number, sector: number, data: string) => {
  Checkpoint.findOneAndUpdate({ id }, { id, sector, data }, { upsert: true }, (err) => {
    if (err) {
      console.log("Error saving checkpoint: " + err);
      return;
    }
  });
};

// TODO Need to protect from intentionally bad data
wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "login") {
        const name = data.payload.name;
        const password = data.payload.password;

        const hashedPassword = hash(password);

        // Check if the user is in the database
        User.findOne({ name, password: hashedPassword }, (err, user) => {
          if (err) {
            ws.send(JSON.stringify({ type: "loginFail", payload: { error: "Database error" } }));
            console.log(err);
            return;
          }
          if (!user) {
            ws.send(JSON.stringify({ type: "loginFail", payload: { error: "Username/password combination not found" } }));
            return;
          }

          if (idToWebsocket.has(user.id)) {
            ws.send(JSON.stringify({ type: "loginFail", payload: { error: "User already logged in" } }));
            return;
          }

          idToWebsocket.set(user.id, ws);
          Checkpoint.findOne({ id: user.id }, (err, checkpoint) => {
            if (err) {
              ws.send(JSON.stringify({ type: "loginFail", payload: { error: "Database error" } }));
              console.log(err);
              return;
            }
            if (!checkpoint) {
              setupPlayer(user.id, ws, name, data.payload.faction);
            } else {
              const state = sectors.get(checkpoint.sector);
              if (!state) {
                ws.send(JSON.stringify({ type: "error", payload: { message: "Bad checkpoint sector" } }));
                console.log("Warning: Checkpoint sector not found (programming error)");
                setupPlayer(user.id, ws, name, data.payload.faction);
                return;
              }
              const playerState = JSON.parse(checkpoint.data);
              if (isNearOperableEnemyStation(playerState, state.players.values()) || enemyCount(playerState, checkpoint.sector) > 2) {
                playerState.position.x = -5000;
                playerState.position.y = 5000;
              }
              // Update the player on load to match what is expected
              if (playerState.defIndex === undefined) {
                playerState.defIndex = playerState.definitionIndex;
                playerState.definitionIndex = undefined;
              }
              playerState.v = { x: 0, y: 0 };
              state.players.set(user.id, playerState);
              clients.set(ws, {
                id: user.id,
                name,
                input: { up: false, down: false, primary: false, secondary: false, right: false, left: false },
                angle: 0,
                currentSector: checkpoint.sector,
                lastMessage: "",
                lastMessageTime: Date.now(),
                sectorDataSent: false,
              });
              targets.set(user.id, [TargetKind.None, 0]);
              secondaries.set(user.id, 0);
              ws.send(
                JSON.stringify({
                  type: "init",
                  payload: {
                    id: user.id,
                    sector: checkpoint.sector,
                    faction: playerState.team,
                    asteroids: Array.from(state.asteroids.values()),
                    collectables: Array.from(state.collectables.values()),
                  },
                })
              );
              sendInventory(ws, user.id);
              // log to file
              appendFile("log", `${new Date().toISOString()} ${name} logged in\n`, (err) => {
                if (err) {
                  console.log(err);
                }
              });
            }
          });
        });
      } else if (data.type === "register") {
        const name = data.payload.name;
        const password = data.payload.password;
        const faction = data.payload.faction;

        // Check if the user is in the database
        User.findOne({ name }, (err, user) => {
          if (err) {
            ws.send(JSON.stringify({ type: "registerFail", payload: { error: "Database error" } }));
            console.log(err);
            return;
          }
          if (user) {
            ws.send(JSON.stringify({ type: "registerFail", payload: { error: "Username already taken" } }));
            return;
          }
          if (name.length > maxNameLength) {
            ws.send(JSON.stringify({ type: "registerFail", payload: { error: "Username too long" } }));
            return;
          }
          User.create({ name, password: hash(password), faction, id: uid() }, (err, user) => {
            if (err) {
              ws.send(JSON.stringify({ type: "registerFail", payload: { error: "Database error" } }));
              console.log(err);
              return;
            }
            setupPlayer(user.id, ws, name, faction);
            idToWebsocket.set(user.id, ws);
          });
        });
      } else if (data.type === "input") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          client.input = data.payload.input;
        } else {
          console.log("Warning: Input data from unknown client");
        }
      } else if (data.type === "angle") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          client.angle = data.payload.angle;
        } else {
          console.log("Warning: Angle data from unknown client");
        }
      } else if (data.type === "dock") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          const state = sectors.get(client.currentSector)!;
          const player = state.players.get(client.id);
          if (player) {
            const station = state.players.get(data.payload.stationId);
            if (canDock(player, station, false)) {
              const def = defs[player.defIndex];
              player.docked = data.payload.stationId;
              player.heading = 0;
              player.speed = 0;
              player.side = 0;
              player.energy = def.energy;
              player.health = def.health;
              player.position = { x: station!.position.x, y: station!.position.y };
              for (let i = 0; i < player.armIndices.length; i++) {
                const armDef = armDefs[player.armIndices[i]];
                if (armDef && armDef.usage === ArmUsage.Ammo) {
                  player.slotData[i].ammo = armDef.maxAmmo;
                }
              }

              state.players.set(client.id, player);
              const playerCopy = copyPlayer(player);
              const checkpointData = JSON.stringify(playerCopy);

              saveCheckpoint(client.id, client.currentSector, checkpointData);
            }
          }
        }
      } else if (data.type === "undock") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          const state = sectors.get(client.currentSector)!;
          const player = state.players.get(client.id);
          if (player) {
            player.docked = undefined;
            state.players.set(client.id, player);

            state.players.set(client.id, player);
            const checkpointData = JSON.stringify(player);

            saveCheckpoint(client.id, client.currentSector, checkpointData);
          }
        }
      } else if (data.type === "repair") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          const state = sectors.get(client.currentSector)!;
          const player = state.players.get(client.id);
          if (player) {
            const station = state.players.get(data.payload.station)!;
            if (canRepair(player, station, false)) {
              // This condition will need to change once there are more than 2 teams
              if (!station.repairs || station.repairs.length !== Faction.Count) {
                console.log(`Warning: Station repairs array is not correctly initialized (${station.id})`);
              } else {
                const stationDef = defs[station.defIndex];
                const repairsNeeded = stationDef.repairsRequired! - station.repairs[player.team];
                const amountRepaired = removeAtMostCargo(player, "Spare Parts", repairsNeeded);
                station.repairs[player.team] += amountRepaired;
              }
            }
          }
        }
      } else if (data.type === "respawn") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          Checkpoint.findOne({ id: data.payload.id }, (err, checkpoint) => {
            if (err) {
              ws.send(JSON.stringify({ type: "error", payload: { message: "Server error loading checkpoint" } }));
              console.log("Error loading checkpoint: " + err);
              return;
            }
            if (!checkpoint) {
              ws.send(JSON.stringify({ type: "error", payload: { message: "Checkpoint not found" } }));
              console.log("Error loading checkpoint: " + err);
              return;
            }
            const state = sectors.get(checkpoint.sector);
            if (!state) {
              ws.send(JSON.stringify({ type: "error", payload: { message: "Bad checkpoint sector" } }));
              console.log("Warning: Checkpoint sector not found (programming error)");
              return;
            }
            const playerState = JSON.parse(checkpoint.data);
            // So I don't have to edit the checkpoints in the database right now
            playerState.isPC = true;
            if (isNearOperableEnemyStation(playerState, state.players.values()) || enemyCount(playerState, checkpoint.sector) > 2) {
              playerState.position.x = -5000;
              playerState.position.y = 5000;
            }
            // Update the player on load to match what is expected
            if (playerState.defIndex === undefined) {
              playerState.defIndex = playerState.definitionIndex;
              playerState.definitionIndex = undefined;
            }
            playerState.v = { x: 0, y: 0 };
            state.players.set(client.id, playerState);
            ws.send(
              JSON.stringify({
                type: "warp",
                payload: {
                  to: checkpoint.sector,
                  asteroids: Array.from(state.asteroids.values()),
                  collectables: Array.from(state.collectables.values()),
                },
              })
            );
            client.currentSector = checkpoint.sector;
          });
        }
      } else if (data.type === "target") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          targets.set(client.id, data.payload.target);
        }
      } else if (data.type === "secondary") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          secondaries.set(client.id, data.payload.secondary);
        }
      } else if (data.type === "sellCargo") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          const state = sectors.get(client.currentSector)!;
          const player = state.players.get(client.id);
          if (player && player.cargo) {
            if (player.credits === undefined) {
              player.credits = 0;
            }
            const price = market.get(data.payload.what);
            if (price) {
              player.credits += removeAtMostCargo(player, data.payload.what, data.payload.amount) * price;
            }
          }
        }
      } else if (data.type === "sellInventory") {
          const client = clients.get(ws);
          if (client && data.payload.id === client.id) {
            const player = sectors.get(client.currentSector)!.players.get(client.id);
            if (player) {
              sellInventory(ws, player, data.payload.what, data.payload.amount);
            }
          }
      } else if (data.type === "depositCargo") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          const state = sectors.get(client.currentSector)!;
          const player = state.players.get(client.id);
          if (player && player.cargo) {
            depositCargo(player, data.payload.what, data.payload.amount, ws);
          }
        }
      } else if (data.type === "dumpCargo") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          const state = sectors.get(client.currentSector)!;
          const player = state.players.get(client.id);
          if (player && player.cargo) {
            removeAtMostCargo(player, data.payload.what, data.payload.amount);
          }
        }
      } else if (data.type === "equip") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          const state = sectors.get(client.currentSector)!;
          const player = state.players.get(client.id);
          if (player) {
            equip(player, data.payload.slotIndex, data.payload.what);
            // state.players.set(client.id, player);
          }
        }
      } else if (data.type === "chat") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          data.payload.message = data.payload.message.trim().substring(0, 200);
          for (const [otherClient, otherClientData] of clients) {
            if (otherClientData.currentSector === client.currentSector) {
              otherClient.send(JSON.stringify({ type: "chat", payload: { id: data.payload.id, message: data.payload.message } }));
            }
          }
        }
      } else if (data.type === "manufacture") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          const state = sectors.get(client.currentSector)!;
          const player = state.players.get(client.id);
          if (player) {
            manufacture(ws, player, data.payload.what, data.payload.amount);
          }
        }
      } else if (data.type === "purchase") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          const state = sectors.get(client.currentSector)!;
          const player = state.players.get(client.id);
          if (player) {
            Station.findOne({ id: player.docked }, (err, station) => {
              if (err) {
                ws.send(JSON.stringify({ type: "error", payload: { message: "Server error loading station" } }));
                console.log("Error loading station: " + err);
                return;
              }
              if (!station) {
                ws.send(JSON.stringify({ type: "error", payload: { message: "Station not found" } }));
                console.log("Error loading station: " + err);
                return;
              }
              purchaseShip(player, data.payload.index, station.shipsAvailable);
            });
          }
        }
      } else if (data.type === "warp") {
        const client = clients.get(ws);
        if (client && data.payload.id === client.id) {
          if (client.currentSector !== data.payload.warpTo && sectorList.includes(data.payload.warpTo)) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player) {
              player.warpTo = data.payload.warpTo;
              player.warping = 1;
              // state.players.set(client.id, player);
            }
          }
        }
      } else {
        console.log("Unknown message from client: ", data);
      }
    } catch (e) {
      console.log("Error in message handler: " + e);
      appendFile("errorlog", `Error: ${e}\nmessage: ${msg}\n${inspect(clients, { depth: null })}\n${Array.from(sectors.values())}\n`, (err) => {
        if (err) {
          console.log("Error writing to log: " + err);
        }
      });
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    const removedClient = clients.get(ws);
    if (removedClient) {
      const player = sectors.get(removedClient.currentSector)?.players.get(removedClient.id);
      const state = sectors.get(removedClient.currentSector)!;
      state.players.delete(removedClient.id);
      targets.delete(removedClient.id);
      secondaries.delete(removedClient.id);
      clients.delete(ws);
      idToWebsocket.delete(removedClient.id);
      if (player?.docked) {
        saveCheckpoint(removedClient.id, removedClient.currentSector, JSON.stringify(player));
      } else if (!player) {
        console.log("Warning: player not found on disconnect");
      }
    }
  });
});

const informDead = (player: Player) => {
  if (player.npc) {
    return;
  }
  const def = defs[player.defIndex];
  if (def.kind === UnitKind.Ship) {
    const ws = idToWebsocket.get(player.id);
    if (ws) {
      ws.send(JSON.stringify({ type: "dead" }));
    }
  }
};

// TODO: Roll this into the main state update function in the form of the mutation returned by the update function
// Should slightly improve performance when things are busy in the sector
const removeCollectable = (sector: number, id: number, collected: boolean) => {
  for (const [client, clientData] of clients) {
    if (clientData.currentSector === sector) {
      client.send(JSON.stringify({ type: "removeCollectable", payload: { id, collected } }));
    }
  }
};

const flashServerMessage = (id: number, message: string) => {
  const ws = idToWebsocket.get(id);
  if (ws) {
    const client = clients.get(ws);
    if (client && message.length > 0) {
      if (message !== client.lastMessage) {
        ws.send(JSON.stringify({ type: "serverMessage", payload: { message } }));
        client.lastMessage = message;
        client.lastMessageTime = Date.now();
      } else {
        if (Date.now() - client.lastMessageTime > serverMessagePersistTime) {
          ws.send(JSON.stringify({ type: "serverMessage", payload: { message } }));
          client.lastMessageTime = Date.now();
        }
      }
    }
  }
};

// Asteroid could be part of the sector data
const sendSectorData = (ws: WebSocket, state: GlobalState) => {
  ws.send(JSON.stringify({ type: "addCollectables", payload: Array.from(state.collectables.values()) }));
};

// To be changed once sectors are better understood
const isEnemySector = (team: Faction, sector: number) => {
  return team + 1 !== sector && sector < 4;
};

const spawnAllyForces = (team: Faction, sector: number, count: number) => {
  const state = sectors.get(sector);
  if (!state) {
    return;
  }
  switch (team) {
    case Faction.Alliance:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.5 ? "Fighter" : "Advanced Fighter", Faction.Alliance, uid());
      }
      break;
    case Faction.Confederation:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.5 ? "Drone" : "Seeker", Faction.Confederation, uid());
      }
      break;
    case Faction.Rogue:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.2 ? "Strafer" : "Venture", Faction.Rogue, uid());
      }
      break;
  }
};

const enemyCount = (team: Faction, sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    return 0;
  }
  let count = 0;
  for (const [id, player] of state.players) {
    if (player.team !== team) {
      count++;
    }
  }
  return count;
};

const allyCount = (team: Faction, sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    return 0;
  }
  let count = 0;
  for (const [id, player] of state.players) {
    if (player.team === team) {
      count++;
    }
  }
  return count;
};

// Updating the game state
setInterval(() => {
  frame++;
  for (const [sector, state] of sectors) {
    for (const [client, data] of clients) {
      const player = state.players.get(data.id);
      if (data.input && player) {
        applyInputs(data.input, player, data.angle);
      }
      if (!data.sectorDataSent) {
        sendSectorData(client, state);
        data.sectorDataSent = true;
      }
    }
    const triggers: EffectTrigger[] = [];
    const mutated = update(
      state,
      frame,
      targets,
      secondaries,
      (trigger) => triggers.push(trigger),
      warpList,
      informDead,
      flashServerMessage,
      (id, collected) => removeCollectable(sector, id, collected)
    );
    processAllNpcs(state);

    // TODO Consider culling the state information to only send nearby players and projectiles (this trades networking bandwidth for CPU)
    const playerData: Player[] = [];
    const npcs: (NPC | undefined)[] = [];
    for (const player of state.players.values()) {
      npcs.push(player.npc);
      player.npc = undefined;
      playerData.push(player);
    }

    const projectileData: Ballistic[] = Array.from(state.projectiles.values()).flat();
    let asteroidData: Asteroid[] = state.asteroidsDirty ? Array.from(state.asteroids.values()) : Array.from(mutated.asteroids);
    const missileData: Missile[] = Array.from(state.missiles.values());

    const serialized = JSON.stringify({
      type: "state",
      payload: {
        players: playerData,
        frame,
        projectiles: projectileData,
        asteroids: asteroidData,
        effects: triggers,
        missiles: missileData,
        collectables: mutated.collectables,
      },
    });

    for (const [client, data] of clients) {
      if (data.currentSector === sector) {
        client.send(serialized);
      }
    }
    for (const player of state.players.values()) {
      player.npc = npcs.shift()!;
    }
  }

  // Handle all warps
  while (warpList.length > 0) {
    const { player, to } = warpList.shift()!;
    const state = sectors.get(to);
    if (state) {
      const ws = idToWebsocket.get(player.id);
      if (ws) {
        const client = clients.get(ws)!;
        client.currentSector = to;
        client.sectorDataSent = false;
        ws.send(
          JSON.stringify({
            type: "warp",
            payload: { to, asteroids: Array.from(state.asteroids.values()), collectables: Array.from(state.collectables.values()) },
          })
        );
        const enemies = enemyCount(player.team, to);
        const allies = allyCount(player.team, to);
        const count = enemies - allies;
        if (count > 3 && isEnemySector(player.team, to)) {
          spawnAllyForces(player.team, to, count);
          flashServerMessage(player.id, `${getFactionString(player.team)} forces have arrived to assist!`);
        }
      }
      player.position.x = Math.random() * 400 - 200;
      player.position.y = Math.random() * 400 - 200;
      player.heading = (3 * Math.PI) / 2;
      player.speed = 0;
      state.players.set(player.id, player);
    }
  }
}, 1000 / ticksPerSecond);

const spawnSectorGuardians = (sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    return;
  }
  let count: number;
  let allies: number;
  for (const [id, player] of state.players) {
    if (player.npc) {
      continue;
    }
    const def = defs[player.defIndex];
    if (def.kind === UnitKind.Station) {
      continue;
    }
    flashServerMessage(player.id, "Sector guardians are arriving!");
  }

  switch (sector) {
    case 1:
      count = enemyCount(Faction.Alliance, sector);
      allies = allyCount(Faction.Alliance, sector);
      if (allies < 10) {
        count = Math.max(10, count);
      }
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.5 ? "Fighter" : "Advanced Fighter", Faction.Alliance, uid());
      }
      break;
    case 2:
      count = enemyCount(Faction.Confederation, sector);
      allies = allyCount(Faction.Confederation, sector);
      if (allies < 10) {
        count = Math.max(10, count);
      }
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.5 ? "Drone" : "Seeker", Faction.Confederation, uid());
      }
      break;
    case 3:
      count = enemyCount(Faction.Rogue, sector);
      allies = allyCount(Faction.Rogue, sector);
      if (allies < 10) {
        count = Math.max(10, count);
      }
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.2 ? "Strafer" : "Venture", Faction.Rogue, uid());
      }
      break;
  }
};

setInterval(() => {
  spawnSectorGuardians(1);
  spawnSectorGuardians(2);
  spawnSectorGuardians(3);
}, 3 * 60 * 1000);

const repairStationsInSectorForTeam = (sector: number, team: Faction) => {
  const state = sectors.get(sector);
  if (!state) {
    return;
  }
  for (const player of state.players.values()) {
    if (player.inoperable) {
      player.repairs![team] += 1;
    }
  }
};

setInterval(() => {
  repairStationsInSectorForTeam(1, Faction.Alliance);
  repairStationsInSectorForTeam(2, Faction.Confederation);
  repairStationsInSectorForTeam(3, Faction.Rogue);
}, 2 * 60 * 1000);

const respawnEmptyAsteroids = (state: GlobalState, sector: number) => {
  let removedCount = 0;
  const removed: number[] = [];
  for (const asteroid of state.asteroids.values()) {
    if (asteroid.resources <= 0) {
      state.asteroids.delete(asteroid.id);
      removed.push(asteroid.id);
      removedCount++;
    }
  }
  if (removedCount > 0) {
    console.log(`Respawning ${removedCount} asteroids in sector ${sector}`);
    const newAsteroids = randomAsteroids(removedCount, asteroidBounds, Date.now(), uid);
    for (const asteroid of newAsteroids) {
      state.asteroids.set(asteroid.id, asteroid);
    }
    for (const [client, data] of clients) {
      if (data.currentSector === sector) {
        client.send(JSON.stringify({ type: "removeAsteroids", payload: { ids: removed } }));
      }
    }
    state.asteroidsDirty = true;
  }
};

setInterval(() => {
  for (const [sector, state] of sectors) {
    respawnEmptyAsteroids(state, sector);
  }
}, 1 * 60 * 1000);

server.listen(wsPort, () => {
  console.log(`${useSsl ? "Secure" : "Unsecure"} websocket server running on port ${wsPort}`);
});
