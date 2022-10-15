// This is shared by the server and the client

import { UnitDefinition, UnitKind, defs, asteroidDefs, armDefs, armDefMap, TargetedKind, missileDefs, ArmamentDef } from "./defs";

type Position = { x: number; y: number };
type Circle = { position: Position; radius: number };
type Rectangle = { x: number; y: number; width: number; height: number };
type Line = { from: Position; to: Position };

const infinityNorm = (a: Position, b: Position) => {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
};

const l2NormSquared = (a: Position, b: Position) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

const l2Norm = (a: Position, b: Position) => {
  return Math.sqrt(l2NormSquared(a, b));
};

const pointInCircle = (point: Position, circle: Circle) => {
  return l2NormSquared(point, circle.position) < circle.radius * circle.radius;
};

const circlesIntersect = (a: Circle, b: Circle) => {
  return l2NormSquared(a.position, b.position) < (a.radius + b.radius) * (a.radius + b.radius);
};

const positiveMod = (a: number, b: number) => {
  return ((a % b) + b) % b;
};

type Entity = Circle & { id: number; speed: number; heading: number };

type CargoEntry = { what: string; amount: number };

type Player = Entity & {
  health: number;
  sinceLastShot: number[];
  toFirePrimary?: boolean;
  toFireSecondary?: boolean;
  projectileId: number;
  name?: string;
  energy: number;
  definitionIndex: number;
  canDock?: number;
  docked?: number;
  armIndices: number[];
  // Limited to flat objects (change player copy code to augment this behavior if needed)
  slotData: any[];
  cargo?: CargoEntry[];
  credits?: number;
};

type Asteroid = Circle & {
  id: number;
  resources: number;
  heading: number;
  definitionIndex: number;
};

type Missile = Entity & {
  damage: number;
  target?: number;
  team: number;
  lifetime: number;
  definitionIndex: number;
};

enum TargetKind {
  None = 0,
  Player,
  Asteroid,
}

const availableCargoCapacity = (player: Player) => {
  const def = defs[player.definitionIndex];
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

const copyPlayer = (player: Player) => {
  const ret = { ...player };
  ret.sinceLastShot = [...player.sinceLastShot];
  ret.armIndices = [...player.armIndices];
  ret.slotData = player.slotData.map((data) => ({ ...data }));
  player.position = { ...player.position };
  player.cargo = player.cargo?.map((cargo) => ({ ...cargo }));
  return ret;
};

const canDock = (player: Player | undefined, station: Player | undefined, strict = true) => {
  if (!player || !station) {
    return false;
  }
  const stationDef = defs[station.definitionIndex];
  const distance = l2Norm(player.position, station.position);
  if (strict) {
    return distance < stationDef.radius;
  } else {
    return distance < stationDef.radius * 2;
  }
};

type Ballistic = Entity & { damage: number; team: number; parent: number; frameTillEXpire: number };

// Primary laser stats (TODO put this in a better place)
const primaryRange = 1500;
const primaryRangeSquared = primaryRange * primaryRange;
const primarySpeed = 20;
const primaryFramesToExpire = primaryRange / primarySpeed;
const primaryRadius = 1;

enum EffectAnchorKind {
  Absolute,
  Player,
  Asteroid,
}

type EffectAnchor = {
  kind: EffectAnchorKind;
  value: Position | number;
  heading?: number;
  speed?: number;
};

type EffectTrigger = {
  effectIndex: number;
  from: EffectAnchor;
  to?: EffectAnchor;
};

type GlobalState = {
  players: Map<number, Player>;
  projectiles: Map<number, Ballistic[]>;
  asteroids: Map<number, Asteroid>;
  missiles: Map<number, Missile>;
};

const setCanDock = (player: Player, state: GlobalState) => {
  if (player) {
    if (player.docked) {
      player.canDock = undefined;
      return;
    }
    const playerDef = defs[player.definitionIndex];
    player.canDock = undefined;
    state.players.forEach((otherPlayer) => {
      const def = defs[otherPlayer.definitionIndex];
      if (def.kind === UnitKind.Station && playerDef.team === def.team) {
        if (canDock(player, otherPlayer)) {
          player.canDock = otherPlayer.id;
          return;
        }
      }
    });
  }
};

// For smoothing the animations
const fractionalUpdate = (state: GlobalState, fraction: number) => {
  const ret: GlobalState = { players: new Map(), projectiles: new Map(), asteroids: new Map(), missiles: new Map() };
  for (const [id, player] of state.players) {
    if (player.docked) {
      ret.players.set(id, player);
      continue;
    }
    ret.players.set(id, {
      ...player,
      position: {
        x: player.position.x + player.speed * Math.cos(player.heading) * fraction,
        y: player.position.y + player.speed * Math.sin(player.heading) * fraction,
      },
    });
  }
  for (const [id, projectiles] of state.projectiles) {
    ret.projectiles.set(
      id,
      projectiles.map((projectile) => ({
        ...projectile,
        position: {
          x: projectile.position.x + projectile.speed * Math.cos(projectile.heading) * fraction,
          y: projectile.position.y + projectile.speed * Math.sin(projectile.heading) * fraction,
        },
      }))
    );
  }
  return ret;
};

const findHeadingBetween = (a: Position, b: Position) => {
  return Math.atan2(b.y - a.y, b.x - a.x);
};

const findClosestTarget = (player: Player, state: GlobalState, onlyEnemy = false) => {
  let ret: [Player | undefined, number] = [undefined, 0];
  let minDistance = Infinity;
  let def: UnitDefinition;
  if (onlyEnemy) {
    def = defs[player.definitionIndex];
  }
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer.docked) {
      continue;
    }
    if (onlyEnemy && def.team === defs[otherPlayer.definitionIndex].team) {
      continue;
    }
    if (player === otherPlayer) {
      continue;
    }
    const distanceSquared = l2NormSquared(player.position, otherPlayer.position);
    if (distanceSquared < minDistance) {
      minDistance = distanceSquared;
      ret = [otherPlayer, id];
    }
  }
  return ret;
};

