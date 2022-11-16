import { copyPlayer, equip, mapSize, randomAsteroids, sectorBounds, TutorialStage } from "../src/game";
import { WebSocket } from "ws";
import { clients, saveCheckpoint, sectors, tutorialRespawnPoints, uid } from "./state";
import { Faction } from "../src/defs";
import { addTutorialRoamingVenture, addTutorialStrafer, NPC } from "../src/npc";

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
            const npc = addTutorialRoamingVenture(state, uid());
            (npc as NPC).killed = () => {
              client.inTutorial = TutorialStage.SwitchSecondary;
              sendTutorialStage(ws, TutorialStage.SwitchSecondary);
            };
          }
        }
      }
      return TutorialStage.Kill;
    case TutorialStage.SwitchSecondary:
      {
        const client = clients.get(ws);
        if (client) {
          const state = sectors.get(client.currentSector);
          if (state) {
            const player = state.players.get(client.id);
            if (player) {
              state.players.set(client.id, equip(player, 1, "Javelin Missile", true));
            }
          }
        }
      }
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
                const asteroids = randomAsteroids(20, boundsAround, client.currentSector, uid, [{ resource: "Prifecite", density: 1 }]);
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
            const npc = addTutorialStrafer(state, uid());
            (npc as NPC).killed = () => {
              {
                const client = clients.get(ws);
                if (client) {
                  client.inTutorial = TutorialStage.Map;
                  sendTutorialStage(ws, TutorialStage.Map);
                  const player = sectors.get(client.currentSector)?.players.get(id);
                  if (player) {
                    client.sectorsVisited.add(player.team === Faction.Alliance ? 12 : 15);
                  }
                }
              }
            };
            client.tutorialNpc = npc;
            const player = state.players.get(client.id);
            if (player) {
              state.players.set(client.id, equip(player, 2, "Laser Beam", true));
              tutorialRespawnPoints.set(client.id, copyPlayer(player));
            }
          }
        }
      }
      return TutorialStage.TargetEnemy;
    case TutorialStage.TargetEnemy:
      {
        const client = clients.get(ws);
        if (client) {
          (client.tutorialNpc as any).doNotShootYet = false;
        }
      }
      return TutorialStage.LaserBeam;
    case TutorialStage.Map:
      {
        const client = clients.get(ws);
        if (client && client.currentSector < mapSize * mapSize) {
          const state = sectors.get(client.currentSector);
          if (state) {
            const player = state.players.get(client.id);
            if (player) {
              const playerData = JSON.stringify(player);
              saveCheckpoint(client.id, client.currentSector, playerData, client.sectorsVisited);
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

export { advanceTutorialStage, sendTutorialStage };
