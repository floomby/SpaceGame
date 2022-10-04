import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { GlobalState, Player, Input, update, applyInputs, Ballistic, ticksPerSecond, maxNameLength } from "../src/game";

const state: GlobalState = {
  players: new Map(),
  projectiles: new Map(),
};

type ClientData = {
  id: number;
  input: Input;
  name: string;
};

let frame = 0;

const clients: Map<WebSocket, ClientData> = new Map();

const server = createServer();

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.type === "register") {
      const id = Math.floor(Math.random() * 1000000);
      const name = data.payload.name.substring(0, maxNameLength);
      clients.set(ws, { id, name, input: { up: false, down: false, left: false, right: false, primary: false } });
      const player = {
        position: { x: 100, y: 100 },
        radius: 13,
        speed: 0,
        heading: 0,
        health: 100,
        id,
        team: id % 2,
        sprite: id % 2,
        sinceLastShot: 10000,
        projectileId: 0,
        name,
      };
      state.players.set(id, player);
      ws.send(JSON.stringify({ type: "init", payload: { id } }));
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
    } else {
      console.log("Message from client: ", data);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    const removedClient = clients.get(ws);
    if (removedClient) {
      state.players.delete(removedClient.id);
      clients.delete(ws);
      for (const [client, data] of clients) {
        client.send(
          JSON.stringify({
            type: "removed",
            payload: removedClient.id,
          })
        );
      }
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
  update(state, frame, (id: number) => {
    for (const [client, data] of clients) {
      if (data.id === id) {
        client.send(JSON.stringify({ type: "removed", payload: id }));
      }
    }
  });

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

    const serialized = JSON.stringify({ type: "state", payload: { players: playerData, frame, projectiles: projectileData } });

    for (const [client, data] of clients) {
      client.send(serialized);
    }
  }
}, 1000 / (ticksPerSecond));

server.listen(8080, () => {
  console.log("Websocket server started on port 8080");
});
