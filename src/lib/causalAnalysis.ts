import type {
  ParsedData,
  ColumnStats,
  CausalGraphData,
  CausalNode,
  CausalEdge,
  GraphMetrics,
  CorrelationEntry,
} from "@/types";
import { pearsonCorrelation } from "./dataParser";

const COLORS = {
  nodes: ["#C48C56", "#8B6C4F", "#A67B5B", "#D4A574", "#6B4E37", "#9C7B5C"],
  positive: "#C48C56",
  negative: "#7B5B3A",
  neutral: "rgba(44, 40, 36, 0.3)",
  communities: [
    "#C48C56", "#8B6C4F", "#A67B5B", "#D4A574",
    "#6B4E37", "#9C7B5C", "#B8956A", "#785A3C",
    "#D4956B", "#A0785A", "#BFA88E", "#8C7460",
  ],
};

/**
 * Build a causal graph from data correlations and statistical relationships
 */
export function buildCausalGraph(
  data: ParsedData,
  stats: ColumnStats[],
  correlations: CorrelationEntry[]
): CausalGraphData {
  const numericCols = stats.filter((s) => s.type === "numeric").map((s) => s.name);
  const categoricalCols = stats.filter((s) => s.type === "categorical").map((s) => s.name);
  const allCols = [...numericCols, ...categoricalCols];

  // Build nodes
  const nodes: CausalNode[] = allCols.map((col, i) => {
    const stat = stats.find((s) => s.name === col);
    const isNumeric = stat?.type === "numeric";
    const variance = isNumeric && stat?.std ? stat.std / (stat.max! - stat.min! || 1) : 0.5;

    return {
      id: col,
      label: col,
      size: 8 + variance * 12,
      color: COLORS.nodes[i % COLORS.nodes.length],
      x: Math.cos((2 * Math.PI * i) / allCols.length) * 100,
      y: Math.sin((2 * Math.PI * i) / allCols.length) * 100,
    };
  });

  // Build edges from correlations
  const edges: CausalEdge[] = [];
  const processedPairs = new Set<string>();

  for (const corr of correlations) {
    if (corr.x === corr.y) continue;
    const pairKey = [corr.x, corr.y].sort().join("__");
    if (processedPairs.has(pairKey)) continue;
    processedPairs.add(pairKey);

    const absCorr = Math.abs(corr.value);
    if (absCorr < 0.1) continue;

    const sourceIdx = allCols.indexOf(corr.x);
    const targetIdx = allCols.indexOf(corr.y);
    const source = sourceIdx < targetIdx ? corr.x : corr.y;
    const target = sourceIdx < targetIdx ? corr.y : corr.x;

    let edgeType: "causal" | "correlation" | "association";
    if (absCorr > 0.7) edgeType = "causal";
    else if (absCorr > 0.4) edgeType = "correlation";
    else edgeType = "association";

    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      weight: absCorr,
      color:
        corr.value > 0
          ? `rgba(196, 140, 86, ${0.3 + absCorr * 0.7})`
          : `rgba(123, 91, 58, ${0.3 + absCorr * 0.7})`,
      type: edgeType,
      label: `${corr.value > 0 ? "+" : ""}${corr.value.toFixed(2)}`,
    });
  }

  // Add edges for categorical-numeric relationships
  for (const catCol of categoricalCols) {
    for (const numCol of numericCols) {
      const groups: Record<string, number[]> = {};
      data.forEach((row) => {
        const cat = String(row[catCol]);
        const num = Number(row[numCol]);
        if (!isNaN(num)) {
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(num);
        }
      });

      const groupMeans = Object.values(groups).map(
        (g) => g.reduce((a, b) => a + b, 0) / g.length
      );
      if (groupMeans.length > 1) {
        const grandMean = groupMeans.reduce((a, b) => a + b, 0) / groupMeans.length;
        const ssb = groupMeans.reduce((acc, m) => acc + (m - grandMean) ** 2, 0);
        const effectSize = Math.min(ssb / (grandMean ** 2 || 1), 1);

        if (effectSize > 0.05) {
          edges.push({
            id: `${catCol}->${numCol}`,
            source: catCol,
            target: numCol,
            weight: effectSize,
            color: `rgba(196, 140, 86, ${0.3 + effectSize * 0.7})`,
            type: effectSize > 0.5 ? "causal" : "association",
            label: `effect: ${effectSize.toFixed(2)}`,
          });
        }
      }
    }
  }

  // Compute communities using label propagation
  const communities = computeCommunities(nodes, edges);
  nodes.forEach((node) => {
    node.community = communities[node.id];
    node.color = COLORS.communities[communities[node.id] % COLORS.communities.length];
  });

  // Compute multiple centrality measures
  const degreeCentrality = computeDegreeCentrality(nodes, edges);
  const betweennessCentrality = computeBetweennessCentrality(nodes, edges);
  const pageRank = computePageRank(nodes, edges);
  const closenessCentrality = computeClosenessCentrality(nodes, edges);

  nodes.forEach((node) => {
    node.centrality = degreeCentrality[node.id] || 0;
    node.betweenness = betweennessCentrality[node.id] || 0;
    node.pageRank = pageRank[node.id] || 0;
    node.closeness = closenessCentrality[node.id] || 0;
    node.degree = countDegree(node.id, edges);
    node.inDegree = countInDegree(node.id, edges);
    node.outDegree = countOutDegree(node.id, edges);
    node.weightedDegree = computeWeightedDegree(node.id, edges);
    node.size = 8 + (degreeCentrality[node.id] || 0) * 20;
  });

  // Compute graph metrics
  const metrics = computeGraphMetrics(nodes, edges, communities);

  // Compute shortest paths for all pairs
  const shortestPaths = computeAllShortestPaths(nodes, edges);

  return {
    nodes,
    edges,
    communities,
    metrics,
    shortestPaths,
    degreeCentrality,
    betweennessCentrality,
    pageRank,
    closenessCentrality,
  };
}

