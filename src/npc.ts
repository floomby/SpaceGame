import { armDefs, collectableDefMap, defMap, defs, emptyLoadout, emptySlotData, Faction, UnitDefinition } from "./defs";
import {
  applyInputs,
  arrivePosition,
  currentlyFacing,
  currentlyFacingApprox,
  effectiveInfinity,
  equip,
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
  process: (state: GlobalState, frame: number) => void;
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
  public selectedSecondary = 1;

  public lootTable: LootTable = [];

  private guidedSecondary: boolean;

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
      position: { x: Math.random() * 5000 - 2500, y: Math.random() * 5000 - 2500 },
      radius: defs[definitionIndex].radius,
      speed: 0,
      heading: Math.random() * 2 * Math.PI,
      health: defs[definitionIndex].health,
      id: id,
      sinceLastShot: [effectiveInfinity],
      projectileId: 0,
      energy: defs[definitionIndex].energy,
      definitionIndex: definitionIndex,
      armIndices: emptyLoadout(definitionIndex),
      slotData: emptySlotData(def),
      cargo: [],
      credits: 500,
      npc: this,
      team,
    };

    if (Math.random() < 0.5) {
      equip(this.player, 1, "Javelin Missile");
      this.guidedSecondary = false;
    } else if (Math.random() < 0.5) {
      equip(this.player, 1, "Tomahawk Missile");
      this.guidedSecondary = true;
    } else if (Math.random() < 0.5) {
      equip(this.player, 1, "Laser Beam");
      this.guidedSecondary = true;
    } else {
      equip(this.player, 1, "Heavy Javelin Missile");
      this.guidedSecondary = false;
    }

    this.lootTable = [loot("Bounty", 0.2), loot("Energy", 0.4), loot("Ammo", 0.3), loot("Spare Parts", 0.8)];
  }

  private justSpawned = true;

  public targetId = 0;

  private doRadomManeuver = false;
  private randomManeuverPosition = { x: 0, y: 0 };

  public process(state: GlobalState, frame: number) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.definitionIndex];
    if (frame % 60 === 0 || this.justSpawned) {
      this.justSpawned = false;
      const newTarget = findClosestTarget(this.player, state, def.scanRange, true);
      this.targetId = newTarget?.id ?? 0;
      target = newTarget;
    }

    if (this.targetId !== 0) {
      if (!target) {
        target = state.players.get(this.targetId);
      }
      if (target) {
        if (this.doRadomManeuver) {
          seekPosition(this.player, this.randomManeuverPosition, this.input);
          if (l2Norm(this.player.position, this.randomManeuverPosition) < 50) {
            this.doRadomManeuver = false;
          }
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
          if (frame % 400 === 0 && Math.random() < 0.5) {
            this.doRadomManeuver = true;
            this.randomManeuverPosition = {
              x: this.player.position.x + Math.random() * 600 - 300,
              y: this.player.position.y + Math.random() * 600 - 300,
            };
          }
        }
        this.input.secondary = (!this.guidedSecondary && targetDist < 1500 && facing) || (this.guidedSecondary && targetDist < 1500);
      } else if (l2Norm(this.player.position, { x: 0, y: 0 }) > 1000) {
        this.input.primary = false;
        this.input.secondary = false;
        this.doRadomManeuver = false;
        seekPosition(this.player, { x: 0, y: 0 }, this.input);
      } else {
        this.doRadomManeuver = false;
        this.input.primary = false;
        this.input.secondary = false;
        stopPlayer(this.player, this.input);
      }
    } else if (l2Norm(this.player.position, { x: 0, y: 0 }) > 1000) {
      this.input.primary = false;
      this.input.secondary = false;
      this.doRadomManeuver = false;
      seekPosition(this.player, { x: 0, y: 0 }, this.input);
    } else {
      this.doRadomManeuver = false;
      this.input.primary = false;
      this.input.secondary = false;
      stopPlayer(this.player, this.input);
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

  public selectedSecondary = 1;

  public lootTable: LootTable = [];

  private guidedSecondary: boolean;
  private usesAmmo: boolean;

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
      position: { x: Math.random() * 5000 - 2500, y: Math.random() * 5000 - 2500 },
      radius: defs[definitionIndex].radius,
      speed: 0,
      heading: Math.random() * 2 * Math.PI,
      health: defs[definitionIndex].health,
      id: id,
      sinceLastShot: [effectiveInfinity],
      projectileId: 0,
      energy: defs[definitionIndex].energy,
      definitionIndex: definitionIndex,
      armIndices: emptyLoadout(definitionIndex),
      slotData: emptySlotData(def),
      cargo: [],
      credits: 500,
      npc: this,
      team,
      side: 0,
    };

    this.usesAmmo = true;
    if (Math.random() < 0.5) {
      equip(this.player, 1, "Javelin Missile");
      this.guidedSecondary = false;
    } else if (Math.random() < 0.5) {
      equip(this.player, 1, "Tomahawk Missile");
      this.guidedSecondary = true;
    } else if (Math.random() < 0.5) {
      equip(this.player, 1, "Laser Beam");
      this.guidedSecondary = true;
      this.usesAmmo = false;
    } else {
      equip(this.player, 1, "Heavy Javelin Missile");
      this.guidedSecondary = false;
    }

    this.lootTable = [loot("Bounty", 0.3), loot("Energy", 0.4), loot("Ammo", 0.5), loot("Spare Parts", 0.7)];
  }

  public targetId = 0;

  private strafeDirection = true;

  private justSpawned = true;

  public process(state: GlobalState, frame: number) {
    let target: Player | undefined = undefined;
    const def = defs[this.player.definitionIndex];
    if (frame % 60 === 0 || this.justSpawned) {
      this.justSpawned = false;
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
        if (frame % 90 == 0 && dist < 400) {
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
