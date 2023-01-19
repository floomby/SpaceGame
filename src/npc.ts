import { armDefs, collectableDefMap, defMap, defs, emptyLoadout, emptySlotData, Faction, SlotKind, UnitDefinition, UnitKind } from "./defs";
import { defaultLootTable, LootTable } from "./defs/collectables";
import { estimateEffectivePrimaryRange, projectileDefs } from "./defs/projectiles";
import {
  applyInputs,
  effectiveInfinity,
  equip,
  findClosestTarget,
  findHeadingBetween,
  GlobalState,
  Input,
  isValidSectorInDirection,
  mapSize,
  Player,
  randomNearbyPointInSector,
  sectorBounds,
  sectorDelta,
} from "./game";
import { findInterceptAimingHeading, findSmallAngleBetween, l2Norm, pointOutsideRectangle, Position, Rectangle } from "./geometry";
import { seekPosition, currentlyFacing, stopPlayer, arrivePosition, arrivePositionUsingAngle, seekPositionUsingAngle } from "./pathing";
import { recipeMap } from "./recipes";

interface NPC {
  player: Player;
  input: Input;
  angle: number | undefined;
  selectedSecondary: number;
  secondariesToFire: number[];
  lootTable: LootTable;
  targetId: number;
  process: (state: GlobalState, sector: number) => void;
  killed?: () => void;
}

type Completed = {
  completed?: boolean;
};

type StateTransition = {
  trigger: (state: GlobalState, npc: NPC, memory: Completed, target: Player | undefined) => boolean;
  state: State;
};

abstract class State {
  public transitions: StateTransition[] = [];
  protected memory: Completed | any = {};
  protected checkTransitions(state: GlobalState, npc: NPC, target: Player | undefined): State | null {
    for (const transition of this.transitions) {
      if (transition.trigger(state, npc, this.memory, target)) {
        const ret = transition.state;
        ret.onEnter(npc);
        return ret;
      }
    }
    return null;
  }

  abstract process: (state: GlobalState, npc: NPC, sector: number, target: Player | undefined) => State;
  abstract onEnter: (npc: NPC) => void;
}

const idleState = () => {
  return new (class extends State {
    process = (state: GlobalState, npc: NPC, sector, target) => {
      const newState = this.checkTransitions(state, npc, target);
      if (newState) {
        return newState;
      }
      stopPlayer(npc.player, npc.input, true);
      npc.input.primary = false;
      npc.input.secondary = false;
      applyInputs(npc.input, npc.player);
      return this;
    };
    onEnter = (npc: NPC) => {};
  })();
};

const passiveGoToRandomPointInSector = (bounds: Rectangle = sectorBounds) => {
  return new (class extends State {
    process = (state: GlobalState, npc: NPC, sector, target) => {
      const newState = this.checkTransitions(state, npc, target);
      if (newState) {
        return newState;
      }
      const angle = arrivePositionUsingAngle(npc.player, this.memory.to as Position, npc.input);
      this.memory.completed = angle === undefined;
      npc.input.primary = false;
      npc.input.secondary = false;
      applyInputs(npc.input, npc.player, angle);
      return this;
    };
    onEnter = (npc: NPC) => {
      this.memory.completed = false;
      this.memory.to = { x: Math.random() * bounds.width + bounds.x, y: Math.random() * bounds.height + bounds.y };
    };
  })();
};

const passiveGoToRandomValidNeighboringSector = () => {
  return new (class extends State {
    process = (state: GlobalState, npc: NPC, sector: number, target: Player | undefined) => {
      if (this.memory.startSector === undefined) {
        this.memory.startSector = sector;
        let valid = false;
        while (!valid) {
          if (Math.random() < 0.5) {
            this.memory.to = { x: +npc.player.position.x + sectorDelta * Math.sign(Math.random() - 0.5), y: npc.player.position.y };
          } else {
            this.memory.to = { x: npc.player.position.x, y: +npc.player.position.y + sectorDelta * Math.sign(Math.random() - 0.5) };
          }
          const direction = pointOutsideRectangle(this.memory.to, sectorBounds);
          if (direction === null) {
            continue;
          }
          valid = isValidSectorInDirection(sector, direction);
        }
      }
      const newState = this.checkTransitions(state, npc, target);
      if (newState) {
        return newState;
      }
      this.memory.completed = sector !== this.memory.startSector;
      npc.input.primary = false;
      npc.input.secondary = false;
      applyInputs(npc.input, npc.player, arrivePositionUsingAngle(npc.player, this.memory.to as Position, npc.input));
      return this;
    };
    onEnter = (npc: NPC) => {
      this.memory.completed = false;
      this.memory.startSector = undefined;
    };
  })();
};

