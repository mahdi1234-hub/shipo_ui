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
  communities: ["#C48C56", "#8B6C4F", "#A67B5B", "#D4A574", "#6B4E37", "#9C7B5C", "#B8956A", "#785A3C"],
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
    if (absCorr < 0.1) continue; // Filter weak correlations

    // Determine causal direction heuristically via temporal/positional ordering
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

      // Simple ANOVA-like effect size
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

  // Compute communities using simple label propagation
  const communities = computeCommunities(nodes, edges);
  nodes.forEach((node) => {
    node.community = communities[node.id];
    node.color = COLORS.communities[communities[node.id] % COLORS.communities.length];
  });

  // Compute centrality
  const centrality = computeDegreeCentrality(nodes, edges);
  nodes.forEach((node) => {
    node.centrality = centrality[node.id] || 0;
    node.size = 8 + (centrality[node.id] || 0) * 20;
  });

  // Compute graph metrics
  const metrics = computeGraphMetrics(nodes, edges, communities);

  return { nodes, edges, communities, metrics };
}

/**
 * Simple label propagation community detection
 */
function computeCommunities(
  nodes: CausalNode[],
  edges: CausalEdge[]
): Record<string, number> {
  const labels: Record<string, number> = {};
  nodes.forEach((n, i) => (labels[n.id] = i));

  // Build adjacency
  const adj: Record<string, string[]> = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach((e) => {
    adj[e.source]?.push(e.target);
    adj[e.target]?.push(e.source);
  });

  // Iterate label propagation
  for (let iter = 0; iter < 10; iter++) {
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

  // Normalize community IDs to 0-based sequential
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
 * Compute degree centrality
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
    degrees[key] = degrees[key] / maxDeg;
  }

  return degrees;
}

/**
 * Compute various graph metrics
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

  // Approximate clustering coefficient
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

  // Count connected components via BFS
  const visited = new Set<string>();
  let components = 0;
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    components++;
    const queue = [node.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      adj[current]?.forEach((nb) => {
        if (!visited.has(nb)) queue.push(nb);
      });
    }
  }

  return {
    density: Math.round(density * 1000) / 1000,
    modularity: Math.round((uniqueCommunities / Math.max(n, 1)) * 1000) / 1000,
    avgClustering: Math.round(avgClustering * 1000) / 1000,
    diameter: Math.min(nodes.length - 1, edges.length),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    components,
  };
}

/**
 * Perform Granger-like causal direction testing between numeric columns
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

      // Lag correlation to determine causal direction
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
