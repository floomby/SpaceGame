// This is shared by the server and the client

import {
  UnitDefinition,
  UnitKind,
  defs,
  asteroidDefs,
  armDefs,
  armDefMap,
  TargetedKind,
  missileDefs,
  ArmamentDef,
  emptyLoadout,
  collectableDefs,
  createCollectableFromDef,
  Faction,
  asteroidDefMap,
  mineDefs,
  AsteroidDef,
} from "./defs";
import { projectileDefs } from "./defs/projectiles";
import {
  Circle,
  Position,
  l2Norm,
  positiveMod,
  l2NormSquared,
  circlesIntersect,
  pointInCircle,
  Rectangle,
  findLinesTangentToCircleThroughPoint,
  findHeadingBetween,
  findInterceptAimingHeading,
  findLineHeading,
  findSmallAngleBetween,
  isAngleBetween,
  CardinalDirection,
  pointOutsideRectangle,
  pointInRectangle,
  canonicalizeAngle,
} from "./geometry";
import { NPC } from "./npc";
import { seek } from "./pathing";
import { sfc32 } from "./prng";

// TODO Move the geometry stuff to a separate file

type Entity = Circle & { id: number; speed: number; heading: number };

type CargoEntry = { what: string; amount: number };

enum CloakedState {
  Cloaked = 120,
  Uncloaked = 0,
}

// There is a bunch of information that the clients do not need but end up receiving anyways
// The server should probably not send the extra information
// This would reduces throughput through the single hottest path in the client code
// The client only really needs needs to know
//   radius
//   position
//   id
//   heading
//   health
//   energy
//   defIndex
//   team
//   canDock
//   docked
//   canRepair
//   arms
//   slotData
//   cargo
//   credits
//   inoperable
//   warping
//   repairs
//   disabled
//   cloak
type Player = Entity & {
  health: number;
  // This is for primary weapons (it is an array because stations have multiple independent hardpoints)
  // Ships just have one element in the array
  sinceLastShot: number[];
  toFirePrimary?: boolean;
  toFireSecondary?: boolean;
  energy: number;
  defIndex: number;
  team: number;
  canDock?: number;
  docked?: number;
  canRepair?: number;
  arms: number[];
  // Limited to flat objects (change player copy code to augment this behavior if needed)
  slotData: any[];
  cargo?: CargoEntry[];
  credits?: number;
  inoperable?: boolean;
  warping?: number;
  warpTo?: number;
  isPC?: boolean;
  npc?: NPC;
  side?: number;
  repairs?: number[];
  disabled?: number;
  omega?: number;
  v?: Position;
  cloak?: number;
  // Velocity impulse
  iv: Position;
  // Rotation impulse
  ir: number;
  // Pitch
  p?: number;
  // Pitch impulse
  ip?: number;
  // Roll
  rl?: number;
  // Roll impulse
  irl?: number;
};

type Asteroid = Circle & {
  id: number;
  resources: number;
  heading: number;
  defIndex: number;
  roll?: number;
  pitch?: number;
  rotationRate?: number;
};

type Missile = Entity & {
  damage: number;
  target?: number;
  team: number;
  lifetime: number;
  defIndex: number;
  modelMatrix?: any;
  roll?: number;
  stale?: boolean;
};

enum TargetKind {
  None = 0,
  Player,
  Asteroid,
}

const availableCargoCapacity = (player: Player) => {
  const def = defs[player.defIndex];
  let capacity = 0;
  if (def.cargoCapacity) {
    capacity = def.cargoCapacity;
  }
  const carrying = player.cargo?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
  return capacity - carrying;
};

const addCargo = (player: Player, what: string, amount: number) => {
  if (!player.cargo) {
    player.cargo = [];
  }
  const maxAmount = availableCargoCapacity(player);
  const existing = player.cargo.find((c) => c.what === what);
  const amountToAdd = Math.min(amount, maxAmount);
  if (existing) {
    existing.amount += amountToAdd;
  } else {
    player.cargo.push({ what, amount: amountToAdd });
  }
  return amountToAdd;
};

const cargoContains = (player: Player, what: string) => {
  return player.cargo?.find((c) => c.what === what)?.amount || 0;
};

const removeAtMostCargo = (player: Player, what: string, amount: number) => {
  const existing = player.cargo?.find((c) => c.what === what);
  if (existing) {
    const removed = Math.min(amount, existing.amount);
    existing.amount -= removed;
    if (existing.amount === 0) {
      player.cargo = player.cargo.filter((c) => c !== existing);
    }
    return removed;
  }
  return 0;
};

type ChatMessage = {
  id: number;
  message: string;
  showUntil: number;
  rasterizationData?: any;
};

const copyPlayer = (player: Player) => {
  return JSON.parse(JSON.stringify(player));
};

const canDock = (player: Player | undefined, station: Player | undefined, strict = true) => {
  if (!player || !station) {
    return false;
  }
  const stationDef = defs[station.defIndex];
  if (stationDef.kind !== UnitKind.Station || !stationDef.dockable || station.inoperable) {
    return false;
  }
  const distance = l2Norm(player.position, station.position);
  if (strict) {
    return distance < stationDef.radius;
  } else {
    return distance < stationDef.radius * 2;
  }
};

// Can roll into the above, but this is more clear
const canRepair = (player: Player | undefined, station: Player | undefined, strict = true) => {
  if (!player || !station) {
    return false;
  }
  const stationDef = defs[station.defIndex];
  if (stationDef.kind !== UnitKind.Station || !station.inoperable) {
    return false;
  }
  const distance = l2Norm(player.position, station.position);
  if (strict) {
    return distance < stationDef.radius && cargoContains(player, "Spare Parts");
    // return distance < stationDef.radius;
  } else {
    // return distance < stationDef.radius * 2;
    return distance < stationDef.radius * 2 && cargoContains(player, "Spare Parts");
  }
};

type Ballistic = Entity & { damage: number; team: number; parent: number; frameTillEXpire: number; idx: number };

type Mine = Entity & { defIndex: number; team: number; left: number; deploying: number; pitch?: number; modelMatrix?: any };

