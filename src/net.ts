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

const register = (name: string, password: string, faction: Faction) => {
  serverSocket.send(
    JSON.stringify({
      type: "register",
      payload: { name, password, faction },
    })
  );
};

const bindings: Map<string, (data: any) => void> = new Map();

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
  socket.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    const callback = bindings.get(data.type);
    if (callback) {
      callback(data.payload);
    }
  };
};

const bindAction = (action: string, callback: (data: any) => void) => {
  bindings.set(action, callback);
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

const sendAngle = (id: number, angle: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "angle",
      payload: { id, angle },
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

const sendRespawn = (id: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "respawn",
      payload: { id },
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

const sendSellCargo = (id: number, what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "sellCargo",
      payload: { id, what, amount },
    })
  );
};

const sendDepositCargo = (id: number, what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "depositCargo",
      payload: { id, what, amount },
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

const sendWarp = (id: number, warpTo: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "warp",
      payload: { id, warpTo },
    })
  );
};

let lastSentRepair = Date.now();

const sendRepair = (id: number, station: number) => {
  if (Date.now() - lastSentRepair > 1000) {
    serverSocket.send(
      JSON.stringify({
        type: "repair",
        payload: { id, station },
      })
    );
    lastSentRepair = Date.now();
  } 
};

const sendDumpCargo = (id: number, what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "dumpCargo",
      payload: { id, what, amount },
    })
  );
};

const sendSellInventory = (id: number, what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "sellInventory",
      payload: { id, what, amount },
    })
  );
};

export {
  connect,
  bindAction,
  unbindAllActions,
  login,
  register,
  sendInput,
  sendAngle,
  sendDock,
  sendUndock,
  sendRespawn,
  sendTarget,
  sendSecondary,
  sendSellCargo,
  sendDepositCargo,
  sendEquip,
  sendChat,
  sendPurchase,
  sendWarp,
  sendRepair,
  sendDumpCargo,
  sendSellInventory,
};