const useMines = (npc: NPC, target: Player, slot: number, distance: number) => {
  const targetDef = defs[target.defIndex];
  if (
    targetDef.kind === UnitKind.Ship &&
    distance > 100 &&
    distance < 600 &&
    Math.abs(findSmallAngleBetween(target.heading, findHeadingBetween(target.position, npc.player.position))) < Math.PI / 4
  ) {
    npc.secondariesToFire.push(slot);
  }
};

const stupidSwarmCombat = (
  primaryRange: number,
  secondaryGuided: boolean,
  secondaryRange: number,
  energyThreshold: number,
  mineSlot: null | number
) => {
  return new (class extends State {
    process = (state: GlobalState, npc: NPC, sector, target) => {
      const newState = this.checkTransitions(state, npc, target);
      if (newState) {
        return newState;
      }
      if (target) {
        const distance = l2Norm(npc.player.position, target.position);
        const facing = currentlyFacing(npc.player, target);
        if (distance < primaryRange && facing && npc.player.energy > energyThreshold) {
          npc.input.primary = true;
        } else {
          npc.input.primary = false;
        }
        if (distance < secondaryRange) {
          if (secondaryGuided) {
            npc.input.secondary = true;
          } else if (facing) {
            npc.input.secondary = true;
          } else {
            npc.input.secondary = false;
          }
        } else {
          npc.input.secondary = false;
        }
        applyInputs(npc.input, npc.player, seekPositionUsingAngle(npc.player, target.position, npc.input));
        if (mineSlot !== null) {
          useMines(npc, target, mineSlot, distance);
        }
      } else {
        stopPlayer(npc.player, npc.input, true);
        applyInputs(npc.input, npc.player);
      }
      return this;
    };
    onEnter = (npc: NPC) => {
      npc.selectedSecondary = 1;
    };
  })();
};

const strafingSwarmCombat = (
  primaryRange: number,
  secondaryGuided: boolean,
  secondaryRange: number,
  energyThreshold: number,
  mineSlot: null | number,
  projectileSpeedToUse: number,
  projectileRangeToUse: number
) => {
  return new (class extends State {
    process = (state: GlobalState, npc: NPC, sector, target) => {
      const newState = this.checkTransitions(state, npc, target);
      if (newState) {
        return newState;
      }
      if (target) {
        const angle = findInterceptAimingHeading(npc.player.position, target, projectileSpeedToUse, projectileRangeToUse);
        if (angle === undefined) {
          this.memory.completed = true;
          return this;
        }
        const distance = l2Norm(npc.player.position, target.position);
        const facing = currentlyFacing(npc.player, target);
        const likelyToHit = Math.abs(findSmallAngleBetween(npc.player.heading, angle)) < Math.PI / 6 || (facing && distance < 400);
        npc.input.primary = npc.player.energy > energyThreshold && likelyToHit;
        if (distance < secondaryRange) {
          if (secondaryGuided) {
            npc.input.secondary = true;
          } else if (likelyToHit) {
            npc.input.secondary = true;
          } else {
            npc.input.secondary = false;
          }
        } else {
          npc.input.secondary = false;
        }
        npc.input.right = !this.memory.strafe;
        npc.input.left = this.memory.strafe;
        if (npc.player.speed > 0) {
          npc.input.down = true;
        } else {
          npc.input.down = false;
        }
        npc.input.up = false;
        applyInputs(npc.input, npc.player, angle);
        if (mineSlot !== null) {
          useMines(npc, target, mineSlot, distance);
        }
        if (distance < 500 && Math.random() < 0.01) {
          this.memory.strafe = !this.memory.strafe;
        }
      } else {
        stopPlayer(npc.player, npc.input, true);
        applyInputs(npc.input, npc.player);
      }
      return this;
    };
    onEnter = (npc: NPC) => {
      this.memory.completed = false;
      this.memory.strafe = Math.random() > 0.5 ? true : false;
      npc.selectedSecondary = 1;
    };
  })();
};

