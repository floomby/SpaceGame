import { assert } from "console";
import { defMap, defs, emptyLoadout, emptySlotData, Faction, SlotKind } from "../../src/defs";
import { estimateEffectivePrimaryRange, projectileDefs } from "../../src/defs/projectiles";
import { CloakedState, effectiveInfinity, equip, findClosestTarget, GlobalState, Input, Player, randomNearbyPointInSector } from "../../src/game";
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
  mineSlot: null | number,
  impulseSlot: null | number
) => {
  const idle = idleState();
  const passiveGoTo = passiveGoToRandomPointInSector();
  const swarm = stupidSwarmCombat(primaryRange, secondaryGuided, secondaryRange, 30, mineSlot);
  const run = runAway(primaryRange, secondaryGuided, secondaryRange, 30, mineSlot);
  const randomManeuver = randomCombatManeuver(primaryRange, secondaryGuided, secondaryRange, 30, mineSlot);

  // Total misuse of the transitions system to do actions (I should make a factory for making one frame fire states)
  // Why not just break all the rules and get free ammo as well
  if (impulseSlot !== null) {
    swarm.transitions.push({
      trigger: (_, npc, ___, target) => {
        if (Math.random() < 0.02 && !!target && l2Norm(npc.player.position, target.position) < 3800) {
          npc.secondariesToFire.push(impulseSlot);
          for (const data of npc.player.slotData) {
            if (data?.ammo === 0) {
              data.ammo += 1;
            }
          }
        }
        if (npc.player.cloak === CloakedState.Uncloaked && npc.player.energy > 20) {
          npc.player.cloak = 1;
        }
        return false;
      },
      state: swarm,
    });
    run.transitions.push({
      trigger: (_, npc, ___, target) => {
        if (Math.random() < 0.02 && !!target && l2Norm(npc.player.position, target.position) < 3800) {
          npc.secondariesToFire.push(impulseSlot);
          for (const data of npc.player.slotData) {
            if (data?.ammo === 0) {
              data.ammo += 1;
            }
          }
        }
        if (npc.player.cloak === CloakedState.Uncloaked && npc.player.energy > 20) {
          npc.player.cloak = 1;
        }
        return false;
      },
      state: swarm,
    });
    randomManeuver.transitions.push({
      trigger: (_, npc, ___, target) => {
        if (Math.random() < 0.02 && !!target && l2Norm(npc.player.position, target.position) < 3800) {
          npc.secondariesToFire.push(impulseSlot);
          for (const data of npc.player.slotData) {
            if (data?.ammo === 0) {
              data.ammo += 1;
            }
          }
        }
        if (npc.player.cloak === CloakedState.Cloaked) {
          npc.player.cloak = CloakedState.Uncloaked;
        }
        return false;
      },
      state: swarm,
    });
  }

  idle.transitions.push({ trigger: (_, __, ___, target) => !!target, state: swarm });
  idle.transitions.push({ trigger: () => Math.random() < 0.01, state: passiveGoTo });
  passiveGoTo.transitions.push({ trigger: (_, __, ___, target) => !!target, state: swarm });
  passiveGoTo.transitions.push({ trigger: (_, __, memory) => !!memory.completed, state: idle });
  swarm.transitions.push({ trigger: (_, __, ___, target) => !target, state: idle });
  swarm.transitions.push({
    trigger: (_, npc, ___, target) => Math.random() < 0.008 && !!target && l2Norm(npc.player.position, target.position) < 500,
    state: randomManeuver,
  });
  randomManeuver.transitions.push({ trigger: (_, __, ___, target) => !target, state: idle });
  randomManeuver.transitions.push({ trigger: (_, __, memory) => !!memory.completed, state: swarm });
  randomManeuver.transitions.push({ trigger: () => Math.random() < 0.005, state: swarm });

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
    state: swarm,
  });
  run.transitions.push({ trigger: () => Math.random() < 0.002, state: run });
  return idle;
};

class CloakyAnnoying implements NPC {
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

  constructor(ship: string, team: Faction, id: number) {
    this.lootTable = new LootTable();

    const { def, index } = defMap.get(ship)!;

    assert(!!def.isCloaky);

    this.player = {
      position: randomNearbyPointInSector({ x: 0, y: 0 }, 6000),
      radius: def.radius,
      speed: 0,
      heading: Math.random() * 2 * Math.PI,
      health: def.health,
      id,
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
      cloak: 1,
    };

    // The striker does not have a mine slot, but I am leaving this check here anyways (I want this to work with other cloaky ships in the future)
    let mineSlot: number | null = def.slots.indexOf(SlotKind.Mine);
    if (mineSlot === -1) {
      mineSlot = null;
    } else {
      this.player = equip(this.player, mineSlot, "Proximity Mine", true);
    }

    const utilityIndices = def.slots.map((slot, i) => (slot === SlotKind.Utility ? i : -1)).filter((i) => i !== -1);

    let impulseSlot: null | number = null;
    if (utilityIndices.length > 0) {
      this.player = equip(this.player, utilityIndices[0], "Cloaking Generator", true);
    }
    if (utilityIndices.length > 1) {
      this.player = equip(this.player, utilityIndices[1], "Impulse Missile", true);
      impulseSlot = utilityIndices[1];
    }

    switch (Math.floor(Math.random() * 4)) {
      case 0:
      case 1:
        this.player = equip(this.player, 1, "Javelin Missile", true);
        this.currentState = makeStateGraph(estimateEffectivePrimaryRange(def), true, 3000, mineSlot, impulseSlot);
        break;
      case 2:
      case 3:
        this.player = equip(this.player, 1, "Tomahawk Missile", true);
        this.currentState = makeStateGraph(estimateEffectivePrimaryRange(def), true, 2500, mineSlot, impulseSlot);
        break;
    }

    this.stateGraphMemory.set(this.currentState, this.currentState.onEnter(this));
  }

  private currentState: State;

  public process(state: GlobalState, sector: number) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.defIndex];
    const newTarget = findClosestTarget(this.player, state, effectiveInfinity, true);
    this.targetId = newTarget?.id ?? 0;
    target = newTarget;
    if (!target && this.targetId) {
      target = state.players.get(this.targetId);
    }
    this.currentState = this.currentState.process(state, this, sector, target);
  }
}

const spawnAssassinationNPC = (state: GlobalState, npcFaction: Faction, targetId: number) => {
  const npc = new CloakyAnnoying("Striker", npcFaction, targetId);
  state.players.set(npc.player.id, npc.player);
};

export { spawnAssassinationNPC };
