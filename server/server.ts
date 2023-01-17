import {
  GlobalState,
  Player,
  Asteroid,
  update,
  applyInputs,
  Ballistic,
  ticksPerSecond,
  randomAsteroids,
  EffectTrigger,
  Missile,
  processAllNpcs,
  SectorTransition,
  findSectorTransitions,
  sectorBounds,
  isNearOperableEnemyStation,
} from "../src/game";
import { defs, Faction, UnitKind } from "../src/defs";

import { addNpc, NPC } from "../src/npc";
import { discoverRecipe, sendInventory } from "./inventory";
import {
  allResources,
  clients,
  friendlySectors,
  idToWebsocket,
  knownRecipes,
  secondaries,
  secondariesToActivate,
  sectorAsteroidResources,
  // sectorAsteroidResources,
  // sectorFactions,
  // sectorGuardianCount,
  sectorList,
  sectors,
  serializeAllClientData,
  ServerChangeKind,
  serverChangePlayer,
  stationIdToDefaultTeam,
  targets,
  uid,
  warpList,
} from "./state";
import { CardinalDirection, mirrorAngleHorizontally, mirrorAngleVertically } from "../src/geometry";
import { allyCount, enemyCount, flashServerMessage } from "./stateHelpers";
import { serversForSectors, setPlayerSector } from "./peers";
import { WebSocket } from "ws";
import { User } from "./dataModels";
import { mapGraph, mapHeight, mapWidth } from "../src/mapLayout";
import { transferableActions } from "./transferableActions";

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

const spawnIncrementalGuardians = (sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    return;
  }

  // const faction = sectorFactions[sector];
  const faction = Math.floor(Math.random() * 4) as Faction;
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

  // const faction = sectorFactions[sector];
  const faction: Faction = Math.floor(Math.random() * 4) as Faction;
  if (faction === null) {
    return;
  }

  const allies = allyCount(faction, sector);
  // const count = sectorGuardianCount[sector] - allies;
  const count = 0;
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

const repairStationsInSector = (sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    return;
  }
  for (const player of state.players.values()) {
    if (player.inoperable && stationIdToDefaultTeam.has(player.id)) {
      const team = stationIdToDefaultTeam.get(player.id)!;
      player.repairs![team] += 1;
    }
  }
};

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
      // sectorAsteroidResources[sectorList.findIndex((s) => s === sector)],
      allResources,
      Array.from(state.players.values()).filter((a) => {
        const def = defs[a.defIndex];
        return def.kind === UnitKind.Station;
      })
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

const warpNonNPCToSector = (ws: WebSocket, player: Player, sector: number) => {
  setPlayerSector(player.id, sector);
  const state = sectors.get(sector);
  if (state) {
    ws.send(
      JSON.stringify({
        type: "warp",
        payload: {
          to: sector,
          asteroids: Array.from(state.asteroids.values()),
          collectables: Array.from(state.collectables.values()),
          mines: Array.from(state.mines.values()),
          sectorInfos: [],
        },
      })
    );
    state.players.set(player.id, player);
  } else {
    const serverName = serversForSectors.get(sector);
    if (serverName) {
      serverChangePlayer(ws, player, serverName);
    } else {
      flashServerMessage(player.id, `Server not found for this sector! (${sector})`, [1.0, 0.0, 0.0, 1.0]);
    }
  }
};

const insertRespawnedPlayer = (ws: WebSocket, player: Player, sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    ws.send(JSON.stringify({ type: "error", payload: { message: "Sector not found on server for respawn" } }));
    console.log("Warning: Sector not found on server for respawn");
    return;
  }
  // So I don't have to edit the checkpoints in the database right now
  player.isPC = true;
  if (isNearOperableEnemyStation(player, state.players.values()) || enemyCount(player.team, sector) - allyCount(player.team, sector) > 2) {
    player.position.x = -5000;
    player.position.y = 5000;
  }
  player.v = { x: 0, y: 0 };
  player.iv = { x: 0, y: 0 };
  player.ir = 0;
  state.players.set(player.id, player);
  ws.send(
    JSON.stringify({
      type: "warp",
      payload: {
        to: sector,
        asteroids: Array.from(state.asteroids.values()),
        collectables: Array.from(state.collectables.values()),
        mines: Array.from(state.mines.values()),
        sectorInfos: [],
      },
    })
  );
};

