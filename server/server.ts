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
  uid,
  randomAsteroids,
  TargetKind,
  EffectTrigger,
  CargoEntry,
  equip,
  Missile,
  purchaseShip,
} from "../src/game";
import { UnitDefinition, defs, defMap, initDefs, Faction, EmptySlot, armDefs, ArmUsage, emptyLoadout } from "../src/defs";
import { assert } from "console";
import { readFileSync } from "fs";
import { useSsl } from "../src/config";
import express from "express";
import { resolve } from "path";

import { User, Station } from "./datamodels";
import mongoose from "mongoose";

import { createHash } from "crypto";

mongoose
  .connect("mongodb://localhost:27017/SpaceGame", {})
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
const sectorList = [1, 2, 3];

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

// Admin stuff, the password is: "something"
app.get("/init", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== "90d4e14de110c29c4feaaaa4f4b49d38d96a9cafe9f750414e0c577779fafc3f") {
    res.send("Invalid password");
    return;
  }
  // Create a bunch of stations
  const stationObjects = sectorList
    .map((sector) => {
      return [
        {
          name: `Starbase ${Math.floor(Math.random() * 200)}`,
          id: uid(),
          sector,
          definitionIndex: defMap.get("Alliance Starbase")?.index,
          position: { x: -1600, y: -1600 },
        },
        {
          name: `Incubation Center ${Math.floor(Math.random() * 200)}`,
          id: uid(),
          sector,
          definitionIndex: defMap.get("Confederacy Starbase")?.index,
          position: { x: 1600, y: 1600 },
        },
      ];
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
  if (hashedPassword !== "90d4e14de110c29c4feaaaa4f4b49d38d96a9cafe9f750414e0c577779fafc3f") {
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

// Websocket server stuff
let server: ReturnType<typeof createServer> | ReturnType<typeof createSecureServer>;
if (useSsl) {
  server = createSecureServer(credentials);
} else {
  server = createServer();
}

// Initialize the definitions (Needs to be done to use them)
initDefs();

const sectors: Map<number, GlobalState> = new Map();
const warpList: { player: Player; to: number }[] = [];

// Game state
// const state: GlobalState = {
//   players: new Map(),
//   projectiles: new Map(),
//   asteroids: new Map(),
//   missiles: new Map(),
// };

sectorList.forEach((sector) => {
  sectors.set(sector, {
    players: new Map(),
    projectiles: new Map(),
    asteroids: new Map(),
    missiles: new Map(),
  });
});

let frame = 0;

// Server state

// Targeting is handled by the clients, but the server needs to know
// Same pattern with secondaries
// BTW I do not like this design
const targets: Map<number, [TargetKind, number]> = new Map();
const secondaries: Map<number, number> = new Map();

type ClientData = {
  id: number;
  input: Input;
  name: string;
  currentSector: number;
};

const checkpoints = new Map<number, Player>();
const respawnKeys = new Map<number, number>();

const clients: Map<WebSocket, ClientData> = new Map();
const idToWebsocket = new Map<number, WebSocket>();

// Clears everything for resetting everything
// const resetState = () => {
//   state.players.clear();
//   state.projectiles.clear();
//   state.asteroids.clear();
//   state.missiles.clear();
//   targets.clear();
//   secondaries.clear();
//   clients.clear();
//   checkpoints.clear();
//   respawnKeys.clear();

//   frame = 0;
// };

for (let i = 0; i < sectorList.length; i++) {
  const sector = sectors.get(sectorList[i])!;
  const testAsteroids = randomAsteroids(30, { x: -3000, y: -3000, width: 6000, height: 6000 }, sectorList[i]);
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
      sinceLastShot: [10000, 10000, 10000, 10000],
      projectileId: 0,
      energy: def.energy,
      definitionIndex: station.definitionIndex,
      armIndices: [],
      slotData: [],
    };
    const sector = sectors.get(station.sector);
    if (sector) {
      sector.players.set(station.id, player);
    }
  }
};

// Market stuff
const market = new Map<string, number>();
market.set("Minerals", 1);
market.set("Teddy Bears", 5);

// Websocket stuff (TODO Move to its own file)
const wss = new WebSocketServer({ server });

const tmpSetupPlayer = (id: number, ws: WebSocket, name: string, faction: Faction) => {
  const defaultSector = sectorList[0];
  clients.set(ws, {
    id: id,
    name,
    input: { up: false, down: false, left: false, right: false, primary: false, secondary: false },
    currentSector: defaultSector,
  });

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

  const player = {
    position: { x: -1600, y: -1600 },
    radius: defs[defIndex].radius,
    speed: 0,
    heading: 0,
    health: defs[defIndex].health,
    id: id,
    sinceLastShot: [10000],
    projectileId: 0,
    name,
    energy: defs[defIndex].energy,
    definitionIndex: defIndex,
    armIndices: emptyLoadout(defIndex),
    slotData: [{}, {}, {}],
    cargo: [{ what: "Teddy Bears", amount: 30 }],
    credits: 500,
  };

  equip(player, 0, "Basic mining laser", true);
  equip(player, 1, "Tomahawk Missile", true);
  equip(player, 2, "Laser Beam", true);

  sectors.get(defaultSector)!.players.set(id, player);
  const respawnKey = uid();
  respawnKeys.set(respawnKey, id);
  checkpoints.set(id, copyPlayer(player));

  targets.set(id, [TargetKind.None, 0]);
  secondaries.set(id, 0);

  ws.send(JSON.stringify({ type: "init", payload: { id: id, respawnKey, sector: 1 } }));
  console.log("Registered client with id: ", id);
};

// TODO Need to protect from intentionally bad data
wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.type === "login") {
      const name = data.payload.name;
      const password = data.payload.password;

      const hashedPassword = hash(password);

      // Check if the user is in the database
      User.findOne({ name, password: hashedPassword }, (err, user) => {
        if (err) {
          ws.send(JSON.stringify({ type: "loginFail", payload: {} }));
          console.log(err);
          return;
        }
        if (!user) {
          ws.send(JSON.stringify({ type: "loginFail", payload: {} }));
          return;
        }

        tmpSetupPlayer(user.id, ws, name, data.payload.faction);
        idToWebsocket.set(user.id, ws);
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
          tmpSetupPlayer(user.id, ws, name, faction);
          idToWebsocket.set(user.id, ws);
        });
      });
    } else if (data.type === "input") {
      const client = clients.get(ws);
      if (client && data.payload.id === client.id) {
        clients.set(ws, { ...client, input: data.payload.input });
      } else {
        console.log("Warning: Input data from unknown client");
      }
    } else if (data.type === "dock") {
      const client = clients.get(ws);
      if (client && data.payload.id === client.id) {
        const state = sectors.get(client.currentSector)!;
        const player = state.players.get(client.id);
        if (player) {
          const station = state.players.get(data.payload.stationId);
          if (canDock(player, station, false)) {
            const def = defs[player.definitionIndex];
            player.docked = data.payload.stationId;
            player.heading = 0;
            player.speed = 0;
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
            playerCopy.docked = undefined;
            checkpoints.set(client.id, playerCopy);
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
          const playerCopy = copyPlayer(player);
          playerCopy.docked = undefined;
          checkpoints.set(client.id, playerCopy);
        }
      }
    } else if (data.type === "respawn") {
      const client = clients.get(ws);
      const id = respawnKeys.get(data.payload.respawnKey);
      console.log("Respawning: ", id, data.payload.respawnKey);
      if (id && client && id === client.id) {
        const state = sectors.get(client.currentSector)!;
        const player = checkpoints.get(id);
        if (player) {
          state.players.set(id, copyPlayer(player));
        } else {
          console.log("Warning: No checkpoint found for player", id);
        }
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
          const selling: CargoEntry[] = [];
          player.cargo = player.cargo.filter(({ what, amount }) => {
            if (what !== data.payload.what) {
              return true;
            } else {
              selling.push({ what, amount });
              return false;
            }
          });
          if (selling.length > 1) {
            console.log("Warning: duplicate cargo (this is indicative of a bug)");
          }
          for (const { what, amount } of selling) {
            const price = market.get(what);
            if (price) {
              if (player.credits === undefined) {
                player.credits = 0;
              }
              player.credits += amount * price;
            }
          }

          state.players.set(client.id, player);
        }
      }
    } else if (data.type === "equip") {
      const client = clients.get(ws);
      if (client && data.payload.id === client.id) {
        const state = sectors.get(client.currentSector)!;
        const player = state.players.get(client.id);
        if (player) {
          equip(player, data.payload.slotIndex, data.payload.what);
          state.players.set(client.id, player);
        }
      }
    } else if (data.type === "chat") {
      const client = clients.get(ws);
      if (client && data.payload.id === client.id) {
        for (const [otherClient, otherClientData] of clients) {
          if (otherClientData.currentSector === client.currentSector) {
            otherClient.send(JSON.stringify({ type: "chat", payload: { id: data.payload.id, message: data.payload.message } }));
          }
        }
      }
    } else if (data.type === "purchase") {
      const client = clients.get(ws);
      if (client && data.payload.id === client.id) {
        const state = sectors.get(client.currentSector)!;
        const player = state.players.get(client.id);
        if (player) {
          purchaseShip(player, data.payload.index);
          state.players.set(client.id, player);
        }
      }
    } else if (data.type === "warp") {
      const client = clients.get(ws);
      if (client && data.payload.id === client.id) {
        if (client.currentSector !== data.payload.warpTo) {
          const state = sectors.get(client.currentSector)!;
          const player = state.players.get(client.id);
          if (player) {
            player.warpTo = data.payload.warpTo;
            player.warping = 1;
            state.players.set(client.id, player);
          }
        }
      }
    } else {
      console.log("Unknown message from client: ", data);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    const removedClient = clients.get(ws);
    if (removedClient) {
      const state = sectors.get(removedClient.currentSector)!;
      state.players.delete(removedClient.id);
      checkpoints.delete(removedClient.id);
      targets.delete(removedClient.id);
      secondaries.delete(removedClient.id);
      for (const [respawnKey, id] of respawnKeys) {
        if (id === removedClient.id) {
          respawnKeys.delete(respawnKey);
          break;
        }
      }
      clients.delete(ws);
      idToWebsocket.delete(removedClient.id);
    }
  });
});