// const clientMineDeploymentUpdater = (mines: IterableIterator<Mine>, sixtieths: number) => {
//   for (const mine of mines) {
//     mine.deploying = Math.max(0, mine.deploying - sixtieths);
//   }
// };

type Collectable = Entity & { index: number; framesLeft: number; phase?: number };

enum EffectAnchorKind {
  Absolute,
  Player,
  Asteroid,
  Missile,
  Projectile,
}

type EffectAnchor = {
  kind: EffectAnchorKind;
  value: Position | number;
  heading?: number;
  speed?: number;
};

type EffectTrigger = {
  effectIndex: number;
  from?: EffectAnchor;
  to?: EffectAnchor;
};

type GlobalState = {
  players: Map<number, Player>;
  projectiles: Map<number, Ballistic>;
  asteroids: Map<number, Asteroid>;
  missiles: Map<number, Missile>;
  collectables: Map<number, Collectable>;
  asteroidsDirty?: boolean;
  mines: Map<number, Mine>;
  projectileId?: number;
};

const setCanDockOrRepair = (player: Player, state: GlobalState) => {
  if (player) {
    if (player.docked) {
      player.canDock = undefined;
      player.canRepair = undefined;
      return;
    }
    player.canDock = undefined;
    state.players.forEach((otherPlayer) => {
      const def = defs[otherPlayer.defIndex];
      if (def.kind === UnitKind.Station) {
        if (player.team === otherPlayer.team && canDock(player, otherPlayer)) {
          player.canDock = otherPlayer.id;
        }
        if (canRepair(player, otherPlayer)) {
          // console.log("can repair", player.id, otherPlayer.id);
          player.canRepair = otherPlayer.id;
        }
      }
    });
  }
};

const findClosestTarget = (player: Player, state: GlobalState, scanRange: number, onlyEnemy = false, unlimitedRange = false) => {
  let ret: Player | undefined = undefined;
  let minDistance = Infinity;
  let def: UnitDefinition;
  if (onlyEnemy) {
    def = defs[player.defIndex];
  }
  const scanRangeSquared = scanRange * scanRange;
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer.docked || otherPlayer.inoperable || (otherPlayer.team !== player.team && otherPlayer.cloak)) {
      continue;
    }
    if (onlyEnemy && player.team === otherPlayer.team) {
      continue;
    }
    if (player === otherPlayer) {
      continue;
    }
    const distanceSquared = l2NormSquared(player.position, otherPlayer.position);
    if (distanceSquared < minDistance && (distanceSquared < scanRangeSquared || unlimitedRange)) {
      minDistance = distanceSquared;
      ret = otherPlayer;
    }
  }
  return ret;
};

const findFurthestTarget = (player: Player, state: GlobalState, scanRange: number, onlyEnemy = false) => {
  let ret: Player | undefined = undefined;
  let maxDistance = 0;
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer.docked || otherPlayer.inoperable || (otherPlayer.team !== player.team && otherPlayer.cloak)) {
      continue;
    }
    if (onlyEnemy && player.team === otherPlayer.team) {
      continue;
    }
    if (player === otherPlayer) {
      continue;
    }
    const distanceSquared = l2NormSquared(player.position, otherPlayer.position);
    if (distanceSquared > maxDistance && distanceSquared < scanRange * scanRange) {
      maxDistance = distanceSquared;
      ret = otherPlayer;
    }
  }
  return ret;
};

const findNextTarget = (player: Player, current: Player | undefined, state: GlobalState, scanRange: number, onlyEnemy = false) => {
  if (!current) {
    return findClosestTarget(player, state, scanRange, onlyEnemy);
  }
  let ret: Player | undefined = current;
  const currentDistanceSquared = l2NormSquared(player.position, current.position);
  let minDistanceGreaterThanCurrent = Infinity;
  let foundFurther = false;
  const scanRangeSquared = scanRange * scanRange;
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer.docked || otherPlayer.inoperable || (otherPlayer.team !== player.team && otherPlayer.cloak)) {
      continue;
    }
    if (onlyEnemy && player.team === otherPlayer.team) {
      continue;
    }
    if (player === otherPlayer) {
      continue;
    }
    const distanceSquared = l2NormSquared(player.position, otherPlayer.position);
    if (distanceSquared > currentDistanceSquared && distanceSquared < minDistanceGreaterThanCurrent && distanceSquared < scanRangeSquared) {
      minDistanceGreaterThanCurrent = distanceSquared;
      ret = otherPlayer;
      foundFurther = true;
    }
  }
  if (!foundFurther) {
    return findClosestTarget(player, state, scanRange, onlyEnemy);
  }
  return ret;
};

const findPreviousTarget = (player: Player, current: Player | undefined, state: GlobalState, scanRange: number, onlyEnemy = false) => {
  if (!current) {
    return findClosestTarget(player, state, scanRange, onlyEnemy);
  }
  let ret: Player | undefined = current;
  const currentDistanceSquared = l2NormSquared(player.position, current.position);
  let maxDistanceLessThanCurrent = 0;
  let foundCloser = false;
  const scanRangeSquared = scanRange * scanRange;
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer.docked || otherPlayer.inoperable || (otherPlayer.team !== player.team && otherPlayer.cloak)) {
      continue;
    }
    if (onlyEnemy && player.team === otherPlayer.team) {
      continue;
    }
    if (player === otherPlayer) {
      continue;
    }
    const distanceSquared = l2NormSquared(player.position, otherPlayer.position);
    if (distanceSquared < currentDistanceSquared && distanceSquared > maxDistanceLessThanCurrent && distanceSquared < scanRangeSquared) {
      maxDistanceLessThanCurrent = distanceSquared;
      ret = otherPlayer;
      foundCloser = true;
    }
  }
  if (!foundCloser) {
    return findFurthestTarget(player, state, scanRange, onlyEnemy);
  }
  return ret;
};

