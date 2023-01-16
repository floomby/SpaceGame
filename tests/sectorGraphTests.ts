import { assert } from "console";
import { inspect } from "util";
import { CardinalDirection } from "../src/geometry";
import { SectorGraph, createEdge, createReflectionEdge, createIsolatedSector, SectorGraphNode, createTorus } from "../src/sectorGraph";

console.log("sectorGraphTests.ts");

const isolatedGraph = new Map<number, SectorGraphNode>();
createIsolatedSector(isolatedGraph, 0);

assert(isolatedGraph.get(0)!.out[CardinalDirection.Up]?.to.sector === 0);
assert(isolatedGraph.get(0)!.out[CardinalDirection.Down]?.to.sector === 0);
assert(isolatedGraph.get(0)!.out[CardinalDirection.Left]?.to.sector === 0);
assert(isolatedGraph.get(0)!.out[CardinalDirection.Right]?.to.sector === 0);

const torusGraph = createTorus(3, 2);

assert(torusGraph.get(0)!.out[CardinalDirection.Up]?.to.sector === 3);
assert(torusGraph.get(0)!.out[CardinalDirection.Down]?.to.sector === 3);

assert(torusGraph.get(3)!.out[CardinalDirection.Up]?.to.sector === 0);
assert(torusGraph.get(3)!.out[CardinalDirection.Down]?.to.sector === 0);

assert(torusGraph.get(5)!.out[CardinalDirection.Left]?.to.sector === 4);
assert(torusGraph.get(5)!.out[CardinalDirection.Right]?.to.sector === 3);

assert(torusGraph.get(3)!.out[CardinalDirection.Left]?.to.sector === 5);
assert(torusGraph.get(3)!.out[CardinalDirection.Right]?.to.sector === 4);
