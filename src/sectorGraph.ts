import { CardinalDirection, oppositeDirection } from "./geometry";

type SectorGraphNode = {
  out: [SectorGraphEdge, SectorGraphEdge, SectorGraphEdge, SectorGraphEdge];
  in: [SectorGraphEdge, SectorGraphEdge, SectorGraphEdge, SectorGraphEdge];
  sector: number;
};

type SectorGraphEdge = {
  from: SectorGraphNode;
  to: SectorGraphNode;
  isReflection?: boolean;
};

type SectorGraph = Map<number, SectorGraphNode>;

const createReflectionEdge = (node: SectorGraphNode, direction: CardinalDirection) => {
  const reflectionEdge: SectorGraphEdge = {
    from: node,
    to: node,
    isReflection: true,
  };
  node.out[direction] = reflectionEdge;
  node.in[oppositeDirection(direction)] = reflectionEdge;
};

const createEdge = (from: SectorGraphNode, to: SectorGraphNode, direction: CardinalDirection) => {
  const edgeA: SectorGraphEdge = {
    from,
    to,
  };
  from.out[direction] = edgeA;
  to.in[oppositeDirection(direction)] = edgeA;
  const edgeB: SectorGraphEdge = {
    from: to,
    to: from,
  };
  to.out[oppositeDirection(direction)] = edgeB;
  from.in[direction] = edgeB;
};

const getEdge = (graph: SectorGraph, from: number, direction: number) => {
  const node = graph.get(from);
  if (node === undefined) {
    return undefined;
  }
  return node.out[direction];
};

const removeContiguousSubgraph = (graph: SectorGraph, start: number) => {
  const visited = new Set<number>();
  const toVisit = [start];
  while (toVisit.length > 0) {
    const sector = toVisit.pop();
    if (sector === undefined) {
      continue;
    }
    if (visited.has(sector)) {
      continue;
    }
    visited.add(sector);
    const node = graph.get(sector);
    if (node === undefined) {
      continue;
    }
    for (const edge of node.out) {
      if (edge === undefined) {
        continue;
      }
      const { from, to } = edge;
      if (from.sector === sector) {
        toVisit.push(to.sector);
      }
    }
  }
};

const createIsolatedSector = (graph: SectorGraph, sector: number) => {
  const node: SectorGraphNode = {
    out: [undefined, undefined, undefined, undefined],
    in: [undefined, undefined, undefined, undefined],
    sector,
  };
  graph.set(sector, node);
  for (let i = 0; i < 4; i++) {
    createReflectionEdge(node, i);
  }
};

const createTorus = (width: number, height: number) => {
  const graph = new Map<number, SectorGraphNode>();
  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      const sector = j * width + i;
      const node: SectorGraphNode = {
        out: [undefined, undefined, undefined, undefined],
        in: [undefined, undefined, undefined, undefined],
        sector,
      };
      graph.set(sector, node);
    }
  }

  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      const sector = j * width + i;
      const node = graph.get(sector);
      createEdge(node, graph.get((((j + height - 1) % height) * width) + i)!, CardinalDirection.Up);
      createEdge(node, graph.get((((j + 1) % height) * width) + i)!, CardinalDirection.Down);
      createEdge(node, graph.get(j * width + ((i + width - 1) % width))!, CardinalDirection.Left);
      createEdge(node, graph.get(j * width + ((i + 1) % width))!, CardinalDirection.Right);
    }
  }

  return graph;
};

const mergeDisjointSubgraphs = (into: Map<number, SectorGraphNode>, ...graphs: SectorGraph[]) => {
  for (const graph of graphs) {
    for (const [sector, node] of graph) {
      into.set(sector, node);
    }
  }
};

export {
  SectorGraph,
  SectorGraphNode,
  SectorGraphEdge,
  createReflectionEdge,
  createEdge,
  createIsolatedSector,
  getEdge,
  removeContiguousSubgraph,
  createTorus,
  mergeDisjointSubgraphs,
};
