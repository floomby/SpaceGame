// This script can get broken if you change the map size, sector size or the scale

import { writeFileSync } from "fs";
import { gameToMacro, sectorBounds } from "../src/game";
import assert from "assert";
import { Rectangle } from "../src/geometry";

const chunkSize = 2048;
const macroChunkSize = 1024;
const bottomLeft = gameToMacro({ x: 10240, y: 10240 }, 15);

const macroToFeature = (macro: { x: number; y: number }) => {
  return {
    x: (macro.x * chunkSize) / macroChunkSize,
    y: (macro.y * chunkSize) / macroChunkSize,
  };
};

const chunkCount = bottomLeft.x / macroChunkSize + 2;

const featureBounds: Rectangle = {
  x: -chunkSize,
  y: -chunkSize,
  width: chunkSize * chunkCount,
  height: chunkSize * chunkCount,
};

const randomPoint = () => ({
  x: Math.random() * featureBounds.width + featureBounds.x,
  y: Math.random() * featureBounds.height + featureBounds.y,
});

const features = [];

for (let i = 0; i < 1200; i++) {
  const where = randomPoint();
  features.push({
    kind: "GlobularCluster",
    x: where.x,
    y: where.y,
    radius: 80 + Math.random() * 300,
    strength: Math.random() * 0.3,
  });
}

const addSectorTint = (sector: number, rgb: [number, number, number], strength: number) => {
  const divisions = 6;
  for (let i = 0; i < divisions; i++) {
    const x = sectorBounds.x + (sectorBounds.width / divisions) * i;
    for (let j = 0; j < divisions; j++) {
      const y = sectorBounds.y + (sectorBounds.height / divisions) * j;
      const where = macroToFeature(gameToMacro({ x, y }, 15));
      features.push({
        kind: "Nebula",
        x: where.x + Math.random() * 4000 - 2000,
        y: where.y + Math.random() * 4000 - 2000,
        radius: 2000 + Math.random() * 2000,
        strength: strength + Math.random() * 0.2,
        color: {
          r: Math.max(rgb[0] + Math.random() * 0.4 - 0.2, 0),
          g: Math.max(rgb[1] + Math.random() * 0.4 - 0.2, 0),
          b: Math.max(rgb[2] + Math.random() * 0.4 - 0.2, 0),
        },
      });
    }
  }
};

addSectorTint(0, [0.0, 0.8, 0.0], 0.6);
addSectorTint(1, [0.3, 0.6, 0.0], 0.4);
addSectorTint(2, [0.3, 0.6, 0.0], 0.4);
addSectorTint(3, [0.0, 0.8, 0.0], 0.6);

addSectorTint(4, [0.0, 0.3, 0.2], 0.4);
addSectorTint(5, [0.3, 0.6, 0.0], 0.4);
addSectorTint(6, [0.3, 0.6, 0.0], 0.4);
addSectorTint(7, [0.0, 0.3, 0.2], 0.4);

addSectorTint(8, [0.0, 0.2, 0.6], 0.6);
addSectorTint(9, [0.0, 0.2, 0.6], 0.4);
addSectorTint(10, [0.7, 0.0, 0.0], 0.4);
addSectorTint(11, [0.7, 0.0, 0.0], 0.5);

addSectorTint(12, [0.0, 0.3, 0.4], 0.7);
addSectorTint(13, [0.0, 0.3, 0.4], 0.6);
addSectorTint(14, [0.7, 0.0, 0.1], 0.6);
addSectorTint(15, [0.7, 0.0, 0.1], 0.7);

for (let i = 0; i < 100; i++) {
  const where = randomPoint();
  features.push({
    kind: "Nebula",
    x: where.x,
    y: where.y,
    radius: 2000 + Math.random() * 2000,
    strength: 0.6 + Math.random() * 0.4,
    color: {
      r: Math.random(),
      g: Math.random(),
      b: Math.random(),
    },
  });
}

writeFileSync("features.json", JSON.stringify(features, null, 2));

console.log(
  `./background-generator/target.exe --offsetX -2048 --offsetY -2048 --featureFile features.json --chunkCount ${chunkCount} --outputDirectory ../resources/background --chunkDimension ${chunkSize} --muteFeatures`
);