/**
 * Count degree (total edges)
 */
function countDegree(nodeId: string, edges: CausalEdge[]): number {
  return edges.filter((e) => e.source === nodeId || e.target === nodeId).length;
}

function countInDegree(nodeId: string, edges: CausalEdge[]): number {
  return edges.filter((e) => e.target === nodeId).length;
}

function countOutDegree(nodeId: string, edges: CausalEdge[]): number {
  return edges.filter((e) => e.source === nodeId).length;
}

function computeWeightedDegree(nodeId: string, edges: CausalEdge[]): number {
  return edges
    .filter((e) => e.source === nodeId || e.target === nodeId)
    .reduce((sum, e) => sum + e.weight, 0);
}

/**
 * Label propagation community detection
 */
function computeCommunities(
  nodes: CausalNode[],
  edges: CausalEdge[]
): Record<string, number> {
  const labels: Record<string, number> = {};
  nodes.forEach((n, i) => (labels[n.id] = i));

  const adj: Record<string, string[]> = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach((e) => {
    adj[e.source]?.push(e.target);
    adj[e.target]?.push(e.source);
  });

  for (let iter = 0; iter < 15; iter++) {
    let changed = false;
    for (const node of nodes) {
      const neighbors = adj[node.id] || [];
      if (neighbors.length === 0) continue;

      const labelCounts: Record<number, number> = {};
      for (const nb of neighbors) {
        const l = labels[nb];
        labelCounts[l] = (labelCounts[l] || 0) + 1;
      }

      const maxLabel = Number(
        Object.entries(labelCounts).sort((a, b) => b[1] - a[1])[0][0]
      );
      if (labels[node.id] !== maxLabel) {
        labels[node.id] = maxLabel;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const uniqueLabels = [...new Set(Object.values(labels))];
  const labelMap: Record<number, number> = {};
  uniqueLabels.forEach((l, i) => (labelMap[l] = i));

  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(labels)) {
    result[key] = labelMap[val];
  }
  return result;
}

/**
 * Degree centrality
 */
function computeDegreeCentrality(
  nodes: CausalNode[],
  edges: CausalEdge[]
): Record<string, number> {
  const degrees: Record<string, number> = {};
  nodes.forEach((n) => (degrees[n.id] = 0));

  edges.forEach((e) => {
    degrees[e.source] = (degrees[e.source] || 0) + e.weight;
    degrees[e.target] = (degrees[e.target] || 0) + e.weight;
  });

  const maxDeg = Math.max(...Object.values(degrees), 1);
  for (const key in degrees) {
    degrees[key] = Math.round((degrees[key] / maxDeg) * 1000) / 1000;
  }

  return degrees;
}

/**
 * Betweenness centrality using Brandes algorithm (simplified)
 */
function computeBetweennessCentrality(
  nodes: CausalNode[],
  edges: CausalEdge[]
): Record<string, number> {
  const adj: Record<string, { target: string; weight: number }[]> = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach((e) => {
    adj[e.source]?.push({ target: e.target, weight: e.weight });
    adj[e.target]?.push({ target: e.source, weight: e.weight });
  });

  const betweenness: Record<string, number> = {};
  nodes.forEach((n) => (betweenness[n.id] = 0));

  for (const s of nodes) {
    const stack: string[] = [];
    const pred: Record<string, string[]> = {};
    const sigma: Record<string, number> = {};
    const dist: Record<string, number> = {};
    const delta: Record<string, number> = {};

    nodes.forEach((n) => {
      pred[n.id] = [];
      sigma[n.id] = 0;
      dist[n.id] = -1;
      delta[n.id] = 0;
    });

    sigma[s.id] = 1;
    dist[s.id] = 0;
    const queue: string[] = [s.id];

    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);

      for (const neighbor of adj[v] || []) {
        const w = neighbor.target;
        if (dist[w] < 0) {
          queue.push(w);
          dist[w] = dist[v] + 1;
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      if (w !== s.id) {
        betweenness[w] += delta[w];
      }
    }
  }

  // Normalize
  const n = nodes.length;
  const norm = n > 2 ? 2 / ((n - 1) * (n - 2)) : 1;
  const maxBet = Math.max(...Object.values(betweenness), 1);
  for (const key in betweenness) {
    betweenness[key] = Math.round((betweenness[key] * norm / (maxBet * norm || 1)) * 1000) / 1000;
  }

  return betweenness;
}

/**
 * PageRank algorithm
 */
function computePageRank(
  nodes: CausalNode[],
  edges: CausalEdge[],
  damping: number = 0.85,
  iterations: number = 30
): Record<string, number> {
  const n = nodes.length;
  if (n === 0) return {};

  const rank: Record<string, number> = {};
  const outDegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};

  nodes.forEach((nd) => {
    rank[nd.id] = 1 / n;
    outDegree[nd.id] = 0;
    adj[nd.id] = [];
  });

  edges.forEach((e) => {
    outDegree[e.source] = (outDegree[e.source] || 0) + 1;
    adj[e.target]?.push(e.source);
  });

  for (let iter = 0; iter < iterations; iter++) {
    const newRank: Record<string, number> = {};
    let danglingSum = 0;

    for (const nd of nodes) {
      if (outDegree[nd.id] === 0) {
        danglingSum += rank[nd.id];
      }
    }

    for (const nd of nodes) {
      let sum = 0;
      for (const inNode of adj[nd.id] || []) {
        sum += rank[inNode] / (outDegree[inNode] || 1);
      }
      newRank[nd.id] = (1 - damping) / n + damping * (sum + danglingSum / n);
    }

    for (const key in rank) {
      rank[key] = newRank[key];
    }
  }

  // Normalize to [0, 1]
  const maxRank = Math.max(...Object.values(rank), 0.001);
  for (const key in rank) {
    rank[key] = Math.round((rank[key] / maxRank) * 1000) / 1000;
  }

  return rank;
}

/**
 * Closeness centrality
 */
function computeClosenessCentrality(
  nodes: CausalNode[],
  edges: CausalEdge[]
): Record<string, number> {
  const adj: Record<string, string[]> = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach((e) => {
    adj[e.source]?.push(e.target);
    adj[e.target]?.push(e.source);
  });

  const closeness: Record<string, number> = {};

  for (const source of nodes) {
    const distances: Record<string, number> = {};
    nodes.forEach((n) => (distances[n.id] = Infinity));
    distances[source.id] = 0;

    const queue = [source.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adj[current] || []) {
        if (distances[neighbor] === Infinity) {
          distances[neighbor] = distances[current] + 1;
          queue.push(neighbor);
        }
      }
    }

    const reachable = Object.values(distances).filter((d) => d < Infinity && d > 0);
    const totalDist = reachable.reduce((a, b) => a + b, 0);
    closeness[source.id] = reachable.length > 0 ? reachable.length / totalDist : 0;
  }

  // Normalize
  const maxClose = Math.max(...Object.values(closeness), 0.001);
  for (const key in closeness) {
    closeness[key] = Math.round((closeness[key] / maxClose) * 1000) / 1000;
  }

  return closeness;
}

