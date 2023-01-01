import { defMap, defs, emptyLoadout, emptySlotData, Faction, SlotKind } from "../../src/defs";
import { estimateEffectivePrimaryRange, projectileDefs } from "../../src/defs/projectiles";
import { effectiveInfinity, equip, findClosestTarget, GlobalState, Input, Player, randomNearbyPointInSector } from "../../src/game";
import { l2Norm } from "../../src/geometry";
import {
  idleState,
  LootTable,
  NPC,
  passiveGoToRandomPointInSector,
  randomCombatManeuver,
  runAway,
  runAwayWithStrafing,
  State,
  strafingSwarmCombat,
  stupidSwarmCombat,
} from "../../src/npc";
import { uid } from "../state";

const makeStateGraph = (
  primaryRange: number,
  secondaryGuided: boolean,
  secondaryRange: number,
  energyThreshold: number,
  mineSlot: null | number,
  isStrafer: boolean
) => {
  const idle = idleState();
  const passiveGoTo = passiveGoToRandomPointInSector();
  const swarm = stupidSwarmCombat(primaryRange, secondaryGuided, secondaryRange, energyThreshold, mineSlot);
  const run = isStrafer
    ? runAwayWithStrafing(primaryRange, secondaryGuided, secondaryRange, energyThreshold, mineSlot)
    : runAway(primaryRange, secondaryGuided, secondaryRange, energyThreshold, mineSlot);
  idle.transitions.push({ trigger: (_, __, ___, target) => !!target, state: swarm });
  idle.transitions.push({ trigger: () => Math.random() < 0.01, state: passiveGoTo });
  passiveGoTo.transitions.push({ trigger: (_, __, ___, target) => !!target, state: swarm });
  passiveGoTo.transitions.push({ trigger: (_, __, memory) => !!memory.completed, state: idle });
  swarm.transitions.push({ trigger: (_, __, ___, target) => !target, state: idle });
  if (!isStrafer) {
    const randomManeuver = randomCombatManeuver(primaryRange, secondaryGuided, secondaryRange, energyThreshold, mineSlot);
    swarm.transitions.push({
      trigger: (_, npc, ___, target) => Math.random() < 0.008 && !!target && l2Norm(npc.player.position, target.position) < 500,
      state: randomManeuver,
    });
    randomManeuver.transitions.push({ trigger: (_, __, ___, target) => !target, state: idle });
    randomManeuver.transitions.push({ trigger: (_, __, memory) => !!memory.completed, state: swarm });
    randomManeuver.transitions.push({ trigger: () => Math.random() < 0.005, state: swarm });
  } else {
    const strafeSwarm = strafingSwarmCombat(
      primaryRange,
      secondaryGuided,
      secondaryRange,
      energyThreshold,
      mineSlot,
      projectileDefs[0].speed,
      projectileDefs[0].range
    );
    strafeSwarm.transitions.push({ trigger: (_, __, ___, target) => !target, state: idle });
    strafeSwarm.transitions.push({ trigger: (_, __, memory) => !!memory.completed, state: swarm });
    swarm.transitions.push({
      trigger: (_, npc, ___, target) => Math.random() < 0.05 && !!target && l2Norm(target.position, npc.player.position) < primaryRange,
      state: strafeSwarm,
    });
  }
  swarm.transitions.push({
    trigger: (_, npc) => {
      const def = defs[npc.player.defIndex];
      return npc.player.health < def.health / 3;
    },
    state: run,
  });
  run.transitions.push({ trigger: (_, __, ___, target) => !target, state: idle });
  run.transitions.push({
    trigger: (_, npc) => {
      const def = defs[npc.player.defIndex];
      return npc.player.health > def.health / 3;
    },
    state: run,
  });
  run.transitions.push({ trigger: () => Math.random() < 0.002, state: run });
  return idle;
};

class BasicSwarmer implements NPC {
  public player: Player;

  public input: Input = {
    left: false,
    right: false,
    up: false,
    down: false,
    primary: false,
    secondary: false,
  };
  public angle = undefined;

  public selectedSecondary = 1;

  public lootTable: LootTable;

  public secondariesToFire: number[] = [];

  public stateGraphMemory: Map<State, any> = new Map();

  public targetId: number;

  constructor(ship: string, team: Faction) {
    this.lootTable = new LootTable();

    const { def, index } = defMap.get(ship)!;

    const bounds = { x: -3000, y: -3000, width: 6000, height: 6000 };

    this.player = {
      position: randomNearbyPointInSector({ x: 0, y: 0 }, 6000),
      radius: def.radius,
      speed: 0,
      heading: Math.random() * 2 * Math.PI,
      health: def.health,
      id: uid(),
      sinceLastShot: [effectiveInfinity],
      energy: def.energy,
      defIndex: index,
      arms: emptyLoadout(index),
      slotData: emptySlotData(def),
      cargo: [],
      credits: 500,
      npc: this,
      team,
      side: 0,
      v: { x: 0, y: 0 },
      iv: { x: 0, y: 0 },
      ir: 0,
    };

    let mineSlot: number | null = def.slots.indexOf(SlotKind.Mine);
    if (mineSlot === -1) {
      mineSlot = null;
    } else {
      this.player = equip(this.player, mineSlot, "Proximity Mine", true);
    }

    const isStrafer = def.name === "Strafer";

    switch (Math.floor(Math.random() * 7)) {
      case 0:
      case 1:
      case 2:
        this.player = equip(this.player, 1, "Javelin Missile", true);
        this.currentState = makeStateGraph(estimateEffectivePrimaryRange(def), true, 3000, 3, mineSlot, isStrafer);
        break;
      case 3:
        this.player = equip(this.player, 1, "Tomahawk Missile", true);
        this.currentState = makeStateGraph(estimateEffectivePrimaryRange(def), true, 2500, 3, mineSlot, isStrafer);
        break;
      case 4:
        this.player = equip(this.player, 1, "Laser Beam", true);
        this.currentState = makeStateGraph(estimateEffectivePrimaryRange(def), true, 3000, 38, mineSlot, isStrafer);
        break;
      case 5:
        this.player = equip(this.player, 1, "Disruptor Cannon", true);
        this.currentState = makeStateGraph(estimateEffectivePrimaryRange(def), false, 350, 10, mineSlot, isStrafer);
        break;
      case 6:
        this.player = equip(this.player, 1, "Shotgun", true);
        this.currentState = makeStateGraph(estimateEffectivePrimaryRange(def), false, 1300, 13, mineSlot, isStrafer);
        break;
    }

    this.stateGraphMemory.set(this.currentState, this.currentState.onEnter(this));
  }

  private currentState: State;

  public process(state: GlobalState, sector: number) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.defIndex];
    const newTarget = findClosestTarget(this.player, state, def.scanRange!, true, true);
    this.targetId = newTarget?.id ?? 0;
    target = newTarget;
    if (!target && this.targetId) {
      target = state.players.get(this.targetId);
    }
    this.currentState = this.currentState.process(state, this, sector, target);
  }
}

const spawnClearanceNPCs = (state: GlobalState, npcFaction: Faction, shipList: string[]) => {
  for (const ship of shipList) {
    if (!defMap.has(ship)) {
      console.log(`Ship ${ship} not found`);
      continue;
    }
    const npc = new BasicSwarmer(ship, npcFaction);
    state.players.set(npc.player.id, npc.player);
  }
};

export { spawnClearanceNPCs };
