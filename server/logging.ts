import mongoose from "mongoose";

const Schema = mongoose.Schema;

interface IWebSocketConnection {
  ipAddr: string;
  date: Date;
  playerId?: number;
}

const webSocketConnectionSchema = new Schema<IWebSocketConnection>({
  ipAddr: { type: String, required: true },
  date: { type: Date, required: true },
  playerId: { type: Number, required: false },
});

const WebSocketConnection = mongoose.model<IWebSocketConnection>("WebSocketConnection", webSocketConnectionSchema);

const logWebSocketConnection = (ipAddr: string | undefined) => {
  if (!ipAddr) {
    return;
  }
  const connection = new WebSocketConnection({ ipAddr, date: new Date() });
  connection.save();
};

const assignPlayerIdToConnection = (ipAddr: string | undefined, playerId: number) => {
  if (!ipAddr) {
    return;
  }

  // Find the most recent connection from this IP address
  WebSocketConnection.findOne({ ipAddr })
    .sort({ date: -1 })
    .exec((err, connection) => {
      if (err) {
        console.error(err);
        return;
      }

      if (connection) {
        // Update the connection with the player ID
        connection.playerId = playerId;
        connection.save();
      } else {
        console.log("Warning: no connection found for IP address " + ipAddr);
      }
    });
};

export { logWebSocketConnection, assignPlayerIdToConnection };