const hardpointPositions = (player: Player, def: UnitDefinition) => {
  const ret: Position[] = [];
  for (let i = 0; i < def.hardpoints.length; i++) {
    const hardpoint = def.hardpoints[i];
    ret.push({
      x: player.position.x + hardpoint.x * Math.cos(player.heading) - hardpoint.y * Math.sin(player.heading),
      y: player.position.y + hardpoint.x * Math.sin(player.heading) + hardpoint.y * Math.cos(player.heading),
    });
  }
  return ret;
};

const kill = (
  def: UnitDefinition,
  player: Player,
  state: GlobalState,
  applyEffect: (effect: EffectTrigger) => void,
  onDeath: (player: Player) => void,
  collectables: Collectable[]
) => {
  if (player.inoperable) {
    return;
  }
  // Dead stations that are dockable become "inoperable" until repaired (repairing is not implemented yet)
  if (def.kind === UnitKind.Station && def.dockable) {
    player.health = 0;
    player.energy = 0;
    player.inoperable = true;
    player.repairs = new Array(Faction.Count as number).fill(0);
  } else {
    // Dead ships just get removed
    state.players.delete(player.id);
    applyEffect({
      effectIndex: def.deathEffect,
      from: {
        kind: EffectAnchorKind.Absolute,
        value: player.position,
        heading: Math.atan2(player.v.y, player.v.x),
        speed: Math.sqrt(player.v.x * player.v.x + player.v.y * player.v.y),
      },
    });
    onDeath(player);
    if (player.npc) {
      const toDrop = player.npc.lootTable.process();
      if (toDrop !== null) {
        collectables.push(createCollectableFromDef(toDrop, player.position));
      }
      if (player.npc.killed) {
        // This should be protected with a try/catch because the killed handler can interact with anything
        // and the game update loop is not protected against exceptions
        try {
          player.npc.killed();
        } catch (e) {
          console.error(e);
        }
      }
    }
  }
};

const dampenImpulse = (player: Player) => {
  player.iv.x *= 0.98;
  player.iv.y *= 0.98;
  if (Math.abs(player.iv.x) < 0.01) {
    player.iv.x = 0;
  }
  if (Math.abs(player.iv.y) < 0.01) {
    player.iv.y = 0;
  }
  player.ir *= 0.98;
  if (Math.abs(player.ir) < 0.001) {
    player.ir = 0;
  }
  // Pitch
  if (player.p !== undefined) {
    // clamp ip to 0.05
    if (player.ip > 0.05) {
      player.ip = 0.05;
    }
    if (player.ip < -0.05) {
      player.ip = -0.05;
    }
    player.ip *= 0.84;
    if (Math.abs(player.ip) < 0.0001) {
      player.ip = 0;
    }
    player.p += player.ip;
    player.p = canonicalizeAngle(player.p);
    player.p *= 0.95;
    if (Math.abs(player.p) < 0.001) {
      player.p = 0;
    }
  }
  // Roll
  if (player.rl !== undefined) {
    // clamp irl to 0.05
    if (player.irl > 0.05) {
      player.irl = 0.05;
    }
    if (player.irl < -0.05) {
      player.irl = -0.05;
    }
    player.irl *= 0.84;
    if (Math.abs(player.irl) < 0.0001) {
      player.irl = 0;
    }
    player.rl += player.irl;
    player.rl = canonicalizeAngle(player.rl);
    player.rl *= 0.95;
    if (Math.abs(player.rl) < 0.001) {
      player.rl = 0;
    }
  }
};

// Idk if this is the right approach or not, but I need something that cuts down on unnecessary things being sent over the websocket
type Mutated = { asteroids: Set<Asteroid>; collectables: Collectable[]; mines: Mine[] };

