"use client";

import React from "react";
import type { CorrelationEntry } from "@/types";

interface CorrelationHeatmapProps {
  data: CorrelationEntry[];
}

export default function CorrelationHeatmap({ data }: CorrelationHeatmapProps) {
  if (data.length === 0) return null;

  const variables = [...new Set(data.map((d) => d.x))];

  const getColor = (value: number): string => {
    if (value >= 0) {
      return `rgba(196, 140, 86, ${Math.abs(value) * 0.9})`;
    }
    return `rgba(123, 91, 58, ${Math.abs(value) * 0.9})`;
  };

  const getTextColor = (value: number): string => {
    return Math.abs(value) > 0.5 ? "#F2EFEA" : "#2C2824";
  };

  return (
    <div className="chart-container">
      <h3
        className="text-sm font-medium tracking-tight opacity-70 uppercase mb-3"
        style={{ fontFamily: "Geist, sans-serif" }}
      >
        Correlation Matrix
      </h3>
      <p className="text-xs opacity-50 mb-3" style={{ fontFamily: "Geist, sans-serif" }}>
        Pearson correlation coefficients between numeric variables
      </p>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-fit">
          {/* Header */}
          <div className="flex">
            <div className="w-20 h-8" />
            {variables.map((v) => (
              <div
                key={v}
                className="w-16 h-8 flex items-center justify-center text-xs opacity-50 -rotate-45 origin-center"
                style={{ fontFamily: "Geist, sans-serif" }}
              >
                {v.length > 7 ? v.slice(0, 7) + ".." : v}
              </div>
            ))}
          </div>

          {/* Rows */}
          {variables.map((rowVar) => (
            <div key={rowVar} className="flex">
              <div
                className="w-20 h-12 flex items-center justify-end pr-2 text-xs opacity-60 shrink-0"
                style={{ fontFamily: "Geist, sans-serif" }}
              >
                {rowVar.length > 9 ? rowVar.slice(0, 9) + ".." : rowVar}
              </div>
              {variables.map((colVar) => {
                const entry = data.find((d) => d.x === rowVar && d.y === colVar);
                const value = entry?.value ?? 0;
                return (
                  <div
                    key={`${rowVar}-${colVar}`}
                    className="w-16 h-12 flex items-center justify-center text-xs rounded-sm m-0.5 transition-all hover:scale-105 cursor-default"
                    style={{
                      backgroundColor: getColor(value),
                      color: getTextColor(value),
                      fontFamily: "Geist, sans-serif",
                    }}
                    title={`${rowVar} vs ${colVar}: ${value.toFixed(3)}`}
                  >
                    {value.toFixed(2)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Color scale */}
      <div className="flex items-center gap-2 mt-3 text-xs opacity-50" style={{ fontFamily: "Geist, sans-serif" }}>
        <span>-1.0</span>
        <div className="flex-1 h-2 rounded-full" style={{
          background: "linear-gradient(to right, rgba(123, 91, 58, 0.9), transparent, rgba(196, 140, 86, 0.9))"
        }} />
        <span>+1.0</span>
      </div>
    </div>
  );
}
