import { createServer } from "http";
import { createServer as createSecureServer } from "https";
import { WebSocketServer, WebSocket } from "ws";
import {
  GlobalState,
  Player,
  Asteroid,
  update,
  applyInputs,
  Ballistic,
  ticksPerSecond,
  maxNameLength,
  canDock,
  copyPlayer,
  randomAsteroids,
  TargetKind,
  EffectTrigger,
  equip,
  Missile,
  purchaseShip,
  effectiveInfinity,
  processAllNpcs,
  serverMessagePersistTime,
  canRepair,
  removeAtMostCargo,
  isNearOperableEnemyStation,
  SectorTransition,
  findSectorTransitions,
  sectorBounds,
  SectorInfo,
  CloakedState,
  TutorialStage,
  mapSize,
  applyUndockingOffset,
} from "../src/game";
import { defs, defMap, Faction, armDefs, ArmUsage, emptyLoadout, UnitKind, clientUid } from "../src/defs";
import { appendFile } from "fs";
import { useSsl } from "../src/config";

import { User, Station, Checkpoint } from "./dataModels";
import mongoose from "mongoose";

import { addNpc, NPC } from "../src/npc";
import { inspect } from "util";
import { depositItemsIntoInventory, depositCargo, manufacture, sellInventory, sendInventory, transferToShip, discoverRecipe, compositeManufacture } from "./inventory";
import { market } from "./market";
import {
  clients,
  friendlySectors,
  idToWebsocket,
  knownRecipes,
  saveCheckpoint,
  secondaries,
  secondariesToActivate,
  sectorAsteroidResources,
  sectorFactions,
  sectorGuardianCount,
  sectorInDirection,
  sectorList,
  sectors,
  targets,
  tutorialRespawnPoints,
  uid,
  warpList,
} from "./state";
import { CardinalDirection, headingFromCardinalDirection, mirrorAngleHorizontally, mirrorAngleVertically } from "../src/geometry";
import { credentials, hash, wsPort } from "./settings";
import Routes from "./routes";
import { advanceTutorialStage, sendTutorialStage } from "./tutorial";

mongoose
  .connect("mongodb://127.0.0.1:27017/SpaceGame", {})
  .catch((err) => {
    console.log("Error connecting to database: " + err);
  })
  .then(() => {
    console.log("Connected to database");
    // Initialize the server state stuff
    initFromDatabase();
  });

Routes();

// This is for loading the stations from the database on server startup
const initFromDatabase = async () => {
  const stations = await Station.find({});
  for (const station of stations) {
    const def = defs[station.definitionIndex];
    const player: Player = {
      position: station.position,
      radius: def.radius,
      speed: 0,
      heading: 0,
      health: def.health,
      id: station.id,
      sinceLastShot: [effectiveInfinity, effectiveInfinity, effectiveInfinity, effectiveInfinity],
      energy: def.energy,
      defIndex: station.definitionIndex,
      arms: [],
      slotData: [],
      team: station.team,
      side: 0,
      isPC: true,
      v: { x: 0, y: 0 },
      iv: { x: 0, y: 0 },
      ir: 0,
    };
    const sector = sectors.get(station.sector);
    if (sector) {
      sector.players.set(station.id, player);
    }
  }
};

// Websocket server stuff
let server: ReturnType<typeof createServer> | ReturnType<typeof createSecureServer>;
if (useSsl) {
  server = createSecureServer(credentials);
} else {
  server = createServer();
}

// Websocket stuff (TODO Move to its own file)
const wss = new WebSocketServer({ server });