// Like usual the update function is a monstrosity
// It could probably use some refactoring
const update = (
  state: GlobalState,
  frameNumber: number,
  serverTargets: Map<number, [TargetKind, number]>,
  serverSecondaries: Map<number, number>,
  applyEffect: (effect: EffectTrigger) => void,
  serverWarpList: { player: Player; to: number }[],
  onDeath: (player: Player) => void,
  flashServerMessage: (id: number, message: string) => void,
  removeCollectable: (id: number, collected: boolean) => void,
  removeMine: (id: number, detonated: boolean) => void,
  knownRecipes: Map<number, Set<string>>,
  discoverRecipe: (id: number, recipe: string) => void,
  secondariesToActivate: Map<number, number[]>
) => {
  const ret: Mutated = { asteroids: new Set(), collectables: [], mines: [] };

  // Quadratic loop for the mines
  for (const mine of state.mines.values()) {
    let didExplode = false;
    if (!mine.deploying) {
      const mineDef = mineDefs[mine.defIndex];
      for (const player of state.players.values()) {
        if (player.team === mine.team) {
          continue;
        }
        if (circlesIntersect(mine, player)) {
          mineDef.explosionMutator(mine, state);
          didExplode = true;
          applyEffect({ effectIndex: mineDef.explosionEffectIndex, from: { kind: EffectAnchorKind.Absolute, value: mine.position } });
          state.mines.delete(mine.id);
          removeMine(mine.id, true);
          break;
        }
      }
    }
    if (!didExplode) {
      mine.left -= 1;
      if (mine.left <= 0) {
        state.mines.delete(mine.id);
        removeMine(mine.id, false);
      } else if (mine.deploying > 0) {
        mine.deploying -= 1;
      }
    }
  }

  // Quadratic loop for the projectiles
  for (const projectile of state.projectiles.values()) {
    const projectileDef = projectileDefs[projectile.idx];
    projectile.position.x += projectile.speed * Math.cos(projectile.heading);
    projectile.position.y += projectile.speed * Math.sin(projectile.heading);
    projectile.frameTillEXpire -= 1;
    let didRemove = false;
    for (const [otherId, otherPlayer] of state.players) {
      if (otherPlayer.docked || otherPlayer.inoperable) {
        continue;
      }
      const def = defs[otherPlayer.defIndex];
      if (projectile.team !== otherPlayer.team && pointInCircle(projectile.position, otherPlayer)) {
        otherPlayer.health -= projectile.damage;
        if (otherPlayer.health <= 0) {
          kill(def, otherPlayer, state, applyEffect, onDeath, ret.collectables);
        }
        state.projectiles.delete(projectile.id);
        didRemove = true;
        if (projectileDef.hitEffect !== undefined) {
          applyEffect({
            effectIndex: projectileDef.hitEffect,
            from: { kind: EffectAnchorKind.Absolute, value: projectile.position },
          });
        }
        if (projectileDef.hitMutator) {
          projectileDef.hitMutator(projectile, state, otherPlayer);
        }
        break;
      }
    }
    if (!didRemove && projectile.frameTillEXpire <= 0) {
      if (projectileDef.endEffect !== undefined) {
        applyEffect({
          effectIndex: projectileDef.endEffect,
          from: { kind: EffectAnchorKind.Absolute, value: projectile.position },
        });
      }
      if (projectileDef.endMutator) {
        projectileDef.endMutator(projectile, state);
      }
      state.projectiles.delete(projectile.id);
    }
  }

  // Another quadratic loop for the missiles
  for (const [id, missile] of state.missiles) {
    const missileDef = missileDefs[missile.defIndex];
    missile.position.x += missile.speed * Math.cos(missile.heading);
    missile.position.y += missile.speed * Math.sin(missile.heading);
    if (missile.speed > missileDef.speed) {
      missile.speed -= missileDef.acceleration;
      if (missile.speed < missileDef.speed) {
        missile.speed = missileDef.speed;
      }
    } else if (missile.speed < missileDef.speed) {
      missile.speed += missileDef.acceleration;
      if (missile.speed > missileDef.speed) {
        missile.speed = missileDef.speed;
      }
    }
    if (missile.lifetime === missileDef.lifetime) {
      applyEffect({
        effectIndex: 5,
        from: {
          kind: EffectAnchorKind.Missile,
          value: id,
        },
      });
    }
    missile.lifetime -= 1;
    let didRemove = false;
    for (const otherPlayer of state.players.values()) {
      if (otherPlayer.docked || otherPlayer.inoperable) {
        continue;
      }
      const def = defs[otherPlayer.defIndex];
      if (missile.team !== otherPlayer.team && circlesIntersect(missile, otherPlayer)) {
        otherPlayer.health -= missile.damage;
        if (otherPlayer.health <= 0) {
          kill(def, otherPlayer, state, applyEffect, onDeath, ret.collectables);
        }
        state.missiles.delete(id);
        const explosionSpeed = Math.min(missile.speed / 2, otherPlayer.speed);
        applyEffect({
          effectIndex: missileDef.deathEffect,
          from: { kind: EffectAnchorKind.Absolute, value: missile.position, heading: missile.heading, speed: missile.speed / 2 },
        });
        didRemove = true;
        if (missileDef.hitMutator) {
          missileDef.hitMutator(otherPlayer, state, applyEffect, missile);
        }
        break;
      }
    }
    if (!didRemove && missile.lifetime > 0 && missile.target) {
      const targetPlayer = state.players.get(missile.target);
      if (targetPlayer) {
        seek(missile, targetPlayer, missileDef.turnRate);
      }
    }
    if (!didRemove && missile.lifetime <= 0) {
      state.missiles.delete(id);
      applyEffect({
        effectIndex: missileDef.deathEffect,
        from: { kind: EffectAnchorKind.Absolute, value: missile.position, heading: missile.heading, speed: missile.speed },
      });
    }
  }

  // Main loop for the players (ships and stations)
  for (const [id, player] of state.players) {
    if (player.docked) {
      continue;
    }
    const def = defs[player.defIndex];
    if (player.health <= 0) {
      kill(def, player, state, applyEffect, onDeath, ret.collectables);
    }

    if (def.kind !== UnitKind.Station) {
      for (const collectable of state.collectables.values()) {
        const collectableDef = collectableDefs[collectable.index];
        if (circlesIntersect(player, collectable) && collectableDef.canBeCollected(player, knownRecipes)) {
          state.collectables.delete(collectable.id);
          removeCollectable(collectable.id, true);
          collectableDef.collectMutator(player, discoverRecipe);
        }
      }
    }

    if (def.kind === UnitKind.Ship) {
      const energyBeforeActing = player.energy;
      const wasCloaked = !!player.cloak;
      const primaryDef = projectileDefs[def.primaryDefIndex];
      if (player.disabled) {
        player.warping = 0;
        player.cloak = 0;
        player.disabled -= 1;
        player.position.x += player.v.x;
        player.position.y += player.v.y;
        player.heading = player.heading + (player.omega % (2 * Math.PI));
      } else {
        player.v.x = player.position.x;
        player.v.y = player.position.y;
        player.position.x += player.speed * Math.cos(player.heading);
        player.position.y += player.speed * Math.sin(player.heading);
        if (player.side) {
          player.position.x += player.side * -Math.sin(player.heading);
          player.position.y += player.side * Math.cos(player.heading);
        }
        player.v.x = player.position.x - player.v.x;
        player.v.y = player.position.y - player.v.y;
      }
      // Apply impulse
      player.heading = player.heading + (player.ir % (2 * Math.PI));
      player.position.x += player.iv.x;
      player.position.y += player.iv.y;
      dampenImpulse(player);

      let energyGain = 0;

      if (player.toFirePrimary && player.energy > primaryDef.energy) {
        const projectile = {
          position: {
            x: player.position.x + Math.cos(player.heading) * primaryDef.speed,
            y: player.position.y + Math.sin(player.heading) * primaryDef.speed,
          },
          radius: primaryDef.radius,
          speed: primaryDef.speed,
          heading: player.heading,
          damage: def.primaryDamage,
          team: player.team,
          id: state.projectileId,
          parent: id,
          frameTillEXpire: primaryDef.framesToExpire,
          idx: def.primaryDefIndex,
        };
        state.projectiles.set(state.projectileId, projectile);
        player.toFirePrimary = false;
        player.energy -= primaryDef.energy;
        if (primaryDef.fireEffect !== undefined) {
          applyEffect({
            effectIndex: primaryDef.fireEffect,
            from: { kind: EffectAnchorKind.Projectile, value: state.projectileId },
          });
        }
        state.projectileId++;
      }
      // Run the secondary frameMutators
      player.arms.forEach((armament, index) => {
        const armDef = armDefs[armament];
        if (armDef.frameMutator) {
          const gain = armDef.frameMutator(player, index, state, flashServerMessage);
          if (gain) {
            energyGain += gain;
          }
        }
      });
      // Fire secondaries
      if (player.toFireSecondary && !player.disabled) {
        let slotId: number;
        if (player.npc) {
          slotId = player.npc.selectedSecondary;
        } else {
          slotId = serverSecondaries.get(id);
        }
        if (slotId < player.arms.length) {
          const armDef = armDefs[player.arms[slotId]];
          // Targeted weapons
          if (armDef.targeted === TargetedKind.Targeted) {
            const [targetKind, targetId] = player.npc ? [TargetKind.Player, player.npc.targetId] : serverTargets.get(id) || [TargetKind.None, 0];
            if (slotId !== undefined && targetKind && slotId < player.arms.length) {
              if (armDef.fireMutator) {
                let target: Player | Asteroid | undefined;
                if (targetKind === TargetKind.Player) {
                  target = state.players.get(targetId);
                } else if (targetKind === TargetKind.Asteroid) {
                  target = state.asteroids.get(targetId);
                }
                if (target) {
                  armDef.fireMutator(state, player, targetKind, target, applyEffect, slotId, flashServerMessage, ret);
                }
              }
            }
            // Untargeted weapons
          } else if (armDef.targeted === TargetedKind.Untargeted) {
            if (slotId !== undefined && slotId < player.arms.length) {
              if (armDef.fireMutator) {
                armDef.fireMutator(state, player, TargetKind.None, undefined, applyEffect, slotId, flashServerMessage, ret);
              }
            }
          }
        }
      }
      const playerSecondaryActivation = player.npc ? player.npc.secondariesToFire : secondariesToActivate.get(id);
      if (playerSecondaryActivation) {
        while (playerSecondaryActivation.length > 0) {
          const slotId = playerSecondaryActivation.pop();
          if (slotId !== undefined && slotId < player.arms.length) {
            const armDef = armDefs[player.arms[slotId]];
            // Targeted weapons
            if (armDef.targeted === TargetedKind.Targeted) {
              const [targetKind, targetId] = player.npc ? [TargetKind.Player, player.npc.targetId] : serverTargets.get(id) || [TargetKind.None, 0];
              if (slotId !== undefined && targetKind && slotId < player.arms.length) {
                if (armDef.fireMutator) {
                  let target: Player | Asteroid | undefined;
                  if (targetKind === TargetKind.Player) {
                    target = state.players.get(targetId);
                  } else if (targetKind === TargetKind.Asteroid) {
                    target = state.asteroids.get(targetId);
                  }
                  if (target) {
                    armDef.fireMutator(state, player, targetKind, target, applyEffect, slotId, flashServerMessage, ret);
                  }
                }
              }
              // Untargeted weapons
            } else if (armDef.targeted === TargetedKind.Untargeted) {
              if (slotId !== undefined && slotId < player.arms.length) {
                if (armDef.fireMutator) {
                  armDef.fireMutator(state, player, TargetKind.None, undefined, applyEffect, slotId, flashServerMessage, ret);
                }
              }
            }
          }
        }
      }
      // Make doing things while cloaked cost triple energy
      // Do not change this without looking at the cloaking generator in the armaments also
      if (wasCloaked) {
        const deltaEnergy = energyBeforeActing - player.energy + energyGain;
        player.energy = Math.max(0, player.energy - 2 * deltaEnergy);
      }
    } else {
      // Have stations spin slowly
      player.heading = positiveMod(player.heading + 0.003, 2 * Math.PI);
      // Have the stations fire their primary weapons
      if (!player.inoperable && !player.disabled) {
        let closestEnemy: Player | undefined;
        let closestEnemyDistanceSquared = Infinity;
        for (const [otherId, otherPlayer] of state.players) {
          if (otherPlayer.docked || otherPlayer.inoperable) {
            continue;
          }
          if (player.id === otherId) {
            continue;
          }
          if (otherPlayer.team === player.team) {
            continue;
          }
          const distanceSquared = l2NormSquared(player.position, otherPlayer.position);
          if (distanceSquared < closestEnemyDistanceSquared) {
            closestEnemy = otherPlayer;
            closestEnemyDistanceSquared = distanceSquared;
          }
        }
        if (closestEnemy) {
          const primaryDef = projectileDefs[def.primaryDefIndex];
          const hardpointLocations = hardpointPositions(player, def);
          const targetingVectors = hardpointLocations.map((hardpoint) =>
            findInterceptAimingHeading(hardpoint, closestEnemy, primaryDef.speed, primaryDef.range)
          );
          for (let i = 0; i < def.hardpoints.length; i++) {
            const targeting = targetingVectors[i];
            if (targeting && player.energy > primaryDef.energy && player.sinceLastShot[i] > def.primaryReloadTime) {
              const projectile = {
                position: hardpointLocations[i],
                radius: primaryDef.radius,
                speed: primaryDef.speed,
                heading: targeting,
                damage: def.primaryDamage,
                team: player.team,
                id: state.projectileId,
                parent: id,
                frameTillEXpire: primaryDef.framesToExpire,
                idx: def.primaryDefIndex,
              };
              state.projectiles.set(state.projectileId, projectile);
              player.energy -= primaryDef.energy;
              player.sinceLastShot[i] = 0;
              if (primaryDef.fireEffect !== undefined) {
                applyEffect({
                  effectIndex: primaryDef.fireEffect,
                  from: { kind: EffectAnchorKind.Projectile, value: state.projectileId },
                });
              }
              state.projectileId++;
            }
          }
        }
      } else if (player.inoperable) {
        for (let i = 0; i < player.repairs.length; i++) {
          if (player.repairs[i] >= def.repairsRequired) {
            console.log("Station repaired", id);
            player.inoperable = false;
            player.team = i;
            player.health = def.health;
            break;
          }
        }
      }
      if (player.disabled > 0) {
        player.disabled = Math.max(0, player.disabled - 3);
      }
    }
    // Update primary times since last shot (secondaries are handled in the frameMutators in the armDefs)
    for (let i = 0; i < player.sinceLastShot.length; i++) {
      player.sinceLastShot[i] += 1;
    }
    // Don't apply regen to players which are inoperable
    if (!player.inoperable) {
      player.health = Math.min(player.health + def.healthRegen, def.health);
      player.energy = Math.min(player.energy + def.energyRegen, def.energy);
    }
    // If a warp is in progress, update the warp progress, then trigger the warp once time has elapsed
    if (player.warping > 0) {
      if (player.energy < 10) {
        player.warping = -player.warping;
      } else {
        player.warping += 1;
        // Energy use while cloaked is tripled
        player.energy -= player.cloak ? 60 / def.warpTime : 20 / def.warpTime;
        if (player.warping > def.warpTime) {
          player.warping = -player.warping;
          state.players.delete(id);
          serverWarpList.push({ player, to: player.warpTo });
          applyEffect({
            effectIndex: def.warpEffect,
            from: { kind: EffectAnchorKind.Absolute, value: player.position, heading: player.heading, speed: player.speed },
          });
        }
      }
    } else if (player.warping < 0) {
      player.warping += 1;
    }
  }
  // Collectable loop
  for (const collectable of state.collectables.values()) {
    if (collectable.framesLeft <= 0) {
      state.collectables.delete(collectable.id);
      removeCollectable(collectable.id, false);
      continue;
    }
    collectable.framesLeft -= 1;
  }
  for (const collectable of ret.collectables) {
    state.collectables.set(collectable.id, collectable);
  }
  return ret;
};

