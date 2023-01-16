import { Faction } from "../src/defs";
import { GlobalState, SectorOfPlayerResult, serverMessagePersistTime } from "../src/game";
import { clients, idToWebsocket, sectors } from "./state";

const enemyCountState = (team: Faction, state: GlobalState) => {
  let count = 0;
  for (const [id, player] of state.players) {
    if (player.team !== team) {
      count++;
    }
  }
  return count;
};

const allyCountState = (team: Faction, state: GlobalState) => {
  let count = 0;
  for (const [id, player] of state.players) {
    if (player.team === team) {
      count++;
    }
  }
  return count;
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

const flashServerMessage = (id: number, message: string, color: [number, number, number, number] = [1.0, 1.0, 1.0, 1.0]) => {
  try {
    const ws = idToWebsocket.get(id);
    if (ws) {
      const client = clients.get(ws);
      if (client && message.length > 0) {
        if (message !== client.lastMessage) {
          ws.send(JSON.stringify({ type: "serverMessage", payload: { message, color } }));
          client.lastMessage = message;
          client.lastMessageTime = Date.now();
        } else {
          if (Date.now() - client.lastMessageTime > serverMessagePersistTime) {
            ws.send(JSON.stringify({ type: "serverMessage", payload: { message, color } }));
            client.lastMessageTime = Date.now();
          }
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
};

const sendMissionComplete = (id: number, message: string) => {
  const ws = idToWebsocket.get(id);
  if (ws) {
    try {
      ws.send(JSON.stringify({ type: "missionComplete", payload: message }));
    } catch (err) {
      console.log(err);
    }
  }
};

// BROKEN (sort of)
const findPlayer = (id: number): SectorOfPlayerResult => {
  for (const [sectorNumber, state] of sectors) {
    if (state.players.has(id)) {
      return { sectorNumber, sectorKind: state.sectorKind! };
    }
  }
  // Should be safe to assume that if they are not in a sector, but connected they are respawning
  if (idToWebsocket.has(id)) {
    return "respawning";
  }
  return null;
};

const setMissionTargetForId = (id: number, targetId: number) => {
  const ws = idToWebsocket.get(id);
  if (ws) {
    try {
      ws.send(JSON.stringify({ type: "setMissionTarget", payload: targetId }));
    } catch (err) {
      console.log(err);
    }
  }
};

export { enemyCount, allyCount, enemyCountState, allyCountState, flashServerMessage, sendMissionComplete, findPlayer, setMissionTargetForId };
