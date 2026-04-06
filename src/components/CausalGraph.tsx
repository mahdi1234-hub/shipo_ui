"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { CausalGraphData } from "@/types";

interface CausalGraphProps {
  data: CausalGraphData;
}

export default function CausalGraph({ data }: CausalGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [layoutRunning, setLayoutRunning] = useState(false);

  const initGraph = useCallback(() => {
    if (!containerRef.current || data.nodes.length === 0) return;

    // Clean up previous instance
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    const graph = new Graph();

    // Add nodes
    data.nodes.forEach((node) => {
      graph.addNode(node.id, {
        x: node.x || Math.random() * 200 - 100,
        y: node.y || Math.random() * 200 - 100,
        size: node.size,
        color: node.color,
        label: node.label,
        type: "circle",
      });
    });

    // Add edges
    data.edges.forEach((edge) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        try {
          graph.addEdge(edge.source, edge.target, {
            size: 1 + edge.weight * 3,
            color: edge.color,
            label: edge.label,
            type: edge.type === "causal" ? "arrow" : "line",
          });
        } catch {
          // Edge may already exist
        }
      }
    });

    // Apply ForceAtlas2 layout
    try {
      forceAtlas2.assign(graph, {
        iterations: 100,
        settings: {
          gravity: 1,
          scalingRatio: 10,
          barnesHutOptimize: true,
          slowDown: 5,
        },
      });
    } catch {
      // Layout may fail for very small graphs
    }

    // Create Sigma instance
    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: true,
      defaultEdgeType: "arrow",
      labelFont: "Geist, Inter, sans-serif",
      labelSize: 12,
      labelColor: { color: "#2C2824" },
      edgeLabelFont: "Geist, Inter, sans-serif",
      edgeLabelSize: 10,
      defaultNodeColor: "#C48C56",
      defaultEdgeColor: "rgba(44, 40, 36, 0.2)",
      minCameraRatio: 0.2,
      maxCameraRatio: 5,
    });

    // Hover effects
    sigma.on("enterNode", ({ node }) => {
      setHoveredNode(node);
      const neighbors = new Set(graph.neighbors(node));
      neighbors.add(node);

      sigma.setSetting("nodeReducer", (n, attrs) => {
        if (neighbors.has(n)) {
          return { ...attrs, zIndex: 1 };
        }
        return { ...attrs, color: "rgba(44, 40, 36, 0.1)", zIndex: 0 };
      });

      sigma.setSetting("edgeReducer", (edge, attrs) => {
        const src = graph.source(edge);
        const tgt = graph.target(edge);
        if (neighbors.has(src) && neighbors.has(tgt)) {
          return { ...attrs, zIndex: 1 };
        }
        return { ...attrs, color: "rgba(44, 40, 36, 0.05)", zIndex: 0 };
      });
    });

    sigma.on("leaveNode", () => {
      setHoveredNode(null);
      sigma.setSetting("nodeReducer", null);
      sigma.setSetting("edgeReducer", null);
    });

    sigma.on("clickNode", ({ node }) => {
      setSelectedNode((prev) => (prev === node ? null : node));
    });

    sigmaRef.current = sigma;
  }, [data]);

  useEffect(() => {
    initGraph();
    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
  }, [initGraph]);

  const handleZoomIn = () => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) camera.animatedZoom({ duration: 300 });
  };

  const handleZoomOut = () => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) camera.animatedUnzoom({ duration: 300 });
  };

  const handleReset = () => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) camera.animatedReset({ duration: 300 });
  };

  const nodeInfo = selectedNode
    ? data.nodes.find((n) => n.id === selectedNode)
    : hoveredNode
    ? data.nodes.find((n) => n.id === hoveredNode)
    : null;

  const connectedEdges = nodeInfo
    ? data.edges.filter(
        (e) => e.source === nodeInfo.id || e.target === nodeInfo.id
      )
    : [];

  return (
    <div className="chart-container">
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-sm font-medium tracking-tight opacity-70 uppercase"
          style={{ fontFamily: "Geist, sans-serif" }}
        >
          Causal Network Graph
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomIn}
            className="w-7 h-7 rounded-full bg-aura-text/5 hover:bg-aura-text/10 flex items-center justify-center text-xs transition-colors"
          >
            +
          </button>
          <button
            onClick={handleZoomOut}
            className="w-7 h-7 rounded-full bg-aura-text/5 hover:bg-aura-text/10 flex items-center justify-center text-xs transition-colors"
          >
            -
          </button>
          <button
            onClick={handleReset}
            className="px-3 h-7 rounded-full bg-aura-text/5 hover:bg-aura-text/10 flex items-center justify-center text-xs transition-colors"
            style={{ fontFamily: "Geist, sans-serif" }}
          >
            Reset
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="sigma-container"
        style={{ height: "380px" }}
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 text-xs opacity-60" style={{ fontFamily: "Geist, sans-serif" }}>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-aura-accent rounded"></span>
          <span>Causal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-aura-text/30 rounded"></span>
          <span>Correlation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-aura-text/15 rounded"></span>
          <span>Association</span>
        </div>
      </div>

      {/* Node info panel */}
      {nodeInfo && (
        <div className="mt-3 p-3 rounded-lg bg-aura-text/[0.03] border border-aura-text/[0.06]">
          <p className="text-sm font-medium" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            {nodeInfo.label}
          </p>
          <div className="flex gap-4 mt-1 text-xs opacity-60" style={{ fontFamily: "Geist, sans-serif" }}>
            <span>Community: {nodeInfo.community}</span>
            <span>Centrality: {nodeInfo.centrality?.toFixed(3)}</span>
            <span>Connections: {connectedEdges.length}</span>
          </div>
          {connectedEdges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {connectedEdges.slice(0, 5).map((e) => (
                <span
                  key={e.id}
                  className="px-2 py-0.5 rounded-full text-xs bg-aura-accent/10 text-aura-accent"
                  style={{ fontFamily: "Geist, sans-serif" }}
                >
                  {e.source === nodeInfo.id ? e.target : e.source} ({e.label})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metrics bar */}
      <div
        className="grid grid-cols-3 gap-3 mt-3 text-xs"
        style={{ fontFamily: "Geist, sans-serif" }}
      >
        <div className="p-2 rounded-lg bg-aura-text/[0.03] text-center">
          <div className="opacity-50 mb-0.5">Density</div>
          <div className="font-medium">{data.metrics.density}</div>
        </div>
        <div className="p-2 rounded-lg bg-aura-text/[0.03] text-center">
          <div className="opacity-50 mb-0.5">Clustering</div>
          <div className="font-medium">{data.metrics.avgClustering}</div>
        </div>
        <div className="p-2 rounded-lg bg-aura-text/[0.03] text-center">
          <div className="opacity-50 mb-0.5">Components</div>
          <div className="font-medium">{data.metrics.components}</div>
        </div>
      </div>
    </div>
  );
}
