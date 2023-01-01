import { Input, Player, maxNameLength, TargetKind, TutorialStage } from "./game";
import { Faction } from "./defs";
import { wsUrl } from "./config";
import { addLoadingText } from "./globals";

let serverSocket: WebSocket;

const login = (name: string, password: string) => {
  serverSocket.send(
    JSON.stringify({
      type: "login",
      payload: { name, password },
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

let heartbeatInterval: number;

// Client connection code
const connect = (callback: (socket: WebSocket) => void) => {
  addLoadingText("Connecting to server...");
  const socket = new WebSocket(wsUrl);
  socket.onopen = () => {
    console.log(`Connected to the server at ${wsUrl}`);
    serverSocket = socket;
    addLoadingText("Connected to server!");
    heartbeatInterval = window.setInterval(() => {
      socket.send(JSON.stringify({ type: "heartbeat" }));
    }, 25 * 1000);
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

const sendInput = (input: Input) => {
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
      payload: { input: inputToSend },
    })
  );
};

const sendAngle = (angle: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "angle",
      payload: { angle },
    })
  );
};

const sendDock = (stationId: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "dock",
      payload: { stationId },
    })
  );
};

const sendUndock = () => {
  serverSocket.send(
    JSON.stringify({
      type: "undock",
      payload: {},
    })
  );
};

const sendRespawn = () => {
  serverSocket.send(
    JSON.stringify({
      type: "respawn",
      payload: {},
    })
  );
};

const sendTarget = (target: [TargetKind, number]) => {
  serverSocket.send(
    JSON.stringify({
      type: "target",
      payload: { target },
    })
  );
};

const sendSecondary = (secondary: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "secondary",
      payload: { secondary },
    })
  );
};

const sendSellCargo = (what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "sellCargo",
      payload: { what, amount },
    })
  );
};

const sendDepositCargo = (what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "depositCargo",
      payload: { what, amount },
    })
  );
};

const sendEquip = (slotIndex: number, what: number, fromInventory = false) => {
  serverSocket.send(
    JSON.stringify({
      type: "equip",
      payload: { slotIndex, what, fromInventory },
    })
  );
};

const sendChat = (message: string) => {
  serverSocket.send(
    JSON.stringify({
      type: "chat",
      payload: { message },
    })
  );
};

const sendPurchase = (index: number, fromInventory = false) => {
  serverSocket.send(
    JSON.stringify({
      type: "purchase",
      payload: { index, fromInventory },
    })
  );
};

const sendWarp = (warpTo: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "warp",
      payload: { warpTo },
    })
  );
};

let lastSentRepair = Date.now();

const sendRepair = (station: number) => {
  if (Date.now() - lastSentRepair > 1000) {
    serverSocket.send(
      JSON.stringify({
        type: "repair",
        payload: { station },
      })
    );
    lastSentRepair = Date.now();
  }
};

const sendDumpCargo = (what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "dumpCargo",
      payload: { what, amount },
    })
  );
};

const sendSellInventory = (what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "sellInventory",
      payload: { what, amount },
    })
  );
};

const sendManufacture = (what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "manufacture",
      payload: { what, amount },
    })
  );
};

const sendCompositeManufacture = (what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "compositeManufacture",
      payload: { what, amount },
    })
  );
};

const sendTransferToShip = (what: string, amount: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "transferToShip",
      payload: { what, amount },
    })
  );
};

const sendSecondaryActivation = (secondary: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "secondaryActivation",
      payload: { secondary },
    })
  );
};

const tutorialStagesCompleted = new Set<TutorialStage>();

const sendTutorialStageComplete = (stage: TutorialStage) => {
  if (!tutorialStagesCompleted.has(stage)) {
    serverSocket.send(
      JSON.stringify({
        type: "tutorialStageComplete",
        payload: { stage },
      })
    );
    tutorialStagesCompleted.add(stage);
  }
};

const sendSelectMission = (missionId: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "selectMission",
      payload: { missionId },
    })
  );
};

const sendStartMission = (missionId: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "startMission",
      payload: { missionId },
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
  sendManufacture,
  sendCompositeManufacture,
  sendTransferToShip,
  sendSecondaryActivation,
  sendTutorialStageComplete,
  sendSelectMission,
  sendStartMission,
};
