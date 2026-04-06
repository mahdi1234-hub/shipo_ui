"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, ScatterChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import type { CausalGraphData } from "@/types";

interface CosmographViewProps {
  data: CausalGraphData;
}

const COMMUNITY_COLORS = [
  "#C48C56", "#8B6C4F", "#A67B5B", "#D4A574",
  "#6B4E37", "#9C7B5C", "#B8956A", "#785A3C",
  "#D4956B", "#A0785A", "#BFA88E", "#8C7460",
];

type MetricKey = "centrality" | "betweenness" | "pageRank" | "closeness";
type ChartView = "centrality" | "community" | "degree" | "radar" | "scatter" | "paths";

export default function CosmographView({ data }: CosmographViewProps) {
  const [activeView, setActiveView] = useState<ChartView>("centrality");
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("centrality");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [cosmographReady, setCosmographReady] = useState(false);
  const [cosmographError, setCosmographError] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cosmographConfig, setCosmographConfig] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [CosmoModule, setCosmoModule] = useState<any>(null);

  const font = { fontFamily: "Geist, sans-serif" };
  const headerFont = { fontFamily: "Plus Jakarta Sans, sans-serif" };

  // Try to load Cosmograph
  useEffect(() => {
    let cancelled = false;

    import("@cosmograph/react")
      .then(async (mod) => {
        if (cancelled) return;
        try {
          const pointsData = data.nodes.map((n) => ({
            id: n.id,
            label: n.label,
            community: n.community ?? 0,
            centrality: n.centrality ?? 0,
            betweenness: n.betweenness ?? 0,
            pageRank: n.pageRank ?? 0,
          }));

          const linksData = data.edges.map((e) => ({
            source: e.source,
            target: e.target,
            weight: e.weight,
          }));

          if (pointsData.length === 0) {
            setCosmographError(true);
            return;
          }

          const result = await mod.prepareCosmographData(
            {
              points: { pointIdBy: "id" },
              links: { linkSourceBy: "source", linkTargetsBy: ["target"] },
            },
            pointsData as Record<string, unknown>[],
            linksData as Record<string, unknown>[]
          );

          if (result && !cancelled) {
            const cfg = {
              ...(result.cosmographConfig || {}),
              points: result.points,
              links: result.links,
            };
            setCosmographConfig(cfg);
            setCosmoModule(mod);
            setCosmographReady(true);
          }
        } catch (err) {
          console.error("Cosmograph prep error:", err);
          if (!cancelled) setCosmographError(true);
        }
      })
      .catch((err) => {
        console.error("Cosmograph load error:", err);
        if (!cancelled) setCosmographError(true);
      });

    return () => { cancelled = true; };
  }, [data]);

  // Prepare chart data
  const centralityData = useMemo(() =>
    [...data.nodes]
      .sort((a, b) => (b[selectedMetric] ?? 0) - (a[selectedMetric] ?? 0))
      .map((n) => ({
        name: n.label,
        value: Number((n[selectedMetric] ?? 0).toFixed(3)),
        community: n.community ?? 0,
      })),
    [data.nodes, selectedMetric]
  );

  const communityData = useMemo(() => {
    const counts: Record<number, { count: number; totalCentrality: number }> = {};
    data.nodes.forEach((n) => {
      const c = n.community ?? 0;
      if (!counts[c]) counts[c] = { count: 0, totalCentrality: 0 };
      counts[c].count++;
      counts[c].totalCentrality += n.centrality ?? 0;
    });
    return Object.entries(counts).map(([comm, val]) => ({
      name: `Community ${comm}`,
      value: val.count,
      avgCentrality: Number((val.totalCentrality / val.count).toFixed(3)),
      community: Number(comm),
    }));
  }, [data.nodes]);

  const degreeData = useMemo(() => {
    const dist: Record<number, number> = {};
    data.nodes.forEach((n) => {
      const d = n.degree ?? 0;
      dist[d] = (dist[d] || 0) + 1;
    });
    return Object.entries(dist)
      .map(([deg, count]) => ({ degree: Number(deg), count }))
      .sort((a, b) => a.degree - b.degree);
  }, [data.nodes]);

  const radarData = useMemo(() => {
    if (!selectedNodeId) {
      // Average across all nodes
      const n = data.nodes.length || 1;
      return [
        { metric: "Centrality", value: Number((data.nodes.reduce((s, nd) => s + (nd.centrality ?? 0), 0) / n).toFixed(3)) },
        { metric: "Betweenness", value: Number((data.nodes.reduce((s, nd) => s + (nd.betweenness ?? 0), 0) / n).toFixed(3)) },
        { metric: "PageRank", value: Number((data.nodes.reduce((s, nd) => s + (nd.pageRank ?? 0), 0) / n).toFixed(3)) },
        { metric: "Closeness", value: Number((data.nodes.reduce((s, nd) => s + (nd.closeness ?? 0), 0) / n).toFixed(3)) },
      ];
    }
    const node = data.nodes.find((nd) => nd.id === selectedNodeId);
    if (!node) return [];
    return [
      { metric: "Centrality", value: node.centrality ?? 0 },
      { metric: "Betweenness", value: node.betweenness ?? 0 },
      { metric: "PageRank", value: node.pageRank ?? 0 },
      { metric: "Closeness", value: node.closeness ?? 0 },
    ];
  }, [data.nodes, selectedNodeId]);

  const scatterData = useMemo(() =>
    data.nodes.map((n) => ({
      x: n.centrality ?? 0,
      y: n.betweenness ?? 0,
      name: n.label,
      community: n.community ?? 0,
      size: (n.pageRank ?? 0) * 20 + 4,
    })),
    [data.nodes]
  );

  const views: { key: ChartView; label: string }[] = [
    { key: "centrality", label: "Centrality Rankings" },
    { key: "community", label: "Communities" },
    { key: "degree", label: "Degree Dist." },
    { key: "radar", label: "Radar Profile" },
    { key: "scatter", label: "Centrality Map" },
    { key: "paths", label: "Path Analysis" },
  ];

  return (
    <div className="chart-container !p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-sm font-medium tracking-tight opacity-70 uppercase" style={font}>
          Advanced Graph Analytics
        </h3>
        <span className="text-[10px] opacity-30" style={font}>
          {data.metrics.nodeCount} nodes | {data.metrics.edgeCount} edges
        </span>
      </div>

      {/* View tabs */}
      <div className="px-4 pb-2 flex gap-1 overflow-x-auto">
        {views.map((v) => (
          <button
            key={v.key}
            onClick={() => setActiveView(v.key)}
            className={`px-2.5 py-1 rounded-full text-[10px] whitespace-nowrap transition-all ${
              activeView === v.key
                ? "bg-aura-text text-aura-inverse font-medium"
                : "bg-aura-text/5 hover:bg-aura-text/10 opacity-60"
            }`}
            style={font}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Cosmograph GPU render (if available) */}
      {cosmographReady && CosmoModule && cosmographConfig && activeView === "scatter" && (
        <CosmographRender module={CosmoModule} config={cosmographConfig} />
      )}

      {/* Chart content */}
      <div className="px-4 py-3">
        {activeView === "centrality" && (
          <div>
            <div className="flex gap-1 mb-3">
              {(["centrality", "betweenness", "pageRank", "closeness"] as MetricKey[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMetric(m)}
                  className={`px-2 py-0.5 rounded-full text-[10px] transition-all ${
                    selectedMetric === m ? "bg-aura-accent/20 text-aura-accent" : "bg-aura-text/5 opacity-50"
                  }`}
                  style={font}
                >
                  {m}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(200, centralityData.length * 28)}>
              <BarChart data={centralityData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(44,40,36,0.06)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.5 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.7 }} width={80} />
                <Tooltip contentStyle={{ background: "#F2EFEA", border: "1px solid rgba(44,40,36,0.1)", borderRadius: "8px", fontSize: "11px" }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {centralityData.map((entry, i) => (
                    <Cell key={i} fill={COMMUNITY_COLORS[entry.community % COMMUNITY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeView === "community" && (
          <div>
            <div className="flex gap-6">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={communityData}
                      cx="50%" cy="50%"
                      outerRadius={80} innerRadius={40}
                      dataKey="value"
                      label={({ name, value }) => `${name} (${value})`}
                      labelLine={false}
                    >
                      {communityData.map((entry, i) => (
                        <Cell key={i} fill={COMMUNITY_COLORS[entry.community % COMMUNITY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#F2EFEA", border: "1px solid rgba(44,40,36,0.1)", borderRadius: "8px", fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {communityData.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 p-1.5 rounded-lg bg-aura-text/[0.03]">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COMMUNITY_COLORS[c.community % COMMUNITY_COLORS.length] }} />
                    <div className="flex-1">
                      <div className="text-xs font-medium" style={headerFont}>{c.name}</div>
                      <div className="text-[10px] opacity-50" style={font}>{c.value} nodes, avg centrality: {c.avgCentrality}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeView === "degree" && (
          <div>
            <p className="text-[10px] opacity-40 mb-2" style={font}>Distribution of node degrees across the network</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={degreeData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(44,40,36,0.06)" />
                <XAxis dataKey="degree" tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.5 }} label={{ value: "Degree", position: "bottom", fontSize: 10, fill: "#2C2824", opacity: 0.4 }} />
                <YAxis tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.5 }} label={{ value: "Count", angle: -90, position: "insideLeft", fontSize: 10, fill: "#2C2824", opacity: 0.4 }} />
                <Tooltip contentStyle={{ background: "#F2EFEA", border: "1px solid rgba(44,40,36,0.1)", borderRadius: "8px", fontSize: "11px" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {degreeData.map((_, i) => (
                    <Cell key={i} fill={`rgba(196, 140, 86, ${0.4 + (i / degreeData.length) * 0.6})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeView === "radar" && (
          <div>
            <div className="flex gap-1 mb-3 flex-wrap">
              <button
                onClick={() => setSelectedNodeId(null)}
                className={`px-2 py-0.5 rounded-full text-[10px] ${!selectedNodeId ? "bg-aura-text text-aura-inverse" : "bg-aura-text/5 opacity-50"}`}
                style={font}
              >
                Average
              </button>
              {data.nodes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSelectedNodeId(n.id)}
                  className={`px-2 py-0.5 rounded-full text-[10px] ${selectedNodeId === n.id ? "bg-aura-accent/20 text-aura-accent" : "bg-aura-text/5 opacity-50"}`}
                  style={font}
                >
                  {n.label}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="rgba(44,40,36,0.1)" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#2C2824", opacity: 0.7 }} />
                <PolarRadiusAxis tick={{ fontSize: 9, fill: "#2C2824", opacity: 0.4 }} />
                <Radar dataKey="value" stroke="#C48C56" fill="#C48C56" fillOpacity={0.3} strokeWidth={2} />
                <Tooltip contentStyle={{ background: "#F2EFEA", border: "1px solid rgba(44,40,36,0.1)", borderRadius: "8px", fontSize: "11px" }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeView === "scatter" && (
          <div>
            <p className="text-[10px] opacity-40 mb-2" style={font}>
              Centrality (X) vs Betweenness (Y), sized by PageRank, colored by community
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ left: 10, right: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(44,40,36,0.06)" />
                <XAxis type="number" dataKey="x" name="Centrality" tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.5 }}
                  label={{ value: "Centrality", position: "bottom", fontSize: 10, fill: "#2C2824", opacity: 0.4 }} />
                <YAxis type="number" dataKey="y" name="Betweenness" tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.5 }} />
                <Tooltip contentStyle={{ background: "#F2EFEA", border: "1px solid rgba(44,40,36,0.1)", borderRadius: "8px", fontSize: "11px" }}
                />
                <Scatter data={scatterData}>
                  {scatterData.map((entry, i) => (
                    <Cell key={i} fill={COMMUNITY_COLORS[entry.community % COMMUNITY_COLORS.length]} r={entry.size} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeView === "paths" && (
          <div>
            <p className="text-[10px] opacity-40 mb-2" style={font}>
              Shortest path distances between all node pairs
            </p>
            <div className="overflow-x-auto">
              <table className="text-[9px] w-full" style={font}>
                <thead>
                  <tr>
                    <th className="p-1 text-left opacity-40">From / To</th>
                    {data.nodes.slice(0, 8).map((n) => (
                      <th key={n.id} className="p-1 text-center opacity-40">{n.label.slice(0, 6)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.nodes.slice(0, 8).map((rowNode) => (
                    <tr key={rowNode.id}>
                      <td className="p-1 opacity-60 font-medium">{rowNode.label.slice(0, 8)}</td>
                      {data.nodes.slice(0, 8).map((colNode) => {
                        if (rowNode.id === colNode.id) {
                          return <td key={colNode.id} className="p-1 text-center bg-aura-text/[0.03]">-</td>;
                        }
                        const path = data.shortestPaths?.[rowNode.id]?.[colNode.id];
                        const dist = path ? path.length - 1 : "-";
                        const intensity = typeof dist === "number" ? Math.min(dist / 4, 1) : 0;
                        return (
                          <td
                            key={colNode.id}
                            className="p-1 text-center rounded-sm"
                            style={{ backgroundColor: typeof dist === "number" ? `rgba(196, 140, 86, ${0.1 + intensity * 0.5})` : "transparent" }}
                          >
                            {dist}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bottom metrics summary */}
      <div className="px-4 py-2 border-t border-aura-text/[0.06] grid grid-cols-4 gap-2">
        {[
          { label: "Density", value: data.metrics.density },
          { label: "Clustering", value: data.metrics.avgClustering },
          { label: "Diameter", value: data.metrics.diameter },
          { label: "Avg Path", value: data.metrics.avgPathLength },
        ].map((m) => (
          <div key={m.label} className="text-center p-1.5 rounded-lg bg-aura-text/[0.03]">
            <div className="text-[8px] opacity-40" style={font}>{m.label}</div>
            <div className="text-xs font-medium" style={headerFont}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Separate component for Cosmograph GPU render
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CosmographRender({ module: CosmoMod, config }: { module: any; config: any }) {
  if (!CosmoMod || !config) return null;

  const { Cosmograph, CosmographProvider } = CosmoMod;

  return (
    <div className="px-4 pb-2">
      <div className="rounded-xl overflow-hidden" style={{ height: "250px", background: "#1a1816" }}>
        <CosmographProvider>
          <Cosmograph
            style={{ width: "100%", height: "100%" }}
            {...config}
            showDynamicLabels={true}
          />
        </CosmographProvider>
      </div>
    </div>
  );
}
