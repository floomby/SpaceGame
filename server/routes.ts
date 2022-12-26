import { createServer } from "http";
import { createServer as createSecureServer } from "https";
import { maxNameLength } from "../src/game";
import { armDefMap, asteroidDefMap, defMap, Faction, UnitKind } from "../src/defs";
import { useSsl } from "../src/config";
import express from "express";
import { resolve } from "path";
import cors from "cors";

import { User, Station } from "./dataModels";

import { addNpc } from "../src/npc";
import { market } from "./market";
import { clients, friendlySectors, idToWebsocket, sectorFactions, sectorHasStarbase, sectorList, sectors, uid } from "./state";
import { adminHash, credentials, hash, httpPort } from "./settings";
import { recipeMap, recipes } from "../src/recipes";
import { isFreeArm } from "../src/defs/armaments";
import { createReport, generatePlayedIntervals, statEpoch, sumIntervals } from "./reports";
import { makeBarGraph } from "./graphs";
import { maxDecimals } from "../src/geometry";

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

app.get("/dist/gl-matrix.js", (req, res) => {
  res.sendFile("node_modules/gl-matrix/gl-matrix.js", { root });
});

app.get("/dist/workers.js", (req, res) => {
  res.sendFile("dist/workers.js", { root });
});

app.get("/", (req, res) => {
  res.sendFile("index.html", { root });
});

app.get("/styles.css", (req, res) => {
  res.sendFile("styles.css", { root });
});

// Rest api stuff for things that are not "realtime"
app.get("/available", (req, res) => {
  const name = req.query.name;
  if (!name || typeof name !== "string" || name.length > maxNameLength) {
    res.send("false");
    return;
  }
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

app.get("/nameOf", (req, res) => {
  const id = req.query.id;
  if (!id || typeof id !== "string") {
    res.send(JSON.stringify({ error: "Invalid id" }));
    return;
  }
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
    res.send(JSON.stringify({ error: "Invalid id" }));
    return;
  }
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
    // Assume if we didn't find the station it is the tutorial station
    res.send(JSON.stringify({ value: "Tutorial Station" }));
  });
});

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
  if (hashedPassword !== adminHash) {
    res.send("Invalid password");
    return;
  }
  // Create a bunch of stations
  const stationObjects = sectorList
    .map((sector) => {
      if (!sectorHasStarbase[sector]) {
        return [];
      }

      const faction = sectorFactions[sector];
      switch (faction) {
        case Faction.Rogue:
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
        case Faction.Alliance:
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
        case Faction.Confederation:
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

// Probably don't need this anymore
app.get("/resetEverything", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== adminHash) {
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

app.get("/unlockEverything", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== adminHash) {
    res.send("Invalid password");
    return;
  }
  const name = req.query.name;
  if (!name || typeof name !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  User.findOne({ name }, (err, user) => {
    if (err) {
      res.send("Database error: " + err);
      return;
    }
    if (!user) {
      res.send("User not found");
      return;
    }
    user.recipesKnown = recipes.map((recipe) => recipe.name);
    user.sectorsVisited = sectorList;
    // Give the user one of each ship
    for (const [key, def] of defMap) {
      if (def.def.kind === UnitKind.Station) {
        continue;
      }
      const inventory = user.inventory.find((item) => item.what === key);
      if (inventory) {
        inventory.amount += 1;
      } else {
        user.inventory.push({
          what: key,
          amount: 1,
        });
      }
    }
    // Give the user one of each armament
    for (const [key, def] of armDefMap) {
      if (isFreeArm(def.def.name)) {
        continue;
      }
      const inventory = user.inventory.find((item) => item.what === key);
      if (inventory) {
        inventory.amount += 1;
      } else {
        user.inventory.push({
          what: key,
          amount: 1,
        });
      }
    }
    // Give the user 10000 of each mineral
    for (const [key, def] of asteroidDefMap) {
      const inventory = user.inventory.find((item) => item.what === key);
      if (inventory) {
        inventory.amount += 10000;
      } else {
        user.inventory.push({
          what: key,
          amount: 10000,
        });
      }
    }

    user.save((err) => {
      if (err) {
        res.send("Database error: " + err);
        return;
      }

      const ws = idToWebsocket.get(user.id);
      if (ws) {
        try {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Error finding user for inventory population" } }));
        } catch (e) {
          console.trace(e);
        }
        const client = clients.get(ws);
        if (client) {
          client.sectorsVisited = new Set(sectorList);
        }
      }

      res.send("true");
    });
  });
});

app.get("/addNPC", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== adminHash) {
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
    addNpc(sectors.get(sectorIndex)!, what, parseInt(team), uid(), friendlySectors(parseInt(team)));
  } catch (e) {
    res.send("Error: " + e);
    return;
  }
  res.send("true");
});

app.get("/startProfiling", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== adminHash) {
    res.send("Invalid password");
    return;
  }
  console.profile();
  res.send("true");
});

