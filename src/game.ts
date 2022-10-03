// This is shared by the server and the client

type Position = { x: number; y: number };
type Circle = { position: Position; radius: number };

const infinityNorm = (a: Position, b: Position) => {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
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

type Ballistic = Entity & { damage: number; team: number; parent: number; };

type GlobalState = {
  players: Map<number, Player>;
  projectiles: Map<number, Ballistic[]>;
};

const update = (state: GlobalState, frameNumber: number) => {
  for (const [id, player] of state.players) {
    player.position.x += player.speed * Math.cos(player.heading);
    player.position.y += player.speed * Math.sin(player.heading);
    if (player.toFire) {
      // console.log(frameNumber, player);
      const projectile = {
        position: { x: player.position.x, y: player.position.y },
        radius: 1,
        speed: 20,
        heading: player.heading,
        damage: 10,
        team: player.team,
        id: player.projectileId,
        parent: id,
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
    for (const projectile of projectiles) {
      projectile.position.x += projectile.speed * Math.cos(projectile.heading);
      projectile.position.y += projectile.speed * Math.sin(projectile.heading);
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

const reloadTime = 20;

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
    if (player.sinceLastShot > reloadTime) {
      player.sinceLastShot = 0;
      player.toFire = true;
    }
  }
};

export { GlobalState, Position, Circle, Input, Player, Ballistic, update, applyInputs, infinityNorm };
