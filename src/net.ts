import { Input, Player, maxNameLength, TargetKind } from "./game";
import { Faction } from "./defs";
import { wsUrl } from "./config";

let serverSocket: WebSocket;

const login = (name: string, password: string, faction: Faction) => {
  serverSocket.send(
    JSON.stringify({
      type: "login",
      payload: { name, password, faction },
    })
  );
};

// Client connection code
const connect = (callback: (socket: WebSocket) => void) => {
  const socket = new WebSocket(wsUrl);
  socket.onopen = () => {
    console.log(`Connected to the server at ${wsUrl}`);
    serverSocket = socket;
    callback(socket);
  };
  socket.onclose = () => {
    console.log("Disconnected from the server");
  };
  socket.onerror = (err) => {
    console.log("Error: ", err);
  };
};

const bindAction = (action: string, callback: (data: any) => void) => {
  serverSocket.addEventListener("message", (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === action) {
      callback(data.payload);
    }
  });
};

const unbindAllActions = () => {
  serverSocket.onmessage = null;
};

const sendInput = (input: Input, id: number) => {
  const inputToSend = {
    up: input.up,
    down: input.down,
    left: input.left,
    right: input.right,
    primary: input.primary,
    secondary: input.secondary,
  };
  serverSocket.send(
    JSON.stringify({
      type: "input",
      payload: { input: inputToSend, id },
    })
  );
};

const sendPlayerInfo = (player: Player) => {
  serverSocket.send(
    JSON.stringify({
      type: "player",
      payload: {
        ...player,
        // name: player.name.substring(0, maxNameLength),
        name: "test",
      },
    })
  );
};

const sendDock = (id: number, stationId: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "dock",
      payload: { id, stationId },
    })
  );
};

const sendUndock = (id: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "undock",
      payload: { id },
    })
  );
};

const sendRespawn = (respawnKey: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "respawn",
      payload: { respawnKey },
    })
  );
};

const sendTarget = (id: number, target: [TargetKind, number]) => {
  serverSocket.send(
    JSON.stringify({
      type: "target",
      payload: { id, target },
    })
  );
};

const sendSecondary = (id: number, secondary: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "secondary",
      payload: { id, secondary },
    })
  );
};

const sendSellCargo = (id: number, what: string) => {
  serverSocket.send(
    JSON.stringify({
      type: "sellCargo",
      payload: { id, what },
    })
  );
};

const sendEquip = (id: number, slotIndex: number, what: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "equip",
      payload: { id, slotIndex, what },
    })
  );
};

const sendChat = (id: number, message: string) => {
  serverSocket.send(
    JSON.stringify({
      type: "chat",
      payload: { id, message },
    })
  );
};

const sendPurchase = (id: number, index: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "purchase",
      payload: { id, index },
    })
  );
};

export {
  connect,
  bindAction,
  unbindAllActions,
  login,
  sendInput,
  sendPlayerInfo,
  sendDock,
  sendUndock,
  sendRespawn,
  sendTarget,
  sendSecondary,
  sendSellCargo,
  sendEquip,
  sendChat,
  sendPurchase,
};
