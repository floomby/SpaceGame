import { collectableDefMap, defMap, defs, emptyLoadout, Faction, UnitDefinition } from "./defs";
import {
  applyInputs,
  arrivePosition,
  currentlyFacing,
  currentlyFacingApprox,
  effectiveInfinity,
  findClosestTarget,
  findHeadingBetween,
  GlobalState,
  Input,
  l2Norm,
  Player,
  seekPosition,
  stopPlayer,
} from "./game";

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
  selectedSecondary: number;
  lootTable: LootTable;
  targetId: number;
  process: (state: GlobalState, frame: number) => void
}

class Swarmer implements NPC {
  public player: Player;

  private input: Input = {
    left: false,
    right: false,
    up: false,
    down: false,
    primary: false,
    secondary: false,
  };
  public selectedSecondary = 0;

  public lootTable: LootTable = [];

  constructor(what: string | number, team: number | Faction, id: number) {
    let definitionIndex: number;
    let def: UnitDefinition;
    if (typeof what === "string") {
      const value = defMap.get(what);
      if (value) {
        definitionIndex = value.index;
        def = value.def;
      } else {
        throw new Error(`Unknown NPC type: ${what}`);
      }
    } else {
      definitionIndex = what;
      def = defs[definitionIndex];
    }
    this.player = {
      position: { x: 0, y: 0 },
      radius: defs[definitionIndex].radius,
      speed: 0,
      heading: 0,
      health: defs[definitionIndex].health,
      id: id,
      sinceLastShot: [effectiveInfinity],
      projectileId: 0,
      energy: defs[definitionIndex].energy,
      definitionIndex: definitionIndex,
      armIndices: emptyLoadout(definitionIndex),
      slotData: [{}, {}, {}],
      cargo: [{ what: "Teddy Bears", amount: 30 }],
      credits: 500,
      npc: this,
      team,
    };

    this.lootTable = [loot("Bounty", 0.3), loot("Ammo", 0.5), loot("Spare Parts", 0.7)];
  }

  public targetId = 0;

  public process(state: GlobalState, frame: number) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.definitionIndex];
    if (frame % 60 === 0) {
      const newTarget = findClosestTarget(this.player, state, def.scanRange, true);
      this.targetId = newTarget?.id ?? 0;
      target = newTarget;
    }

    if (this.targetId !== 0) {
      if (!target) {
        target = state.players.get(this.targetId);
      }
      if (target) {
        seekPosition(this.player, target.position, this.input);
        if (currentlyFacing(this.player, target)) {
          this.input.primary = true;
        } else {
          this.input.primary = false;
        }
      } else {
        stopPlayer(this.player, this.input);
      }
    }
    applyInputs(this.input, this.player);
  }
}

// Special ai for the strafer unit
class Strafer implements NPC {
  public player: Player;

  private input: Input = {
    left: false,
    right: false,
    up: false,
    down: false,
    primary: false,
    secondary: false,
  };
  private angle: number = undefined;

  public selectedSecondary = 0;

  public lootTable: LootTable = [];

  constructor(what: string | number, team: number | Faction, id: number) {
    let definitionIndex: number;
    let def: UnitDefinition;
    if (typeof what === "string") {
      const value = defMap.get(what);
      if (value) {
        definitionIndex = value.index;
        def = value.def;
      } else {
        throw new Error(`Unknown NPC type: ${what}`);
      }
    } else {
      definitionIndex = what;
      def = defs[definitionIndex];
    }
    this.player = {
      position: { x: Math.random() * 2000 - 1000, y: Math.random() * 2000 - 1000 },
      radius: defs[definitionIndex].radius,
      speed: 0,
      heading: 0,
      health: defs[definitionIndex].health,
      id: id,
      sinceLastShot: [effectiveInfinity],
      projectileId: 0,
      energy: defs[definitionIndex].energy,
      definitionIndex: definitionIndex,
      armIndices: emptyLoadout(definitionIndex),
      slotData: [{}, {}, {}],
      cargo: [{ what: "Teddy Bears", amount: 30 }],
      credits: 500,
      npc: this,
      team,
      side: 0,
    };

    this.lootTable = [loot("Bounty", 0.3), loot("Ammo", 0.5), loot("Spare Parts", 0.7)];
  }

  public targetId = 0;

  private strafeDirection = true;

  public process(state: GlobalState, frame: number) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.definitionIndex];
    if (frame % 60 === 0) {
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
        } else 
        if (dist > 1000) {
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
        if (frame % 90 == 0 && dist < 400) {
          if (Math.random() < 0.5) {
            this.strafeDirection = !this.strafeDirection;
          }
        }

        // this.input.left = true;

        // if (currentlyFacing(this.player, target)) {
        //   this.input.primary = true;
        // } else {
        //   this.input.primary = false;
        // }
      } else {
        stopPlayer(this.player, this.input);
      }
    }
    applyInputs(this.input, this.player, this.angle);
  }
}

const addNpc = (state: GlobalState, what: string | number, team: Faction, id: number) => {
  let npc: NPC;
  switch (what) {
    case "Strafer":
    case 6:
    // case 0:
    // case "Fighter":
      npc = new Strafer(what, team, id);
      break;
    default:
      npc = new Swarmer(what, team, id);
      break;
  }
  // console.log(npc);
  state.players.set(npc.player.id, npc.player);
};

export { NPC, LootTable, addNpc, processLootTable };
