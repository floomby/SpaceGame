// Standalone tool for initializing the map and the stations in the database

import mongoose from "mongoose";
import { Faction } from "../src/defs";
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

const factionLookup = new Array(sectorCount).fill(Faction.Alliance);

factionLookup[0] = Faction.Scourge;
factionLookup[5] = Faction.Scourge;
factionLookup[12] = Faction.Scourge;
factionLookup[17] = Faction.Scourge;

factionLookup[2] = Faction.Rogue;
factionLookup[3] = Faction.Rogue;
factionLookup[14] = Faction.Rogue;
factionLookup[15] = Faction.Rogue;

factionLookup[4] = Faction.Confederation;
factionLookup[9] = Faction.Confederation;
factionLookup[10] = Faction.Confederation;
factionLookup[11] = Faction.Confederation;
factionLookup[16] = Faction.Confederation;

mongoose
  .connect("mongodb://127.0.0.1:27017/SpaceGame", {})
  .catch((err) => {
    console.log("Error connecting to database: " + err);
  })
  .then(async () => {
    for (let i = 0; i < sectorCount; i++) {
      const sector = new Sector({
        id: i,
        resources: randomResources(),
        asteroidCount: Math.floor(Math.random() * 30) + 5,
        faction: factionLookup[i],
        guardianCount: 5,
      });
      await sector.save();
    }
    process.exit(0);
  });
