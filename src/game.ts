// This is shared by the server and the client

type Position = { x: number; y: number };
type Circle = { position: Position; radius: number };

const infinityNorm = (a: Position, b: Position) => {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
};

const l2NormSquared = (a: Position, b: Position) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
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
  team: number;
  sprite: number;
  sinceLastShot: number;
  toFire?: boolean;
  projectileId: number;
};

type Ballistic = Entity & { damage: number; team: number; parent: number; frameTillEXpire: number };

// Primary laser stats (TODO put this in a better place)
const primaryRange = 1500;
const primarySpeed = 20;
const primaryFramesToExpire = primaryRange / primarySpeed;
const primaryReloadTime = 20;

type GlobalState = {
  players: Map<number, Player>;
  projectiles: Map<number, Ballistic[]>;
};

// For smoothing the animations
const fractionalUpdate = (state: GlobalState, fraction: number) => {
  const ret: GlobalState = { players: new Map(), projectiles: new Map() };
  for (const [id, player] of state.players) {
    ret.players.set(id, {
      ...player,
      position: {
        x: player.position.x + player.speed * Math.cos(player.heading) * fraction,
        y: player.position.y + player.speed * Math.sin(player.heading) * fraction,
      },
    });
  }
  for (const [id, projectiles] of state.projectiles) {
    ret.projectiles.set(id, projectiles.map((projectile) => ({ 
      ...projectile,
      position: {
        x: projectile.position.x + projectile.speed * Math.cos(projectile.heading) * fraction,
        y: projectile.position.y + projectile.speed * Math.sin(projectile.heading) * fraction,
      },
     })));
  }
  return ret;
}

const update = (state: GlobalState, frameNumber: number, onDeath: (id: number) => void) => {
  for (const [id, player] of state.players) {
    player.position.x += player.speed * Math.cos(player.heading);
    player.position.y += player.speed * Math.sin(player.heading);
    if (player.toFire) {
      // console.log(frameNumber, player);
      const projectile = {
        position: { x: player.position.x, y: player.position.y },
        radius: 1,
        speed: primarySpeed,
        heading: player.heading,
        damage: 10, // This should be based on what ship is firing
        team: player.team,
        id: player.projectileId,
        parent: id,
        frameTillEXpire: primaryFramesToExpire,
      };
      const projectiles = state.projectiles.get(id) || [];
      projectiles.push(projectile);
      state.projectiles.set(id, projectiles);
      player.projectileId++;
      player.toFire = false;
    }
    player.sinceLastShot += 1;
  }
  for (const [id, projectiles] of state.projectiles) {
    for (let i = 0; i < projectiles.length; i++) {
      const projectile = projectiles[i];
      projectile.position.x += projectile.speed * Math.cos(projectile.heading);
      projectile.position.y += projectile.speed * Math.sin(projectile.heading);
      projectile.frameTillEXpire -= 1;
      let didRemove = false;
      for (const [otherId, otherPlayer] of state.players) {
        if (projectile.team !== otherPlayer.team && pointInCircle(projectile.position, otherPlayer)) {
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
};

const applyInputs = (input: Input, player: Player) => {
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
    if (player.sinceLastShot > primaryReloadTime) {
      player.sinceLastShot = 0;
      player.toFire = true;
    }
  }
};

const ticksPerSecond = 60;

export { GlobalState, Position, Circle, Input, Player, Ballistic, update, applyInputs, infinityNorm, positiveMod, fractionalUpdate, ticksPerSecond };
