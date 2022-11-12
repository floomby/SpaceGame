import { armDefs, collectableDefMap, defMap, defs, emptyLoadout, emptySlotData, Faction, UnitDefinition } from "./defs";
import { projectileDefs } from "./defs/projectiles";
import {
  applyInputs,
  effectiveInfinity,
  equip,
  findClosestTarget,
  findHeadingBetween,
  GlobalState,
  Input,
  isValidSectorInDirection,
  Player,
  sectorBounds,
  sectorDelta,
} from "./game";
import { l2Norm, pointOutsideRectangle, Position } from "./geometry";
import { seekPosition, currentlyFacing, stopPlayer, arrivePosition, arrivePositionUsingAngle, seekPositionUsingAngle } from "./pathing";
import { recipeMap } from "./recipes";

// TODO Consider reimplementing this to not be a cascading probability table
type LootTable = { index: number; probability: number }[];

const processLootTable = (lootTable: LootTable) => {
  for (const entry of lootTable) {
    if (Math.random() < entry.probability) {
      return entry.index;
    }
  }
  return undefined;
};

const loot = (name: string, probability: number) => {
  return { index: collectableDefMap.get(name)!.index, probability };
};

interface NPC {
  player: Player;
  input: Input;
  angle: number;
  selectedSecondary: number;
  secondariesToFire: number[];
  lootTable: LootTable;
  targetId: number;
  process: (state: GlobalState, sector: number) => void;
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

const passiveGoToRandomPointInSector = () => {
  return new (class extends State {
    process = (state: GlobalState, npc: NPC, sector, target) => {
      const newState = this.checkTransitions(state, npc, target);
      if (newState) {
        return newState;
      }
      const angle = arrivePositionUsingAngle(npc.player, this.memory.to as Position, npc.input);
      this.memory.completed = angle === undefined;
      applyInputs(npc.input, npc.player, angle);
      return this;
    };
    onEnter = (npc: NPC) => {
      this.memory.completed = false;
      this.memory.to = { x: Math.random() * sectorBounds.width + sectorBounds.x, y: Math.random() * sectorBounds.height + sectorBounds.y };
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
      applyInputs(npc.input, npc.player, arrivePositionUsingAngle(npc.player, this.memory.to as Position, npc.input));
      return this;
    };
    onEnter = (npc: NPC) => {
      this.memory.completed = false;
      this.memory.startSector = undefined;
    };
  })();
};

const stupidSwarmCombat = (primaryRange: number, secondaryGuided: boolean, secondaryRange: number, energyThreshold: number) => {
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

const randomCombatManeuver = (primaryRange: number, secondaryGuided: boolean, secondaryRange: number, energyThreshold: number) => {
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

const makeTestStateGraph = (primaryRange: number, secondaryGuided: boolean, secondaryRange: number, energyThreshold: number) => {
  const idle = idleState();
  const passiveGoTo = passiveGoToRandomPointInSector();
  const passiveGoToSector = passiveGoToRandomValidNeighboringSector();
  const swarm = stupidSwarmCombat(primaryRange, secondaryGuided, secondaryRange, energyThreshold);
  const randomManeuver = randomCombatManeuver(primaryRange, secondaryGuided, secondaryRange, energyThreshold);
  idle.transitions.push({ trigger: (_, __, ___, target) => !!target, state: swarm });
  idle.transitions.push({ trigger: () => Math.random() < 0.005, state: passiveGoTo });
  idle.transitions.push({ trigger: () => Math.random() < 0.004, state: passiveGoToSector });
  passiveGoTo.transitions.push({ trigger: (_, __, ___, target) => !!target, state: swarm });
  passiveGoTo.transitions.push({ trigger: (_, __, memory) => memory.completed, state: idle });
  passiveGoToSector.transitions.push({ trigger: (_, __, ___, target) => !!target, state: swarm });
  passiveGoToSector.transitions.push({ trigger: (_, __, memory) => memory.completed, state: passiveGoTo });
  swarm.transitions.push({ trigger: (_, __, ___, target) => !target, state: idle });
  swarm.transitions.push({
    trigger: (_, npc, ___, target) => Math.random() < 0.01 && l2Norm(npc.player.position, target.position) < 500,
    state: randomManeuver,
  });
  randomManeuver.transitions.push({ trigger: (_, __, ___, target) => !target, state: idle });
  randomManeuver.transitions.push({ trigger: (_, __, memory) => memory.completed, state: swarm });
  randomManeuver.transitions.push({ trigger: () => Math.random() < 0.005, state: swarm });
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

  public lootTable: LootTable = [];

  public secondariesToFire: number[] = [];

  public stateGraphMemory: Map<State, any> = new Map();

  public targetId: number;

  constructor(what: string | number, team: number | Faction, id: number) {
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
      projectileId: 0,
      energy: defs[defIndex].energy,
      defIndex: defIndex,
      armIndices: emptyLoadout(defIndex),
      slotData: emptySlotData(def),
      cargo: [],
      credits: 500,
      npc: this,
      team,
      v: { x: 0, y: 0 },
      iv: { x: 0, y: 0 },
      ir: 0,
    };

    switch (Math.floor(Math.random() * 12)) {
      case 0:
      case 1:
      case 2:
        this.player = equip(this.player, 1, "Javelin Missile", true);
        this.currentState = makeTestStateGraph(projectileDefs[def.primaryDefIndex].range / 3, true, 3000, 3);
        break;
      case 3:
      case 4:
        this.player = equip(this.player, 1, "Tomahawk Missile", true);
        this.currentState = makeTestStateGraph(projectileDefs[def.primaryDefIndex].range / 3, true, 2500, 3);
        break;
      case 5:
        this.player = equip(this.player, 1, "Laser Beam", true);
        this.currentState = makeTestStateGraph(projectileDefs[def.primaryDefIndex].range / 3, true, 3000, 38);
        break;
      case 6:
        this.player = equip(this.player, 1, "Heavy Javelin Missile", true);
        this.currentState = makeTestStateGraph(projectileDefs[def.primaryDefIndex].range / 3, false, 700, 3);
        break;
      case 7:
      case 8:
        this.player = equip(this.player, 1, "Disruptor Cannon", true);
        this.currentState = makeTestStateGraph(projectileDefs[def.primaryDefIndex].range / 3, false, 350, 3);
        break;
      case 9:
      case 10:
        this.player = equip(this.player, 1, "Plasma Cannon", true);
        this.currentState = makeTestStateGraph(projectileDefs[def.primaryDefIndex].range / 3, false, 800, 3);
        break;
      case 11:
        this.player = equip(this.player, 1, "EMP Missile", true);
        this.currentState = makeTestStateGraph(projectileDefs[def.primaryDefIndex].range / 3, true, 3000, 3);
        break;
    }

    for (const recipe of recipeMap.keys()) {
      this.lootTable.push(loot(`Recipe - ${recipe}`, 0.1));
    }
    this.lootTable = this.lootTable.concat([
      loot("Bounty", 0.2),
      loot("Health", 0.5),
      loot("Energy", 0.2),
      loot("Ammo", 0.3),
      loot("Spare Parts", 0.8),
    ]);

    this.stateGraphMemory.set(this.currentState, this.currentState.onEnter(this));
  }

  private currentState: State;

  private frame = Math.floor(Math.random() * 60);

  public process(state: GlobalState, sector: number) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.defIndex];
    if (this.frame++ % 60 === 0) {
      const newTarget = findClosestTarget(this.player, state, def.scanRange, true);
      this.targetId = newTarget?.id ?? 0;
      target = newTarget;
    }
    if (!target && this.targetId) {
      target = state.players.get(this.targetId);
    }
    this.currentState = this.currentState.process(state, this, sector, target);
  }
}

