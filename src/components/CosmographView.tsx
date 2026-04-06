"use client";

import React, { useEffect, useState, useMemo } from "react";
import type { CausalGraphData } from "@/types";

interface CosmographViewProps {
  data: CausalGraphData;
}

interface PointData {
  [key: string]: string | number;
  id: string;
  label: string;
  community: number;
  centrality: number;
  betweenness: number;
  pageRank: number;
  closeness: number;
  degree: number;
  inDegree: number;
  outDegree: number;
  weightedDegree: number;
}

interface LinkData {
  [key: string]: string | number;
  source: string;
  target: string;
  weight: number;
  type: string;
}

const COMMUNITY_COLORS = [
  "#C48C56", "#8B6C4F", "#A67B5B", "#D4A574",
  "#6B4E37", "#9C7B5C", "#B8956A", "#785A3C",
];

export default function CosmographView({ data }: CosmographViewProps) {
  const [isReady, setIsReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cosmographConfig, setCosmographConfig] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [CosmographComponents, setCosmographComponents] = useState<any>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const points: PointData[] = useMemo(() => data.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    community: node.community || 0,
    centrality: node.centrality || 0,
    betweenness: node.betweenness || 0,
    pageRank: node.pageRank || 0,
    closeness: node.closeness || 0,
    degree: node.degree || 0,
    inDegree: node.inDegree || 0,
    outDegree: node.outDegree || 0,
    weightedDegree: node.weightedDegree || 0,
  })), [data.nodes]);

  const links: LinkData[] = useMemo(() => data.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    weight: edge.weight,
    type: edge.type,
  })), [data.edges]);

  const selectedNode = selectedNodeId ? points.find((p) => p.id === selectedNodeId) : null;

  useEffect(() => {
    let cancelled = false;

    import("@cosmograph/react").then(async (mod) => {
      if (cancelled) return;

      try {
        const result = await mod.prepareCosmographData(
          {
            points: { pointIdBy: "id" },
            links: { linkSourceBy: "source", linkTargetsBy: ["target"] },
          },
          points,
          links
        );

        if (result && !cancelled) {
          setCosmographConfig({
            points: result.points,
            links: result.links,
            ...result.cosmographConfig,
          });
          setCosmographComponents(mod);
          setIsReady(true);
        }
      } catch (err) {
        console.error("Cosmograph data prep error:", err);
        // Still show the component even if data prep fails
        setCosmographComponents(mod);
        setIsReady(true);
      }
    }).catch((err) => {
      console.error("Failed to load Cosmograph:", err);
    });

    return () => { cancelled = true; };
  }, [points, links]);

  const font = { fontFamily: "Geist, sans-serif" };
  const headerFont = { fontFamily: "Plus Jakarta Sans, sans-serif" };

  if (!isReady) {
    return (
      <div className="chart-container">
        <h3 className="text-sm font-medium tracking-tight opacity-70 uppercase mb-3" style={font}>
          GPU-Accelerated Graph (Cosmograph)
        </h3>
        <div className="flex items-center justify-center h-48 opacity-30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-aura-accent typing-dot" />
            <div className="w-2 h-2 rounded-full bg-aura-accent typing-dot" />
            <div className="w-2 h-2 rounded-full bg-aura-accent typing-dot" />
            <span className="text-xs" style={font}>Loading Cosmograph WebGL engine...</span>
          </div>
        </div>
      </div>
    );
  }

  const {
    Cosmograph,
    CosmographProvider,
    CosmographSearch,
    CosmographHistogram,
    CosmographSizeLegend,
    CosmographButtonFitView,
    CosmographButtonZoomInOut,
  } = CosmographComponents;

  return (
    <div className="chart-container !p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-sm font-medium tracking-tight opacity-70 uppercase" style={font}>
          GPU Graph (Cosmograph)
        </h3>
        <span className="text-[10px] opacity-30" style={font}>
          WebGL Accelerated | {data.metrics.nodeCount} nodes | {data.metrics.edgeCount} edges
        </span>
      </div>

      <CosmographProvider>
        {/* Search */}
        <div className="px-4 pb-2">
          <CosmographSearch
            className="w-full"
            style={{
              background: "rgba(44,40,36,0.04)",
              border: "1px solid rgba(44,40,36,0.06)",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "12px",
              fontFamily: "Geist, sans-serif",
              color: "#2C2824",
              outline: "none",
            }}
            placeholder="Search nodes..."
          />
        </div>

        {/* Main Graph */}
        <div className="relative w-full" style={{ height: "400px" }}>
          <Cosmograph
            style={{ width: "100%", height: "100%" }}
            {...(cosmographConfig || {})}
            showDynamicLabels={true}
          />

          {/* Controls overlay */}
          <div className="absolute bottom-2 right-2 flex flex-col gap-1">
            <CosmographButtonFitView
              style={{
                background: "rgba(242,239,234,0.9)",
                border: "1px solid rgba(44,40,36,0.1)",
                borderRadius: "8px",
                padding: "4px 8px",
                fontSize: "10px",
                cursor: "pointer",
              }}
            />
            <CosmographButtonZoomInOut
              style={{
                background: "rgba(242,239,234,0.9)",
                border: "1px solid rgba(44,40,36,0.1)",
                borderRadius: "8px",
                padding: "4px 8px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            />
          </div>
        </div>

        {/* Histogram for centrality distribution */}
        <div className="px-4 py-2 border-t border-aura-text/[0.06]">
          <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>
            Centrality Distribution
          </label>
          <CosmographHistogram
            accessor="centrality"
            style={{
              height: "60px",
              width: "100%",
            }}
          />
        </div>

        {/* Size Legend */}
        <div className="px-4 py-2 border-t border-aura-text/[0.06]">
          <CosmographSizeLegend
            style={{ width: "100%", height: "30px" }}
          />
        </div>
      </CosmographProvider>

      {/* Node analytics grid */}
      <div className="px-4 py-2 border-t border-aura-text/[0.06]">
        <label className="text-[10px] uppercase tracking-wider opacity-40 mb-1.5 block" style={font}>
          Node Analytics
        </label>
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          {points.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedNodeId(selectedNodeId === p.id ? null : p.id)}
              className={`px-2 py-0.5 text-[9px] rounded-full transition-all ${
                selectedNodeId === p.id
                  ? "bg-aura-accent/20 text-aura-accent font-medium"
                  : "bg-aura-text/5 opacity-50 hover:opacity-80"
              }`}
              style={font}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selected node details */}
      {selectedNode && (
        <div className="px-4 py-3 border-t border-aura-text/[0.06] bg-aura-text/[0.02]">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: COMMUNITY_COLORS[selectedNode.community % COMMUNITY_COLORS.length] }}
            />
            <span className="text-sm font-medium" style={headerFont}>{selectedNode.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-aura-accent/10 text-aura-accent" style={font}>
              Community {selectedNode.community}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "Centrality", value: selectedNode.centrality.toFixed(3) },
              { label: "Betweenness", value: selectedNode.betweenness.toFixed(3) },
              { label: "PageRank", value: selectedNode.pageRank.toFixed(3) },
              { label: "Closeness", value: selectedNode.closeness.toFixed(3) },
              { label: "Degree", value: selectedNode.degree },
              { label: "In-Degree", value: selectedNode.inDegree },
              { label: "Out-Degree", value: selectedNode.outDegree },
              { label: "W.Degree", value: Number(selectedNode.weightedDegree).toFixed(2) },
            ].map((m) => (
              <div key={m.label} className="text-center p-1 rounded bg-aura-text/[0.03]">
                <div className="text-[8px] opacity-40" style={font}>{m.label}</div>
                <div className="text-[10px] font-medium" style={font}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Connected nodes */}
          <div className="mt-2">
            <label className="text-[9px] uppercase tracking-wider opacity-40 mb-1 block" style={font}>
              Connections
            </label>
            <div className="flex flex-wrap gap-1">
              {data.edges
                .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                .slice(0, 10)
                .map((e) => {
                  const other = e.source === selectedNode.id ? e.target : e.source;
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelectedNodeId(other)}
                      className="px-1.5 py-0.5 text-[9px] rounded-full bg-aura-accent/10 text-aura-accent hover:bg-aura-accent/20"
                      style={font}
                    >
                      {other} ({e.label})
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