const runAway = (primaryRange: number, secondaryGuided: boolean, secondaryRange: number, energyThreshold: number, mineSlot: null | number) => {
  return new (class extends State {
    process = (state: GlobalState, npc: NPC, sector, target) => {
      const newState = this.checkTransitions(state, npc, target);
      if (newState) {
        return newState;
      }
      if (target) {
        const distance = l2Norm(npc.player.position, target.position);
        const facing = currentlyFacing(npc.player, target);
        if (distance < primaryRange && facing && npc.player.energy > energyThreshold) {
          npc.input.primary = true;
        } else {
          npc.input.primary = false;
        }
        if (distance < secondaryRange) {
          if (secondaryGuided) {
            npc.input.secondary = true;
          } else if (facing) {
            npc.input.secondary = true;
          } else {
            npc.input.secondary = false;
          }
        } else {
          npc.input.secondary = false;
        }
        applyInputs(npc.input, npc.player, seekPositionUsingAngle(npc.player, this.memory.to, npc.input));
        if (mineSlot !== null) {
          useMines(npc, target, mineSlot, distance);
        }
      } else {
        stopPlayer(npc.player, npc.input, true);
        applyInputs(npc.input, npc.player);
      }
      return this;
    };
    onEnter = (npc: NPC) => {
      this.memory.to = { x: npc.player.position.x + Math.random() * 4000 - 2000, y: npc.player.position.y + Math.random() * 4000 - 2000 };
      npc.selectedSecondary = 1;
    };
  })();
};

const runAwayWithStrafing = (
  primaryRange: number,
  secondaryGuided: boolean,
  secondaryRange: number,
  energyThreshold: number,
  mineSlot: null | number
) => {
  return new (class extends State {
    process = (state: GlobalState, npc: NPC, sector, target) => {
      const newState = this.checkTransitions(state, npc, target);
      if (newState) {
        return newState;
      }
      if (target) {
        const distance = l2Norm(npc.player.position, target.position);
        const facing = currentlyFacing(npc.player, target);
        if (distance < primaryRange && facing && npc.player.energy > energyThreshold) {
          npc.input.primary = true;
        } else {
          npc.input.primary = false;
        }
        if (distance < secondaryRange) {
          if (secondaryGuided) {
            npc.input.secondary = true;
          } else if (facing) {
            npc.input.secondary = true;
          } else {
            npc.input.secondary = false;
          }
        } else {
          npc.input.secondary = false;
        }
        npc.input.right = !this.memory.strafe;
        npc.input.left = this.memory.strafe;
        applyInputs(npc.input, npc.player, seekPositionUsingAngle(npc.player, this.memory.to, npc.input));
        if (mineSlot !== null) {
          useMines(npc, target, mineSlot, distance);
        }
        if (Math.random() < 0.05) {
          this.memory.strafe = !this.memory.strafe;
        }
      } else {
        stopPlayer(npc.player, npc.input, true);
        applyInputs(npc.input, npc.player);
      }
      return this;
    };
    onEnter = (npc: NPC) => {
      this.memory.to = { x: npc.player.position.x + Math.random() * 4000 - 2000, y: npc.player.position.y + Math.random() * 4000 - 2000 };
      this.memory.strafe = Math.random() > 0.5 ? true : false;
      npc.selectedSecondary = 1;
    };
  })();
};