/**
 * Compute all-pairs shortest paths using BFS
 */
function computeAllShortestPaths(
  nodes: CausalNode[],
  edges: CausalEdge[]
): Record<string, Record<string, string[]>> {
  const adj: Record<string, string[]> = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach((e) => {
    adj[e.source]?.push(e.target);
    adj[e.target]?.push(e.source);
  });

  const paths: Record<string, Record<string, string[]>> = {};

  for (const source of nodes) {
    paths[source.id] = {};
    const prev: Record<string, string | null> = {};
    const visited = new Set<string>();

    nodes.forEach((n) => (prev[n.id] = null));
    visited.add(source.id);
    const queue = [source.id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adj[current] || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          prev[neighbor] = current;
          queue.push(neighbor);
        }
      }
    }

    // Reconstruct paths
    for (const target of nodes) {
      if (target.id === source.id) continue;
      const path: string[] = [];
      let current: string | null = target.id;
      while (current !== null) {
        path.unshift(current);
        current = prev[current];
      }
      if (path[0] === source.id) {
        paths[source.id][target.id] = path;
      }
    }
  }

  return paths;
}

/**
 * Compute graph metrics
 */
function computeGraphMetrics(
  nodes: CausalNode[],
  edges: CausalEdge[],
  communities: Record<string, number>
): GraphMetrics {
  const n = nodes.length;
  const maxEdges = (n * (n - 1)) / 2;
  const density = maxEdges > 0 ? edges.length / maxEdges : 0;

  const uniqueCommunities = new Set(Object.values(communities)).size;

  // Clustering coefficient
  const adj: Record<string, Set<string>> = {};
  nodes.forEach((nd) => (adj[nd.id] = new Set()));
  edges.forEach((e) => {
    adj[e.source]?.add(e.target);
    adj[e.target]?.add(e.source);
  });

  let totalClustering = 0;
  let countNodes = 0;
  for (const node of nodes) {
    const neighbors = Array.from(adj[node.id]);
    const k = neighbors.length;
    if (k < 2) continue;

    let triangles = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        if (adj[neighbors[i]]?.has(neighbors[j])) {
          triangles++;
        }
      }
    }
    totalClustering += (2 * triangles) / (k * (k - 1));
    countNodes++;
  }

  const avgClustering = countNodes > 0 ? totalClustering / countNodes : 0;

  // Connected components
  const visited = new Set<string>();
  let components = 0;
  let maxComponentSize = 0;
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    components++;
    let componentSize = 0;
    const queue = [node.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      componentSize++;
      adj[current]?.forEach((nb) => {
        if (!visited.has(nb)) queue.push(nb);
      });
    }
    maxComponentSize = Math.max(maxComponentSize, componentSize);
  }

  // Diameter (longest shortest path in largest component)
  let diameter = 0;
  for (const node of nodes) {
    const distances: Record<string, number> = {};
    nodes.forEach((nd) => (distances[nd.id] = Infinity));
    distances[node.id] = 0;
    const bfsQueue = [node.id];
    while (bfsQueue.length > 0) {
      const current = bfsQueue.shift()!;
      for (const nb of adj[current] || new Set()) {
        if (distances[nb] === Infinity) {
          distances[nb] = distances[current] + 1;
          bfsQueue.push(nb);
        }
      }
    }
    const maxDist = Math.max(
      ...Object.values(distances).filter((d) => d < Infinity)
    );
    diameter = Math.max(diameter, maxDist);
  }

  // Average path length
  let totalPaths = 0;
  let totalPathLength = 0;
  for (const node of nodes) {
    const distances: Record<string, number> = {};
    nodes.forEach((nd) => (distances[nd.id] = Infinity));
    distances[node.id] = 0;
    const bfsQueue = [node.id];
    while (bfsQueue.length > 0) {
      const current = bfsQueue.shift()!;
      for (const nb of adj[current] || new Set()) {
        if (distances[nb] === Infinity) {
          distances[nb] = distances[current] + 1;
          bfsQueue.push(nb);
        }
      }
    }
    for (const d of Object.values(distances)) {
      if (d > 0 && d < Infinity) {
        totalPaths++;
        totalPathLength += d;
      }
    }
  }

  const avgPathLength = totalPaths > 0 ? totalPathLength / totalPaths : 0;

  return {
    density: Math.round(density * 1000) / 1000,
    modularity: Math.round((uniqueCommunities / Math.max(n, 1)) * 1000) / 1000,
    avgClustering: Math.round(avgClustering * 1000) / 1000,
    diameter,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    components,
    avgPathLength: Math.round(avgPathLength * 1000) / 1000,
    maxComponentSize,
  };
}

