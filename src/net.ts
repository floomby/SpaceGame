import { Input, Player, maxNameLength } from "./game";

let serverSocket: WebSocket;

const register = (name: string) => {
  serverSocket.send(
    JSON.stringify({
      type: "register",
      payload: { name },
    })
  );
};

// Client connection code
const connect = (callback: (socket: WebSocket) => void) => {
  const socket = new WebSocket("ws://localhost:8080");
  socket.onopen = () => {
    console.log("Connected to the server");
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

const sendInput = (input: Input, id: number) => {
  serverSocket.send(
    JSON.stringify({
      type: "input",
      payload: { input, id },
    })
  );
};

const sendPlayerInfo = (player: Player) => {
  serverSocket.send(
    JSON.stringify({
      type: "player",
      payload: {
        ...player,
        name: player.name.substring(0, maxNameLength),
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

export { connect, bindAction, register, sendInput, sendPlayerInfo, sendDock, sendUndock };
