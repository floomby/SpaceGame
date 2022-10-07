import { createServer } from "http";
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
} from "../src/game";
import { UnitDefinition, defs, defMap, initDefs, Faction } from "../src/defs";
import { assert } from "console";

const port = 8080;

initDefs();

const state: GlobalState = {
  players: new Map(),
  projectiles: new Map(),
  asteroids: new Map(),
};

// Targeting is handled by the clients, but the server needs to know
// Same pattern with secondaries
// BTW I do not like this design
const targets: Map<number, [TargetKind, number]> = new Map();
const secondaries: Map<number, number> = new Map();

type ClientData = {
  id: number;
  input: Input;
  name: string;
};

const checkpoints = new Map<number, Player>();
const respawnKeys = new Map<number, number>();

let frame = 0;

const clients: Map<WebSocket, ClientData> = new Map();

const server = createServer();

const wss = new WebSocketServer({ server });

const testStarbaseId = uid();
const testStarbase = {
  position: { x: -400, y: -400 },
  radius: defs[2].radius,
  speed: 0,
  heading: 0,
  health: defs[2].health,
  testStarbaseId,
  sinceLastShot: [10000, 10000, 10000, 10000],
  projectileId: 0,
  energy: defs[2].energy,
  definitionIndex: 2,
  id: testStarbaseId,
  name: "Test Starbase",
  armaments: [],
  slotData: [],
};
state.players.set(testStarbaseId, testStarbase);

const testAsteroids = randomAsteroids(30, { x: -1000, y: -1000, width: 2000, height: 2000 });
for (const asteroid of testAsteroids) {
  state.asteroids.set(asteroid.id, asteroid);
}

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.type === "register") {
      const id = uid();
      const name = data.payload.name.substring(0, maxNameLength);
      clients.set(ws, { id, name, input: { up: false, down: false, left: false, right: false, primary: false, secondary: false } });

      let defIndex: number;
      const faction = data.payload.faction as Faction;
      if (faction === Faction.Alliance) {
        defIndex = defMap.get("Fighter")!.index;
      } else if (faction === Faction.Confederation) {
        defIndex = defMap.get("Drone")!.index;
      } else {
        console.log(`Invalid faction ${faction}`);
        return;
      }

      const player = {
        position: { x: 300, y: 200 },
        radius: defs[defIndex].radius,
        speed: 0,
        heading: 0,
        health: defs[defIndex].health,
        id,
        sinceLastShot: [10000],
        projectileId: 0,
        name,
        energy: defs[defIndex].energy,
        definitionIndex: defIndex,
        armaments: [5, 0],
        slotData: [{}],
      };

      state.players.set(id, player);
      const respawnKey = uid();
      respawnKeys.set(respawnKey, id);
      checkpoints.set(id, copyPlayer(player));

      targets.set(id, [TargetKind.None, 0]);
      secondaries.set(id, 0);

      ws.send(JSON.stringify({ type: "init", payload: { id, respawnKey } }));
      console.log("Registered client with id: ", id);
    } else if (data.type === "debug") {
      console.log("Debugging");
      for (const [client, data] of clients) {
        console.log("Client: ", data);
      }
    } else if (data.type === "player") {
      console.log("Received player data from client (should not be here with the changes): ", data.payload);
      const client = clients.get(ws);
      if (client && data.payload.id === client.id) {
        // console.log("Player data from client: ", data.payload);
        state.players.set(client.id, data.payload);
        // TODO Cheating check needed
      } else {
        console.log("Player data from unknown client");
      }
    } else if (data.type === "input") {
      const client = clients.get(ws);
      if (client && data.payload.id === client.id) {
        clients.set(ws, { ...client, input: data.payload.input });
        // Since I am just sending the state every frame I don't need to relay all the inputs to everyone
        // for (const [toClient, toData] of clients) {
        //   // TODO Cull based on distance
        //   if (client.id !== toData.id) {
        //     toClient.send(JSON.stringify({ type: "input", payload: data.payload }));
        //   }
        // }
      } else {
        console.log("Input data from unknown client");
      }
    } else if (data.type === "dock") {
      const client = clients.get(ws);
      if (client && data.payload.id === client.id) {
        const player = state.players.get(client.id);
        if (player) {
          const station = state.players.get(data.payload.stationId);
          if (canDock(player, station, false)) {
            player.docked = data.payload.stationId;
            player.heading = 0;
            player.speed = 0;
            player.position = { x: station!.position.x, y: station!.position.y };
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
        const player = state.players.get(client.id);
        if (player) {
          player.docked = undefined;
          state.players.set(client.id, player);
        }
      }
    } else if (data.type === "respawn") {
      const client = clients.get(ws);
      const id = respawnKeys.get(data.payload.respawnKey);
      console.log("Respawning: ", id, data.payload.respawnKey);
      if (id && client && id === client.id) {
        const player = checkpoints.get(id);
        if (player) {
          state.players.set(id, copyPlayer(player));
        } else {
          console.log("No checkpoint found for player", id);
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
    } else {
      console.log("Message from client: ", data);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    const removedClient = clients.get(ws);
    if (removedClient) {
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
      // for (const [client, data] of clients) {
      //   client.send(
      //     JSON.stringify({
      //       type: "removed",
      //       payload: removedClient.id,
      //     })
      //   );
      // }
    }
  });
});

// Idk if this is how I want to do it or not
const framesPerSync = 1;

setInterval(() => {
  frame++;
  for (const [client, data] of clients) {
    const player = state.players.get(data.id);
    if (data.input && player) {
      applyInputs(data.input, player);
    }
  }
  const triggers: EffectTrigger[] = [];
  update(state, frame, () => {}, targets, secondaries, (trigger) => triggers.push(trigger));
  // update(state, frame, (id: number) => {
  //   for (const [client, data] of clients) {
  //     if (data.id === id) {
  //       client.send(JSON.stringify({ type: "removed", payload: id }));
  //     }
  //   }
  // });

  // TODO Consider culling the state information to only send nearby players and projectiles
  if (frame % framesPerSync === 0) {
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

    const serialized = JSON.stringify({
      type: "state",
      payload: { players: playerData, frame, projectiles: projectileData, asteroids: asteroidData, effects: triggers },
    });

    for (const [client, data] of clients) {
      client.send(serialized);
    }
  }
}, 1000 / ticksPerSecond);

server.listen(port, () => {
  console.log("Websocket server started on port 8080");
});
