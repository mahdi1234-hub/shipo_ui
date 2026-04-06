"use client";

import React, { useState } from "react";
import type { ColumnStats } from "@/types";

interface StatsSummaryProps {
  stats: ColumnStats[];
  rowCount: number;
}

export default function StatsSummary({ stats, rowCount }: StatsSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const numericStats = stats.filter((s) => s.type === "numeric");
  const categoricalStats = stats.filter((s) => s.type === "categorical");

  return (
    <div className="chart-container">
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-sm font-medium tracking-tight opacity-70 uppercase"
          style={{ fontFamily: "Geist, sans-serif" }}
        >
          Data Summary
        </h3>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs px-3 py-1 rounded-full bg-aura-text/5 hover:bg-aura-text/10 transition-colors"
          style={{ fontFamily: "Geist, sans-serif" }}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="p-2 rounded-lg bg-aura-text/[0.03] text-center">
          <div className="text-xs opacity-50" style={{ fontFamily: "Geist, sans-serif" }}>Rows</div>
          <div className="text-lg font-medium" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{rowCount}</div>
        </div>
        <div className="p-2 rounded-lg bg-aura-text/[0.03] text-center">
          <div className="text-xs opacity-50" style={{ fontFamily: "Geist, sans-serif" }}>Numeric</div>
          <div className="text-lg font-medium" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{numericStats.length}</div>
        </div>
        <div className="p-2 rounded-lg bg-aura-text/[0.03] text-center">
          <div className="text-xs opacity-50" style={{ fontFamily: "Geist, sans-serif" }}>Categorical</div>
          <div className="text-lg font-medium" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{categoricalStats.length}</div>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2">
          {numericStats.map((stat) => (
            <div key={stat.name} className="p-3 rounded-lg bg-aura-text/[0.03]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                  {stat.name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-aura-accent/10 text-aura-accent" style={{ fontFamily: "Geist, sans-serif" }}>
                  numeric
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2 text-xs" style={{ fontFamily: "Geist, sans-serif" }}>
                <div>
                  <span className="opacity-50">Mean</span>
                  <div className="font-medium">{stat.mean?.toFixed(2)}</div>
                </div>
                <div>
                  <span className="opacity-50">Median</span>
                  <div className="font-medium">{stat.median?.toFixed(2)}</div>
                </div>
                <div>
                  <span className="opacity-50">Std</span>
                  <div className="font-medium">{stat.std?.toFixed(2)}</div>
                </div>
                <div>
                  <span className="opacity-50">Min</span>
                  <div className="font-medium">{stat.min}</div>
                </div>
                <div>
                  <span className="opacity-50">Max</span>
                  <div className="font-medium">{stat.max}</div>
                </div>
              </div>
              {/* Mini distribution bar */}
              {stat.min !== undefined && stat.max !== undefined && stat.mean !== undefined && (
                <div className="mt-2 h-1.5 rounded-full bg-aura-text/5 relative overflow-hidden">
                  <div
                    className="absolute h-full rounded-full bg-aura-accent/40"
                    style={{
                      left: `${((stat.mean - stat.min) / (stat.max - stat.min || 1)) * 100 - 5}%`,
                      width: "10%",
                    }}
                  />
                </div>
              )}
            </div>
          ))}

          {categoricalStats.map((stat) => (
            <div key={stat.name} className="p-3 rounded-lg bg-aura-text/[0.03]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                  {stat.name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-aura-text/10" style={{ fontFamily: "Geist, sans-serif" }}>
                  categorical ({stat.uniqueValues} unique)
                </span>
              </div>
              {stat.topValues && (
                <div className="flex flex-wrap gap-1">
                  {stat.topValues.map((tv) => (
                    <span
                      key={tv.value}
                      className="text-xs px-2 py-0.5 rounded-full bg-aura-text/5"
                      style={{ fontFamily: "Geist, sans-serif" }}
                    >
                      {tv.value} ({tv.count})
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
