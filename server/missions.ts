/* 
Some words on how missions work:

 - Missions are generated for every player and live in the database when the player wants to view their available missions.
 - There will always be at least some number available (this number is currently in the routes file under the /getMissions endpoint).
 - Once a player selects a mission it is marked as selected in the database.
 - Once the player wants to start a mission the sector for the mission is created and added to the sector list for running the game update loop.
 - At that point the mission is marked as in progress in the database.
 - Upon mission completion the reward is given out and the mission is marked as completed in the database.

*/

import { clientUid, Faction, randomDifferentFaction } from "../src/defs";
import { GlobalState, MissionType, Player } from "../src/game";
import mongoose, { HydratedDocument } from "mongoose";
import { getPlayerFromId, sectors, sectorTriggers, uid } from "./state";
import { WebSocket } from "ws";
import { enemyCountState, flashServerMessage, sendMissionComplete } from "./stateHelpers";
import { spawnClearanceNPCs } from "./npcs/clearance";

const Schema = mongoose.Schema;

interface IMission {
  name: string;
  id: number;
  type: MissionType;
  forFaction: Faction;
  reward: number;
  description: string;
  assignee: number;
  selected?: boolean;
  inProgress?: boolean;
  completed?: boolean;
  startDate?: Date;
  completedDate?: Date;
  failed?: boolean;
  failedDate?: Date;
}

const missionSchema = new Schema<IMission>({
  name: { type: String, required: true },
  id: { type: Number, required: true, min: 1, validate: Number.isInteger },
  type: { type: String, required: true },
  forFaction: { type: Number, required: true, min: 0, max: 2, validate: Number.isInteger },
  reward: { type: Number, required: true, min: 0 },
  description: { type: String, required: true },
  assignee: { type: Number, required: true },
  selected: { type: Boolean, required: false },
  inProgress: { type: Boolean, required: false },
  completed: { type: Boolean, required: false },
  startDate: { type: Date, required: false },
  completedDate: { type: Date, required: false },
  failed: { type: Boolean, required: false },
  failedDate: { type: Date, required: false },
});

const Mission = mongoose.model<IMission>("Mission", missionSchema);

const genMissions = async (assignee: number, forFaction: Faction, count: number, missions: HydratedDocument<IMission>[]) => {
  for (let i = 0; i < count; i++) {
    const mission = new Mission({
      name: "Clearance #" + clientUid().toString(),
      id: uid(),
      type: MissionType.Clearance,
      forFaction,
      reward: 1000 + i * 100,
      description: "Clear out the sector of enemy ships",
      assignee,
    });
    missions.push(await mission.save());
  }
  return missions;
};

const missionSectorCleanupInterval = 1000 * 60 * 60 * 3; // 3 hours

const removeMissionSector = (sectorId: number, missionId: number) => {
  const sectorNonNPCCount = Array.from(sectors.get(sectorId)?.players.values() || []).filter((p) => p.isPC).length;
  if (sectorNonNPCCount === 0) {
    sectors.delete(sectorId);
    sectorTriggers.delete(sectorId);
    failMissionIfIncomplete(missionId);
  } else {
    setTimeout(() => {
      removeMissionSector(sectorId, missionId);
    }, missionSectorCleanupInterval);
  }
};

const setupMissionSectorCleanup = (missionId) => {
  let missionSector = uid();
  while (sectors.has(missionSector)) {
    missionSector = uid();
  }

  setTimeout(() => {
    removeMissionSector(missionSector, missionId);
  }, missionSectorCleanupInterval);

  return missionSector;
};

const startMissionGameState = (player: Player, mission: HydratedDocument<IMission>) => {
  const missionSector = setupMissionSectorCleanup(mission.id);
  player.warping = 1;
  player.warpTo = missionSector;

  const state = {
    players: new Map(),
    projectiles: new Map(),
    asteroids: new Map(),
    missiles: new Map(),
    collectables: new Map(),
    asteroidsDirty: false,
    mines: new Map(),
    projectileId: 1,
    delayedActions: [],
  };

  sectors.set(missionSector, state);
  if (mission.type === MissionType.Clearance) {
    spawnClearanceNPCs(state, randomDifferentFaction(mission.forFaction), ["Fighter", "Maintainer"]);
    sectorTriggers.set(missionSector, (state: GlobalState) => {
      if (enemyCountState(mission.forFaction, state) === 0) {
        completeMission(mission.id);
        sectorTriggers.delete(missionSector);
      }
    });
  } else {
    console.log("Unsupported mission type: " + mission.type);
  }
};

const startPlayerInMission = (ws: WebSocket, player: Player, id: number) => {
  Mission.findOne({ id }, (err, mission: HydratedDocument<IMission>) => {
    if (err) {
      console.log(err);
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Error starting mission" } }));
      } catch (e) {
        console.trace(e);
      }
      return;
    }
    if (!mission) {
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Mission not found" } }));
      } catch (e) {
        console.trace(e);
      }
      return;
    }
    if (!mission.selected) {
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Mission has not yet been selected" } }));
      } catch (e) {
        console.trace(e);
      }
      return;
    }
    if (mission.completed) {
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Mission already completed" } }));
      } catch (e) {
        console.trace(e);
      }
      return;
    }
    if (mission.inProgress) {
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Mission already in progress" } }));
      } catch (e) {
        console.trace(e);
      }
      return;
    }
    if (mission.assignee && mission.assignee !== player.id) {
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Mission assigned to another player" } }));
      } catch (e) {
        console.trace(e);
      }
      return;
    }
    if (mission.forFaction !== player.team) {
      try {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Mission not for your faction" } }));
      } catch (e) {
        console.trace(e);
      }
      return;
    }
    mission.inProgress = true;
    flashServerMessage(player.id, "Starting mission: " + mission.name, [0.0, 1.0, 0.0, 1.0]);
    mission
      .save()
      .then(() => {
        startMissionGameState(player, mission);
      })
      .catch((e) => {
        console.trace(e);
      });
  });
};

const selectMission = (ws: WebSocket, player: Player, missionId: number) => {
  Mission.findOneAndUpdate(
    { id: missionId, assignee: player.id, forFaction: player.team },
    { selected: true },
    (err, mission: HydratedDocument<IMission>) => {
      if (err) {
        console.log(err);
        try {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Error assigning mission" } }));
        } catch (e) {
          console.trace(e);
        }
        return;
      }
      if (!mission) {
        try {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Valid mission not found" } }));
        } catch (e) {
          console.trace(e);
        }
        return;
      }
      flashServerMessage(player.id, "You have selected mission: " + mission.name);
    }
  );
};

const completeMission = (id: number) => {
  Mission.findOneAndUpdate({ id }, { completed: true, completedDate: new Date(), inProgress: false }, (err, mission: HydratedDocument<IMission>) => {
    if (err) {
      console.log(err);
      return;
    }
    if (!mission) {
      return;
    }
    const player = getPlayerFromId(mission.assignee!);
    if (!player) {
      return;
    }
    player.credits = player.credits ? player.credits + mission.reward : mission.reward;
    sendMissionComplete(player.id, "You have completed mission: " + mission.name);
  });
};

const failMissionIfIncomplete = (id: number) => {
  Mission.findOneAndUpdate(
    { id, completed: { $ne: true } },
    { failed: true, failedDate: new Date(), inProgress: false },
    (err, mission: HydratedDocument<IMission>) => {
      if (err) {
        console.log(err);
        return;
      }
    }
  );
};

export { Mission, genMissions, MissionType, startPlayerInMission, selectMission };