const setupPlayer = (id: number, ws: WebSocket, name: string, faction: Faction) => {
  let defIndex: number;
  if (faction === Faction.Alliance) {
    // defIndex = defMap.get("Fighter")!.index;
    defIndex = defMap.get("Advanced Fighter")!.index;
  } else if (faction === Faction.Confederation) {
    // defIndex = defMap.get("Drone")!.index;
    defIndex = defMap.get("Seeker")!.index;
  } else {
    console.log(`Invalid faction ${faction}`);
    return;
  }

  const sectorToWarpTo = faction === Faction.Alliance ? 12 : 15;

  let tutorialSector = clientUid();
  while (sectors.has(tutorialSector)) {
    tutorialSector = clientUid();
  }

  clients.set(ws, {
    id: id,
    name,
    input: { up: false, down: false, primary: false, secondary: false, right: false, left: false },
    angle: 0,
    currentSector: tutorialSector,
    lastMessage: "",
    lastMessageTime: Date.now(),
    sectorsVisited: new Set(),
    inTutorial: TutorialStage.Move,
  });

  let player = {
    position: { x: 0, y: 0 },
    radius: defs[defIndex].radius,
    speed: 0,
    heading: 0,
    health: defs[defIndex].health,
    id: id,
    sinceLastShot: [effectiveInfinity],
    energy: defs[defIndex].energy,
    defIndex: defIndex,
    arms: emptyLoadout(defIndex),
    slotData: new Array(defs[defIndex].slots.length).fill({}),
    cargo: [],
    credits: 500,
    team: faction,
    side: 0,
    isPC: true,
    v: { x: 0, y: 0 },
    iv: { x: 0, y: 0 },
    ir: 0,
  };

  // player = equip(player, 0, "Basic Mining Laser", true);
  // player = equip(player, 1, "Laser Beam", true);
  // player = equip(player, 1, "Tomahawk Missile", true);

  const state = {
    players: new Map(),
    projectiles: new Map(),
    asteroids: new Map(),
    missiles: new Map(),
    collectables: new Map(),
    asteroidsDirty: false,
    mines: new Map(),
    projectileId: 1,
  };

  sectors.set(tutorialSector, state);
  state.players.set(id, player);

  // Idk the right way to handle this right now
  // Just delete the tutorial sector after a while
  setTimeout(() => {
    sectors.delete(tutorialSector);
    tutorialRespawnPoints.delete(tutorialSector);
  }, 1000 * 60 * 60 * 3);

  targets.set(id, [TargetKind.None, 0]);
  secondaries.set(id, 0);
  secondariesToActivate.set(id, []);
  knownRecipes.set(id, new Set());

  const sectorInfos: SectorInfo[] = [];
  sectorInfos.push({
    sector: sectorToWarpTo,
    resources: sectorAsteroidResources[sectorToWarpTo].map((value) => value.resource),
  });

  ws.send(
    JSON.stringify({
      type: "init",
      payload: {
        id: id,
        sector: tutorialSector,
        faction,
        asteroids: Array.from(state.asteroids.values()),
        collectables: Array.from(state.collectables.values()),
        mines: Array.from(state.mines.values()),
        sectorInfos,
        recipes: [],
      },
    })
  );
  sendInventory(ws, id);
  sendTutorialStage(ws, TutorialStage.Move);
};

