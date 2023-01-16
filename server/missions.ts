/* 
Some words on how missions work:

 - Missions are generated for every player and live in the database when the player wants to view their available missions.
 - There will always be at least some number available (this number is currently in the routes file under the /getMissions endpoint).
 - Once a player selects a mission it is marked as selected in the database.
 - Once the player wants to start a mission the sector for the mission is created and added to the sector list for running the game update loop.
 - At that point the mission is marked as in progress in the database.
 - Upon mission completion the reward is given out and the mission is marked as completed in the database.
 - There is a cleanup timeout that periodically checks to see if the mission sector can be removed from the sector list.
 - If the mission sector is no longer accessible then it is removed from the sector list and the mission is marked as failed in the database if it was not completed.

*/

import { clientUid, Faction, randomDifferentFaction } from "../src/defs";
import { GlobalState, MissionType, Player, SectorKind } from "../src/game";
import mongoose, { HydratedDocument } from "mongoose";
import { getPlayerFromId, sectors, sectorTriggers, uid } from "./state";
import { WebSocket } from "ws";
import { enemyCountState, flashServerMessage, sendMissionComplete, setMissionTargetForId } from "./stateHelpers";
import { clearanceNPCsRewards, randomClearanceShip, spawnClearanceNPCs } from "./npcs/clearance";
import { spawnAssassinationNPC } from "./npcs/assassination";
import { awareSectors, makeNetworkAware, removeNetworkAwareness } from "./peers";
import { createIsolatedSector, removeContiguousSubgraph } from "../src/sectorGraph";
import { mapGraph } from "../src/mapLayout";

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
  coAssignees: number[];
  sector?: number;
  clearanceShips: string[];
  targetId?: number;
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
  coAssignees: { type: [Number], default: [] },
  sector: { type: Number, required: false },
  clearanceShips: { type: [String], default: [] },
  targetId: { type: Number, required: false },
});

const Mission = mongoose.model<IMission>("Mission", missionSchema);

const clearanceMission = (assignee: number, forFaction: Faction) => {
  const shipCount = Math.floor(Math.random() * 3) + 1;

  const ships: string[] = [];
  let reward = 0;

  for (let i = 0; i < shipCount; i++) {
    const ship = randomClearanceShip();
    ships.push(ship);
    reward += clearanceNPCsRewards.get(ship) || 0;
  }

  return new Mission({
    name: "Clearance #" + clientUid().toString(),
    id: uid(),
    type: MissionType.Clearance,
    forFaction,
    reward,
    description: "Clear out the sector of enemy ships",
    assignee,
    clearanceShips: ships,
  });
};

const assassinationMission = (assignee: number, forFaction: Faction) => {
  const shipCount = Math.floor(Math.random() * 3) + 1;

  const ships: string[] = [];
  let reward = 0;

  for (let i = 0; i < shipCount; i++) {
    const ship = randomClearanceShip();
    ships.push(ship);
    reward += clearanceNPCsRewards.get(ship) || 0;
  }

  return new Mission({
    name: "Assassination #" + clientUid().toString(),
    id: uid(),
    type: MissionType.Assassination,
    forFaction,
    reward: 2000 + Math.floor(reward / 2),
    description: "Eliminate the target",
    assignee,
    targetId: uid(),
    clearanceShips: ships,
  });
};

const genMissions = async (assignee: number, forFaction: Faction, count: number, missions: HydratedDocument<IMission>[]) => {
  for (let i = 0; i < count; i++) {
    const mission = Math.random() > 0.5 ? assassinationMission(assignee, forFaction) : clearanceMission(assignee, forFaction);
    missions.push(await mission.save());
  }
  return missions;
};

const missionSectorCleanupInterval = 1000 * 60 * 60 * 3; // 3 hours

const removeMissionSector = (sectorId: number, missionId: number) => {
  const sectorNonNPCCount = Array.from(sectors.get(sectorId)?.players.values() || []).filter((p) => p.isPC).length;
  if (sectorNonNPCCount === 0) {
    sectors.delete(sectorId);
    removeNetworkAwareness(sectorId);
    // removeContiguousSubgraph(mapGraph, sectorId);
    sectorTriggers.delete(sectorId);
    failMissionIfIncomplete(missionId);
  } else {
    setTimeout(() => {
      removeMissionSector(sectorId, missionId);
    }, missionSectorCleanupInterval);
  }
};

const setupMissionSectorCleanup = (missionId: number, missionSector: number) => {
  setTimeout(() => {
    removeMissionSector(missionSector, missionId);
  }, missionSectorCleanupInterval);

  return missionSector;
};

const startMissionGameState = (player: Player, mission: HydratedDocument<IMission>, missionSectorId: number) => {
  const missionSector = setupMissionSectorCleanup(mission.id, missionSectorId);

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
    sectorKind: SectorKind.Mission,
  };
  
  makeNetworkAware(missionSectorId, SectorKind.Mission);
  // I don't need to add topology for single isolated sectors (will want to though if I go to torus wrapping single sectors)
  // createIsolatedSector(mapGraph, missionSectorId);
  
  sectors.set(missionSector, state);
  if (mission.type === MissionType.Clearance) {
    spawnClearanceNPCs(state, randomDifferentFaction(mission.forFaction), mission.clearanceShips);
    sectorTriggers.set(missionSector, (state: GlobalState) => {
      if (enemyCountState(mission.forFaction, state) === 0) {
        completeMission(mission.id);
        sectorTriggers.delete(missionSector);
      }
    });
  } else if (mission.type === MissionType.Assassination) {
    if (!mission.targetId) {
      console.log("Target ID missing for assassination mission");
      return;
    }
    const faction = randomDifferentFaction(mission.forFaction);
    spawnClearanceNPCs(state, faction, mission.clearanceShips);
    spawnAssassinationNPC(state, faction, mission.targetId!);
    sectorTriggers.set(missionSector, (state: GlobalState) => {
      if (!state.players.has(mission.targetId!)) {
        completeMission(mission.id);
        sectorTriggers.delete(missionSector);
      }
    });
  } else {
    console.log("Unsupported mission type: " + mission.type);
    return;
  }

  player.warping = 1;
  player.warpTo = missionSector;
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
    if (mission.targetId) {
      setMissionTargetForId(player.id, mission.targetId);
    }
    const missionSectorId = uid();
    mission.sector = missionSectorId;
    mission
      .save()
      .then(() => {
        startMissionGameState(player, mission, missionSectorId);
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
    for (const coAssignee of mission.coAssignees.concat([mission.assignee!])) {
      const coPlayer = getPlayerFromId(coAssignee);
      if (coPlayer) {
        coPlayer.credits = coPlayer.credits ? coPlayer.credits + mission.reward : mission.reward;
        sendMissionComplete(coPlayer.id, "You have completed mission: " + mission.name);
      }
    }
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
