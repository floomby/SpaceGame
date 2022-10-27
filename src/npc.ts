import { defMap, defs, emptyLoadout, Faction, UnitDefinition } from "./defs";
import {
  applyInputs,
  arrivePosition,
  currentlyFacing,
  currentlyFacingApprox,
  effectiveInfinity,
  findClosestTarget,
  GlobalState,
  Input,
  Player,
  seekPosition,
  stopPlayer,
  uid,
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

class NPC {
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

  constructor(what: string | number, team: number | Faction) {
    const id = uid();

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

    this.lootTable = [{ index: 0, probability: 0.5 }];
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

const addNpc = (state: GlobalState, what: string | number, team: Faction) => {
  const npc = new NPC(what, team);
  state.players.set(npc.player.id, npc.player);
};

export { NPC, LootTable, addNpc, processLootTable };
