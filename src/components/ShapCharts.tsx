"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
  ReferenceLine,
} from "recharts";
import type { ShapData } from "@/types";

interface ShapChartsProps {
  data: ShapData;
}

type TabType = "importance" | "waterfall" | "dependence" | "interaction" | "beeswarm";

// Seeded pseudo-random for deterministic jitter
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

export default function ShapCharts({ data }: ShapChartsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("importance");

  if (data.features.length === 0) {
    return null;
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: "importance", label: "Global Importance" },
    { key: "waterfall", label: "Waterfall" },
    { key: "beeswarm", label: "Beeswarm" },
    { key: "dependence", label: "Dependence" },
    { key: "interaction", label: "Interactions" },
  ];

  return (
    <div className="chart-container">
      <h3
        className="text-sm font-medium tracking-tight opacity-70 uppercase mb-3"
        style={{ fontFamily: "Geist, sans-serif" }}
      >
        SHAP Value Analysis
      </h3>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? "bg-aura-text text-aura-inverse font-medium"
                : "bg-aura-text/5 hover:bg-aura-text/10 opacity-60"
            }`}
            style={{ fontFamily: "Geist, sans-serif" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "importance" && <GlobalImportanceChart data={data} />}
      {activeTab === "waterfall" && <WaterfallChart data={data} />}
      {activeTab === "beeswarm" && <BeeswarmChart data={data} />}
      {activeTab === "dependence" && <DependencePlots data={data} />}
      {activeTab === "interaction" && <InteractionMatrix data={data} />}
    </div>
  );
}

function GlobalImportanceChart({ data }: { data: ShapData }) {
  const chartData = data.globalImportance.map((item) => ({
    feature: item.feature.length > 15 ? item.feature.slice(0, 15) + "..." : item.feature,
    importance: item.importance,
    fullName: item.feature,
  }));

  return (
    <div>
      <p className="text-xs opacity-50 mb-3" style={{ fontFamily: "Geist, sans-serif" }}>
        Mean absolute SHAP values showing overall feature importance
      </p>
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 35)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(44,40,36,0.06)" />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.5 }} />
          <YAxis
            type="category"
            dataKey="feature"
            tick={{ fontSize: 11, fill: "#2C2824", opacity: 0.7 }}
            width={100}
          />
          <Tooltip
            contentStyle={{
              background: "#F2EFEA",
              border: "1px solid rgba(44,40,36,0.1)",
              borderRadius: "8px",
              fontFamily: "Geist, sans-serif",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
            {chartData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={`rgba(196, 140, 86, ${0.4 + (index / chartData.length) * 0.6})`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function WaterfallChart({ data }: { data: ShapData }) {
  const sorted = [...data.shapValues].sort(
    (a, b) => Math.abs(b.shapValue) - Math.abs(a.shapValue)
  );

  let cumulative = data.baseValue;
  const waterfallData = [
    {
      feature: "Base",
      start: 0,
      end: data.baseValue,
      value: data.baseValue,
      isBase: true,
    },
  ];

  for (const sv of sorted) {
    const start = cumulative;
    cumulative += sv.shapValue;
    waterfallData.push({
      feature:
        sv.feature.length > 12 ? sv.feature.slice(0, 12) + "..." : sv.feature,
      start,
      end: cumulative,
      value: sv.shapValue,
      isBase: false,
    });
  }

  waterfallData.push({
    feature: "Output",
    start: 0,
    end: cumulative,
    value: cumulative,
    isBase: true,
  });

  return (
    <div>
      <p className="text-xs opacity-50 mb-3" style={{ fontFamily: "Geist, sans-serif" }}>
        Feature contributions from base value to model output
      </p>
      <ResponsiveContainer width="100%" height={Math.max(200, waterfallData.length * 30)}>
        <BarChart
          data={waterfallData}
          layout="vertical"
          margin={{ left: 20, right: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(44,40,36,0.06)" />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.5 }} />
          <YAxis
            type="category"
            dataKey="feature"
            tick={{ fontSize: 11, fill: "#2C2824", opacity: 0.7 }}
            width={80}
          />
          <Tooltip
            contentStyle={{
              background: "#F2EFEA",
              border: "1px solid rgba(44,40,36,0.1)",
              borderRadius: "8px",
              fontFamily: "Geist, sans-serif",
              fontSize: "12px",
            }}
          />
          <ReferenceLine x={data.baseValue} stroke="rgba(44,40,36,0.3)" strokeDasharray="3 3" />
          <Bar dataKey="start" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a" radius={[0, 4, 4, 0]}>
            {waterfallData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.isBase
                    ? "rgba(44, 40, 36, 0.3)"
                    : entry.value >= 0
                    ? "rgba(196, 140, 86, 0.7)"
                    : "rgba(123, 91, 58, 0.7)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BeeswarmChart({ data }: { data: ShapData }) {
  const beeswarmData = useMemo(() => {
    const result: { feature: string; shapValue: number; featureValue: number; y: number }[] = [];
    let seed = 42;

    data.shapValues.forEach((sv, fi) => {
      for (let j = 0; j < 5; j++) {
        seed++;
        const jitter = (seededRandom(seed) - 0.5) * 0.3;
        seed++;
        const shapJitter = seededRandom(seed);
        seed++;
        const featJitter = seededRandom(seed);
        result.push({
          feature: sv.feature,
          shapValue: sv.shapValue * (1 + (shapJitter - 0.5) * 0.4),
          featureValue: sv.featureValue * (1 + (featJitter - 0.5) * 0.3),
          y: fi + jitter,
        });
      }
    });

    return result;
  }, [data.shapValues]);

  return (
    <div>
      <p className="text-xs opacity-50 mb-3" style={{ fontFamily: "Geist, sans-serif" }}>
        Distribution of SHAP values for each feature (color = direction)
      </p>
      <ResponsiveContainer width="100%" height={Math.max(250, data.features.length * 40)}>
        <ScatterChart margin={{ left: 20, right: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(44,40,36,0.06)" />
          <XAxis
            type="number"
            dataKey="shapValue"
            name="SHAP Value"
            tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.5 }}
            label={{ value: "SHAP Value", position: "bottom", fontSize: 11, fill: "#2C2824", opacity: 0.5 }}
          />
          <YAxis type="number" dataKey="y" tick={false} />
          <Tooltip
            contentStyle={{
              background: "#F2EFEA",
              border: "1px solid rgba(44,40,36,0.1)",
              borderRadius: "8px",
              fontFamily: "Geist, sans-serif",
              fontSize: "12px",
            }}
          />
          <ReferenceLine x={0} stroke="rgba(44,40,36,0.3)" strokeDasharray="3 3" />
          <Scatter data={beeswarmData}>
            {beeswarmData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.shapValue >= 0 ? "rgba(196, 140, 86, 0.6)" : "rgba(123, 91, 58, 0.6)"}
                r={4}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2 mt-2">
        {data.features.map((f, i) => (
          <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-aura-text/5 opacity-60">
            {i}: {f}
          </span>
        ))}
      </div>
    </div>
  );
}

function DependencePlots({ data }: { data: ShapData }) {
  const [selectedPlot, setSelectedPlot] = useState(0);

  if (data.dependencePlots.length === 0) {
    return <p className="text-xs opacity-50">No dependence plots available.</p>;
  }

  const plot = data.dependencePlots[selectedPlot];

  return (
    <div>
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {data.dependencePlots.map((p, i) => (
          <button
            key={p.feature}
            onClick={() => setSelectedPlot(i)}
            className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-all ${
              selectedPlot === i
                ? "bg-aura-accent/20 text-aura-accent font-medium"
                : "bg-aura-text/5 hover:bg-aura-text/10 opacity-60"
            }`}
            style={{ fontFamily: "Geist, sans-serif" }}
          >
            {p.feature}
          </button>
        ))}
      </div>

      <p className="text-xs opacity-50 mb-3" style={{ fontFamily: "Geist, sans-serif" }}>
        {plot.feature} vs SHAP value (colored by {plot.interactionFeature})
      </p>

      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ left: 10, right: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(44,40,36,0.06)" />
          <XAxis
            type="number"
            dataKey="x"
            name={plot.feature}
            tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.5 }}
            label={{ value: plot.feature, position: "bottom", fontSize: 11, fill: "#2C2824", opacity: 0.5 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="SHAP Value"
            tick={{ fontSize: 10, fill: "#2C2824", opacity: 0.5 }}
          />
          <Tooltip
            contentStyle={{
              background: "#F2EFEA",
              border: "1px solid rgba(44,40,36,0.1)",
              borderRadius: "8px",
              fontFamily: "Geist, sans-serif",
              fontSize: "12px",
            }}
          />
          <Scatter data={plot.points}>
            {plot.points.map((point, index) => {
              const maxColor = Math.max(...plot.points.map((p) => Math.abs(p.color)), 1);
              const intensity = Math.abs(point.color) / maxColor;
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={`rgba(196, 140, 86, ${0.2 + intensity * 0.8})`}
                  r={3}
                />
              );
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function InteractionMatrix({ data }: { data: ShapData }) {
  if (data.interactionMatrix.length === 0) {
    return <p className="text-xs opacity-50">No interaction data available.</p>;
  }

  const features = data.features.slice(0, data.interactionMatrix.length);
  const maxVal = Math.max(
    ...data.interactionMatrix.flat().filter((v) => v < 1),
    0.01
  );

  return (
    <div>
      <p className="text-xs opacity-50 mb-3" style={{ fontFamily: "Geist, sans-serif" }}>
        Feature interaction strengths (higher = stronger interaction effect)
      </p>
      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="flex">
            <div className="w-20 h-8 flex items-center justify-end pr-2 text-xs opacity-50" />
            {features.map((f) => (
              <div
                key={f}
                className="w-14 h-8 flex items-center justify-center text-xs opacity-50 -rotate-45 origin-center"
                style={{ fontFamily: "Geist, sans-serif" }}
              >
                {f.slice(0, 6)}
              </div>
            ))}
          </div>

          {data.interactionMatrix.map((row, i) => (
            <div key={i} className="flex">
              <div
                className="w-20 h-10 flex items-center justify-end pr-2 text-xs opacity-60"
                style={{ fontFamily: "Geist, sans-serif" }}
              >
                {features[i]?.slice(0, 8)}
              </div>
              {row.map((val, j) => {
                const intensity = val === 1 ? 1 : val / maxVal;
                return (
                  <div
                    key={j}
                    className="w-14 h-10 flex items-center justify-center text-xs rounded-sm m-0.5 transition-all hover:scale-110"
                    style={{
                      backgroundColor: `rgba(196, 140, 86, ${intensity * 0.8})`,
                      color: intensity > 0.5 ? "#F2EFEA" : "#2C2824",
                      fontFamily: "Geist, sans-serif",
                    }}
                    title={`${features[i]} x ${features[j]}: ${val.toFixed(3)}`}
                  >
                    {val.toFixed(2)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 text-xs opacity-50" style={{ fontFamily: "Geist, sans-serif" }}>
        <span>Weak</span>
        <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-transparent to-aura-accent" />
        <span>Strong</span>
      </div>
    </div>
  );
}