// TODO Need to go over this carefully, checking to make sure that malicious clients can't do anything bad
wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "login") {
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

          const sectorInfos: SectorInfo[] = [];
          if (!user.sectorsVisited) {
            user.sectorsVisited = [user.currentSector];
            user.save();
          }
          const sectorsVisited: Set<number> = new Set(user.sectorsVisited);
          for (const sector of sectorsVisited) {
            sectorInfos.push({
              sector,
              resources: sectorAsteroidResources[sector].map((value) => value.resource),
            });
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
              const state = sectors.get(checkpoint.sector);
              if (!state) {
                ws.send(JSON.stringify({ type: "error", payload: { message: "Bad checkpoint sector" } }));
                console.log("Warning: Checkpoint sector not found");
                setupPlayer(user.id, ws, name, user.faction);
                return;
              }
              const playerState = JSON.parse(checkpoint.data) as Player;
              if (isNearOperableEnemyStation(playerState, state.players.values()) || enemyCount(playerState.team, checkpoint.sector) > 2) {
                playerState.position.x = -5000;
                playerState.position.y = 5000;
              }
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
              state.players.set(user.id, playerState);
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
              ws.send(
                JSON.stringify({
                  type: "init",
                  payload: {
                    id: user.id,
                    sector: checkpoint.sector,
                    faction: playerState.team,
                    asteroids: Array.from(state.asteroids.values()),
                    collectables: Array.from(state.collectables.values()),
                    mines: Array.from(state.mines.values()),
                    sectorInfos,
                    recipes: user.recipesKnown,
                  },
                })
              );
              sendInventory(ws, user.id);
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
          User.create({ name, password: hash(password), faction, id: uid() }, (err, user) => {
            if (err) {
              ws.send(JSON.stringify({ type: "registerFail", payload: { error: "Database error" } }));
              console.log(err);
              return;
            }
            setupPlayer(user.id, ws, name, faction);
            idToWebsocket.set(user.id, ws);
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
            const state = sectors.get(checkpoint.sector);
            if (!state) {
              ws.send(JSON.stringify({ type: "error", payload: { message: "Bad checkpoint sector" } }));
              console.log("Warning: Checkpoint sector not found (programming error)");
              return;
            }
            const playerState = JSON.parse(checkpoint.data) as Player;
            // So I don't have to edit the checkpoints in the database right now
            playerState.isPC = true;
            if (
              isNearOperableEnemyStation(playerState, state.players.values()) ||
              enemyCount(playerState.team, checkpoint.sector) - allyCount(playerState.team, checkpoint.sector) > 2
            ) {
              playerState.position.x = -5000;
              playerState.position.y = 5000;
            }
            playerState.v = { x: 0, y: 0 };
            playerState.iv = { x: 0, y: 0 };
            playerState.ir = 0;
            state.players.set(client.id, playerState);
            ws.send(
              JSON.stringify({
                type: "warp",
                payload: {
                  to: checkpoint.sector,
                  asteroids: Array.from(state.asteroids.values()),
                  collectables: Array.from(state.collectables.values()),
                  mines: Array.from(state.mines.values()),
                  sectorInfos: [],
                },
              })
            );
            client.currentSector = checkpoint.sector;
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
          if (client.currentSector !== data.payload.warpTo && sectorList.includes(data.payload.warpTo)) {
            if (!client.sectorsVisited.has(data.payload.warpTo)) {
              flashServerMessage(client.id, "You must visit a sector before you can warp to it");
              return;
            }
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
    console.log("Client disconnected");
    const removedClient = clients.get(ws);
    if (removedClient) {
      const player = sectors.get(removedClient.currentSector)?.players.get(removedClient.id);
      const state = sectors.get(removedClient.currentSector)!;
      state.players.delete(removedClient.id);
      targets.delete(removedClient.id);
      secondaries.delete(removedClient.id);
      secondariesToActivate.delete(removedClient.id);
      clients.delete(ws);
      idToWebsocket.delete(removedClient.id);
      knownRecipes.delete(removedClient.id);
      if (player) {
        if (player.docked) {
          if (!removedClient.inTutorial) {
            saveCheckpoint(removedClient.id, removedClient.currentSector, player, removedClient.sectorsVisited);
          }
        } else {
          User.findOneAndUpdate(
            { id: removedClient.id },
            { currentSector: removedClient.currentSector, sectorsVisited: Array.from(removedClient.sectorsVisited) },
            (err) => {
              if (err) {
                console.log("Error saving user: " + err);
              }
            }
          );
        }
      } else if (!player) {
        console.log("Warning: player not found on disconnect");
      }
    }
  });
});

const informDead = (player: Player) => {
  if (player.npc) {
    return;
  }
  const def = defs[player.defIndex];
  if (def.kind === UnitKind.Ship) {
    const ws = idToWebsocket.get(player.id);
    if (ws) {
      ws.send(JSON.stringify({ type: "dead" }));
    }
  }
};

// TODO: Roll this into the main state update function in the form of the mutation returned by the update function
// Should slightly improve performance when things are busy in the sector
const removeCollectable = (sector: number, id: number, collected: boolean) => {
  for (const [client, clientData] of clients) {
    if (clientData.currentSector === sector) {
      client.send(JSON.stringify({ type: "removeCollectable", payload: { id, collected } }));
    }
  }
};

// Same thing with this one
const removeMine = (sector: number, id: number, detonated: boolean) => {
  for (const [client, clientData] of clients) {
    if (clientData.currentSector === sector) {
      client.send(JSON.stringify({ type: "removeMine", payload: { id, detonated } }));
    }
  }
};

const flashServerMessage = (id: number, message: string) => {
  const ws = idToWebsocket.get(id);
  if (ws) {
    const client = clients.get(ws);
    if (client && message.length > 0) {
      if (message !== client.lastMessage) {
        ws.send(JSON.stringify({ type: "serverMessage", payload: { message } }));
        client.lastMessage = message;
        client.lastMessageTime = Date.now();
      } else {
        if (Date.now() - client.lastMessageTime > serverMessagePersistTime) {
          ws.send(JSON.stringify({ type: "serverMessage", payload: { message } }));
          client.lastMessageTime = Date.now();
        }
      }
    }
  }
};

// To be changed once sectors are better understood
// const isEnemySector = (team: Faction, sector: number) => {
//   return team + 1 !== sector && sector < 4;
// };

// const spawnAllyForces = (team: Faction, sector: number, count: number) => {
//   const state = sectors.get(sector);
//   if (!state) {
//     return;
//   }
//   switch (team) {
//     case Faction.Alliance:
//       for (let i = 0; i < count; i++) {
//         addNpc(state, Math.random() > 0.5 ? "Fighter" : "Advanced Fighter", Faction.Alliance, uid());
//       }
//       break;
//     case Faction.Confederation:
//       for (let i = 0; i < count; i++) {
//         addNpc(state, Math.random() > 0.5 ? "Drone" : "Seeker", Faction.Confederation, uid());
//       }
//       break;
//     case Faction.Rogue:
//       for (let i = 0; i < count; i++) {
//         addNpc(state, Math.random() > 0.2 ? "Strafer" : "Venture", Faction.Rogue, uid());
//       }
//       break;
//   }
// };

const enemyCount = (team: Faction, sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    return 0;
  }
  let count = 0;
  for (const [id, player] of state.players) {
    if (player.team !== team) {
      count++;
    }
  }
  return count;
};