const findFurthestTarget = (player: Player, state: GlobalState, onlyEnemy = false) => {
  let ret: [Player | undefined, number] = [undefined, 0];
  let maxDistance = 0;
  let def: UnitDefinition;
  if (onlyEnemy) {
    def = defs[player.definitionIndex];
  }
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer.docked) {
      continue;
    }
    if (onlyEnemy && def.team === defs[otherPlayer.definitionIndex].team) {
      continue;
    }
    if (player === otherPlayer) {
      continue;
    }
    const distanceSquared = l2NormSquared(player.position, otherPlayer.position);
    if (distanceSquared > maxDistance) {
      maxDistance = distanceSquared;
      ret = [otherPlayer, id];
    }
  }
  return ret;
};

const findNextTarget = (player: Player, current: Player | undefined, state: GlobalState, onlyEnemy = false) => {
  if (!current) {
    return findClosestTarget(player, state, onlyEnemy);
  }
  let ret: [Player | undefined, number] = [current, current?.id || 0];
  const currentDistanceSquared = l2NormSquared(player.position, current.position);
  let minDistanceGreaterThanCurrent = Infinity;
  let foundFurther = false;
  let def: UnitDefinition;
  if (onlyEnemy) {
    def = defs[player.definitionIndex];
  }
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer.docked) {
      continue;
    }
    if (onlyEnemy && def.team === defs[otherPlayer.definitionIndex].team) {
      continue;
    }
    if (player === otherPlayer) {
      continue;
    }
    const distanceSquared = l2NormSquared(player.position, otherPlayer.position);
    if (distanceSquared > currentDistanceSquared && distanceSquared < minDistanceGreaterThanCurrent) {
      minDistanceGreaterThanCurrent = distanceSquared;
      ret = [otherPlayer, id];
      foundFurther = true;
    }
  }
  if (!foundFurther) {
    return findClosestTarget(player, state, onlyEnemy);
  }
  return ret;
};