app.get("/stopProfiling", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== adminHash) {
    res.send("Invalid password");
    return;
  }
  console.profileEnd();
  res.send("true");
});

app.get("/totalPlayers", (req, res) => {
  const ret =
    `Total: ${Array.from(sectors.values())
      .map((sector) => sector.players.size)
      .reduce((a, b) => a + b, 0)
      .toString()}<br/>` +
    Array.from(sectors.entries())
      .map(([sector, sectorData]) => `${sector}: ${sectorData.players.size.toString()}`)
      .join("<br/>");
  res.send(ret);
});

app.get("/fixDataBase", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== adminHash) {
    res.send("Invalid password");
    return;
  }
  // Round all the inventory number to the nearest integer
  User.find({}, (err, users) => {
    if (err) {
      res.send("Database error: " + err);
      return;
    }
    users.forEach((user) => {
      const newInventory = Object.fromEntries(Object.entries(user.inventory).map(([key, value]) => [key, Math.round(value as number)]));
      user.inventory = newInventory;
      user.save();
    });
    res.send("true");
  });
});

app.get("/priceOf", (req, res) => {
  const what = req.query.what;
  if (!what || typeof what !== "string") {
    res.send(JSON.stringify({ error: "Invalid get parameters" }));
    return;
  }
  const price = market.get(what);
  if (!price) {
    res.send(JSON.stringify({ error: "Invalid item" }));
    return;
  }
  res.send(JSON.stringify({ value: price }));
});

app.get("/kill", (req, res) => {
  const password = req.query.password;
  if (!password || typeof password !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  const hashedPassword = hash(password);
  if (hashedPassword !== adminHash) {
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

app.get("/usersOnline", (req, res) => {
  res.send(JSON.stringify(Array.from(clients.values()).map((client) => client.name)));
});

app.get("/totalPlayTime", (req, res) => {
  const name = req.query.name;
  if (!name || typeof name !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  User.findOne({ name }, (err, user) => {
    if (err) {
      res.send("Database error: " + err);
      return;
    }
    if (!user) {
      res.send("Invalid user");
      return;
    }
    const totalPlayTime = sumIntervals(generatePlayedIntervals(user)) / 1000 / 60;
    res.send(totalPlayTime.toString());
  });
});

app.get("/testGraph", (req, res) => {
  const name = req.query.name;
  if (!name || typeof name !== "string") {
    res.send("Invalid get parameters");
    return;
  }
  User.findOne({ name }, (err, user) => {
    if (err) {
      res.send("Database error: " + err);
      return;
    }
    if (!user) {
      res.send("Invalid user");
      return;
    }
    const data = generatePlayedIntervals(user).map(([start, end]) => (end.getTime() - start.getTime()) / 1000 / 60);
    res.send(makeBarGraph(data.map((value) => ({ value, tooltip: maxDecimals(value, 2).toString() })), "Time Period", "Time Played", "Player Play Time Graph"));
  });
});

app.get("/playReport", async (req, res) => {
  res.send(await createReport(statEpoch));
});

app.get("/changePassword", (req, res) => {
  const username = req.query.username as string;
  const oldPassword = req.query.old as string;
  const newPassword = req.query.new as string;

  User.find({ name: username }, (err, users) => {
    if (err) {
      res.send("Database error: " + err);
      return;
    }

    if (users.length === 0) {
      res.send(`Cannot find user "${username}"`);
      return;
    }

    if (users.length > 1) {
      res.send("Found more than one user");
      return;
    }

    const user = users[0];

    if (hash(oldPassword) !== user.password) {
      res.send("Incorrect password");
      return;
    }

    user.password = hash(newPassword);
    user.save();

    res.send(true);
    return;
  });
});

export default () => {
  app.use(cors());
  if (useSsl) {
    app.use(express.static("resources"));
    app.use(express.static("shaders"));

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
};
