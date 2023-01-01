import { Faction } from "../src/defs";
import { GlobalState, serverMessagePersistTime } from "../src/game";
import { clients, idToWebsocket, sectors } from "./state";

const enemyCountState = (team: Faction, state: GlobalState) => {
  let count = 0;
  for (const [id, player] of state.players) {
    if (player.team !== team) {
      count++;
    }
  }
  return count;
}

const allyCountState = (team: Faction, state: GlobalState) => {
  let count = 0;
  for (const [id, player] of state.players) {
    if (player.team === team) {
      count++;
    }
  }
  return count;
}

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

export { enemyCount, allyCount, enemyCountState, allyCountState, flashServerMessage };
