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
    speed: 10,
    range: 500,
    energy: 8,
    radius: 2,
    // TODO Make the sound effect for this
    fireEffect: 8,
    hitMutator(ballistic, state, player) {
      player!.energy -= 12;
    },
  });
  projectileDefs[projectileDefs.length - 1].framesToExpire =
    projectileDefs[projectileDefs.length - 1].range / projectileDefs[projectileDefs.length - 1].speed;
};

export { projectileDefs, initProjectileDefs };