const randomCombatManeuver = (
  primaryRange: number,
  secondaryGuided: boolean,
  secondaryRange: number,
  energyThreshold: number,
  mineSlot: null | number
) => {
  return new (class extends State {
    process = (state: GlobalState, npc: NPC, sector, target) => {
      const newState = this.checkTransitions(state, npc, target);
      if (newState) {
        return newState;
      }
      if (target) {
        const distance = l2Norm(npc.player.position, target.position);
        const facing = currentlyFacing(npc.player, target);
        if (distance < primaryRange && facing && npc.player.energy > energyThreshold) {
          npc.input.primary = true;
        } else {
          npc.input.primary = false;
        }
        if (distance < secondaryRange) {
          if (secondaryGuided) {
            npc.input.secondary = true;
          } else if (facing) {
            npc.input.secondary = true;
          } else {
            npc.input.secondary = false;
          }
        } else {
          npc.input.secondary = false;
        }
        applyInputs(npc.input, npc.player, seekPositionUsingAngle(npc.player, this.memory.to, npc.input));
        this.memory.completed = l2Norm(npc.player.position, this.memory.to) < 100;
        if (mineSlot !== null) {
          useMines(npc, target, mineSlot, distance);
        }
      } else {
        stopPlayer(npc.player, npc.input, true);
        applyInputs(npc.input, npc.player);
      }
      return this;
    };
    onEnter = (npc: NPC) => {
      npc.selectedSecondary = 1;
      this.memory.completed = false;
      this.memory.to = { x: Math.random() * 700 - 350 + npc.player.position.x, y: Math.random() * 700 - 350 + npc.player.position.y };
    };
  })();
};

const warpTo = (sectorList: number[]) => {
  if (sectorList.length < 2) {
    throw new Error("Sector list must have at least 2 sectors");
  }
  return new (class extends State {
    process = (state: GlobalState, npc: NPC, sector: number, target) => {
      if (this.memory.needWarp) {
        const sectors = sectorList.filter((sec) => sec !== sector);
        if (npc.player.warping < 1) {
          npc.player.warping = 1;
        }
        npc.player.warpTo = sectors[Math.floor(Math.random() * sectors.length)];
      }
      const newState = this.checkTransitions(state, npc, target);
      if (newState) {
        return newState;
      }
    };
    onEnter = (npc: NPC) => {
      this.memory.needWarp = true;
    };
  })();
};

