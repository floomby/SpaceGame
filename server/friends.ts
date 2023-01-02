import mongoose, { HydratedDocument } from "mongoose";
import { IUser, User } from "./dataModels";
import { WebSocket } from "ws";
import { flashServerMessage } from "./stateHelpers";
import { idToWebsocket } from "./state";

const Schema = mongoose.Schema;

interface IFriendRequest {
  from: number;
  to: number;
}

const friendRequestSchema = new Schema<IFriendRequest>({
  from: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    },
  },
  to: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    },
  },
});

const FriendRequest = mongoose.model<IFriendRequest>("FriendRequest", friendRequestSchema);

const canFriendRequest = async (from: number, to: string) => {
  const fromUser = await User.findOne({ id: from });
  if (!fromUser) {
    return false;
  }
  const user = await User.findOne({ name: to });
  if (!user) {
    return false;
  }
  if (user.id === from) {
    return false;
  }
  // check if already friends
  if (user.friends.includes(from)) {
    return false;
  }
  // check if already sent a friend request
  const friendRequest = await FriendRequest.findOne({ from, to: user.id });
  if (friendRequest) {
    return false;
  }
  return true;
};

// This is also used to accept friend requests
const createFriendRequest = async (ws: WebSocket, id: number, to: string) => {
  try {
    const fromUser = await User.findOne({ id });
    if (!fromUser) {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to send friend request (could not find own user)" } }));
      return;
    }
    const user = await User.findOne({ name: to });
    if (!user) {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to send friend request (invalid user)" } }));
      return;
    }
    if (user.id === id) {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to send friend request (cannot friend yourself)" } }));
      return;
    }
    // check if already friends
    if (user.friends.includes(id)) {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to send friend request (already friends)" } }));
      return;
    }
    // check if already sent a friend request
    const friendRequest = await FriendRequest.findOne({ from: id, to: user.id });
    if (friendRequest) {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to send friend request (already sent)" } }));
      return;
    }
    // check if outstanding friend request
    const friendRequest2 = await FriendRequest.findOne({ from: user.id, to: id });
    if (friendRequest2) {
      // accept friend request
      fromUser.friends.push(user.id);
      user.friends.push(id);
      // start a session
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        await fromUser.save();
        await user.save();
        await friendRequest2.delete();
        await session.commitTransaction();
        try {
          notifyFriendRequestChanged(friendRequest2);
          notifyFriendChanged(fromUser.id, user.id);
          flashServerMessage(id, "You are now friends with " + user.name);
          flashServerMessage(user.id, "You are now friends with " + fromUser.name);
        } catch (err) {
          console.error(err);
        }
      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
      return;
    }
    // create friend request
    const newFriendRequest = new FriendRequest({ from: id, to: user.id });
    await newFriendRequest.save();
    notifyFriendRequestChanged(newFriendRequest);
    flashServerMessage(id, "Friend request sent to " + user.name);
  } catch (err) {
    console.error(err);
    try {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to send friend request" } }));
    } catch (err) {
      console.error(err);
    }
  }
};

const revokeFriendRequest = async (ws: WebSocket, id: number, to: string) => {
  try {
    const toUser = await User.findOne({ name: to });
    if (!toUser) {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to revoke friend request (invalid user)" } }));
      return;
    }
    const friendRequest = await FriendRequest.findOne({ from: id, to: toUser.id });
    if (!friendRequest) {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to revoke friend request (no friend request)" } }));
      return;
    }
    await friendRequest.delete();
    notifyFriendRequestChanged(friendRequest);
    flashServerMessage(id, "Friend request revoked");
  } catch (err) {
    console.error(err);
    try {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to revoke friend request" } }));
    } catch (err) {
      console.error(err);
    }
  }
};

const notifyFriendRequestChanged = (request: HydratedDocument<IFriendRequest>) => {
  const { from, to } = request;
  for (const id of [from, to]) {
    const ws = idToWebsocket.get(id);
    if (ws) {
      ws.send(JSON.stringify({ type: "friendRequestChange" }));
    }
  }
};

const notifyFriendChanged = (id1: number, id2: number) => {
  for (const id of [id1, id2]) {
    const ws = idToWebsocket.get(id);
    if (ws) {
      ws.send(JSON.stringify({ type: "friendChange" }));
    }
  }
};

export { FriendRequest, IFriendRequest, canFriendRequest, createFriendRequest, revokeFriendRequest };
