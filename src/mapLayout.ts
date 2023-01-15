import { createTorus } from "./sectorGraph";

const width = 6;
const height = 3;

const mapGraph = createTorus(width, height);

const peerCount = 3;

type ResourceDensity = { resource: string; density: number };

export { ResourceDensity, mapGraph, width as mapWidth, height as mapHeight, peerCount };
