// This is shared by the server and the client

import { UnitDefinition, UnitKind, defs } from "./defs";

type Position = { x: number; y: number };
type Circle = { position: Position; radius: number };
type Rectangle = { x: number; y: number; width: number; height: number };

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

const positiveMod = (a: number, b: number) => {
  return ((a % b) + b) % b;
};

type Entity = Circle & { id: number; speed: number; heading: number };

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
  armaments: number[];
  // Limited to flat objects (change player copy code to augment this behavior if needed)
  slotData: any[];
  cargo?: { what: string; amount: number }[];
};

const availableCargoCapacity = (player: Player) => {
  const def = defs[player.definitionIndex];
  let capacity = 0;
  if (def.cargoCapacity) {
    capacity = def.cargoCapacity;
  }
  const carrying = player.cargo?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
  return capacity - carrying;
};

const copyPlayer = (player: Player) => {
  const ret = { ...player };
  ret.sinceLastShot = [...player.sinceLastShot];
  ret.armaments = [...player.armaments];
  ret.slotData = player.slotData.map((data) => ({ ...data }));
  player.position = { ...player.position };
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

// type Effect = {
//   sprite: number;
//   position: Position;
//   heading: number;
// };

type GlobalState = {
  players: Map<number, Player>;
  projectiles: Map<number, Ballistic[]>;
  // effects?: Effect[];
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
  const ret: GlobalState = { players: new Map(), projectiles: new Map() };
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

const findClosestTarget = (player: Player, state: GlobalState) => {
  let ret: [Player | undefined, number] = [undefined, 0];
  let minDistance = Infinity;
  const def = defs[player.definitionIndex];
  for (const [id, otherPlayer] of state.players) {
    const otherDef = defs[otherPlayer.definitionIndex];
    if (def.team === otherDef.team) {
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

const findFurthestTarget = (player: Player, state: GlobalState) => {
  let ret: [Player | undefined, number] = [undefined, 0];
  let maxDistance = 0;
  const def = defs[player.definitionIndex];
  for (const [id, otherPlayer] of state.players) {
    const otherDef = defs[otherPlayer.definitionIndex];
    if (def.team === otherDef.team) {
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

const findNextTarget = (player: Player, current: Player | undefined, state: GlobalState) => {
  if (!current) {
    return findClosestTarget(player, state);
  }
  let ret: [Player | undefined, number] = [current, 0];
  const def = defs[player.definitionIndex];
  const currentDistanceSquared = l2NormSquared(player.position, current.position);
  let minDistanceGreaterThanCurrent = Infinity;
  let foundFurther = false;
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer === ret[0]) {
      ret[1] = id;
    }
    const otherDef = defs[otherPlayer.definitionIndex];
    if (def.team === otherDef.team) {
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
    return findClosestTarget(player, state);
  }
  if (ret[1] === 0) {
    ret = [undefined, 0];
  }
  return ret;
};

const findPreviousTarget = (player: Player, current: Player | undefined, state: GlobalState) => {
  if (!current) {
    return findClosestTarget(player, state);
  }
  let ret: [Player | undefined, number] = [current, 0];
  const def = defs[player.definitionIndex];
  const currentDistanceSquared = l2NormSquared(player.position, current.position);
  let maxDistanceLessThanCurrent = 0;
  let foundCloser = false;
  for (const [id, otherPlayer] of state.players) {
    if (otherPlayer === ret[0]) {
      ret[1] = id;
    }
    const otherDef = defs[otherPlayer.definitionIndex];
    if (def.team === otherDef.team) {
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
    return findFurthestTarget(player, state);
  }
  if (ret[1] === 0) {
    ret = [undefined, 0];
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

const update = (state: GlobalState, frameNumber: number, onDeath: (id: number) => void) => {
  for (const [id, player] of state.players) {
    if (player.docked) {
      continue;
    }
    const def = defs[player.definitionIndex];
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
    } else {
      // Have stations spin slowly
      player.heading = positiveMod(player.heading + 0.003, 2 * Math.PI);

      let closestEnemy: Player | undefined;
      const closestEnemyDistance = Infinity;
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
        const distance = l2NormSquared(player.position, otherPlayer.position);
        if (distance < closestEnemyDistance) {
          closestEnemy = otherPlayer;
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
};

const applyInputs = (input: Input, player: Player) => {
  const def = defs[player.definitionIndex];
  if (input.up) {
    player.speed += 0.1;
  }
  if (input.down) {
    player.speed -= 0.1;
  }
  if (input.left) {
    player.heading -= 0.1;
  }
  if (input.right) {
    player.heading += 0.1;
  }
  if (player.speed > 10) {
    player.speed = 10;
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
  Ballistic,
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
  ticksPerSecond,
  maxNameLength,
};
