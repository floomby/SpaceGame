import { Ballistic, findAllPlayersOverlappingCircle, GlobalState, Player } from "../game";

type ProjectileDef = {
  drawIndex: number;
  speed: number;
  range: number;
  framesToExpire?: number;
  energy: number;
  radius: number;
  fireEffect: number;
  endEffect?: number;
  endMutator?: (ballistic: Ballistic, state: GlobalState) => void;
  hitEffect?: number;
  hitMutator?: (ballistic: Ballistic, state: GlobalState, player?: Player) => void;
};

const projectileDefs: ProjectileDef[] = [];

const initProjectileDefs = () => {
  // 0 - Default primary
  projectileDefs.push({
    drawIndex: 0,
    speed: 20,
    range: 1500,
    energy: 3,
    radius: 1,
    fireEffect: 8,
  });
  projectileDefs[projectileDefs.length - 1].framesToExpire =
    projectileDefs[projectileDefs.length - 1].range / projectileDefs[projectileDefs.length - 1].speed;

  // 1 - Plasma
  projectileDefs.push({
    drawIndex: 1,
    speed: 8,
    range: 600,
    // This energy cost is a redundant field if the weapon is not a primary weapon
    energy: 7.5,
    radius: 3,
    fireEffect: 13,
    endEffect: 14,
    hitEffect: 14,
    hitMutator(ballistic, state) {
      ballistic.radius = 50;
      const players = findAllPlayersOverlappingCircle(ballistic, state.players.values());
      for (let i = 0; i < players.length; i++) {
        players[i].health -= 30;
      }
    },
  });
  projectileDefs[projectileDefs.length - 1].framesToExpire =
    projectileDefs[projectileDefs.length - 1].range / projectileDefs[projectileDefs.length - 1].speed;
  projectileDefs[projectileDefs.length - 1].endMutator = projectileDefs[projectileDefs.length - 1].hitMutator;

  // 1 - Disruptor
  projectileDefs.push({
    drawIndex: 2,
    speed: 12,
    range: 450,
    energy: 2,
    radius: 2,
    fireEffect: 17,
    hitMutator(ballistic, state, player) {
      player.energy = Math.max(player!.energy - 12, 0);
    },
  });
  projectileDefs[projectileDefs.length - 1].framesToExpire =
    projectileDefs[projectileDefs.length - 1].range / projectileDefs[projectileDefs.length - 1].speed;
};

const projectileLightColorUnnormed = (projectileIndex: number): [number, number, number] => {
  switch (projectileIndex) {
    case 0:
      return [4.0, 4.0, 4.0];
    case 1:
      return [4.0, 4.0, 0.0];
    case 2:
      return [4.0, 0.0, 0.0];
    default:
      return [4.0, 4.0, 4.0];
  }
};

export { projectileDefs, initProjectileDefs, projectileLightColorUnnormed };