const makeBasicStateGraph = (
  primaryRange: number,
  secondaryGuided: boolean,
  secondaryRange: number,
  energyThreshold: number,
  mineSlot: null | number,
  friendlySectors: number[],
  isStrafer: boolean
) => {
  const idle = idleState();
  const passiveGoTo = passiveGoToRandomPointInSector();
  const passiveGoToSector = passiveGoToRandomValidNeighboringSector();
  const swarm = stupidSwarmCombat(primaryRange, secondaryGuided, secondaryRange, energyThreshold, mineSlot);
  const run = isStrafer
    ? runAwayWithStrafing(primaryRange, secondaryGuided, secondaryRange, energyThreshold, mineSlot)
    : runAway(primaryRange, secondaryGuided, secondaryRange, energyThreshold, mineSlot);
  const warpAway = warpTo(friendlySectors);
  const randomWarp = warpTo(new Array(mapSize * mapSize).fill(0).map((_, i) => i));
  idle.transitions.push({ trigger: (_, __, ___, target) => !!target, state: swarm });
  idle.transitions.push({ trigger: () => Math.random() < 0.01, state: passiveGoTo });
  idle.transitions.push({ trigger: () => Math.random() < 0.01, state: passiveGoToSector });
  idle.transitions.push({ trigger: () => Math.random() < 0.02, state: randomWarp });
  passiveGoTo.transitions.push({ trigger: (_, __, ___, target) => !!target, state: swarm });
  passiveGoTo.transitions.push({ trigger: (_, __, memory) => memory.completed, state: idle });
  passiveGoToSector.transitions.push({ trigger: (_, __, ___, target) => !!target, state: swarm });
  passiveGoToSector.transitions.push({ trigger: (_, __, memory) => memory.completed, state: passiveGoTo });
  swarm.transitions.push({ trigger: (_, __, ___, target) => !target, state: idle });
  if (!isStrafer) {
    const randomManeuver = randomCombatManeuver(primaryRange, secondaryGuided, secondaryRange, energyThreshold, mineSlot);
    swarm.transitions.push({
      trigger: (_, npc, ___, target) => Math.random() < 0.008 && l2Norm(npc.player.position, target.position) < 500,
      state: randomManeuver,
    });
    randomManeuver.transitions.push({ trigger: (_, __, ___, target) => !target, state: idle });
    randomManeuver.transitions.push({ trigger: (_, __, memory) => memory.completed, state: swarm });
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
    strafeSwarm.transitions.push({ trigger: (_, __, memory) => memory.completed, state: swarm });
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
  run.transitions.push({ trigger: (_, npc) => !npc.player.warping && Math.random() < 0.02, state: warpAway });
  run.transitions.push({
    trigger: (_, npc) => {
      const def = defs[npc.player.defIndex];
      return npc.player.health > def.health / 3;
    },
    state: swarm,
  });
  run.transitions.push({ trigger: () => Math.random() < 0.002, state: run });
  warpAway.transitions.push({ trigger: () => true, state: run });
  randomWarp.transitions.push({ trigger: () => true, state: idle });
  return idle;
};

class ActiveSwarmer implements NPC {
  public player: Player;

  public input: Input = {
    left: false,
    right: false,
    up: false,
    down: false,
    primary: false,
    secondary: false,
  };
  public angle: number = undefined;

  public selectedSecondary = 1;

  public lootTable = defaultLootTable;

  public secondariesToFire: number[] = [];

  public stateGraphMemory: Map<State, any> = new Map();

  public targetId: number;

  public friendlySectors: number[] = [];

  constructor(what: string | number, team: number | Faction, id: number, friendlySectors: number[]) {
    let defIndex: number;
    let def: UnitDefinition;
    if (typeof what === "string") {
      const value = defMap.get(what);
      if (value) {
        defIndex = value.index;
        def = value.def;
      } else {
        throw new Error(`Unknown NPC type: ${what}`);
      }
    } else {
      defIndex = what;
      def = defs[defIndex];
    }
    this.player = {
      position: { x: Math.random() * 5000 - 2500, y: Math.random() * 5000 - 2500 },
      radius: defs[defIndex].radius,
      speed: 0,
      heading: Math.random() * 2 * Math.PI,
      health: defs[defIndex].health,
      id: id,
      sinceLastShot: [effectiveInfinity],
      energy: defs[defIndex].energy,
      defIndex: defIndex,
      arms: emptyLoadout(defIndex),
      slotData: emptySlotData(def),
      cargo: [],
      credits: 500,
      npc: this,
      warping: -defs[defIndex].warpTime,
      team,
      v: { x: 0, y: 0 },
      iv: { x: 0, y: 0 },
      ir: 0,
      side: 0,
    };

    let mineSlot = def.slots.indexOf(SlotKind.Mine);
    if (mineSlot === -1) {
      mineSlot = null;
    } else {
      this.player = equip(this.player, mineSlot, "Proximity Mine", true);
    }

    const isStrafer = def.name === "Strafer";

    switch (Math.floor(Math.random() * 12)) {
      case 0:
      case 1:
      case 2:
        this.player = equip(this.player, 1, "Javelin Missile", true);
        this.currentState = makeBasicStateGraph(estimateEffectivePrimaryRange(def), true, 3000, 3, mineSlot, friendlySectors, isStrafer);
        break;
      case 3:
      case 4:
        this.player = equip(this.player, 1, "Tomahawk Missile", true);
        this.currentState = makeBasicStateGraph(estimateEffectivePrimaryRange(def), true, 2500, 3, mineSlot, friendlySectors, isStrafer);
        break;
      case 5:
        this.player = equip(this.player, 1, "Laser Beam", true);
        this.currentState = makeBasicStateGraph(estimateEffectivePrimaryRange(def), true, 3000, 38, mineSlot, friendlySectors, isStrafer);
        break;
      case 6:
        this.player = equip(this.player, 1, "Heavy Javelin Missile", true);
        this.currentState = makeBasicStateGraph(estimateEffectivePrimaryRange(def), false, 700, 3, mineSlot, friendlySectors, isStrafer);
        break;
      case 7:
      case 8:
        if (isStrafer) {
          this.player = equip(this.player, 1, "Plasma Cannon", true);
          this.currentState = makeBasicStateGraph(estimateEffectivePrimaryRange(def), false, 800, 3, mineSlot, friendlySectors, isStrafer);
        } else {
          this.player = equip(this.player, 1, "Disruptor Cannon", true);
          this.currentState = makeBasicStateGraph(estimateEffectivePrimaryRange(def), false, 350, 3, mineSlot, friendlySectors, isStrafer);
        }
        break;
      case 9:
      case 10:
        this.player = equip(this.player, 1, "Plasma Cannon", true);
        this.currentState = makeBasicStateGraph(estimateEffectivePrimaryRange(def), false, 800, 3, mineSlot, friendlySectors, isStrafer);
        break;
      case 11:
        this.player = equip(this.player, 1, "EMP Missile", true);
        this.currentState = makeBasicStateGraph(estimateEffectivePrimaryRange(def), true, 3000, 3, mineSlot, friendlySectors, isStrafer);
        break;
    }

    this.stateGraphMemory.set(this.currentState, this.currentState.onEnter(this));
  }

  private currentState: State;

  public process(state: GlobalState, sector: number) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.defIndex];
    const newTarget = findClosestTarget(this.player, state, def.scanRange, true);
    this.targetId = newTarget?.id ?? 0;
    target = newTarget;
    if (!target && this.targetId) {
      target = state.players.get(this.targetId);
    }
    this.currentState = this.currentState.process(state, this, sector, target);
  }
}

