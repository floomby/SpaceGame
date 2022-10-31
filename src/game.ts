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
} from "./defs";
import {
  Circle,
  Position,
  l2Norm,
  Line,
  positiveMod,
  l2NormSquared,
  circlesIntersect,
  pointInCircle,
  Rectangle,
  findLinesTangentToCircleThroughPoint,
  infinityNorm,
  maxDecimals,
  findHeadingBetween,
  findInterceptAimingHeading,
  findLineHeading,
  findSmallAngleBetween,
  isAngleBetween,
} from "./geometry";
import { NPC, processLootTable } from "./npc";
import { sfc32 } from "./prng";

// TODO Move the geometry stuff to a separate file

type Entity = Circle & { id: number; speed: number; heading: number };

type CargoEntry = { what: string; amount: number };

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
//   armIndices
//   slotData
//   cargo
//   credits
//   inoperable
//   warping
//   repairs
//   disabled
type Player = Entity & {
  health: number;
  sinceLastShot: number[];
  toFirePrimary?: boolean;
  toFireSecondary?: boolean;
  projectileId: number;
  energy: number;
  defIndex: number;
  team: number;
  canDock?: number;
  docked?: number;
  canRepair?: number;
  armIndices: number[];
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
};

type Asteroid = Circle & {
  id: number;
  resources: number;
  heading: number;
  defIndex: number;
};

