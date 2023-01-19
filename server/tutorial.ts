import { copyPlayer, effectiveInfinity, equip, Player, randomAsteroids, sectorBounds, TutorialStage } from "../src/game";
import { WebSocket } from "ws";
import { clients, getTutorialNpc, saveCheckpoint, sectors, uid } from "./state";
import { defMap, Faction } from "../src/defs";
import { addTutorialRoamingVenture, addTutorialStrafer, NPC } from "./npcs/npc";
import { discoverRecipe, updateClientRecipes } from "./inventory";
import { mapHeight, mapWidth } from "../src/mapLayout";
import { transferableActionsMap } from "./transferableActions";
import mongoose from "mongoose";
import { playerSectors } from "./peers";

interface ITutorialRespawn {
  id: number;
  data: string;
  time: Date;
  sector: number;
}

const TutorialRespawn = mongoose.model<ITutorialRespawn>(
  "TutorialRespawn",
  new mongoose.Schema({
    id: {
      type: Number,
      required: true,
    },
    data: {
      type: String,
      required: true,
    },
    time: {
      type: Date,
      required: true,
      expires: "1d",
    },
    sector: {
      type: Number,
      required: true,
    },
  })
);

const saveTutorialRespawn = (player: Player) => {
  const id = player.id;
  const data = JSON.stringify(player);
  const sector = playerSectors.get(id);
  TutorialRespawn.findOneAndUpdate({ id }, { id, data, time: new Date(), sector }, { upsert: true }, (err) => {
    if (err) {
      console.error("Unable to save tutorial respawn point", err);
    }
  });
};

const spawnTutorialStation = async (ws: WebSocket) => {
  const client = clients.get(ws);
  if (client) {
    const sector = sectors.get(client.currentSector);
    if (sector) {
      const save = await TutorialRespawn.findOne({ id: client.id });
      if (save) {
        const player = JSON.parse(save.data);
        const def = (player.team === Faction.Alliance ? defMap.get("Alliance Starbase") : defMap.get("Confederacy Starbase"))!;
        const station: Player = {
          position: { x: 0, y: 0 },
          radius: def?.def.radius,
          speed: 0,
          heading: 0,
          health: def.def.health,
          id: uid(),
          sinceLastShot: [effectiveInfinity, effectiveInfinity, effectiveInfinity, effectiveInfinity],
          energy: def.def.energy,
          defIndex: def.index,
          arms: [],
          slotData: [],
          team: player.team,
          side: 0,
          v: { x: 0, y: 0 },
          iv: { x: 0, y: 0 },
          ir: 0,
        };
        sector.players.set(station.id, station);
      }
    }
  }
};

const advanceTutorialStage = (id: number, stage: TutorialStage, ws: WebSocket) => {
  switch (stage) {
    case TutorialStage.Move:
      return TutorialStage.Strafe;
    case TutorialStage.Strafe:
      return TutorialStage.Shoot;
    case TutorialStage.Shoot:
      {
        const client = clients.get(ws);
        if (client) {
          const state = sectors.get(client.currentSector);
          if (state) {
            const player = state.players.get(id);
            if (player) {
              addTutorialRoamingVenture(state, uid(), player.position);
              state.sectorChecks?.push({ index: transferableActionsMap.get("tutorialVenture")!, data: { id } });
            }
          }
        }
      }
      return TutorialStage.Kill;
    case TutorialStage.SwitchSecondary:
      return TutorialStage.FireJavelin;
    case TutorialStage.FireJavelin:
      {
        const client = clients.get(ws);
        if (client) {
          const state = sectors.get(client.currentSector);
          if (state) {
            const player = state.players.get(client.id);
            if (player) {
              state.players.set(client.id, equip(player, 0, "Basic Mining Laser", true));
            }
          }
          setTimeout(() => {
            const state = sectors.get(client.currentSector);
            if (state) {
              const player = state.players.get(client.id);
              if (player) {
                const boundsAround = { x: player.position.x - 1000, y: player.position.y - 1000, width: 2000, height: 2000 };
                const asteroids = randomAsteroids(20, boundsAround, client.currentSector, uid, [{ resource: "Prifecite", density: 1 }], []);
                for (const asteroid of asteroids) {
                  state.asteroids.set(asteroid.id, asteroid);
                }
                state.asteroidsDirty = true;
              }
            }
          }, 2000);
        }
      }
      return TutorialStage.SelectAsteroid;
    case TutorialStage.SelectAsteroid:
      return TutorialStage.CollectResources;
    case TutorialStage.CollectResources:
      {
        const client = clients.get(ws);
        if (client) {
          const state = sectors.get(client.currentSector);
          if (state) {
            const player = state.players.get(client.id);
            if (player) {
              const npc = addTutorialStrafer(state, uid(), player.position);
              client.tutorialNpc = npc;
              npc.player.doNotShootYet = true;
              state.sectorChecks?.push({ index: transferableActionsMap.get("tutorialStrafer")!, data: { id } });
              const equippedPlayer = equip(player, 2, "Laser Beam", true);
              state.players.set(client.id, equippedPlayer);
              saveTutorialRespawn(equippedPlayer);
            }
          }
        }
      }
      return TutorialStage.TargetEnemy;
    case TutorialStage.TargetEnemy:
      {
        const client = clients.get(ws);
        if (client) {
          const state = sectors.get(client.currentSector);
          if (state) {
            const npc = getTutorialNpc(client, state);
            if (npc) {
              npc.player.doNotShootYet = false;
            }
          }
        }
      }
      return TutorialStage.LaserBeam;
    case TutorialStage.Dock:
      {
        const client = clients.get(ws);
        if (client) {
          updateClientRecipes(ws, client.id);
          discoverRecipe(ws, client.id, "Refined Prifetium");
        }
      }
      return TutorialStage.Deposit;
    case TutorialStage.Deposit:
      return TutorialStage.Manufacture1;
    case TutorialStage.Manufacture1:
      return TutorialStage.Manufacture2;
    case TutorialStage.Manufacture2:
      return TutorialStage.BuyMines;
    case TutorialStage.BuyMines:
      return TutorialStage.Undock;
    case TutorialStage.Undock:
      return TutorialStage.UseMines;
    case TutorialStage.UseMines:
      {
        const client = clients.get(ws);
        if (client) {
          const state = sectors.get(client.currentSector);
          if (state) {
            const player = state.players.get(client.id);
            if (player) {
              client.sectorsVisited.add(player.team === Faction.Alliance ? 12 : 15);
            }
          }
        }
      }
      return TutorialStage.Map;
    case TutorialStage.Map:
      {
        const client = clients.get(ws);
        if (client && client.currentSector < mapWidth * mapHeight) {
          const state = sectors.get(client.currentSector);
          if (state) {
            const player = state.players.get(client.id);
            if (player) {
              saveCheckpoint(client.id, client.currentSector, player, client.sectorsVisited);
            }
          }
        }
      }
      return TutorialStage.Done;
    case TutorialStage.Done:
      console.log("Warning: Tutorial already complete");
      return TutorialStage.Done;
    default:
      console.log("Warning: Unexpected tutorial stage " + stage);
      return stage;
  }
};

const sendTutorialStage = (ws: WebSocket, stage: TutorialStage) => {
  ws.send(JSON.stringify({ type: "tutorialStage", payload: stage }));
};

export { advanceTutorialStage, sendTutorialStage, spawnTutorialStation, saveTutorialRespawn, TutorialRespawn, ITutorialRespawn };