const allyCount = (team: Faction, sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    return 0;
  }
  let count = 0;
  for (const [id, player] of state.players) {
    if (player.team === team) {
      count++;
    }
  }
  return count;
};

let frame = 0;

const discoverer = (id: number, recipe: string) => {
  const ws = idToWebsocket.get(id);
  if (ws) {
    const known = knownRecipes.get(id);
    if (known) {
      known.add(recipe);
    }
    discoverRecipe(ws, id, recipe);
  }
};

// Updating the game state
setInterval(() => {
  frame++;
  const sectorTransitions: SectorTransition[] = [];

  for (const [sector, state] of sectors) {
    for (const [client, data] of clients) {
      const player = state.players.get(data.id);
      if (data.input && player) {
        applyInputs(data.input, player, data.angle);
      }
    }
    const triggers: EffectTrigger[] = [];
    const mutated = update(
      state,
      frame,
      targets,
      secondaries,
      (trigger) => triggers.push(trigger),
      warpList,
      informDead,
      flashServerMessage,
      (id, collected) => removeCollectable(sector, id, collected),
      (id, detonated) => removeMine(sector, id, detonated),
      knownRecipes,
      discoverer,
      secondariesToActivate
    );
    processAllNpcs(state, sector);
    findSectorTransitions(state, sector, sectorTransitions);

    // TODO Consider culling the state information to only send nearby players and projectiles (this trades networking bandwidth for server CPU)
    // TODO I should not be sending the players out of range or the cloaked players to the clients that should not be able to have that information
    const playerData: Player[] = [];
    const npcs: (NPC | undefined)[] = [];
    for (const player of state.players.values()) {
      npcs.push(player.npc);
      player.npc = undefined;
      playerData.push(player);
    }

    const projectileData: Ballistic[] = Array.from(state.projectiles.values());
    let asteroidData: Asteroid[] = state.asteroidsDirty ? Array.from(state.asteroids.values()) : Array.from(mutated.asteroids);
    const missileData: Missile[] = Array.from(state.missiles.values());

    const serialized = JSON.stringify({
      type: "state",
      payload: {
        players: playerData,
        frame,
        projectiles: projectileData,
        asteroids: asteroidData,
        effects: triggers,
        missiles: missileData,
        collectables: mutated.collectables,
        mines: mutated.mines,
      },
    });

    for (const [client, data] of clients) {
      if (data.currentSector === sector) {
        client.send(serialized);
      }
    }
    for (const player of state.players.values()) {
      player.npc = npcs.shift()!;
    }
  }

  // Handle all sector transitions
  for (const transition of sectorTransitions) {
    const newSector = sectorInDirection(transition.from, transition.direction) ?? transition.from;

    if (newSector === transition.from) {
      if (transition.direction === CardinalDirection.Up) {
        transition.player.position.y = sectorBounds.y + 200;
        transition.direction = CardinalDirection.Down;
        transition.player.heading = mirrorAngleHorizontally(transition.player.heading);
      } else if (transition.direction === CardinalDirection.Down) {
        transition.player.position.y = sectorBounds.y + sectorBounds.height - 200;
        transition.direction = CardinalDirection.Up;
        transition.player.heading = mirrorAngleHorizontally(transition.player.heading);
      } else if (transition.direction === CardinalDirection.Left) {
        transition.player.position.x = sectorBounds.x + 200;
        transition.direction = CardinalDirection.Right;
        transition.player.heading = mirrorAngleVertically(transition.player.heading);
      } else if (transition.direction === CardinalDirection.Right) {
        transition.player.position.x = sectorBounds.x + sectorBounds.width - 200;
        transition.direction = CardinalDirection.Left;
        transition.player.heading = mirrorAngleVertically(transition.player.heading);
      }
    }

    const state = sectors.get(newSector);
    if (state) {
      const ws = idToWebsocket.get(transition.player.id);
      const sectorInfo = {
        sector: newSector,
        resources: newSector < mapSize * mapSize ? sectorAsteroidResources[newSector].map((value) => value.resource) : [],
      };
      if (ws) {
        const client = clients.get(ws)!;
        client.currentSector = newSector;
        if (newSector < mapSize * mapSize) {
          client.sectorsVisited.add(newSector);
        }
        ws.send(
          JSON.stringify({
            type: "warp",
            payload: {
              to: newSector,
              asteroids: Array.from(state.asteroids.values()),
              collectables: Array.from(state.collectables.values()),
              mines: Array.from(state.mines.values()),
              sectorInfos: [sectorInfo],
            },
          })
        );
      }
      transition.player.position = transition.coords;
      // transition.player.heading = headingFromCardinalDirection(transition.direction);
      state.players.set(transition.player.id, transition.player);
    }
  }

  // Handle all warps
  while (warpList.length > 0) {
    const { player, to } = warpList.shift()!;
    const state = sectors.get(to);
    if (state) {
      const ws = idToWebsocket.get(player.id);
      if (ws) {
        const client = clients.get(ws)!;
        client.currentSector = to;
        ws.send(
          JSON.stringify({
            type: "warp",
            payload: {
              to,
              asteroids: Array.from(state.asteroids.values()),
              collectables: Array.from(state.collectables.values()),
              mines: Array.from(state.mines.values()),
              sectorInfos: [],
            },
          })
        );
        // const enemies = enemyCount(player.team, to);
        // const allies = allyCount(player.team, to);
        // const count = enemies - allies;
        // if (count > 3 && isEnemySector(player.team, to)) {
        //   spawnAllyForces(player.team, to, count);
        //   flashServerMessage(player.id, `${getFactionString(player.team)} forces have arrived to assist!`);
        // }
      }
      // Lets just keep the coords and momentum of the player on warping
      // player.position.x = Math.random() * 6000 - 3000;
      // player.position.y = Math.random() * 6000 - 3000;
      // player.heading = (3 * Math.PI) / 2;
      // player.speed = 0;
      state.players.set(player.id, player);
    }
  }
}, 1000 / ticksPerSecond);