const addNpc = (state: GlobalState, what: string | number, team: Faction, id: number, friendlySectors: number[]) => {
  const npc = new ActiveSwarmer(what, team, id, friendlySectors);
  state.players.set(npc.player.id, npc.player);
};

// Tutorial NPCs below

const aimlessPassiveRoaming = (bounds: Rectangle) => {
  const roam = passiveGoToRandomPointInSector(bounds);
  roam.transitions.push({ trigger: () => Math.random() < 0.05, state: roam });
  roam.transitions.push({ trigger: (_, __, memory) => memory.completed, state: roam });
  return roam;
};

class TutorialRoamingVenture implements NPC {
  public player: Player;

  public input: Input = {
    left: false,
    right: false,
    up: false,
    down: false,
    primary: false,
    secondary: false,
  };
  public angle: number = undefined;

  public selectedSecondary = 1;

  public lootTable: LootTable;

  public secondariesToFire: number[] = [];

  public stateGraphMemory: Map<State, any> = new Map();

  public targetId: number;

  constructor(id: number, where: Position) {
    this.lootTable = new LootTable();

    const { def, index } = defMap.get("Venture");

    const bounds = { x: -3000, y: -3000, width: 6000, height: 6000 };

    this.player = {
      position: randomNearbyPointInSector(where, 1500),
      radius: def.radius,
      speed: 0,
      heading: Math.random() * 2 * Math.PI,
      health: def.health,
      id: id,
      sinceLastShot: [effectiveInfinity],
      energy: def.energy,
      defIndex: index,
      arms: emptyLoadout(index),
      slotData: emptySlotData(def),
      cargo: [],
      credits: 500,
      npc: this,
      team: Faction.Rogue,
      side: 0,
      v: { x: 0, y: 0 },
      iv: { x: 0, y: 0 },
      ir: 0,
    };

    this.currentState = aimlessPassiveRoaming(bounds);

    this.stateGraphMemory.set(this.currentState, this.currentState.onEnter(this));
  }

  private currentState: State;

  public process(state: GlobalState, sector: number) {
    this.currentState = this.currentState.process(state, this, sector, undefined);
  }
}

const addTutorialRoamingVenture = (state: GlobalState, id: number, where: Position) => {
  const npc = new TutorialRoamingVenture(id, where);
  state.players.set(npc.player.id, npc.player);
  return npc;
};

class TutorialStrafer implements NPC {
  public player: Player;

  public input: Input = {
    left: false,
    right: false,
    up: false,
    down: false,
    primary: false,
    secondary: false,
  };
  public angle: number = undefined;

  public selectedSecondary = 1;

  public lootTable: LootTable;

  public secondariesToFire: number[] = [];

  private guidedSecondary: boolean;
  private usesAmmo: boolean;

  public doNotShootYet: boolean = true;