const findPreviousTarget = (player: Player, current: Player | undefined, state: GlobalState, onlyEnemy = false) => {
  if (!current) {
    return findClosestTarget(player, state, onlyEnemy);
  }
  let ret: [Player | undefined, number] = [current, current?.id || 0];
  const currentDistanceSquared = l2NormSquared(player.position, current.position);
  let maxDistanceLessThanCurrent = 0;
  let foundCloser = false;
  let def: UnitDefinition;
  if (onlyEnemy) {
    def = defs[player.definitionIndex];
  }
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer.docked) {
      continue;
    }
    if (onlyEnemy && def.team === defs[otherPlayer.definitionIndex].team) {
      continue;
    }
    if (player === otherPlayer) {
      continue;
    }
    const distanceSquared = l2NormSquared(player.position, otherPlayer.position);
    if (distanceSquared < currentDistanceSquared && distanceSquared > maxDistanceLessThanCurrent) {
      maxDistanceLessThanCurrent = distanceSquared;
      ret = [otherPlayer, id];
      foundCloser = true;
    }
  }
  if (!foundCloser) {
    return findFurthestTarget(player, state, onlyEnemy);
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

// Like usual the update function is a monstrosity
const update = (
  state: GlobalState,
  frameNumber: number,
  onDeath: (id: number) => void,
  serverTargets: Map<number, [TargetKind, number]>,
  serverSecondaries: Map<number, number>,
  applyEffect: (effect: EffectTrigger) => void
) => {
  for (const [id, player] of state.players) {
    if (player.docked) {
      continue;
    }
    const def = defs[player.definitionIndex];
    if (player.health <= 0) {
      state.players.delete(id);
      applyEffect({
        effectIndex: def.deathEffect,
        from: { kind: EffectAnchorKind.Absolute, value: player.position, heading: player.heading, speed: player.speed },
      });
      onDeath(id);
    }
    if (def.kind === UnitKind.Ship) {
      player.position.x += player.speed * Math.cos(player.heading);
      player.position.y += player.speed * Math.sin(player.heading);
      if (player.toFirePrimary && player.energy > 10) {
        const projectile = {
          position: { x: player.position.x, y: player.position.y },
          radius: primaryRadius,
          speed: primarySpeed,
          heading: player.heading,
          damage: def.primaryDamage,
          team: def.team,
          id: player.projectileId,
          parent: id,
          frameTillEXpire: primaryFramesToExpire,
        };
        const projectiles = state.projectiles.get(id) || [];
        projectiles.push(projectile);
        state.projectiles.set(id, projectiles);
        player.projectileId++;
        player.toFirePrimary = false;
        player.energy -= 10;
      }
      player.armIndices.forEach((armament, index) => {
        const armDef = armDefs[armament];
        if (armDef.frameMutator) {
          armDef.frameMutator(player, index);
        }
      });
      if (player.toFireSecondary) {
        const slotId = serverSecondaries.get(id);
        const armDef = armDefs[player.armIndices[slotId]];
        if (armDef.targeted === TargetedKind.Targeted) {
          const [targetKind, targetId] = serverTargets.get(id) || [TargetKind.None, 0];
          if (slotId !== undefined && targetKind && slotId < player.armIndices.length) {
            if (armDef.stateMutator) {
              let target: Player | Asteroid | undefined;
              if (targetKind === TargetKind.Player) {
                target = state.players.get(targetId);
              } else if (targetKind === TargetKind.Asteroid) {
                target = state.asteroids.get(targetId);
              }
              if (target) {
                armDef.stateMutator(state, player, targetKind, target, applyEffect, slotId);
              }
            }
          }
        } else if (armDef.targeted === TargetedKind.Untargeted) {
          if (slotId !== undefined && slotId < player.armIndices.length) {
            if (armDef.stateMutator) {
              armDef.stateMutator(state, player, TargetKind.None, undefined, applyEffect, slotId);
            }
          }
        }
      }
    } else {
      // Have stations spin slowly
      player.heading = positiveMod(player.heading + 0.003, 2 * Math.PI);

      let closestEnemy: Player | undefined;
      let closestEnemyDistanceSquared = Infinity;
      for (const [otherId, otherPlayer] of state.players) {
        if (otherPlayer.docked) {
          continue;
        }
        if (player.id === otherId) {
          continue;
        }
        const otherDef = defs[otherPlayer.definitionIndex];
        if (otherDef.team === def.team) {
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
        const hardpointHeadingsAndDistances = hardpointLocations.map((hardpoint) => [
          findHeadingBetween(hardpoint, closestEnemy.position),
          l2NormSquared(hardpoint, closestEnemy.position),
        ]);
        for (let i = 0; i < def.hardpoints.length; i++) {
          const [heading, distanceSquared] = hardpointHeadingsAndDistances[i];
          if (distanceSquared < primaryRangeSquared && player.energy > 10 && player.sinceLastShot[i] > def.primaryReloadTime) {
            const projectile = {
              position: hardpointLocations[i],
              radius: primaryRadius,
              speed: primarySpeed,
              heading,
              damage: def.primaryDamage,
              team: def.team,
              id: player.projectileId,
              parent: id,
              frameTillEXpire: primaryFramesToExpire,
            };
            const projectiles = state.projectiles.get(id) || [];
            projectiles.push(projectile);
            state.projectiles.set(id, projectiles);
            player.projectileId++;
            player.energy -= 10;
            player.sinceLastShot[i] = 0;
          }
        }
      }
    }
    for (let i = 0; i < player.sinceLastShot.length; i++) {
      player.sinceLastShot[i] += 1;
    }
    player.energy += def.energyRegen;
    if (player.energy > def.energy) {
      player.energy = def.energy;
    }
  }
  for (const [id, projectiles] of state.projectiles) {
    for (let i = 0; i < projectiles.length; i++) {
      const projectile = projectiles[i];
      projectile.position.x += projectile.speed * Math.cos(projectile.heading);
      projectile.position.y += projectile.speed * Math.sin(projectile.heading);
      projectile.frameTillEXpire -= 1;
      let didRemove = false;
      for (const [otherId, otherPlayer] of state.players) {
        if (otherPlayer.docked) {
          continue;
        }
        const def = defs[otherPlayer.definitionIndex];
        if (projectile.team !== def.team && pointInCircle(projectile.position, otherPlayer)) {
          otherPlayer.health -= projectile.damage;
          if (otherPlayer.health <= 0) {
            state.players.delete(otherId);
            applyEffect({
              effectIndex: def.deathEffect,
              from: { kind: EffectAnchorKind.Absolute, value: otherPlayer.position, heading: otherPlayer.heading, speed: otherPlayer.speed },
            });
            onDeath(otherId);
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
  for (const [id, missile] of state.missiles) {
    const missileDef = missileDefs[missile.definitionIndex];
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
    missile.lifetime -= 1;
    let didRemove = false;
    for (const [otherId, otherPlayer] of state.players) {
      if (otherPlayer.docked) {
        continue;
      }
      const def = defs[otherPlayer.definitionIndex];
      if (missile.team !== def.team && circlesIntersect(missile, otherPlayer)) {
        otherPlayer.health -= missile.damage;
        if (otherPlayer.health <= 0) {
          state.players.delete(otherId);
          applyEffect({
            effectIndex: def.deathEffect,
            from: { kind: EffectAnchorKind.Absolute, value: otherPlayer.position, heading: otherPlayer.heading, speed: otherPlayer.speed },
          });
          onDeath(otherId);
        }
        state.missiles.delete(id);
        applyEffect({ effectIndex: missileDef.deathEffect, from: { kind: EffectAnchorKind.Absolute, value: missile.position } });
        didRemove = true;
        break;
      }
    }
    if (!didRemove && missile.lifetime <= 0) {
      state.missiles.delete(id);
      applyEffect({ effectIndex: missileDef.deathEffect, from: { kind: EffectAnchorKind.Absolute, value: missile.position } });
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
};

const applyInputs = (input: Input, player: Player) => {
  const def = defs[player.definitionIndex];
  if (input.up) {
    player.speed += def.acceleration;
  }
  if (input.down) {
    player.speed -= def.acceleration;
  }
  if (input.left) {
    player.heading -= def.turnRate;
  }
  if (input.right) {
    player.heading += def.turnRate;
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
};

const uid = () => {
  let ret = 0;
  while (ret === 0) {
    ret = Math.floor(Math.random() * 1000000);
  }
  return ret;
};

const randomAsteroids = (count: number, bounds: Rectangle) => {
  if (asteroidDefs.length === 0) {
    throw new Error("Asteroid defs not initialized");
  }
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * asteroidDefs.length);
    const def = asteroidDefs[index];
    const asteroid: Asteroid = {
      position: {
        x: Math.random() * bounds.width + bounds.x,
        y: Math.random() * bounds.height + bounds.y,
      },
      heading: Math.random() * 2 * Math.PI,
      resources: def.resources,
      definitionIndex: index,
      id: uid(),
      radius: def.radius,
    };
    asteroids.push(asteroid);
  }
  return asteroids;
};

const findClosestTargetAsteroid = (player: Player, state: GlobalState) => {
  let ret: [Asteroid | undefined, number] = [undefined, 0];
  let minDistance = Infinity;
  for (const [id, asteroid] of state.asteroids) {
    const distanceSquared = l2NormSquared(player.position, asteroid.position);
    if (distanceSquared < minDistance) {
      minDistance = distanceSquared;
      ret = [asteroid, id];
    }
  }
  return ret;
};

const findFurthestTargetAsteroid = (player: Player, state: GlobalState) => {
  let ret: [Asteroid | undefined, number] = [undefined, 0];
  let maxDistance = 0;
  for (const [id, asteroid] of state.asteroids) {
    const distanceSquared = l2NormSquared(player.position, asteroid.position);
    if (distanceSquared > maxDistance) {
      maxDistance = distanceSquared;
      ret = [asteroid, id];
    }
  }
  return ret;
};

const findNextTargetAsteroid = (player: Player, current: Asteroid | undefined, state: GlobalState) => {
  if (!current) {
    return findClosestTargetAsteroid(player, state);
  }
  let ret: [Asteroid | undefined, number] = [current, current?.id || 0];
  const currentDistanceSquared = l2NormSquared(player.position, current.position);
  let minDistanceGreaterThanCurrent = Infinity;
  let foundFurther = false;
  for (const [id, asteroid] of state.asteroids) {
    const distanceSquared = l2NormSquared(player.position, asteroid.position);
    if (distanceSquared > currentDistanceSquared && distanceSquared < minDistanceGreaterThanCurrent) {
      minDistanceGreaterThanCurrent = distanceSquared;
      ret = [asteroid, id];
      foundFurther = true;
    }
  }
  if (!foundFurther) {
    return findClosestTargetAsteroid(player, state);
  }
  return ret;
};

const findPreviousTargetAsteroid = (player: Player, current: Asteroid | undefined, state: GlobalState) => {
  if (!current) {
    return findClosestTargetAsteroid(player, state);
  }
  let ret: [Asteroid | undefined, number] = [current, current?.id || 0];
  const currentDistanceSquared = l2NormSquared(player.position, current.position);
  let maxDistanceLessThanCurrent = 0;
  let foundCloser = false;
  for (const [id, asteroid] of state.asteroids) {
    const distanceSquared = l2NormSquared(player.position, asteroid.position);
    if (distanceSquared < currentDistanceSquared && distanceSquared > maxDistanceLessThanCurrent) {
      maxDistanceLessThanCurrent = distanceSquared;
      ret = [asteroid, id];
      foundCloser = true;
    }
  }
  if (!foundCloser) {
    return findFurthestTargetAsteroid(player, state);
  }
  return ret;
};

const equip = (player: Player, slotIndex: number, what: string | number, noCost = false) => {
  const def = defs[player.definitionIndex];
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
    console.log("Warning: wrong kind of armament");
    return;
  }
  if (slotIndex >= player.armIndices.length) {
    console.log("Warning: player armaments not initialized correctly");
    return;
  }

  if ((player.credits !== undefined && armDef.cost <= player.credits) || noCost) {
    player.credits -= armDef.cost;
    player.armIndices[slotIndex] = defIndex;
    if (armDef.equipMutator) {
      armDef.equipMutator(player, slotIndex);
    }
  }
};

const maxNameLength = 20;
const ticksPerSecond = 60;

export {
  GlobalState,
  Position,
  Circle,
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
  update,
  applyInputs,
  infinityNorm,
  positiveMod,
  fractionalUpdate,
  canDock,
  setCanDock,
  copyPlayer,
  findNextTarget,
  findPreviousTarget,
  findHeadingBetween,
  uid,
  randomAsteroids,
  findNextTargetAsteroid,
  findPreviousTargetAsteroid,
  l2Norm,
  l2NormSquared,
  availableCargoCapacity,
  addCargo,
  equip,
  ticksPerSecond,
  maxNameLength,
};