const informDead = (id: number) => {
  const ws = idToWebsocket.get(id);
  if (ws) {
    ws.send(JSON.stringify({ type: "dead" }));
  }
};

// Updating the game state
setInterval(() => {
  frame++;
  for (const [sector, state] of sectors) {
    for (const [client, data] of clients) {
      const player = state.players.get(data.id);
      if (data.input && player) {
        applyInputs(data.input, player);
      }
    }
    const triggers: EffectTrigger[] = [];
    update(state, frame, targets, secondaries, (trigger) => triggers.push(trigger), warpList, informDead);

    // TODO Consider culling the state information to only send nearby players and projectiles
    const playerData: Player[] = [];
    for (const player of state.players.values()) {
      playerData.push(player);
    }
    const projectileData: Ballistic[] = [];
    for (const [id, projectiles] of state.projectiles) {
      projectileData.push(...projectiles);
    }
    const asteroidData: Asteroid[] = [];
    for (const asteroid of state.asteroids.values()) {
      asteroidData.push(asteroid);
    }
    const missileData: Missile[] = [];
    for (const missile of state.missiles.values()) {
      missileData.push(missile);
    }

    const serialized = JSON.stringify({
      type: "state",
      payload: { players: playerData, frame, projectiles: projectileData, asteroids: asteroidData, effects: triggers, missiles: missileData },
    });

    for (const [client, data] of clients) {
      if (data.currentSector === sector) {
        client.send(serialized);
      }
    }
  }
  // Handle all warps
  while (warpList.length > 0) {
    const { player, to } = warpList.shift()!;
    const state = sectors.get(to);
    if (state) {
      const ws = idToWebsocket.get(player.id);
      if (ws) {
        clients.get(ws)!.currentSector = to;
        ws.send(JSON.stringify({ type: "warp", payload: { to } }));
      }
      player.position.x = 0;
      player.position.y = 0;
      player.heading = (3 * Math.PI) / 2;
      player.speed = 0;
      state.players.set(player.id, player);
    }
  }
}, 1000 / ticksPerSecond);

server.listen(wsPort, () => {
  console.log(`${useSsl ? "Secure" : "Unsecure"} websocket server running on port ${wsPort}`);
});