const processAllNpcs = (state: GlobalState, sector: number) => {
  for (const [id, player] of state.players) {
    if (!player.npc) {
      continue;
    }
    player.npc.process(state, sector);
  }
};

type SectorTransition = {
  direction: CardinalDirection;
  from: number;
  coords: Position;
  player: Player;
};

const findSectorTransitions = (state: GlobalState, sector: number, transitions: SectorTransition[]) => {
  for (const player of state.players.values()) {
    const direction = pointOutsideRectangle(player.position, sectorBounds);
    if (direction !== null) {
      const transition = {
        direction,
        from: sector,
        coords: player.position,
        player,
      };
      if (direction === CardinalDirection.Up) {
        transition.coords.y = sectorBounds.y + sectorBounds.height - 200;
      } else if (direction === CardinalDirection.Down) {
        transition.coords.y = sectorBounds.y + 200;
      } else if (direction === CardinalDirection.Left) {
        transition.coords.x = sectorBounds.x + sectorBounds.width - 200;
      } else if (direction === CardinalDirection.Right) {
        transition.coords.x = sectorBounds.x + 200;
      }

      transitions.push(transition);
      player.warping = -player.warping;
      state.players.delete(player.id);
    }
  }
};

type Input = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  primary: boolean;
  secondary: boolean;
  dock?: boolean;
  nextTarget?: boolean;
  previousTarget?: boolean;
  nextTargetAsteroid?: boolean;
  previousTargetAsteroid?: boolean;
  ctl?: boolean;
  quickTargetClosestEnemy?: boolean;
};

