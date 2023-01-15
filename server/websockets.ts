import { appendFile } from "fs";
import { createServer } from "http";
import https from "https";
import { inspect } from "util";
import { WebSocketServer, WebSocket } from "ws";
import { useSsl } from "../src/config";
import { armDefs, ArmUsage, defs, Faction } from "../src/defs";
import {
  applyUndockingOffset,
  canDock,
  canRepair,
  CloakedState,
  copyPlayer,
  equip,
  isNearOperableEnemyStation,
  maxNameLength,
  Player,
  purchaseShip,
  removeAtMostCargo,
  removeCargoFractions,
  SectorInfo,
  TargetKind,
  TutorialStage,
} from "../src/game";
import { mapHeight, mapWidth } from "../src/mapLayout";
import { Checkpoint, Station, User } from "./dataModels";
import { createFriendRequest, friendWarp, revokeFriendRequest, unfriend } from "./friends";
import {
  compositeManufacture,
  depositCargo,
  depositItemsIntoInventory,
  manufacture,
  sellInventory,
  sendInventory,
  transferToShip,
} from "./inventory";
import { assignPlayerIdToConnection, logWebSocketConnection } from "./logging";
import { market } from "./market";
import { setupPlayer } from "./misc";
import { selectMission, startPlayerInMission } from "./missions";
import { waitingData } from "./peers";
import { respawnPlayer, spawnPlayer } from "./server";
import { hash, sniCallback, wsPort } from "./settings";
import {
  clients,
  deserializeClientData,
  idToWebsocket,
  knownRecipes,
  saveCheckpoint,
  secondaries,
  secondariesToActivate,
  // sectorAsteroidResources,
  sectorList,
  sectors,
  targets,
  tutorialRespawnPoints,
  uid,
} from "./state";
import { allyCount, enemyCount, flashServerMessage } from "./stateHelpers";
import { advanceTutorialStage, sendTutorialStage } from "./tutorial";

