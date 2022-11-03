import { Rectangle } from "../geometry";

type AsteroidDef = {
  resources: number;
  sprite: Rectangle;
  radius: number;
  mineral: string;
  difficulty: number;
};

const asteroidDefs: AsteroidDef[] = [];
const asteroidDefMap = new Map<string, { index: number; def: AsteroidDef }>();

const initAsteroids = () => {
  asteroidDefs.push({
    resources: 500,
    sprite: { x: 256, y: 0, width: 64, height: 64 },
    radius: 24,
    mineral: "Prifecite",
    difficulty: 1,
  });
  asteroidDefs.push({
    resources: 100,
    sprite: { x: 320, y: 576, width: 64, height: 64 },
    radius: 22,
    mineral: "Russanite",
    difficulty: 10,
  });

  for (let i = 0; i < asteroidDefs.length; i++) {
    const def = asteroidDefs[i];
    asteroidDefMap.set(def.mineral, { index: i, def });
  }
};

export { AsteroidDef, asteroidDefs, asteroidDefMap, initAsteroids };