const applyInputs = (input: Input, player: Player, angle?: number) => {
  if (player.disabled) {
    player.toFirePrimary = false;
    return;
  }
  const def = defs[player.defIndex];
  player.omega = player.heading;
  if (input.up) {
    player.speed += def.acceleration;
    // I don't like this here...
    if (player.p === undefined) {
      player.p = 0;
      player.ip = 0;
    }
    if (player.speed < def.speed) {
      player.ip -= 0.04 * Math.pow((def.speed - player.speed) / def.speed, 0.5) * def.acceleration;
    }
  }
  if (input.down) {
    player.speed -= def.acceleration;
    if (player.p === undefined) {
      player.p = 0;
      player.ip = 0;
    }
    if (player.speed > 0) {
      player.ip += 0.04 * Math.pow(player.speed / def.speed, 0.5) * def.acceleration;
    }
  }
  if (angle === undefined) {
    if (input.left) {
      player.heading -= def.turnRate;
    }
    if (input.right) {
      player.heading += def.turnRate;
    }
  } else {
    const delta = findSmallAngleBetween(player.heading, angle);
    const rotation = Math.min(Math.abs(delta), def.turnRate) * Math.sign(delta);
    player.heading += rotation;
    if (input.left) {
      player.side -= def.sideThrustAcceleration;
      if (player.side < -def.sideThrustMaxSpeed) {
        player.side = -def.sideThrustMaxSpeed;
      }
    }
    if (input.right) {
      player.side += def.sideThrustAcceleration;
      if (player.side > def.sideThrustMaxSpeed) {
        player.side = def.sideThrustMaxSpeed;
      }
    }
    if (!input.left && !input.right) {
      if (player.side < 0) {
        player.side += def.sideThrustAcceleration;
        if (player.side > 0) {
          player.side = 0;
        }
      } else if (player.side > 0) {
        player.side -= def.sideThrustAcceleration;
        if (player.side < 0) {
          player.side = 0;
        }
      }
    }
    if (player.rl === undefined) {
      player.rl = player.irl = 0;
    }
    player.irl = (player.side / def.sideThrustMaxSpeed) * 0.2 * def.sideThrustAcceleration;
  }
  if (player.speed > def.speed) {
    player.speed = def.speed;
  }
  if (player.speed < 0) {
    player.speed = 0;
  }
  if (input.primary) {
    if (player.sinceLastShot[0] > def.primaryReloadTime) {
      player.sinceLastShot[0] = 0;
      player.toFirePrimary = true;
    }
  } else {
    player.toFirePrimary = false;
  }
  player.toFireSecondary = input.secondary;
  player.omega = player.heading - (player.omega % (2 * Math.PI));
};

