import { copyPlayer, effectiveInfinity, equip, mapSize, Player, randomAsteroids, sectorBounds, TutorialStage } from "../src/game";
import { WebSocket } from "ws";
import { clients, saveCheckpoint, sectors, tutorialRespawnPoints, uid } from "./state";
import { defMap, Faction } from "../src/defs";
import { addTutorialRoamingVenture, addTutorialStrafer, NPC } from "../src/npc";
import { discoverRecipe } from "./inventory";

const spawnTutorialStation = (ws: WebSocket) => {
  const client = clients.get(ws);
  if (client) {
    const sector = sectors.get(client.currentSector);
    if (sector) {
      const player = tutorialRespawnPoints.get(client.id);
      if (player) {
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
          isPC: true,
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
              const npc = addTutorialRoamingVenture(state, uid(), player.position);
              (npc as NPC).killed = () => {
                const client = clients.get(ws);
                if (client) {
                  client.inTutorial = TutorialStage.SwitchSecondary;
                  sendTutorialStage(ws, TutorialStage.SwitchSecondary);
                  const state = sectors.get(client.currentSector);
                  if (state) {
                    const player = state.players.get(client.id);
                    if (player) {
                      state.players.set(client.id, equip(player, 1, "Javelin Missile", true));
                    }
                  }
                }
              };
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
            const player = state.players.get(client.id);
            if (player) {
              const npc = addTutorialStrafer(state, uid(), player.position);
              (npc as NPC).killed = () => {
                {
                  const client = clients.get(ws);
                  if (client) {
                    client.inTutorial = TutorialStage.Dock;
                    sendTutorialStage(ws, TutorialStage.Dock);
                    spawnTutorialStation(ws);
                  }
                }
              };
              client.tutorialNpc = npc;
              const equippedPlayer = equip(player, 2, "Laser Beam", true);
              state.players.set(client.id, equippedPlayer);
              tutorialRespawnPoints.set(client.id, copyPlayer(equippedPlayer));
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
    case TutorialStage.Dock:
      {
        const client = clients.get(ws);
        if (client) {
          const player = tutorialRespawnPoints.get(id);
          discoverRecipe(ws, client.id, "Refined Prifetium");
          if (player) {
            client.sectorsVisited.add(player.team === Faction.Alliance ? 12 : 15);
          }
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
          const player = tutorialRespawnPoints.get(id);
          if (player) {
            client.sectorsVisited.add(player.team === Faction.Alliance ? 12 : 15);
          }
        }
      }
      return TutorialStage.Map;
    case TutorialStage.Map:
      {
        const client = clients.get(ws);
        if (client && client.currentSector < mapSize * mapSize) {
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

export { advanceTutorialStage, sendTutorialStage };
