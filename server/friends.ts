import mongoose, { HydratedDocument } from "mongoose";
import { IUser, User } from "./dataModels";
import { WebSocket } from "ws";
import { findPlayer, flashServerMessage, setMissionTargetForId } from "./stateHelpers";
import { idToWebsocket } from "./state";
import { MissionType, Player, SectorKind } from "../src/game";
import { Mission } from "./missions";

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
        await fromUser.save({ session });
        await user.save({ session });
        await friendRequest2.delete({ session });
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
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to rescind friend request (invalid user)" } }));
      return;
    }
    const friendRequest = await FriendRequest.findOne({ from: id, to: toUser.id });
    if (!friendRequest) {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to rescind friend request (no friend request)" } }));
      return;
    }
    await friendRequest.delete();
    notifyFriendRequestChanged(friendRequest);
    flashServerMessage(id, `Friend request to ${toUser.name} rescinded`);
  } catch (err) {
    console.error(err);
    try {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to rescind friend request" } }));
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
      try {
        ws.send(JSON.stringify({ type: "friendRequestChange" }));
      } catch (err) {
        console.log(err);
      }
    }
  }
};

const notifyFriendChanged = (id1: number, id2: number) => {
  for (const id of [id1, id2]) {
    const ws = idToWebsocket.get(id);
    if (ws) {
      try {
        ws.send(JSON.stringify({ type: "friendChange" }));
      } catch (err) {
        console.log(err);
      }
    }
  }
};

const unfriend = async (ws: WebSocket, id: number, friend: number) => {
  try {
    // start a transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user1 = await User.findOneAndUpdate({ id }, { $pull: { friends: friend } }, { session });
      const user2 = await User.findOneAndUpdate({ id: friend }, { $pull: { friends: id } }, { session });
      if (!user1 || !user2) {
        throw new Error("Failed to unfriend");
      }
      await session.commitTransaction();
      notifyFriendChanged(id, friend);
      flashServerMessage(id, "You are no longer friends with " + user2.name);
      flashServerMessage(friend, "You are no longer friends with " + user1.name);
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error(err);
    try {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Failed to unfriend" } }));
    } catch (err) {
      console.error(err);
    }
  }
};

const friendWarp = async (ws: WebSocket, player: Player, friend: number) => {
  try {
    // check if friends
    const user = await User.findOne({ id: player.id });
    if (!user) {
      ws.send({ type: "error", payload: { message: "Failed to warp to friend (invalid user)" } });
      throw new Error("Failed to warp to friend (invalid user)");
    }
    if (!user.friends.includes(friend)) {
      ws.send({ type: "error", payload: { message: "Failed to warp to friend (not friends)" } });
      throw new Error("Failed to warp to friend (not friends)");
    }
    const where = findPlayer(friend);
    if (!where) {
      flashServerMessage(player.id, "Failed to warp to friend (not online)", [1.0, 0.0, 0.0, 1.0]);
      return;
    }
    if (where === "respawning") {
      flashServerMessage(player.id, "Failed to warp to friend (respawning)", [1.0, 0.0, 0.0, 1.0]);
      return;
    }
    if ((where as any).sectorKind === SectorKind.Tutorial) {
      flashServerMessage(player.id, "Failed to warp to friend (cannot warp into tutorial)", [1.0, 0.0, 0.0, 1.0]);
      return;
    }
    player.warping = 1;
    player.warpTo = where.sectorNumber;
    // Add the player to the mission
    if ((where as any).sectorKind === SectorKind.Mission) {
      const mission = await Mission.findOneAndUpdate(
        { sectorNumber: where.sectorNumber, inProgress: true, assignee: { $ne: player.id }, forFaction: player.team },
        { $addToSet: { coAssignees: player.id } }
      );
      if (!mission) {
        flashServerMessage(player.id, "Unable to join mission", [1.0, 0.0, 0.0, 1.0]);
      } else {
        flashServerMessage(player.id, "Joined mission: " + mission.name, [0.0, 1.0, 0.0, 1.0]);
        if (mission.targetId) {
          setMissionTargetForId(player.id, mission.targetId);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
};

export { FriendRequest, IFriendRequest, canFriendRequest, createFriendRequest, revokeFriendRequest, unfriend, friendWarp };
