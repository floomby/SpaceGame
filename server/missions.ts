import { clientUid, Faction } from "../src/defs";
import { GlobalState, MissionType, Player } from "../src/game";
import mongoose, { HydratedDocument } from "mongoose";
import { getPlayerFromId, sectors, sectorTriggers, uid } from "./state";
import { WebSocket } from "ws";
import { enemyCountState, flashServerMessage } from "./stateHelpers";

const Schema = mongoose.Schema;

interface IMission {
  name: string;
  id: number;
  type: MissionType;
  forFaction: Faction;
  reward: number;
  description: string;
  inProgress?: boolean;
  assignee?: number;
  completed?: boolean;
  assignedDate?: Date;
  completedDate?: Date;
}

const missionSchema = new Schema<IMission>({
  name: { type: String, required: true },
  id: { type: Number, required: true, min: 1, validate: Number.isInteger },
  type: { type: String, required: true },
  forFaction: { type: Number, required: true, min: 0, max: 2, validate: Number.isInteger },
  reward: { type: Number, required: true, min: 0 },
  description: { type: String, required: true },
  inProgress: { type: Boolean, required: false },
  assignee: { type: Number, required: false },
  completed: { type: Boolean, required: false },
  assignedDate: { type: Date, required: false },
  completedDate: { type: Date, required: false },
});

const Mission = mongoose.model<IMission>("Mission", missionSchema);

const genMissions = async () => {
  for (let fact of [Faction.Alliance, Faction.Confederation, Faction.Rogue]) {
    for (let i = 0; i < 3; i++) {
      const mission = new Mission({
        name: "Clearance of sector " + i,
        id: uid(),
        type: MissionType.Clearance,
        forFaction: fact,
        reward: 1000 + i * 100,
        description: "Clear out the sector of enemy ships",
      });
      await mission.save();
    }
  }
};

const removeMissionSector = (sectorId: number) => {
  const sectorNonNPCCount = Array.from(sectors.get(sectorId)?.players.values() || []).filter((p) => p.isPC).length;
  if (sectorNonNPCCount === 0) {
    sectors.delete(sectorId);
  } else {
    setTimeout(() => {
      sectors.delete(sectorId);
      sectorTriggers.delete(sectorId);
    }, 1000 * 60 * 60 * 3);
  }
};

const createTutorialSector = () => {
  let missionSector = uid();
  while (sectors.has(missionSector)) {
    missionSector = uid();
  }

  // Idk the right way to handle this (still didn't figure a good way out for the tutorial either)
  setTimeout(() => {
    removeMissionSector(missionSector);
  }, 1000 * 60 * 60 * 3);

  return missionSector;
};

const startMissionGameState = (player: Player, mission: HydratedDocument<IMission>) => {
  const missionSector = createTutorialSector();
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

const startPlayerInMission = (ws: WebSocket, player: Player, id: number, flashServerMessage: (id: number, message: string) => void) => {
  const mission = Mission.findOne({ id }, (err, mission: HydratedDocument<IMission>) => {
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
        ws.send(JSON.stringify({ type: "error", payload: { message: "Mission already assigned to another player" } }));
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
    mission.assignee = player.id;
    mission.assignedDate = new Date();
    flashServerMessage(player.id, "Starting mission: " + mission.name);
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

const assignMission = (ws: WebSocket, player: Player, missionId: number, flashServerMessage: (id: number, message: string) => void) => {
  const mission = Mission.findOneAndUpdate(
    { id: missionId, assignee: null, forFaction: player.team },
    { assignee: player.id, assignedDate: new Date() },
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
          ws.send(JSON.stringify({ type: "error", payload: { message: "Mission not found or no longer valid" } }));
        } catch (e) {
          console.trace(e);
        }
        return;
      }
      flashServerMessage(player.id, "You have been assigned mission: " + mission.name);
    }
  );
};

const completeMission = (id: number) => {
  Mission.findOneAndUpdate({ id }, { completed: true, completedDate: new Date() }, (err, mission: HydratedDocument<IMission>) => {
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
    flashServerMessage(player.id, "You have completed mission: " + mission.name);
  });
};



export { Mission, genMissions, MissionType, startPlayerInMission, assignMission };