const spawnIncrementalGuardians = (sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    return;
  }

  const faction = sectorFactions[sector];
  if (faction === null) {
    return;
  }

  // const allies = allyCount(faction, sector);
  // const count = sectorGuardianCount[sector] - allies;
  // if (count <= 0) {
  //   return;
  // }

  let count = Math.max(Math.floor(Math.random() * 3), 1);

  switch (faction) {
    case Faction.Alliance:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.5 ? "Fighter" : "Advanced Fighter", Faction.Alliance, uid(), friendlySectors(faction));
      }
      break;
    case Faction.Confederation:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.5 ? "Drone" : "Seeker", Faction.Confederation, uid(), friendlySectors(faction));
      }
      break;
    case Faction.Rogue:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.2 ? "Strafer" : "Venture", Faction.Rogue, uid(), friendlySectors(faction));
      }
      break;
    case Faction.Scourge:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.5 ? "Spartan" : "Striker", Faction.Scourge, uid(), friendlySectors(faction));
      }
  }
};

const spawnSectorGuardians = (sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    return;
  }

  const faction = sectorFactions[sector];
  if (faction === null) {
    return;
  }

  const allies = allyCount(faction, sector);
  const count = sectorGuardianCount[sector] - allies;
  if (count <= 0) {
    return;
  }

  for (const [id, player] of state.players) {
    if (player.npc) {
      continue;
    }
    const def = defs[player.defIndex];
    if (def.kind === UnitKind.Station) {
      continue;
    }
    flashServerMessage(player.id, "Sector guardians are arriving!");
  }

  switch (faction) {
    case Faction.Alliance:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.5 ? "Fighter" : "Advanced Fighter", Faction.Alliance, uid(), friendlySectors(faction));
      }
      break;
    case Faction.Confederation:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.5 ? "Drone" : "Seeker", Faction.Confederation, uid(), friendlySectors(faction));
      }
      break;
    case Faction.Rogue:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.2 ? "Strafer" : "Venture", Faction.Rogue, uid(), friendlySectors(faction));
      }
      break;
    case Faction.Scourge:
      for (let i = 0; i < count; i++) {
        addNpc(state, Math.random() > 0.5 ? "Spartan" : "Striker", Faction.Scourge, uid(), friendlySectors(faction));
      }
  }
};