const randomAsteroids = (
  count: number,
  bounds: Rectangle,
  seed: number,
  uid: () => number,
  typeDensities: { resource: string; density: number }[]
) => {
  if (asteroidDefs.length === 0) {
    throw new Error("Asteroid defs not initialized");
  }
  if (typeDensities.length === 0) {
    console.log("Warning: missing asteroids densities, aborting");
    return [];
  }
  const prng = sfc32(seed, 4398, 25, 6987);
  const asteroids: Asteroid[] = [];
  const totalDensity = typeDensities.reduce((acc, cur) => acc + cur.density, 0);
  const mapping: { def: AsteroidDef; index: number }[] = [];
  for (let i = 0; i < typeDensities.length; i++) {
    const value = asteroidDefMap.get(typeDensities[i].resource);
    if (value === undefined) {
      console.log(`Warning: missing asteroid def for ${typeDensities[i].resource}, aborting`);
      return [];
    }
    mapping.push(value);
  }
  if (mapping.some((def) => def === undefined)) {
    console.log("Warning: invalid asteroid type, aborting");
    return [];
  }
  for (let i = 0; i < count; i++) {
    let index = 0;
    let sum = Math.floor(prng() * totalDensity);
    while (sum >= typeDensities[index].density) {
      sum -= typeDensities[index].density;
      index++;
    }
    const asteroidDef = mapping[index].def;
    const asteroid: Asteroid = {
      position: {
        x: prng() * bounds.width + bounds.x,
        y: prng() * bounds.height + bounds.y,
      },
      heading: prng() * 2 * Math.PI,
      resources: asteroidDef.resources,
      defIndex: mapping[index].index,
      id: uid(),
      radius: asteroidDef.radius,
    };
    asteroids.push(asteroid);
  }
  return asteroids;
};

const findClosestTargetAsteroid = (player: Player, state: GlobalState, scanRange: number) => {
  let ret: Asteroid | undefined = undefined;
  let minDistance = Infinity;
  const scanRangeSquared = scanRange * scanRange;
  for (const [id, asteroid] of state.asteroids) {
    const distanceSquared = l2NormSquared(player.position, asteroid.position);
    if (distanceSquared < minDistance && distanceSquared < scanRangeSquared) {
      minDistance = distanceSquared;
      ret = asteroid;
    }
  }
  return ret;
};

const findFurthestTargetAsteroid = (player: Player, state: GlobalState, scanRange: number) => {
  let ret: Asteroid | undefined = undefined;
  let maxDistance = 0;
  let scanRangeSquared = scanRange * scanRange;
  for (const [id, asteroid] of state.asteroids) {
    const distanceSquared = l2NormSquared(player.position, asteroid.position);
    if (distanceSquared > maxDistance && distanceSquared < scanRangeSquared) {
      maxDistance = distanceSquared;
      ret = asteroid;
    }
  }
  return ret;
};

const findNextTargetAsteroid = (player: Player, current: Asteroid | undefined, state: GlobalState, scanRange: number) => {
  if (!current) {
    return findClosestTargetAsteroid(player, state, scanRange);
  }
  let ret: Asteroid | undefined = current;
  const currentDistanceSquared = l2NormSquared(player.position, current.position);
  let minDistanceGreaterThanCurrent = Infinity;
  let foundFurther = false;
  let scanRangeSquared = scanRange * scanRange;
  for (const [id, asteroid] of state.asteroids) {
    const distanceSquared = l2NormSquared(player.position, asteroid.position);
    if (distanceSquared > currentDistanceSquared && distanceSquared < minDistanceGreaterThanCurrent && distanceSquared < scanRangeSquared) {
      minDistanceGreaterThanCurrent = distanceSquared;
      ret = asteroid;
      foundFurther = true;
    }
  }
  if (!foundFurther) {
    return findClosestTargetAsteroid(player, state, scanRange);
  }
  return ret;
};

const findPreviousTargetAsteroid = (player: Player, current: Asteroid | undefined, state: GlobalState, scanRange: number) => {
  if (!current) {
    return findClosestTargetAsteroid(player, state, scanRange);
  }
  let ret: Asteroid | undefined = current;
  const currentDistanceSquared = l2NormSquared(player.position, current.position);
  let maxDistanceLessThanCurrent = 0;
  let foundCloser = false;
  let scanRangeSquared = scanRange * scanRange;
  for (const [id, asteroid] of state.asteroids) {
    const distanceSquared = l2NormSquared(player.position, asteroid.position);
    if (distanceSquared < currentDistanceSquared && distanceSquared > maxDistanceLessThanCurrent && distanceSquared < scanRangeSquared) {
      maxDistanceLessThanCurrent = distanceSquared;
      ret = asteroid;
      foundCloser = true;
    }
  }
  if (!foundCloser) {
    return findFurthestTargetAsteroid(player, state, scanRange);
  }
  return ret;
};

const equip = (player: Player, slotIndex: number, what: string | number, noCost?: boolean) => {
  const def = defs[player.defIndex];
  if (slotIndex >= def.slots.length) {
    console.log("Warning: slot number too high");
    return player;
  }
  let armDef: ArmamentDef | undefined = undefined;
  let defIndex: number;
  if (typeof what === "string") {
    const entry = armDefMap.get(what);
    if (!entry) {
      console.log("Warning: no such armament");
      return player;
    }
    armDef = entry.def;
    defIndex = entry.index;
  } else {
    if (what >= armDefs.length) {
      console.log("Warning: armament index too high");
      return player;
    }
    armDef = armDefs[what];
    defIndex = what;
  }
  const slotKind = def.slots[slotIndex];
  if (slotKind !== armDef.kind) {
    console.log("Warning: wrong kind of armament", slotKind, armDef.kind);
    return player;
  }
  if (slotIndex >= player.arms.length) {
    console.log("Warning: player armaments not initialized correctly");
    return player;
  }

  if ((player.credits !== undefined && armDef.cost <= player.credits) || noCost) {
    const npc = player.npc;
    player.npc = undefined;
    const ret = copyPlayer(player);
    player.npc = npc;
    ret.npc = npc;

    if (!noCost) {
      ret.credits -= armDef.cost;
    }
    ret.arms[slotIndex] = defIndex;
    if (armDef.equipMutator) {
      armDef.equipMutator(ret, slotIndex);
    }
    return ret;
  }
  return player;
};

