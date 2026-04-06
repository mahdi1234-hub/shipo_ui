"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import circular from "graphology-layout/circular";
import random from "graphology-layout/random";
import type { CausalGraphData, CausalNode } from "@/types";

interface CausalGraphProps {
  data: CausalGraphData;
}

type LayoutType = "force" | "circular" | "random";
type SizeMetric = "centrality" | "betweenness" | "pageRank" | "closeness" | "degree" | "weightedDegree";
type ColorMode = "community" | "centrality" | "betweenness" | "pageRank";
type EdgeFilter = "all" | "causal" | "correlation" | "association";

const COMMUNITY_COLORS = [
  "#C48C56", "#8B6C4F", "#A67B5B", "#D4A574",
  "#6B4E37", "#9C7B5C", "#B8956A", "#785A3C",
  "#D4956B", "#A0785A", "#BFA88E", "#8C7460",
];

function metricColor(value: number): string {
  // Brown gradient from light to dark based on value 0-1
  const r = Math.round(196 - value * 80);
  const g = Math.round(140 - value * 80);
  const b = Math.round(86 - value * 50);
  return `rgb(${r}, ${g}, ${b})`;
}

export default function CausalGraph({ data }: CausalGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [pathSource, setPathSource] = useState<string | null>(null);
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);

  const [layout, setLayout] = useState<LayoutType>("force");
  const [sizeMetric, setSizeMetric] = useState<SizeMetric>("centrality");
  const [colorMode, setColorMode] = useState<ColorMode>("community");
  const [edgeFilter, setEdgeFilter] = useState<EdgeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCommunity, setSelectedCommunity] = useState<number | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  const [activePanel, setActivePanel] = useState<"controls" | "metrics" | "node" | "path">("controls");

  const communities = useMemo(() => {
    const comms = new Set(Object.values(data.communities));
    return Array.from(comms).sort((a, b) => a - b);
  }, [data.communities]);

  const filteredEdges = useMemo(() => {
    if (edgeFilter === "all") return data.edges;
    return data.edges.filter((e) => e.type === edgeFilter);
  }, [data.edges, edgeFilter]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return data.nodes.filter((n) => n.label.toLowerCase().includes(q));
  }, [searchQuery, data.nodes]);

  const getNodeSize = useCallback(
    (node: CausalNode): number => {
      const base = 6;
      const scale = 18;
      switch (sizeMetric) {
        case "centrality": return base + (node.centrality || 0) * scale;
        case "betweenness": return base + (node.betweenness || 0) * scale;
        case "pageRank": return base + (node.pageRank || 0) * scale;
        case "closeness": return base + (node.closeness || 0) * scale;
        case "degree": return base + ((node.degree || 0) / Math.max(...data.nodes.map((n) => n.degree || 1))) * scale;
        case "weightedDegree": return base + ((node.weightedDegree || 0) / Math.max(...data.nodes.map((n) => n.weightedDegree || 1))) * scale;
        default: return base + (node.centrality || 0) * scale;
      }
    },
    [sizeMetric, data.nodes]
  );

  const getNodeColor = useCallback(
    (node: CausalNode): string => {
      if (selectedCommunity !== null && node.community !== selectedCommunity) {
        return "rgba(44, 40, 36, 0.1)";
      }
      switch (colorMode) {
        case "community": return COMMUNITY_COLORS[(node.community || 0) % COMMUNITY_COLORS.length];
        case "centrality": return metricColor(node.centrality || 0);
        case "betweenness": return metricColor(node.betweenness || 0);
        case "pageRank": return metricColor(node.pageRank || 0);
        default: return COMMUNITY_COLORS[(node.community || 0) % COMMUNITY_COLORS.length];
      }
    },
    [colorMode, selectedCommunity]
  );

  const initGraph = useCallback(() => {
    if (!containerRef.current || data.nodes.length === 0) return;

    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    const graph = new Graph();

    // Add nodes
    data.nodes.forEach((node) => {
      graph.addNode(node.id, {
        x: node.x || 0,
        y: node.y || 0,
        size: getNodeSize(node),
        color: getNodeColor(node),
        label: node.label,
        type: "circle",
        // Store all metrics as attributes
        community: node.community,
        centrality: node.centrality,
        betweenness: node.betweenness,
        pageRank: node.pageRank,
        closeness: node.closeness,
        degree: node.degree,
        inDegree: node.inDegree,
        outDegree: node.outDegree,
        weightedDegree: node.weightedDegree,
      });
    });

    // Add filtered edges
    filteredEdges.forEach((edge) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        try {
          graph.addEdge(edge.source, edge.target, {
            size: 1 + edge.weight * 3,
            color: edge.color,
            label: edge.label,
            type: edge.type === "causal" ? "arrow" : "line",
            edgeType: edge.type,
            weight: edge.weight,
          });
        } catch {
          // Edge may already exist
        }
      }
    });

    // Apply layout
    switch (layout) {
      case "force":
        try {
          forceAtlas2.assign(graph, {
            iterations: 120,
            settings: {
              gravity: 1.5,
              scalingRatio: 10,
              barnesHutOptimize: true,
              slowDown: 5,
              strongGravityMode: false,
            },
          });
        } catch { /* layout may fail */ }
        break;
      case "circular":
        circular.assign(graph);
        break;
      case "random":
        random.assign(graph);
        break;
    }

    graphRef.current = graph;

    // Create Sigma instance
    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: showEdgeLabels,
      defaultEdgeType: "arrow",
      labelFont: "Geist, Inter, sans-serif",
      labelSize: 12,
      labelColor: { color: "#2C2824" },
      edgeLabelFont: "Geist, Inter, sans-serif",
      edgeLabelSize: 9,
      defaultNodeColor: "#C48C56",
      defaultEdgeColor: "rgba(44, 40, 36, 0.15)",
      minCameraRatio: 0.1,
      maxCameraRatio: 8,
      labelRenderedSizeThreshold: showLabels ? 0 : 999,
    });

    // Hover effects with neighborhood highlighting
    sigma.on("enterNode", ({ node }) => {
      setHoveredNode(node);
      const neighbors = new Set(graph.neighbors(node));
      neighbors.add(node);

      sigma.setSetting("nodeReducer", (n, attrs) => {
        if (neighbors.has(n)) {
          return {
            ...attrs,
            zIndex: 1,
            highlighted: true,
            label: graph.getNodeAttribute(n, "label"),
          };
        }
        return { ...attrs, color: "rgba(44, 40, 36, 0.08)", zIndex: 0, label: "" };
      });

      sigma.setSetting("edgeReducer", (edge, attrs) => {
        const src = graph.source(edge);
        const tgt = graph.target(edge);
        if (neighbors.has(src) && neighbors.has(tgt)) {
          return { ...attrs, zIndex: 1, size: (attrs.size || 1) * 1.5 };
        }
        return { ...attrs, color: "rgba(44, 40, 36, 0.03)", zIndex: 0 };
      });
    });

    sigma.on("leaveNode", () => {
      setHoveredNode(null);
      sigma.setSetting("nodeReducer", null);
      sigma.setSetting("edgeReducer", null);
    });

    sigma.on("clickNode", ({ node }) => {
      if (activePanel === "path") {
        if (!pathSource) {
          setPathSource(node);
        } else if (!pathTarget) {
          setPathTarget(node);
          // Compute and highlight path
          const path = data.shortestPaths[pathSource]?.[node];
          if (path) {
            setHighlightedPath(path);
          }
        } else {
          setPathSource(node);
          setPathTarget(null);
          setHighlightedPath([]);
        }
      } else {
        setSelectedNode((prev) => (prev === node ? null : node));
        setActivePanel("node");
      }
    });

    sigma.on("clickStage", () => {
      if (activePanel !== "path") {
        setSelectedNode(null);
      }
    });

    sigmaRef.current = sigma;
  }, [data, layout, filteredEdges, getNodeSize, getNodeColor, showLabels, showEdgeLabels, activePanel, pathSource]);

  useEffect(() => {
    initGraph();
    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
  }, [initGraph]);

  // Update path highlighting
  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph || highlightedPath.length === 0) return;

    const pathSet = new Set(highlightedPath);
    const pathEdges = new Set<string>();
    for (let i = 0; i < highlightedPath.length - 1; i++) {
      const src = highlightedPath[i];
      const tgt = highlightedPath[i + 1];
      graph.forEachEdge(src, (edge, _attrs, source, target) => {
        if ((source === src && target === tgt) || (source === tgt && target === src)) {
          pathEdges.add(edge);
        }
      });
    }

    sigma.setSetting("nodeReducer", (n, attrs) => {
      if (pathSet.has(n)) {
        return { ...attrs, color: "#C48C56", size: (attrs.size || 8) * 1.5, zIndex: 2 };
      }
      return { ...attrs, color: "rgba(44, 40, 36, 0.08)", zIndex: 0 };
    });

    sigma.setSetting("edgeReducer", (edge, attrs) => {
      if (pathEdges.has(edge)) {
        return { ...attrs, color: "#C48C56", size: 4, zIndex: 2 };
      }
      return { ...attrs, color: "rgba(44, 40, 36, 0.03)", zIndex: 0 };
    });

    return () => {
      sigma.setSetting("nodeReducer", null);
      sigma.setSetting("edgeReducer", null);
    };
  }, [highlightedPath]);

  // Search highlighting
  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma || !searchQuery.trim()) {
      sigma?.setSetting("nodeReducer", null);
      sigma?.setSetting("edgeReducer", null);
      return;
    }

    const matches = new Set(searchResults.map((n) => n.id));
    if (matches.size === 0) return;

    sigma.setSetting("nodeReducer", (n, attrs) => {
      if (matches.has(n)) {
        return { ...attrs, color: "#C48C56", size: (attrs.size || 8) * 1.3, zIndex: 2 };
      }
      return { ...attrs, color: "rgba(44, 40, 36, 0.1)", zIndex: 0 };
    });

    sigma.setSetting("edgeReducer", (_edge, attrs) => {
      return { ...attrs, color: "rgba(44, 40, 36, 0.05)" };
    });
  }, [searchQuery, searchResults]);

  const handleZoomIn = () => sigmaRef.current?.getCamera().animatedZoom({ duration: 300 });
  const handleZoomOut = () => sigmaRef.current?.getCamera().animatedUnzoom({ duration: 300 });
  const handleReset = () => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
    setHighlightedPath([]);
    setPathSource(null);
    setPathTarget(null);
    setSelectedNode(null);
    setSearchQuery("");
    setSelectedCommunity(null);
  };

  const focusNode = (nodeId: string) => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma || !graph.hasNode(nodeId)) return;

    const attrs = graph.getNodeAttributes(nodeId);
    sigma.getCamera().animate({ x: attrs.x, y: attrs.y, ratio: 0.3 }, { duration: 500 });
    setSelectedNode(nodeId);
    setActivePanel("node");
  };

  const selectedNodeData = selectedNode ? data.nodes.find((n) => n.id === selectedNode) : null;
  const hoveredNodeData = hoveredNode ? data.nodes.find((n) => n.id === hoveredNode) : null;
  const displayNode = selectedNodeData || hoveredNodeData;
  const connectedEdges = displayNode
    ? data.edges.filter((e) => e.source === displayNode.id || e.target === displayNode.id)
    : [];

  // Degree distribution data
  const degreeDistribution = useMemo(() => {
    const dist: Record<number, number> = {};
    data.nodes.forEach((n) => {
      const d = n.degree || 0;
      dist[d] = (dist[d] || 0) + 1;
    });
    return Object.entries(dist)
      .map(([deg, count]) => ({ degree: Number(deg), count }))
      .sort((a, b) => a.degree - b.degree);
  }, [data.nodes]);

  // Top nodes by various metrics
  const topNodes = useMemo(() => ({
    centrality: [...data.nodes].sort((a, b) => (b.centrality || 0) - (a.centrality || 0)).slice(0, 5),
    betweenness: [...data.nodes].sort((a, b) => (b.betweenness || 0) - (a.betweenness || 0)).slice(0, 5),
    pageRank: [...data.nodes].sort((a, b) => (b.pageRank || 0) - (a.pageRank || 0)).slice(0, 5),
    closeness: [...data.nodes].sort((a, b) => (b.closeness || 0) - (a.closeness || 0)).slice(0, 5),
  }), [data.nodes]);

  const font = { fontFamily: "Geist, sans-serif" };
  const headerFont = { fontFamily: "Plus Jakarta Sans, sans-serif" };

  return (
    <div className="chart-container !p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-sm font-medium tracking-tight opacity-70 uppercase" style={font}>
          Causal Network Graph
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={handleZoomIn} className="w-7 h-7 rounded-full bg-aura-text/5 hover:bg-aura-text/10 flex items-center justify-center text-xs">+</button>
          <button onClick={handleZoomOut} className="w-7 h-7 rounded-full bg-aura-text/5 hover:bg-aura-text/10 flex items-center justify-center text-xs">-</button>
          <button onClick={handleReset} className="px-2 h-7 rounded-full bg-aura-text/5 hover:bg-aura-text/10 text-xs" style={font}>Reset</button>
        </div>
      </div>

      {/* Graph + Panels Container */}
      <div className="relative">
        {/* Sigma Canvas */}
        <div ref={containerRef} className="w-full" style={{ height: "480px", background: "rgba(44,40,36,0.02)" }} />

        {/* Left Panel - Controls */}
        <div className="absolute top-2 left-2 w-52 max-h-[460px] overflow-y-auto bg-aura-bg/95 backdrop-blur-sm rounded-xl border border-aura-text/[0.08] shadow-sm">
          {/* Panel tabs */}
          <div className="flex border-b border-aura-text/[0.06]">
            {(["controls", "metrics", "path"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActivePanel(tab)}
                className={`flex-1 py-2 text-[10px] uppercase tracking-wider transition-all ${
                  activePanel === tab ? "bg-aura-text/5 font-medium opacity-80" : "opacity-40 hover:opacity-60"
                }`}
                style={font}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="p-2.5 space-y-2.5">
            {activePanel === "controls" && (
              <>
                {/* Search */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>Search Nodes</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type to find..."
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-aura-text/[0.04] border border-aura-text/[0.06] outline-none focus:border-aura-accent/30"
                    style={font}
                  />
                  {searchResults.length > 0 && (
                    <div className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                      {searchResults.map((n) => (
                        <button key={n.id} onClick={() => focusNode(n.id)} className="w-full text-left px-2 py-1 text-[10px] rounded hover:bg-aura-text/5" style={font}>
                          {n.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Layout */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>Layout</label>
                  <div className="flex gap-1">
                    {(["force", "circular", "random"] as LayoutType[]).map((l) => (
                      <button
                        key={l}
                        onClick={() => setLayout(l)}
                        className={`flex-1 py-1 text-[10px] rounded-md transition-all ${
                          layout === l ? "bg-aura-text text-aura-inverse" : "bg-aura-text/5 hover:bg-aura-text/10"
                        }`}
                        style={font}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Node Size By */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>Node Size By</label>
                  <select
                    value={sizeMetric}
                    onChange={(e) => setSizeMetric(e.target.value as SizeMetric)}
                    className="w-full px-2 py-1.5 text-[10px] rounded-lg bg-aura-text/[0.04] border border-aura-text/[0.06] outline-none"
                    style={font}
                  >
                    <option value="centrality">Degree Centrality</option>
                    <option value="betweenness">Betweenness</option>
                    <option value="pageRank">PageRank</option>
                    <option value="closeness">Closeness</option>
                    <option value="degree">Degree Count</option>
                    <option value="weightedDegree">Weighted Degree</option>
                  </select>
                </div>

                {/* Node Color By */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>Color By</label>
                  <select
                    value={colorMode}
                    onChange={(e) => setColorMode(e.target.value as ColorMode)}
                    className="w-full px-2 py-1.5 text-[10px] rounded-lg bg-aura-text/[0.04] border border-aura-text/[0.06] outline-none"
                    style={font}
                  >
                    <option value="community">Community</option>
                    <option value="centrality">Centrality Heat</option>
                    <option value="betweenness">Betweenness Heat</option>
                    <option value="pageRank">PageRank Heat</option>
                  </select>
                </div>

                {/* Edge Filter */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>Edge Type</label>
                  <div className="flex flex-wrap gap-1">
                    {(["all", "causal", "correlation", "association"] as EdgeFilter[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setEdgeFilter(f)}
                        className={`px-2 py-0.5 text-[10px] rounded-full transition-all ${
                          edgeFilter === f ? "bg-aura-accent/20 text-aura-accent" : "bg-aura-text/5 hover:bg-aura-text/10 opacity-60"
                        }`}
                        style={font}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Community Filter */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>Community</label>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setSelectedCommunity(null)}
                      className={`px-2 py-0.5 text-[10px] rounded-full transition-all ${
                        selectedCommunity === null ? "bg-aura-text text-aura-inverse" : "bg-aura-text/5 opacity-60"
                      }`}
                      style={font}
                    >
                      All
                    </button>
                    {communities.map((c) => (
                      <button
                        key={c}
                        onClick={() => setSelectedCommunity(selectedCommunity === c ? null : c)}
                        className={`w-6 h-5 text-[9px] rounded-full transition-all flex items-center justify-center ${
                          selectedCommunity === c ? "ring-2 ring-aura-text scale-110" : "opacity-70"
                        }`}
                        style={{ backgroundColor: COMMUNITY_COLORS[c % COMMUNITY_COLORS.length], color: "#F2EFEA" }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggles */}
                <div className="flex gap-2">
                  <label className="flex items-center gap-1.5 text-[10px] opacity-60 cursor-pointer" style={font}>
                    <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="w-3 h-3" />
                    Labels
                  </label>
                  <label className="flex items-center gap-1.5 text-[10px] opacity-60 cursor-pointer" style={font}>
                    <input type="checkbox" checked={showEdgeLabels} onChange={(e) => setShowEdgeLabels(e.target.checked)} className="w-3 h-3" />
                    Edge labels
                  </label>
                </div>
              </>
            )}

            {activePanel === "metrics" && (
              <>
                {/* Global Metrics */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1.5 block" style={font}>Graph Metrics</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Nodes", value: data.metrics.nodeCount },
                      { label: "Edges", value: data.metrics.edgeCount },
                      { label: "Density", value: data.metrics.density },
                      { label: "Clustering", value: data.metrics.avgClustering },
                      { label: "Diameter", value: data.metrics.diameter },
                      { label: "Components", value: data.metrics.components },
                      { label: "Avg Path", value: data.metrics.avgPathLength },
                      { label: "Max Comp", value: data.metrics.maxComponentSize },
                    ].map((m) => (
                      <div key={m.label} className="p-1.5 rounded-md bg-aura-text/[0.03] text-center">
                        <div className="text-[9px] opacity-40" style={font}>{m.label}</div>
                        <div className="text-xs font-medium" style={headerFont}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Nodes Rankings */}
                {(["centrality", "betweenness", "pageRank", "closeness"] as const).map((metric) => (
                  <div key={metric}>
                    <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>
                      Top by {metric}
                    </label>
                    <div className="space-y-0.5">
                      {topNodes[metric].map((n, i) => (
                        <button
                          key={n.id}
                          onClick={() => focusNode(n.id)}
                          className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-aura-text/5 text-left"
                        >
                          <span className="text-[9px] text-aura-accent opacity-60 w-3">{i + 1}</span>
                          <span className="text-[10px] flex-1 truncate" style={font}>{n.label}</span>
                          <span className="text-[9px] opacity-40" style={font}>{(n[metric] || 0).toFixed(3)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Degree Distribution */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>Degree Distribution</label>
                  <div className="flex items-end gap-px h-12">
                    {degreeDistribution.map((d) => {
                      const maxCount = Math.max(...degreeDistribution.map((dd) => dd.count));
                      const height = (d.count / maxCount) * 100;
                      return (
                        <div
                          key={d.degree}
                          className="flex-1 bg-aura-accent/40 rounded-t-sm hover:bg-aura-accent/70 transition-colors"
                          style={{ height: `${height}%`, minWidth: "3px" }}
                          title={`Degree ${d.degree}: ${d.count} nodes`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[8px] opacity-30 mt-0.5" style={font}>
                    <span>{degreeDistribution[0]?.degree}</span>
                    <span>{degreeDistribution[degreeDistribution.length - 1]?.degree}</span>
                  </div>
                </div>
              </>
            )}

            {activePanel === "path" && (
              <>
                <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>
                  Shortest Path Finder
                </label>
                <p className="text-[10px] opacity-50 mb-2" style={font}>
                  Click two nodes on the graph to find the shortest path between them.
                </p>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-aura-accent/30 flex items-center justify-center text-[8px]">A</span>
                    <span className="text-[10px] flex-1" style={font}>{pathSource || "Click a node..."}</span>
                    {pathSource && (
                      <button onClick={() => { setPathSource(null); setHighlightedPath([]); }} className="text-[10px] opacity-40 hover:opacity-80">x</button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-aura-accent/30 flex items-center justify-center text-[8px]">B</span>
                    <span className="text-[10px] flex-1" style={font}>{pathTarget || "Click another node..."}</span>
                    {pathTarget && (
                      <button onClick={() => { setPathTarget(null); setHighlightedPath([]); }} className="text-[10px] opacity-40 hover:opacity-80">x</button>
                    )}
                  </div>
                </div>

                {highlightedPath.length > 0 && (
                  <div className="mt-2 p-2 rounded-lg bg-aura-accent/10">
                    <div className="text-[10px] font-medium mb-1" style={headerFont}>
                      Path ({highlightedPath.length - 1} hops)
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {highlightedPath.map((nodeId, i) => (
                        <React.Fragment key={nodeId}>
                          <button
                            onClick={() => focusNode(nodeId)}
                            className="px-1.5 py-0.5 text-[9px] rounded bg-aura-accent/20 text-aura-accent hover:bg-aura-accent/30"
                            style={font}
                          >
                            {nodeId}
                          </button>
                          {i < highlightedPath.length - 1 && (
                            <span className="text-[9px] opacity-30">&#8594;</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}

                {pathSource && pathTarget && highlightedPath.length === 0 && (
                  <p className="text-[10px] text-red-600/60 mt-1" style={font}>No path found between these nodes.</p>
                )}

                {/* Quick path from dropdowns */}
                <div className="mt-2 space-y-1">
                  <select
                    value={pathSource || ""}
                    onChange={(e) => {
                      setPathSource(e.target.value || null);
                      setHighlightedPath([]);
                      if (e.target.value && pathTarget) {
                        const path = data.shortestPaths[e.target.value]?.[pathTarget];
                        if (path) setHighlightedPath(path);
                      }
                    }}
                    className="w-full px-2 py-1 text-[10px] rounded-lg bg-aura-text/[0.04] border border-aura-text/[0.06] outline-none"
                    style={font}
                  >
                    <option value="">Select source...</option>
                    {data.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                  <select
                    value={pathTarget || ""}
                    onChange={(e) => {
                      setPathTarget(e.target.value || null);
                      if (pathSource && e.target.value) {
                        const path = data.shortestPaths[pathSource]?.[e.target.value];
                        setHighlightedPath(path || []);
                      }
                    }}
                    className="w-full px-2 py-1 text-[10px] rounded-lg bg-aura-text/[0.04] border border-aura-text/[0.06] outline-none"
                    style={font}
                  >
                    <option value="">Select target...</option>
                    {data.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Panel - Node Details */}
        {displayNode && (
          <div className="absolute top-2 right-2 w-52 bg-aura-bg/95 backdrop-blur-sm rounded-xl border border-aura-text/[0.08] shadow-sm p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeColor(displayNode) }} />
              <span className="text-sm font-medium truncate" style={headerFont}>{displayNode.label}</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {[
                { label: "Community", value: displayNode.community },
                { label: "Degree", value: displayNode.degree },
                { label: "In-Degree", value: displayNode.inDegree },
                { label: "Out-Degree", value: displayNode.outDegree },
                { label: "Centrality", value: displayNode.centrality?.toFixed(3) },
                { label: "Betweenness", value: displayNode.betweenness?.toFixed(3) },
                { label: "PageRank", value: displayNode.pageRank?.toFixed(3) },
                { label: "Closeness", value: displayNode.closeness?.toFixed(3) },
                { label: "W. Degree", value: displayNode.weightedDegree?.toFixed(2) },
              ].map((m) => (
                <div key={m.label} className="text-center p-1 rounded bg-aura-text/[0.03]">
                  <div className="text-[8px] opacity-40" style={font}>{m.label}</div>
                  <div className="text-[11px] font-medium" style={font}>{m.value ?? "N/A"}</div>
                </div>
              ))}
            </div>

            {/* Connected edges */}
            <div>
              <label className="text-[9px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>
                Connections ({connectedEdges.length})
              </label>
              <div className="space-y-0.5 max-h-28 overflow-y-auto">
                {connectedEdges.map((e) => {
                  const other = e.source === displayNode.id ? e.target : e.source;
                  const direction = e.source === displayNode.id ? "out" : "in";
                  return (
                    <button
                      key={e.id}
                      onClick={() => focusNode(other)}
                      className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-aura-text/5 text-left"
                    >
                      <span className="text-[8px] opacity-30">{direction === "out" ? "&#8594;" : "&#8592;"}</span>
                      <span className="text-[10px] flex-1 truncate" style={font}>{other}</span>
                      <span className={`text-[8px] px-1 rounded-full ${
                        e.type === "causal" ? "bg-aura-accent/20 text-aura-accent" :
                        e.type === "correlation" ? "bg-aura-text/10" : "bg-aura-text/5 opacity-40"
                      }`} style={font}>
                        {e.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Neighborhood community breakdown */}
            {connectedEdges.length > 0 && (
              <div className="mt-2">
                <label className="text-[9px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>
                  Neighbor Communities
                </label>
                <div className="flex gap-1 flex-wrap">
                  {(() => {
                    const commCounts: Record<number, number> = {};
                    connectedEdges.forEach((e) => {
                      const other = e.source === displayNode.id ? e.target : e.source;
                      const comm = data.communities[other];
                      commCounts[comm] = (commCounts[comm] || 0) + 1;
                    });
                    return Object.entries(commCounts).map(([comm, count]) => (
                      <span
                        key={comm}
                        className="px-1.5 py-0.5 text-[9px] rounded-full text-white"
                        style={{ backgroundColor: COMMUNITY_COLORS[Number(comm) % COMMUNITY_COLORS.length] }}
                      >
                        C{comm}: {count}
                      </span>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Legend */}
      <div className="px-4 py-2 flex flex-wrap items-center gap-4 text-[10px] opacity-50 border-t border-aura-text/[0.06]" style={font}>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-aura-accent rounded"></span>
          <span>Causal ({data.edges.filter((e) => e.type === "causal").length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-aura-text/30 rounded"></span>
          <span>Correlation ({data.edges.filter((e) => e.type === "correlation").length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-aura-text/15 rounded"></span>
          <span>Association ({data.edges.filter((e) => e.type === "association").length})</span>
        </div>
        <span className="ml-auto opacity-60">
          {data.metrics.nodeCount} nodes | {filteredEdges.length} edges | {communities.length} communities
        </span>
      </div>
    </div>
  );
}