setInterval(() => {
  for (let i = 0; i < sectorList.length; i++) {
    spawnIncrementalGuardians(i);
  }
}, 20 * 990);

setInterval(() => {
  for (let i = 0; i < sectorList.length; i++) {
    spawnSectorGuardians(i);
  }
}, 120 * 60 * 1000);

const repairStationsInSectorForTeam = (sector: number, team: Faction) => {
  const state = sectors.get(sector);
  if (!state) {
    return;
  }
  for (const player of state.players.values()) {
    if (player.inoperable) {
      player.repairs![team] += 1;
    }
  }
};

setInterval(() => {
  for (const sector of sectorList) {
    const faction = sectorFactions[sector];
    if (faction === null) {
      continue;
    }
    repairStationsInSectorForTeam(sector, faction);
  }
}, 2 * 60 * 1000);

const respawnEmptyAsteroids = (state: GlobalState, sector: number) => {
  let removedCount = 0;
  const removed: number[] = [];
  for (const asteroid of state.asteroids.values()) {
    if (asteroid.resources <= 0) {
      state.asteroids.delete(asteroid.id);
      removed.push(asteroid.id);
      removedCount++;
    }
  }
  if (removedCount > 0) {
    console.log(`Respawning ${removedCount} asteroids in sector ${sector}`);
    const newAsteroids = randomAsteroids(
      removedCount,
      sectorBounds,
      Date.now(),
      uid,
      sectorAsteroidResources[sectorList.findIndex((s) => s === sector)]
    );
    for (const asteroid of newAsteroids) {
      state.asteroids.set(asteroid.id, asteroid);
    }
    for (const [client, data] of clients) {
      if (data.currentSector === sector) {
        client.send(JSON.stringify({ type: "removeAsteroids", payload: { ids: removed } }));
      }
    }
    state.asteroidsDirty = true;
  }
};

setInterval(() => {
  for (const [sector, state] of sectors) {
    respawnEmptyAsteroids(state, sector);
  }
}, 1 * 60 * 1000);

server.listen(wsPort, () => {
  console.log(`${useSsl ? "Secure" : "Unsecure"} websocket server running on port ${wsPort}`);
});
