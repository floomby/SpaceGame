const register = (socket: WebSocket, id: number) => {
  socket.send(
    JSON.stringify({
      type: "register",
      payload: { id },
    })
  );
};

// Client connection code
const connect = (callback: (socket: WebSocket) => void) => {
  const socket = new WebSocket("ws://localhost:8080");
  socket.onopen = () => {
    console.log("Connected to the server");
    callback(socket);
  };
  socket.onclose = () => {
    console.log("Disconnected from the server");
  };
  socket.onerror = (err) => {
    console.log("Error: ", err);
  }
};

const bindAction = (socket: WebSocket, action: string, callback: (data: any) => void) => {
  socket.addEventListener("message", (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === action) {
      callback(data.payload);
    }
  });
};

export { connect, bindAction, register };