export function startWebSocketServer(wsPort: number) {
  // Websocket server stuff
  let server: ReturnType<typeof createServer> | https.Server;
  if (useSsl) {
    server = new https.Server({ SNICallback: sniCallback });
  } else {
    server = createServer();
  }

  // Websocket stuff (TODO Move to its own file)
  const wss = new WebSocketServer({ server });

  // TODO Need to go over this carefully, checking to make sure that malicious clients can't do anything bad
  wss.on("connection", (ws, req) => {
    (ws as any).isAlive = true;

    const ipAddr = req.socket.remoteAddress;

    logWebSocketConnection(ipAddr);

    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === "heartbeat") {
          (ws as any).isAlive = true;
          return;
        } else if (data.type === "serverHopKey") {
          const key = data.payload.key;
          deserializeClientData(ws, waitingData.get(key)!);
        } else if (data.type === "login") {
          const name = data.payload.name;
          const password = data.payload.password;

          const hashedPassword = hash(password);

          // Check if the user is in the database
          User.findOne({ name, password: hashedPassword }, (err, user) => {
            if (err) {
              ws.send(JSON.stringify({ type: "loginFail", payload: { error: "Database error" } }));
              console.log(err);
              return;
            }
            if (!user) {
              ws.send(JSON.stringify({ type: "loginFail", payload: { error: "Username/password combination not found" } }));
              return;
            }

            if (idToWebsocket.has(user.id)) {
              ws.send(JSON.stringify({ type: "loginFail", payload: { error: "User already logged in" } }));
              return;
            }

            idToWebsocket.set(user.id, ws);

            assignPlayerIdToConnection(ipAddr, user.id);
            
            if (!user.sectorsVisited) {
              if (user.currentSector >= 0 && user.currentSector < mapWidth * mapHeight) {
                user.sectorsVisited = [user.currentSector];
              } else {
                user.sectorsVisited = [];
              }
            }
            const sectorsVisited: Set<number> = new Set(user.sectorsVisited);
            if (user.currentSector >= 0 && user.currentSector < mapWidth * mapHeight) {
              sectorsVisited.add(user.currentSector);
            }

            user.loginCount++;
            user.loginTimes.push(Date.now());
            try {
              user.save();
            } catch (err) {
              console.log(err);
            }

            Checkpoint.findOne({ id: user.id }, (err, checkpoint) => {
              if (err) {
                ws.send(JSON.stringify({ type: "loginFail", payload: { error: "Database error" } }));
                console.log(err);
                return;
              }
              if (!checkpoint) {
                setupPlayer(user.id, ws, name, user.faction);
              } else {
                clients.set(ws, {
                  id: user.id,
                  name,
                  input: { up: false, down: false, primary: false, secondary: false, right: false, left: false },
                  angle: 0,
                  currentSector: checkpoint.sector,
                  lastMessage: "",
                  lastMessageTime: Date.now(),
                  sectorsVisited,
                  inTutorial: TutorialStage.Done,
                });
                targets.set(user.id, [TargetKind.None, 0]);
                secondaries.set(user.id, 0);
                secondariesToActivate.set(user.id, []);
                knownRecipes.set(user.id, new Set(user.recipesKnown));

                const playerState = JSON.parse(checkpoint.data) as Player;
                // All these "fixes" are for making old checkpoints work with new code
                // Update the player on load to match what is expected
                if (playerState.defIndex === undefined) {
                  playerState.defIndex = (playerState as any).definitionIndex;
                  (playerState as any).definitionIndex = undefined;
                }
                // fix the cargo
                if (playerState.cargo === undefined || playerState.cargo.some((c) => !Number.isInteger(c.amount))) {
                  playerState.cargo = [{ what: "Teddy Bears", amount: 30 }];
                }
                // fix the credits
                if (playerState.credits === undefined) {
                  playerState.credits = 500;
                }
                playerState.credits = Math.round(playerState.credits);
                // fix the slot data
                const def = defs[playerState.defIndex];
                while (playerState.slotData.length < def.slots.length) {
                  playerState.arms.push(def.slots[playerState.slotData.length]);
                  playerState.slotData.push({});
                }
                // fix the impulse
                if (playerState.ir === undefined) {
                  playerState.ir = 0;
                }
                if (playerState.iv === undefined) {
                  playerState.iv = { x: 0, y: 0 };
                }
                // fix the health and energy
                if (playerState.health > def.health) {
                  playerState.health = def.health;
                }
                if (playerState.energy > def.energy) {
                  playerState.energy = def.energy;
                }
                (playerState as any).projectileId = undefined;
                // fix the arms
                if (playerState.arms === undefined) {
                  playerState.arms = (playerState as any).armIndices;
                  (playerState as any).armIndices = undefined;
                }
                playerState.v = { x: 0, y: 0 };

                spawnPlayer(ws, playerState, checkpoint.sector);
                // log to file
                appendFile("log", `${new Date().toISOString()} ${name} logged in\n`, (err) => {
                  if (err) {
                    console.log(err);
                  }
                });
              }
            });
          });
        } else if (data.type === "register") {
          const name = data.payload.name;
          const password = data.payload.password;
          const faction = data.payload.faction;

          // Check if the user is in the database
          User.findOne({ name }, (err, user) => {
            if (err) {
              ws.send(JSON.stringify({ type: "registerFail", payload: { error: "Database error" } }));
              console.log(err);
              return;
            }
            if (user) {
              ws.send(JSON.stringify({ type: "registerFail", payload: { error: "Username already taken" } }));
              return;
            }
            if (name.length > maxNameLength) {
              ws.send(JSON.stringify({ type: "registerFail", payload: { error: "Username too long" } }));
              return;
            }
            User.create({ name, password: hash(password), faction, id: uid(), loginTimes: [Date.now()] }, (err, user) => {
              if (err) {
                ws.send(JSON.stringify({ type: "registerFail", payload: { error: "Database error" } }));
                console.log(err);
                return;
              }
              setupPlayer(user.id, ws, name, faction);
              idToWebsocket.set(user.id, ws);

              assignPlayerIdToConnection(ipAddr, user.id);
            });
          });
        } else if (data.type === "input") {
          const client = clients.get(ws);
          if (client) {
            client.input = data.payload.input;
          } else {
            console.log("Warning: Input data from unknown client");
          }
        } else if (data.type === "angle") {
          const client = clients.get(ws);
          if (client) {
            client.angle = data.payload.angle;
          } else {
            console.log("Warning: Angle data from unknown client");
          }
        } else if (data.type === "dock") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player) {
              if (player.docked) {
                return;
              }
              removeCargoFractions(player);
              const station = state.players.get(data.payload.stationId);
              if (canDock(player, station, false)) {
                const def = defs[player.defIndex];
                player.docked = data.payload.stationId;
                player.heading = 0;
                player.speed = 0;
                player.side = 0;
                player.energy = def.energy;
                player.health = def.health;
                player.warping = 0;
                player.ir = 0;
                player.iv.x = 0;
                player.iv.y = 0;
                player.cloak = CloakedState.Uncloaked;
                player.position = { x: station!.position.x, y: station!.position.y };
                for (let i = 0; i < player.arms.length; i++) {
                  const armDef = armDefs[player.arms[i]];
                  if (armDef && armDef.usage === ArmUsage.Ammo) {
                    player.slotData[i].ammo = armDef.maxAmmo;
                  }
                }

                state.players.set(client.id, player);

                if (!client.inTutorial) {
                  saveCheckpoint(client.id, client.currentSector, player, client.sectorsVisited);
                } else {
                  tutorialRespawnPoints.set(client.id, copyPlayer(player));
                }
              }
            }
          }
        } else if (data.type === "undock") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player) {
              player.docked = undefined;
              applyUndockingOffset(player);
              state.players.set(client.id, player);

              if (!client.inTutorial) {
                saveCheckpoint(client.id, client.currentSector, player, client.sectorsVisited);
              } else {
                tutorialRespawnPoints.set(client.id, copyPlayer(player));
              }
            }
          }
        } else if (data.type === "repair") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player) {
              const station = state.players.get(data.payload.station)!;
              if (canRepair(player, station, false)) {
                if (!station.repairs || station.repairs.length !== Faction.Count) {
                  console.log(`Warning: Station repairs array is not correctly initialized (${station.id})`);
                } else {
                  const stationDef = defs[station.defIndex];
                  const repairsNeeded = stationDef.repairsRequired! - station.repairs[player.team];
                  const amountRepaired = removeAtMostCargo(player, "Spare Parts", repairsNeeded);
                  station.repairs[player.team] += amountRepaired;
                }
              }
            }
          }
        } else if (data.type === "respawn") {
          const client = clients.get(ws);
          if (client) {
            if (client.inTutorial) {
              const state = sectors.get(client.currentSector);
              if (state) {
                const playerState = tutorialRespawnPoints.get(client.id);
                if (playerState) {
                  state.players.set(client.id, copyPlayer(playerState));
                } else {
                  ws.send(JSON.stringify({ type: "error", payload: { message: "Missing tutorial respawn checkpoint" } }));
                }
              } else {
                ws.send(JSON.stringify({ type: "error", payload: { message: "Tutorial sector invalid" } }));
              }
              return;
            }
            Checkpoint.findOne({ id: client.id }, (err, checkpoint) => {
              if (err) {
                ws.send(JSON.stringify({ type: "error", payload: { message: "Server error loading checkpoint" } }));
                console.log("Error loading checkpoint: " + err);
                return;
              }
              if (!checkpoint) {
                ws.send(JSON.stringify({ type: "error", payload: { message: "Checkpoint not found" } }));
                console.log("Error loading checkpoint: " + err);
                return;
              }
              client.currentSector = checkpoint.sector;
              const playerState = JSON.parse(checkpoint.data) as Player;
              respawnPlayer(ws, playerState, checkpoint.sector);
            });
          }
        } else if (data.type === "target") {
          const client = clients.get(ws);
          if (client) {
            targets.set(client.id, data.payload.target);
          }
        } else if (data.type === "secondary") {
          const client = clients.get(ws);
          if (client) {
            if (typeof data.payload.secondary === "number" && data.payload.secondary >= 0) {
              secondaries.set(client.id, data.payload.secondary);
            }
          }
        } else if (data.type === "secondaryActivation") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player) {
              if (typeof data.payload.secondary === "number" && data.payload.secondary < player.arms.length && data.payload.secondary >= 0) {
                secondariesToActivate.get(client.id)?.push(data.payload.secondary);
              }
            }
          }
        } else if (data.type === "sellCargo") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player && player.cargo) {
              if (player.credits === undefined) {
                player.credits = 0;
              }
              const price = market.get(data.payload.what);
              if (price) {
                player.credits += removeAtMostCargo(player, data.payload.what, Math.round(data.payload.amount)) * price;
              }
            }
          }
        } else if (data.type === "transferToShip") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player) {
              transferToShip(ws, player, data.payload.what, Math.round(data.payload.amount), flashServerMessage);
            }
          }
        } else if (data.type === "sellInventory") {
          const client = clients.get(ws);
          if (client) {
            const player = sectors.get(client.currentSector)!.players.get(client.id);
            if (player) {
              sellInventory(ws, player, data.payload.what, Math.round(data.payload.amount));
            }
          }
        } else if (data.type === "depositCargo") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player && player.cargo) {
              depositCargo(player, data.payload.what, Math.round(data.payload.amount), ws);
            }
          }
        } else if (data.type === "dumpCargo") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player && player.cargo) {
              removeAtMostCargo(player, data.payload.what, Math.round(data.payload.amount));
            }
          }
        } else if (data.type === "equip") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player) {
              // equip does the bounds checking for the index for us
              let newPlayer = equip(player, data.payload.slotIndex, data.payload.what, data.payload.fromInventory);
              if (newPlayer !== player) {
                state.players.set(client.id, newPlayer);
                const toTake = data.payload.fromInventory ? [armDefs[newPlayer.arms[data.payload.slotIndex]].name] : [];
                // There is technically a bug here, if the player equips and then logs off, but the database has an error after they log off then
                // they what is deposited will be lost. I don't want to deal with it though (the correct thing is to pull their save from the database
                // and deal with it that way, but if we just had a database error this is unlikely to work anyways)
                depositItemsIntoInventory(ws, player, [armDefs[player.arms[data.payload.slotIndex]].name], toTake, flashServerMessage, () => {
                  console.log("Error depositing armament into inventory, reverting player");
                  try {
                    const otherState = sectors.get(clients.get(idToWebsocket.get(player.id)!)!.currentSector)!;
                    otherState.players.set(player.id, player);
                  } catch (e) {
                    console.log("Warning: unable to revert player" + e);
                  }
                });
              }
            }
          }
        } else if (data.type === "chat") {
          const client = clients.get(ws);
          if (client) {
            data.payload.message = data.payload.message.trim().substring(0, 200);
            for (const [otherClient, otherClientData] of clients) {
              if (otherClientData.currentSector === client.currentSector) {
                otherClient.send(JSON.stringify({ type: "chat", payload: { id: client.id, message: data.payload.message } }));
              }
            }
          }
        } else if (data.type === "manufacture") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player) {
              manufacture(ws, player, data.payload.what, Math.round(data.payload.amount), flashServerMessage);
            }
          }
        } else if (data.type === "compositeManufacture") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player) {
              compositeManufacture(ws, player, data.payload.what, Math.round(data.payload.amount), flashServerMessage);
            }
          }
        } else if (data.type === "purchase") {
          const client = clients.get(ws);
          if (client) {
            const state = sectors.get(client.currentSector)!;
            const player = state.players.get(client.id);
            if (player) {
              Station.findOne({ id: player.docked }, (err, station) => {
                if (err) {
                  ws.send(JSON.stringify({ type: "error", payload: { message: "Server error loading station" } }));
                  console.log("Error loading station: " + err);
                  return;
                }
                if (!station) {
                  ws.send(JSON.stringify({ type: "error", payload: { message: "Station not found" } }));
                  console.log("Error loading station: " + err);
                  return;
                }
                const newPlayer = purchaseShip(player, data.payload.index, station.shipsAvailable, data.payload.fromInventory);
                if (newPlayer !== player) {
                  state.players.set(client.id, newPlayer);
                  const items = [defs[player.defIndex].name];
                  if (player.arms) {
                    for (const armIndex of player.arms) {
                      items.push(armDefs[armIndex].name);
                    }
                  }
                  const toTake = data.payload.fromInventory ? [defs[newPlayer.defIndex].name] : [];
                  // There is technically a bug here, if the player equips and then logs off, but the database has an error after they log off then
                  // they what is deposited will be lost. I don't want to deal with it though (the correct thing is to pull their save from the database
                  // and deal with it that way, but if we just had a database error this is unlikely to work anyways)
                  depositItemsIntoInventory(ws, player, items, toTake, flashServerMessage, () => {
                    console.log("Error depositing ship into inventory, reverting player");
                    try {
                      const otherState = sectors.get(clients.get(idToWebsocket.get(player.id)!)!.currentSector)!;
                      otherState.players.set(player.id, player);
                    } catch (e) {
                      console.log("Warning: unable to revert player" + e);
                    }
                  });
                }
              });
            }
          }
        } else if (data.type === "warp") {
          const client = clients.get(ws);
          if (client) {
            if (client.currentSector !== data.payload.warpTo) {
              // if (!client.sectorsVisited.has(data.payload.warpTo)) {
              //   flashServerMessage(client.id, "You must visit a sector before you can warp to it");
              //   return;
              // }
              const state = sectors.get(client.currentSector)!;
              const player = state.players.get(client.id);
              if (player) {
                player.warpTo = data.payload.warpTo;
                player.warping = 1;
              }
            }
          }
        } else if (data.type === "tutorialStageComplete") {
          const client = clients.get(ws);
          if (client) {
            if (client.inTutorial === data.payload.stage) {
              if (client.inTutorial !== data.payload.stage) {
                ws.send(JSON.stringify({ type: "error", payload: { message: "Tutorial stage mismatch" } }));
              }
              client.inTutorial = advanceTutorialStage(client.id, data.payload.stage, ws);
              sendTutorialStage(ws, client.inTutorial);
            }
          }
        } else if (data.type === "selectMission") {
          const client = clients.get(ws);
          if (client) {
            if (client.inTutorial) {
              flashServerMessage(client.id, "You cannot select a mission while in the tutorial", [1.0, 0.0, 0.0, 1.0]);
              return;
            }
            const state = sectors.get(client.currentSector);
            if (state) {
              const player = state.players.get(client.id);
              if (player) {
                selectMission(ws, player, data.payload.missionId);
              }
            }
          }
        } else if (data.type === "startMission") {
          const client = clients.get(ws);
          if (client) {
            if (client.inTutorial) {
              flashServerMessage(client.id, "You cannot start a mission while in the tutorial", [1.0, 0.0, 0.0, 1.0]);
              return;
            }
            const state = sectors.get(client.currentSector);
            if (state) {
              const player = state.players.get(client.id);
              if (player) {
                startPlayerInMission(ws, player, data.payload.missionId);
              }
            }
          }
        } else if (data.type === "friendRequest") {
          const client = clients.get(ws);
          if (client) {
            createFriendRequest(ws, client.id, data.payload.name);
          }
        } else if (data.type === "revokeFriendRequest") {
          const client = clients.get(ws);
          if (client) {
            revokeFriendRequest(ws, client.id, data.payload.name);
          }
        } else if (data.type === "unfriend") {
          const client = clients.get(ws);
          if (client) {
            unfriend(ws, client.id, data.payload.id);
          }
        } else if (data.type === "friendWarp") {
          const client = clients.get(ws);
          if (client) {
            const player = sectors.get(client.currentSector)?.players.get(client.id);
            if (player) {
              friendWarp(ws, player, data.payload.id);
            }
          }
        } else {
          console.log("Unknown message from client: ", data);
        }
      } catch (e) {
        console.log("Error in message handler: " + e);
        appendFile("errorlog", `Error: ${e}\nmessage: ${msg}\n${inspect(clients, { depth: null })}\n${Array.from(sectors.values())}\n`, (err) => {
          if (err) {
            console.log("Error writing to log: " + err);
          }
        });
      }
    });

    ws.on("close", () => {
      try {
        const removedClient = clients.get(ws);
        if (removedClient) {
          clients.delete(ws);
          const player = sectors.get(removedClient.currentSector)?.players.get(removedClient.id);
          const state = sectors.get(removedClient.currentSector);
          targets.delete(removedClient.id);
          secondaries.delete(removedClient.id);
          secondariesToActivate.delete(removedClient.id);
          idToWebsocket.delete(removedClient.id);
          knownRecipes.delete(removedClient.id);
          state?.players.delete(removedClient.id);
          if (player) {
            if (player.docked) {
              if (!removedClient.inTutorial) {
                saveCheckpoint(removedClient.id, removedClient.currentSector, player, removedClient.sectorsVisited, true);
              }
            } else {
              User.findOneAndUpdate(
                { id: removedClient.id },
                {
                  $set: { sectorsVisited: Array.from(removedClient.sectorsVisited), currentSector: removedClient.currentSector },
                  $push: { logoffTimes: Date.now() },
                },
                (err) => {
                  if (err) {
                    console.log("Error saving user: " + err);
                  }
                }
              );
            }
          } else if (!player) {
            console.log("Warning: player not found on disconnect (this is normal for a server switch)");
          }
        }
      } catch (e) {
        console.log("Error in close handler: " + e);
        appendFile("errorlog", `Error: ${e}\n${inspect(clients, { depth: null })}\n${Array.from(sectors.values())}\n`, (err) => {
          if (err) {
            console.log("Error writing to log: " + err);
          }
        });
      }
    });
  });

  const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
      if ((ws as any).isAlive === false) return ws.terminate();

      (ws as any).isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", function close() {
    clearInterval(interval);
  });

  server.listen(wsPort, () => {
    console.log(`${useSsl ? "Secure" : "Unsecure"} websocket server running on port ${wsPort}`);
  });
}
