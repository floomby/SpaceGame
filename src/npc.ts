import { defMap, defs, emptyLoadout, UnitDefinition } from "./defs";
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

  constructor(what: string | number) {
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
    };
  }

  public targetId = 0;

  public process(state: GlobalState, frame: number) {
    let target: Player | undefined = undefined;
    if (frame % 60 === 0) {
      const [newTarget, id] = findClosestTarget(this.player, state, true);
      this.targetId = id;
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

const addNpc = (state: GlobalState) => {
  const npc = new NPC("Drone");
  state.players.set(npc.player.id, npc.player);
};

export { NPC, addNpc };