/**
 * Granger-like causal direction testing
 */
export function inferCausalDirections(
  data: ParsedData,
  numericCols: string[]
): { source: string; target: string; strength: number }[] {
  const results: { source: string; target: string; strength: number }[] = [];

  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const colA = numericCols[i];
      const colB = numericCols[j];

      const valsA = data.map((r) => Number(r[colA])).filter((v) => !isNaN(v));
      const valsB = data.map((r) => Number(r[colB])).filter((v) => !isNaN(v));

      if (valsA.length < 3 || valsB.length < 3) continue;

      const n = Math.min(valsA.length, valsB.length);
      const laggedA = valsA.slice(0, n - 1);
      const currentB = valsB.slice(1, n);
      const laggedB = valsB.slice(0, n - 1);
      const currentA = valsA.slice(1, n);

      const corrAtoB = Math.abs(pearsonCorrelation(laggedA, currentB));
      const corrBtoA = Math.abs(pearsonCorrelation(laggedB, currentA));

      if (corrAtoB > corrBtoA && corrAtoB > 0.2) {
        results.push({ source: colA, target: colB, strength: corrAtoB });
      } else if (corrBtoA > corrAtoB && corrBtoA > 0.2) {
        results.push({ source: colB, target: colA, strength: corrBtoA });
      }
    }
  }

  return results;
}