class Swarmer implements NPC {
  public player: Player;

  public input: Input = {
    left: false,
    right: false,
    up: false,
    down: false,
    primary: false,
    secondary: false,
  };
  public selectedSecondary = 1;

  public angle: number = undefined;

  public lootTable: LootTable = [];

  public secondariesToFire: number[] = [];

  private guidedSecondary: boolean;

  constructor(what: string | number, team: number | Faction, id: number) {
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
      projectileId: 0,
      energy: defs[defIndex].energy,
      defIndex: defIndex,
      armIndices: emptyLoadout(defIndex),
      slotData: emptySlotData(def),
      cargo: [],
      credits: 500,
      npc: this,
      team,
      v: { x: 0, y: 0 },
      iv: { x: 0, y: 0 },
      ir: 0,
    };

    switch (Math.floor(Math.random() * 5)) {
      case 0:
        this.player = equip(this.player, 1, "Javelin Missile", true);
        this.guidedSecondary = false;
        break;
      case 1:
        this.player = equip(this.player, 1, "Tomahawk Missile", true);
        this.guidedSecondary = true;
        break;
      case 2:
        this.player = equip(this.player, 1, "Laser Beam", true);
        this.guidedSecondary = true;
        break;
      case 3:
        this.player = equip(this.player, 1, "Heavy Javelin Missile", true);
        this.guidedSecondary = false;
        break;
      case 4:
        this.player = equip(this.player, 1, "EMP Missile", true);
        this.guidedSecondary = true;
        break;
    }

