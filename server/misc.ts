import { clientUid, defMap, defs, emptyLoadout, Faction } from "../src/defs";
import { effectiveInfinity, Player, SectorInfo, SectorKind, TargetKind, TutorialStage } from "../src/game";
import { clients, knownRecipes, secondaries, secondariesToActivate, sectors, targets, tutorialRespawnPoints } from "./state";
import { WebSocket } from "ws";
import { sendInventory } from "./inventory";
import { sendTutorialStage } from "./tutorial";
import { Station } from "./dataModels";

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
    delayedActions: [],
    sectorKind: SectorKind.Tutorial,
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
    // resources: sectorAsteroidResources[sectorToWarpTo].map((value) => value.resource),
    resources: [],
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

export { setupPlayer, initFromDatabase };