type Missile = Entity & {
  damage: number;
  target?: number;
  team: number;
  lifetime: number;
  defIndex: number;
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
  if (existing) {
    existing.amount += Math.min(amount, maxAmount);
  } else {
    player.cargo.push({ what, amount: Math.min(amount, maxAmount) });
  }
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

type Ballistic = Entity & { damage: number; team: number; parent: number; frameTillEXpire: number };

// Primary laser stats (TODO put this in a better place)
const primaryRange = 1500;
const primarySpeed = 20;
const primaryFramesToExpire = primaryRange / primarySpeed;
const primaryRadius = 1;
const primaryEnergy = 3;

type Collectable = Entity & { index: number; framesLeft: number; phase?: number };

enum EffectAnchorKind {
  Absolute,
  Player,
  Asteroid,
  Missile,
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
  projectiles: Map<number, Ballistic[]>;
  asteroids: Map<number, Asteroid>;
  missiles: Map<number, Missile>;
  collectables: Map<number, Collectable>;
  asteroidsDirty?: boolean;
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

const seek = (entity: Entity, target: Entity, maxTurn: number) => {
  const heading = findHeadingBetween(entity.position, target.position);
  let diff = heading - entity.heading;
  diff = positiveMod(diff, 2 * Math.PI);
  if (diff > Math.PI) {
    diff -= 2 * Math.PI;
  }
  if (Math.abs(diff) < maxTurn) {
    entity.heading = heading;
  } else if (diff > 0) {
    entity.heading += maxTurn;
  } else {
    entity.heading -= maxTurn;
  }
};

const findClosestTarget = (player: Player, state: GlobalState, scanRange: number, onlyEnemy = false) => {
  let ret: Player | undefined = undefined;
  let minDistance = Infinity;
  let def: UnitDefinition;
  if (onlyEnemy) {
    def = defs[player.defIndex];
  }
  const scanRangeSquared = scanRange * scanRange;
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer.docked || otherPlayer.inoperable) {
      continue;
    }
    if (onlyEnemy && player.team === otherPlayer.team) {
      continue;
    }
    if (player === otherPlayer) {
      continue;
    }
    const distanceSquared = l2NormSquared(player.position, otherPlayer.position);
    if (distanceSquared < minDistance && distanceSquared < scanRangeSquared) {
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
    if (otherPlayer.docked || otherPlayer.inoperable) {
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
    if (otherPlayer.docked || otherPlayer.inoperable) {
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
    if (otherPlayer.docked || otherPlayer.inoperable) {
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
  drop: (collectable: Collectable) => void
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
      from: { kind: EffectAnchorKind.Absolute, value: player.position, heading: player.heading, speed: player.speed },
    });
    onDeath(player);
    if (player.npc) {
      const toDrop = processLootTable(player.npc.lootTable);
      if (toDrop !== undefined) {
        drop(createCollectableFromDef(toDrop, player.position));
      }
    }
  }
};

// Idk if this is the right approach or not, but I need something that cuts down on unnecessary things being sent over the websocket
type Mutated = { asteroids: Set<Asteroid> };

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
  drop: (collectable: Collectable) => void,
  removeCollectable: (id: number, collected: boolean) => void
) => {
  const ret: Mutated = { asteroids: new Set() };

  // Main loop for the players (ships and stations)
  for (const [id, player] of state.players) {
    if (player.docked) {
      continue;
    }
    const def = defs[player.defIndex];
    if (player.health <= 0) {
      kill(def, player, state, applyEffect, onDeath, drop);
    }

    if (def.kind !== UnitKind.Station) {
      for (const collectable of state.collectables.values()) {
        const collectableDef = collectableDefs[collectable.index];
        if (circlesIntersect(player, collectable) && collectableDef.canBeCollected(player)) {
          state.collectables.delete(collectable.id);
          removeCollectable(collectable.id, true);
          collectableDef.collectMutator(player);
        }
      }
    }

    if (def.kind === UnitKind.Ship) {
      if (player.disabled) {
        player.warping = 0;
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
      if (player.toFirePrimary && player.energy > primaryEnergy) {
        const projectile = {
          position: { x: player.position.x, y: player.position.y },
          radius: primaryRadius,
          speed: primarySpeed,
          heading: player.heading,
          damage: def.primaryDamage,
          team: player.team,
          id: player.projectileId,
          parent: id,
          frameTillEXpire: primaryFramesToExpire,
        };
        const projectiles = state.projectiles.get(id) || [];
        projectiles.push(projectile);
        state.projectiles.set(id, projectiles);
        player.projectileId++;
        player.toFirePrimary = false;
        player.energy -= primaryEnergy;
        applyEffect({
          effectIndex: 8,
          from: { kind: EffectAnchorKind.Absolute, value: player.position },
        });
      }
      // Run the secondary frameMutators
      player.armIndices.forEach((armament, index) => {
        const armDef = armDefs[armament];
        if (armDef.frameMutator) {
          armDef.frameMutator(player, index);
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
        const armDef = armDefs[player.armIndices[slotId]];
        // Targeted weapons
        if (armDef.targeted === TargetedKind.Targeted) {
          const [targetKind, targetId] = player.npc ? [TargetKind.Player, player.npc.targetId] : serverTargets.get(id) || [TargetKind.None, 0];
          if (slotId !== undefined && targetKind && slotId < player.armIndices.length) {
            if (armDef.stateMutator) {
              let target: Player | Asteroid | undefined;
              if (targetKind === TargetKind.Player) {
                target = state.players.get(targetId);
              } else if (targetKind === TargetKind.Asteroid) {
                target = state.asteroids.get(targetId);
              }
              if (target) {
                armDef.stateMutator(state, player, targetKind, target, applyEffect, slotId, flashServerMessage, ret);
              }
            }
          }
          // Untargeted weapons
        } else if (armDef.targeted === TargetedKind.Untargeted) {
          if (slotId !== undefined && slotId < player.armIndices.length) {
            if (armDef.stateMutator) {
              armDef.stateMutator(state, player, TargetKind.None, undefined, applyEffect, slotId, flashServerMessage, ret);
            }
          }
        }
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
          const otherDef = defs[otherPlayer.defIndex];
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
          const hardpointLocations = hardpointPositions(player, def);
          const targetingVectors = hardpointLocations.map((hardpoint) =>
            findInterceptAimingHeading(hardpoint, closestEnemy, primarySpeed, primaryRange)
          );
          for (let i = 0; i < def.hardpoints.length; i++) {
            const targeting = targetingVectors[i];
            if (targeting && player.energy > primaryEnergy && player.sinceLastShot[i] > def.primaryReloadTime) {
              const projectile = {
                position: hardpointLocations[i],
                radius: primaryRadius,
                speed: primarySpeed,
                heading: targeting,
                damage: def.primaryDamage,
                team: player.team,
                id: player.projectileId,
                parent: id,
                frameTillEXpire: primaryFramesToExpire,
              };
              const projectiles = state.projectiles.get(id) || [];
              projectiles.push(projectile);
              state.projectiles.set(id, projectiles);
              player.projectileId++;
              player.energy -= primaryEnergy;
              player.sinceLastShot[i] = 0;
              applyEffect({ effectIndex: 8, from: { kind: EffectAnchorKind.Absolute, value: hardpointLocations[i] } });
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
    if (player.warping) {
      player.warping += 1;
      if (player.warping > def.warpTime) {
        player.warping = 0;
        state.players.delete(id);
        serverWarpList.push({ player, to: player.warpTo });
        applyEffect({
          effectIndex: def.warpEffect,
          from: { kind: EffectAnchorKind.Absolute, value: player.position, heading: player.heading, speed: player.speed },
        });
      }
    }
  }
  for (const collectable of state.collectables.values()) {
    if (collectable.framesLeft <= 0) {
      state.collectables.delete(collectable.id);
      removeCollectable(collectable.id, false);
      continue;
    }
    collectable.framesLeft -= 1;
  }
  // Quadratic loop for the projectiles
  for (const [id, projectiles] of state.projectiles) {
    for (let i = 0; i < projectiles.length; i++) {
      const projectile = projectiles[i];
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
            kill(def, otherPlayer, state, applyEffect, onDeath, drop);
          }
          projectiles.splice(i, 1);
          i--;
          didRemove = true;
          break;
        }
      }
      if (!didRemove && projectile.frameTillEXpire <= 0) {
        projectiles.splice(i, 1);
        i--;
      }
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
    for (const [otherId, otherPlayer] of state.players) {
      if (otherPlayer.docked || otherPlayer.inoperable) {
        continue;
      }
      const def = defs[otherPlayer.defIndex];
      if (missile.team !== otherPlayer.team && circlesIntersect(missile, otherPlayer)) {
        otherPlayer.health -= missile.damage;
        if (otherPlayer.health <= 0) {
          kill(def, otherPlayer, state, applyEffect, onDeath, drop);
        }
        state.missiles.delete(id);
        applyEffect({ effectIndex: missileDef.deathEffect, from: { kind: EffectAnchorKind.Absolute, value: missile.position } });
        didRemove = true;
        if (missileDef.hitMutator) {
          missileDef.hitMutator(otherPlayer, state, applyEffect);
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
      applyEffect({ effectIndex: missileDef.deathEffect, from: { kind: EffectAnchorKind.Absolute, value: missile.position } });
    }
  }
  return ret;
};

const processAllNpcs = (state: GlobalState) => {
  for (const [id, player] of state.players) {
    if (!player.npc) {
      continue;
    }
    player.npc.process(state);
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
  }
  if (input.down) {
    player.speed -= def.acceleration;
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

const randomAsteroids = (count: number, bounds: Rectangle, seed: number, uid: () => number) => {
  if (asteroidDefs.length === 0) {
    throw new Error("Asteroid defs not initialized");
  }
  const prng = sfc32(seed, 4398, 25, 6987);
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(prng() * asteroidDefs.length);
    const def = asteroidDefs[index];
    const asteroid: Asteroid = {
      position: {
        x: prng() * bounds.width + bounds.x,
        y: prng() * bounds.height + bounds.y,
      },
      heading: prng() * 2 * Math.PI,
      resources: def.resources,
      defIndex: index,
      id: uid(),
      radius: def.radius,
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
    return;
  }
  let armDef: ArmamentDef | undefined = undefined;
  let defIndex: number;
  if (typeof what === "string") {
    const entry = armDefMap.get(what);
    if (!entry) {
      console.log("Warning: no such armament");
      return;
    }
    armDef = entry.def;
    defIndex = entry.index;
  } else {
    if (what >= armDefs.length) {
      console.log("Warning: armament index too high");
      return;
    }
    armDef = armDefs[what];
    defIndex = what;
  }
  const slotKind = def.slots[slotIndex];
  if (slotKind !== armDef.kind) {
    console.log("Warning: wrong kind of armament", slotKind, armDef.kind);
    return;
  }
  if (slotIndex >= player.armIndices.length) {
    console.log("Warning: player armaments not initialized correctly");
    return;
  }

  if ((player.credits !== undefined && armDef.cost <= player.credits) || noCost) {
    if (!noCost) {
      player.credits -= armDef.cost;
    }
    player.armIndices[slotIndex] = defIndex;
    if (armDef.equipMutator) {
      armDef.equipMutator(player, slotIndex);
    }
  }
};

const purchaseShip = (player: Player, index: number, stationShipOptions: string[]) => {
  if (index >= defs.length || index < 0) {
    console.log("Warning: ship index out of range");
    return;
  }
  const def = defs[index];
  if (def.price === undefined) {
    console.log("Warning: ship not purchasable");
    return;
  }
  // if (playerDef.team !== def.team) {
  //   console.log("Warning: ship not on same team");
  //   return;
  // }
  if (!stationShipOptions.includes(def.name)) {
    console.log("Warning: ship not available at this station");
    return;
  }
  if (player.credits !== undefined && def.price <= player.credits) {
    player.credits -= def.price;
    player.defIndex = index;
    player.slotData = new Array(def.slots.length).map(() => ({}));
    player.armIndices = emptyLoadout(index);
    player.health = def.health;
    player.energy = def.energy;
  }
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

const seekPosition = (player: Player, position: Position, input: Input) => {
  const heading = findHeadingBetween(player.position, position);
  let headingMod = positiveMod(heading - player.heading, 2 * Math.PI);
  if (headingMod > Math.PI) {
    headingMod -= 2 * Math.PI;
  }
  if (headingMod > 0) {
    input.right = true;
    input.left = false;
  } else if (headingMod < 0) {
    input.left = true;
    input.right = false;
  } else {
    input.left = false;
    input.right = false;
  }
  input.up = true;
  input.down = false;
};

const arrivePosition = (player: Player, position: Position, input: Input, epsilon = 10) => {
  const def = defs[player.defIndex];
  const heading = findHeadingBetween(player.position, position);
  let headingMod = positiveMod(heading - player.heading, 2 * Math.PI);
  if (headingMod > Math.PI) {
    headingMod -= 2 * Math.PI;
  }

  const distance = l2Norm(player.position, position);

  let targetSpeed: number;
  if (distance > def.brakeDistance!) {
    targetSpeed = def.speed;
  } else {
    targetSpeed = (def.speed * distance) / def.brakeDistance!;
  }

  if (headingMod > 0 && player.speed > 0) {
    input.right = true;
    input.left = false;
  } else if (headingMod < 0 && player.speed > 0) {
    input.left = true;
    input.right = false;
  } else {
    input.left = false;
    input.right = false;
  }

  if (distance < epsilon && player.speed < (def.speed * distance) / (def.brakeDistance! + epsilon)) {
    if (player.speed > 0) {
      input.down = true;
      input.up = false;
    } else {
      input.down = false;
      input.up = false;
    }
    return;
  }

  if (player.speed === targetSpeed) {
    input.up = false;
    input.down = false;
  } else if (player.speed < targetSpeed) {
    input.up = true;
    input.down = false;
  } else {
    input.up = false;
    input.down = true;
  }
};

const stopPlayer = (player: Player, input: Input, stopRotation = true) => {
  input.up = false;
  if (player.speed > 0) {
    input.down = true;
  } else {
    input.down = false;
  }
  if (stopRotation) {
    input.left = false;
    input.right = false;
  }
};

// This function is not exactly optimal
const currentlyFacing = (entity: Entity, circle: Circle) => {
  if (pointInCircle(entity.position, circle)) {
    return true;
  }
  const lines = findLinesTangentToCircleThroughPoint(entity.position, circle)!;
  const heading = entity.heading;
  const angleA = findLineHeading(lines[0]);
  const angleB = findLineHeading(lines[1]);
  const diff = positiveMod(angleA - angleB, 2 * Math.PI);
  if (diff > Math.PI) {
    return isAngleBetween(heading, angleA, angleB);
  } else {
    return isAngleBetween(heading, angleB, angleA);
  }
};

// This is a faster version that should work most of the time
// THIS IS BROKEN
const currentlyFacingApprox = (entity: Entity, circle: Circle) => {
  if (pointInCircle(entity.position, circle)) {
    return true;
  }
  const distance = l2Norm(entity.position, circle.position);
  const heading = findHeadingBetween(entity.position, circle.position);
  const arcLength = Math.abs(entity.heading - heading) * distance;
  return arcLength < circle.radius;
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

const findAllAsteroidsOverlappingPoint = (point: Position, asteroids: IterableIterator<Asteroid>) => {
  const overlappingAsteroids: Asteroid[] = [];
  for (const asteroid of asteroids) {
    if (pointInCircle(point, asteroid)) {
      overlappingAsteroids.push(asteroid);
    }
  }
  return overlappingAsteroids;
};

const isNearOperableEnemyStation = (player: Player, players: IterableIterator<Player>, distance = primaryRadius) => {
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

export {
  GlobalState,
  Position,
  Circle,
  Line,
  Rectangle,
  Input,
  Player,
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
  update,
  applyInputs,
  processAllNpcs,
  infinityNorm,
  positiveMod,
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
  l2Norm,
  l2NormSquared,
  availableCargoCapacity,
  addCargo,
  removeAtMostCargo,
  equip,
  maxDecimals,
  purchaseShip,
  repairStation,
  seekPosition,
  stopPlayer,
  arrivePosition,
  findLinesTangentToCircleThroughPoint,
  findLineHeading,
  isAngleBetween,
  findSmallAngleBetween,
  currentlyFacing,
  currentlyFacingApprox,
  findClosestTarget,
  findAllPlayersOverlappingPoint,
  findAllAsteroidsOverlappingPoint,
  isNearOperableEnemyStation,
  ticksPerSecond,
  maxNameLength,
  effectiveInfinity,
  serverMessagePersistTime,
};
