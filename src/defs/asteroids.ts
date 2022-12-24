import { Rectangle } from "../geometry";

type AsteroidDef = {
  resources: number;
  sprite: Rectangle;
  radius: number;
  mineral: string;
  difficulty: number;
  model: string;
  modelIndex?: number;
};

const asteroidDefs: AsteroidDef[] = [];
const asteroidDefMap = new Map<string, { index: number; def: AsteroidDef }>();

const initAsteroids = () => {
  asteroidDefs.push({
    resources: 500,
    sprite: { x: 256, y: 0, width: 64, height: 64 },
    radius: 40,
    mineral: "Prifecite",
    difficulty: 1,
    model: "prifecite",
  });
  asteroidDefs.push({
    resources: 100,
    sprite: { x: 320, y: 576, width: 64, height: 64 },
    radius: 40,
    mineral: "Russanite",
    difficulty: 3,
    model: "russanite",
  });
  asteroidDefs.push({
    resources: 1000,
    sprite: { x: 256, y: 832, width: 64, height: 64 },
    radius: 40,
    mineral: "Hemacite",
    difficulty: 2,
    model: "hemacite",
  });
  asteroidDefs.push({
    resources: 1000,
    sprite: { x: 384, y: 640, width: 64, height: 64 },
    radius: 40,
    mineral: "Aziracite",
    difficulty: 2,
    model: "aziracite",
  });

  for (let i = 0; i < asteroidDefs.length; i++) {
    const def = asteroidDefs[i];
    asteroidDefMap.set(def.mineral, { index: i, def });
  }
};

export { AsteroidDef, asteroidDefs, asteroidDefMap, initAsteroids };
