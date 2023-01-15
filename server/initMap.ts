// Standalone tool for initializing the map and the stations in the database

import mongoose from "mongoose";
import { asteroidDefMap, initAsteroids } from "../src/defs/asteroids";
import { mapHeight, mapWidth, ResourceDensity } from "../src/mapLayout";
import { Sector } from "./sector";

initAsteroids();

const resourceKinds = Array.from(asteroidDefMap.keys());

const randomResources = () => {
  const acm: ResourceDensity[] = [];
  const kinds = [...resourceKinds];
  while (kinds.length > 0) {
    const kind = kinds.pop()!;
    if (Math.random() < 0.5) {
      continue;
    }
    const density = Math.random() * 2 + 1;
    acm.push({ resource: kind, density });
  }
  if (acm.length === 0) {
    return randomResources();
  }
  return acm;
};

const sectorCount = mapWidth * mapHeight;

mongoose.connect("mongodb://127.0.0.1:27017/SpaceGame", {})
  .catch((err) => {
    console.log("Error connecting to database: " + err);
  }).then( async () => {
    for (let i = 0; i < sectorCount; i++) {
      const sector = new Sector({
        id: i,
        resources: randomResources(),
        count: Math.floor(Math.random() * 30) + 5,
      });
      await sector.save();
    }
    process.exit(0);
  });