  constructor(id: number, where: Position) {
    this.lootTable = new LootTable();

    const { def, index } = defMap.get("Strafer");

    this.player = {
      position: randomNearbyPointInSector(where, 4000),
      radius: def.radius,
      speed: 0,
      heading: Math.random() * 2 * Math.PI,
      health: def.health,
      id: id,
      sinceLastShot: [effectiveInfinity],
      energy: def.energy,
      defIndex: index,
      arms: emptyLoadout(index),
      slotData: emptySlotData(def),
      cargo: [],
      credits: 500,
      npc: this,
      team: Faction.Rogue,
      side: 0,
      v: { x: 0, y: 0 },
      iv: { x: 0, y: 0 },
      ir: 0,
    };

    this.usesAmmo = true;
    this.guidedSecondary = false;
    this.player = equip(this.player, 1, "Javelin Missile", true);
  }

  public targetId = 0;

  private strafeDirection = true;

  private frame = Math.floor(Math.random() * 60);

  public process(state: GlobalState) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.defIndex];
    if (this.frame % 60 === 0) {
      const newTarget = findClosestTarget(this.player, state, def.scanRange, true, true);
      this.targetId = newTarget?.id ?? 0;
      target = newTarget;
    }

    if (this.targetId !== 0) {
      if (!target) {
        target = state.players.get(this.targetId);
      }
      if (target) {
        const dist = l2Norm(this.player.position, target.position);
        this.angle = findHeadingBetween(this.player.position, target.position);
        if (dist < 200) {
          this.input.primary = true;
          this.input.down = true;
          this.input.up = false;
          this.input.right = !this.strafeDirection;
          this.input.left = this.strafeDirection;
        } else if (dist > 1000) {
          this.input.primary = false;
          this.input.down = false;
          this.input.up = true;
          this.input.left = false;
          this.input.right = false;
          this.input.left = false;
        } else {
          this.input.primary = true;
          this.input.down = true;
          this.input.up = false;
          this.input.left = false;
          this.input.right = !this.strafeDirection;
          this.input.left = this.strafeDirection;
        }
        if (this.frame % 90 == 0 && dist < 400) {
          if (Math.random() < 0.5) {
            this.strafeDirection = !this.strafeDirection;
          }
        }
        const targetDist = l2Norm(this.player.position, target.position);
        const facing = currentlyFacing(this.player, target);
        if ((targetDist < 500 || ((this.player.energy > 50 || this.usesAmmo) && targetDist < 1000)) && facing) {
          this.input.primary = true;
        } else {
          this.input.primary = false;
        }
        this.input.secondary = (!this.guidedSecondary && targetDist < 1500 && facing) || (this.guidedSecondary && targetDist < 1500);
      } else if (l2Norm(this.player.position, { x: 0, y: 0 }) > 2000) {
        this.input.primary = false;
        this.input.secondary = false;
        this.angle = findHeadingBetween(this.player.position, { x: 0, y: 0 });
        this.input.down = false;
        this.input.up = true;
        this.input.left = false;
        this.input.right = false;
      } else {
        this.input.primary = false;
        this.input.secondary = false;
        stopPlayer(this.player, this.input);
      }
    } else if (l2Norm(this.player.position, { x: 0, y: 0 }) > 2000) {
      this.input.primary = false;
      this.input.secondary = false;
      this.angle = findHeadingBetween(this.player.position, { x: 0, y: 0 });
      this.input.down = false;
      this.input.up = true;
      this.input.left = false;
      this.input.right = false;
    } else {
      this.input.primary = false;
      this.input.secondary = false;
      stopPlayer(this.player, this.input);
    }

    if (this.doNotShootYet) {
      this.input.primary = false;
      this.input.secondary = false;
    }

    applyInputs(this.input, this.player, this.angle);
    this.frame++;
  }
}

const addTutorialStrafer = (state: GlobalState, id: number, where: Position) => {
  const npc = new TutorialStrafer(id, where);
  state.players.set(npc.player.id, npc.player);
  return npc;
};

export {
  NPC,
  LootTable,
  addNpc,
  addTutorialRoamingVenture,
  addTutorialStrafer,
  State,
  idleState,
  passiveGoToRandomPointInSector,
  stupidSwarmCombat,
  runAwayWithStrafing,
  runAway,
  randomCombatManeuver,
  strafingSwarmCombat,
};