const purchaseShip = (player: Player, index: number, shipOptions: string[], bypassChecks: boolean) => {
  if (index >= defs.length || index < 0) {
    console.log("Warning: ship index out of range");
    return player;
  }
  const def = defs[index];
  if (def.price === undefined) {
    console.log("Warning: ship not purchasable");
    return player;
  }
  if (!bypassChecks && !shipOptions.includes(def.name)) {
    console.log("Warning: ship not available at this station");
    return player;
  }
  if (bypassChecks || (player.credits !== undefined && def.price <= player.credits)) {
    const npc = player.npc;
    player.npc = undefined;
    const ret = copyPlayer(player);
    player.npc = npc;
    ret.npc = npc;
    if (!bypassChecks) {
      ret.credits -= def.price;
    }
    ret.defIndex = index;
    ret.slotData = new Array(def.slots.length).map(() => ({}));
    ret.arms = emptyLoadout(index);
    ret.health = def.health;
    ret.energy = def.energy;
    return ret;
  }
  return player;
};

const repairStation = (player: Player) => {
  if (player.inoperable) {
    const def = defs[player.defIndex];
    player.health = def.health;
    // IDK if they should have full energy on being repaired
    // player.energy = def.energy;
    player.inoperable = false;
  }
};

const findAllPlayersOverlappingPoint = (point: Position, players: IterableIterator<Player>) => {
  const overlappingPlayers: Player[] = [];
  for (const player of players) {
    if (pointInCircle(point, player)) {
      overlappingPlayers.push(player);
    }
  }
  return overlappingPlayers;
};

const findAllPlayersOverlappingCircle = (circle: Circle, players: IterableIterator<Player>) => {
  const overlappingPlayers: Player[] = [];
  for (const player of players) {
    if (circlesIntersect(circle, player)) {
      overlappingPlayers.push(player);
    }
  }
  return overlappingPlayers;
};

const findAllAsteroidsOverlappingPoint = (point: Position, asteroids: IterableIterator<Asteroid>) => {
  const overlappingAsteroids: Asteroid[] = [];
  for (const asteroid of asteroids) {
    if (pointInCircle(point, asteroid)) {
      overlappingAsteroids.push(asteroid);
    }
  }
  return overlappingAsteroids;
};

const isNearOperableEnemyStation = (player: Player, players: IterableIterator<Player>, distance = 1500) => {
  for (const otherPlayer of players) {
    const otherDef = defs[otherPlayer.defIndex];
    if (otherDef.kind !== UnitKind.Station || otherPlayer.inoperable) {
      continue;
    }
    if (otherPlayer.team !== player.team) {
      if (l2Norm(player.position, otherPlayer.position) <= distance) {
        return true;
      }
    }
  }
  return false;
};

const serverMessagePersistTime = 3000;
const maxNameLength = 20;
const ticksPerSecond = 60;
// Infinity is not serializable with JSON.stringify...
const effectiveInfinity = 1000000000;

const mapSize = 4;
const sectorBounds: Rectangle = { x: -10000, y: -10000, width: 20000, height: 20000 };
const sectorDelta = 20500;

const randomNearbyPointInSector = (point: Position, distance: number) => {
  let ret = { x: Math.random() * distance * 2 - distance + point.x, y: Math.random() * distance * 2 - distance + point.y };
  while (l2Norm(ret, point) > distance || !pointInRectangle(ret, sectorBounds)) {
    ret = { x: Math.random() * distance * 2 - distance + point.x, y: Math.random() * distance * 2 - distance + point.y };
  }
  return ret;
};

const isValidSectorInDirection = (sector: number, direction: CardinalDirection) => {
  if (direction === CardinalDirection.Up) {
    return sector >= mapSize;
  } else if (direction === CardinalDirection.Down) {
    return sector < mapSize * (mapSize - 1);
  } else if (direction === CardinalDirection.Left) {
    return sector % mapSize !== 0;
  } else if (direction === CardinalDirection.Right) {
    return sector % mapSize !== mapSize - 1;
  }
  return false;
};

type SectorInfo = {
  sector: number;
  resources: string[];
};

enum TutorialStage {
  Done = 0,
  Move,
  Strafe,
  Shoot,
  Kill,
  SwitchSecondary,
  FireJavelin,
  SelectAsteroid,
  CollectResources,
  LaserBeam,
  TargetEnemy,
  Dock,
  Deposit,
  Manufacture1,
  Manufacture2,
  BuyMines,
  Undock,
  UseMines,
  Map,
}

export {
  GlobalState,
  Input,
  Player,
  Mine,
  Asteroid,
  Ballistic,
  Missile,
  TargetKind,
  EffectAnchorKind,
  EffectAnchor,
  EffectTrigger,
  CargoEntry,
  ChatMessage,
  Collectable,
  Mutated,
  SectorTransition,
  SectorInfo,
  Entity,
  CloakedState,
  TutorialStage,
  update,
  applyInputs,
  processAllNpcs,
  findSectorTransitions,
  canDock,
  canRepair,
  setCanDockOrRepair,
  copyPlayer,
  findNextTarget,
  findPreviousTarget,
  findHeadingBetween,
  randomAsteroids,
  findNextTargetAsteroid,
  findPreviousTargetAsteroid,
  availableCargoCapacity,
  addCargo,
  removeAtMostCargo,
  equip,
  purchaseShip,
  repairStation,
  findLinesTangentToCircleThroughPoint,
  findLineHeading,
  isAngleBetween,
  findSmallAngleBetween,
  findClosestTarget,
  findAllPlayersOverlappingPoint,
  findAllAsteroidsOverlappingPoint,
  findAllPlayersOverlappingCircle,
  isNearOperableEnemyStation,
  ticksPerSecond,
  maxNameLength,
  effectiveInfinity,
  serverMessagePersistTime,
  // clientMineDeploymentUpdater,
  isValidSectorInDirection,
  sectorBounds,
  sectorDelta,
  mapSize,
  randomNearbyPointInSector,
};
