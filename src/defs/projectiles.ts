import { Ballistic, findAllPlayersOverlappingCircle, GlobalState } from "../game";

type ProjectileDef = {
  drawIndex: number;
  speed: number;
  range: number;
  framesToExpire?: number;
  energy: number;
  radius: number;
  fireEffect?: number;
  endEffect?: number;
  endMutator?: (ballistic: Ballistic, state: GlobalState) => void;
  hitEffect?: number;
  hitMutator?: (ballistic: Ballistic, state: GlobalState) => void;
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
    energy: 5,
    radius: 3,
    fireEffect: 8,
    endEffect: 8,
    hitEffect: 8,
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
};

export { projectileDefs, initProjectileDefs };