const respawnPlayer = (ws: WebSocket, player: Player, sector: number) => {
  setPlayerSector(player.id, sector);
  if (sectors.has(sector)) {
    insertRespawnedPlayer(ws, player, sector);
  } else {
    const newServerName = serversForSectors.get(sector);
    if (newServerName) {
      serverChangePlayer(ws, player, newServerName, ServerChangeKind.Respawn);
    } else {
      flashServerMessage(player.id, "Server not found for this sector!", [1.0, 0.0, 0.0, 1.0]);
    }
  }
};

const insertSpawnedPlayer = (ws: WebSocket, player: Player, sector: number) => {
  const state = sectors.get(sector);
  if (!state) {
    ws.send(JSON.stringify({ type: "error", payload: { message: "Sector missing from server for spawn" } }));
    console.log("Warning: Sector missing from server for spawn");
    return;
  }
  if (isNearOperableEnemyStation(player, state.players.values()) || enemyCount(player.team, sector) > 2) {
    player.position.x = -5000;
    player.position.y = 5000;
  }
  state.players.set(player.id, player);

  const client = clients.get(ws);
  if (!client) {
    console.log("Warning: Client not found for spawn");
    return;
  }

  const sectorInfos = Array.from(client.sectorsVisited).map((sector) => ({
    sector,
    resources: sectorAsteroidResources[sector].map((r) => r.resource),
  }));

  // console.log("Sector info for player is ", sectorInfos, client.sectorsVisited);

  ws.send(
    JSON.stringify({
      type: "init",
      payload: {
        id: player.id,
        sector: sector,
        faction: player.team,
        asteroids: Array.from(state.asteroids.values()),
        collectables: Array.from(state.collectables.values()),
        mines: Array.from(state.mines.values()),
        sectorInfos,
        recipes: Array.from(knownRecipes.get(player.id) || []),
      },
    })
  );
  sendInventory(ws, player.id);
};

const spawnPlayer = (ws: WebSocket, player: Player, sector: number) => {
  setPlayerSector(player.id, sector);
  if (sectors.has(sector)) {
    insertSpawnedPlayer(ws, player, sector);
  } else {
    const newServerName = serversForSectors.get(sector);
    if (newServerName) {
      serverChangePlayer(ws, player, newServerName, ServerChangeKind.Spawn);
    } else {
      flashServerMessage(player.id, "Server not found for this sector!", [1.0, 0.0, 0.0, 1.0]);
    }
  }
};

const setupTimers = () => {
  // setInterval(() => {
  //   for (let i = 0; i < sectorList.length; i++) {
  //     spawnIncrementalGuardians(i);
  //   }
  // }, 20 * 990);

  // setInterval(() => {
  //   for (let i = 0; i < sectorList.length; i++) {
  //     spawnSectorGuardians(i);
  //   }
  // }, 120 * 60 * 1000);

  setInterval(() => {
    for (const sector of sectorList) {
      repairStationsInSector(sector);
    }
  }, 20 * 1000);

  setInterval(() => {
    for (const [sector, state] of sectors) {
      respawnEmptyAsteroids(state, sector);
    }
  }, 1 * 60 * 1000);

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
        secondariesToActivate,
        transferableActions,
        sector
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

      if (frame % 60 === 0) {
        for (let i = 0; i < state.sectorChecks!.length; i++) {
          const check = state.sectorChecks![i];
          const toRemove = transferableActions[check.index](state, sector, check.data);
          if (toRemove) {
            state.sectorChecks!.splice(i, 1);
            i--;
          }
        }
      }
    }

    // Handle all sector transitions
    for (const transition of sectorTransitions) {
      const newSector = mapGraph.get(transition.from)?.out[transition.direction]?.to?.sector ?? transition.from;
      // console.log("Transitioning player", transition.player.id, "from sector", transition.from, "to sector", newSector);

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

      const ws = idToWebsocket.get(transition.player.id);
      transition.player.position = transition.coords;
      if (ws) {
        const client = clients.get(ws)!;
        client.currentSector = newSector;
        if (newSector < mapWidth * mapHeight) {
          client.sectorsVisited.add(newSector);
        }
        warpNonNPCToSector(ws, transition.player, newSector);
      } else {
        // Is npc
        console.log("Sector transitions for NPCs is disabled currently");
      }
    }

    // Handle all warps
    while (warpList.length > 0) {
      const { player, to } = warpList.shift()!;
      const ws = idToWebsocket.get(player.id);
      if (ws) {
        const client = clients.get(ws)!;
        client.currentSector = to;
        warpNonNPCToSector(ws, player, to);
      } else {
        // Is npc
        console.log("NPC warping is disabled currently");
      }
    }
  }, 1000 / ticksPerSecond);
};

export { setupTimers, respawnPlayer, insertRespawnedPlayer, spawnPlayer, insertSpawnedPlayer };