    for (const recipe of recipeMap.keys()) {
      this.lootTable.push(loot(`Recipe - ${recipe}`, 0.1));
    }
    this.lootTable = this.lootTable.concat([
      loot("Bounty", 0.2),
      loot("Health", 0.5),
      loot("Energy", 0.2),
      loot("Ammo", 0.3),
      loot("Spare Parts", 0.8),
    ]);
  }

  public targetId = 0;

  private doRadomManeuver = 0;
  private randomManeuverPosition = { x: 0, y: 0 };

  private frame = Math.floor(Math.random() * 60);

  public process(state: GlobalState) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.defIndex];
    if (this.frame % 60 === 0) {
      const newTarget = findClosestTarget(this.player, state, def.scanRange, true);
      this.targetId = newTarget?.id ?? 0;
      target = newTarget;
    }

    if (this.targetId !== 0) {
      if (!target) {
        target = state.players.get(this.targetId);
      }
      if (target) {
        if (this.doRadomManeuver > 0) {
          seekPosition(this.player, this.randomManeuverPosition, this.input);
          if (l2Norm(this.player.position, this.randomManeuverPosition) < 50) {
            this.doRadomManeuver = 0;
          }
          this.doRadomManeuver--;
        } else {
          seekPosition(this.player, target.position, this.input);
        }
        const targetDist = l2Norm(this.player.position, target.position);
        const facing = currentlyFacing(this.player, target);
        if (targetDist < 500 && facing) {
          this.input.primary = true;
        } else {
          this.input.primary = false;
        }
        if (targetDist < 700) {
          if (this.frame % 400 === 0 && Math.random() < 0.5) {
            this.doRadomManeuver = 180;
            this.randomManeuverPosition = {
              x: this.player.position.x + Math.random() * 600 - 300,
              y: this.player.position.y + Math.random() * 600 - 300,
            };
          }
        }
        this.input.secondary = (!this.guidedSecondary && targetDist < 1500 && facing) || (this.guidedSecondary && targetDist < 1500);
      } else if (l2Norm(this.player.position, { x: 0, y: 0 }) > 3000) {
        this.input.primary = false;
        this.input.secondary = false;
        this.doRadomManeuver = 0;
        seekPosition(this.player, { x: 0, y: 0 }, this.input);
      } else {
        this.doRadomManeuver = 0;
        this.input.primary = false;
        this.input.secondary = false;
        stopPlayer(this.player, this.input);
      }
    } else if (l2Norm(this.player.position, { x: 0, y: 0 }) > 3000) {
      this.input.primary = false;
      this.input.secondary = false;
      this.doRadomManeuver = 0;
      seekPosition(this.player, { x: 0, y: 0 }, this.input);
    } else {
      this.doRadomManeuver = 0;
      this.input.primary = false;
      this.input.secondary = false;
      stopPlayer(this.player, this.input);
    }
    applyInputs(this.input, this.player);

    this.frame++;
  }
}

// Special ai for the strafer unit
class Strafer implements NPC {
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

  public lootTable: LootTable = [];

  public secondariesToFire: number[] = [];

  private guidedSecondary: boolean;
  private usesAmmo: boolean;

  constructor(what: string | number, team: number | Faction, id: number) {
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
      projectileId: 0,
      energy: defs[defIndex].energy,
      defIndex: defIndex,
      armIndices: emptyLoadout(defIndex),
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

    this.usesAmmo = true;
    switch (Math.floor(Math.random() * 5)) {
      case 0:
        this.player = equip(this.player, 1, "Javelin Missile", true);
        this.guidedSecondary = false;
        break;
      case 1:
        this.player = equip(this.player, 1, "Tomahawk Missile", true);
        this.guidedSecondary = true;
        break;
      case 2:
        this.player = equip(this.player, 1, "Laser Beam", true);
        this.guidedSecondary = true;
        this.usesAmmo = false;
        break;
      case 3:
        this.player = equip(this.player, 1, "Heavy Javelin Missile", true);
        this.guidedSecondary = false;
        break;
      case 4:
        this.player = equip(this.player, 1, "EMP Missile", true);
        this.guidedSecondary = true;
        break;
    }

    for (const recipe of recipeMap.keys()) {
      this.lootTable.push(loot(`Recipe - ${recipe}`, 0.1));
    }
    this.lootTable = this.lootTable.concat([
      loot("Bounty", 0.2),
      loot("Health", 0.5),
      loot("Energy", 0.2),
      loot("Ammo", 0.3),
      loot("Spare Parts", 0.8),
    ]);
  }

  public targetId = 0;

  private strafeDirection = true;

  private frame = Math.floor(Math.random() * 60);

  public process(state: GlobalState) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.defIndex];
    if (this.frame % 60 === 0) {
      const newTarget = findClosestTarget(this.player, state, def.scanRange, true);
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
    applyInputs(this.input, this.player, this.angle);
    this.frame++;
  }
}

const addNpc = (state: GlobalState, what: string | number, team: Faction, id: number) => {
  let npc: NPC;
  switch (what) {
    // case "Striker":
    //   npc = new ActiveSwarmer(what, team, id);
    //   break;
    case "Strafer":
    case 6:
      // case 0:
      // case "Fighter":
      npc = new Strafer(what, team, id);
      break;
    default:
      npc = new ActiveSwarmer(what, team, id);
      break;
  }
  // console.log(npc);
  state.players.set(npc.player.id, npc.player);
};

export { NPC, LootTable, addNpc, processLootTable };
