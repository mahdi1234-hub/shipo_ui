"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage, AnalysisResult } from "@/types";
import { parseData, computeColumnStats, computeCorrelationMatrix } from "@/lib/dataParser";
import { buildCausalGraph } from "@/lib/causalAnalysis";
import { computeShapValues } from "@/lib/shapAnalysis";

// Dynamic imports for heavy chart components (no SSR)
const CausalGraph = dynamic(() => import("./CausalGraph"), { ssr: false });
const CosmographView = dynamic(() => import("./CosmographView"), { ssr: false });
const ShapCharts = dynamic(() => import("./ShapCharts"), { ssr: false });
const CorrelationHeatmap = dynamic(() => import("./CorrelationHeatmap"), { ssr: false });
const StatsSummary = dynamic(() => import("./StatsSummary"), { ssr: false });

export default function ChatUI() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, [input]);

  /**
   * Detect if user input contains analyzable data
   */
  function detectAnalyzableData(text: string): boolean {
    const trimmed = text.trim();
    // JSON
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try { JSON.parse(trimmed); return true; } catch { /* not json */ }
    }
    // CSV-like
    const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length >= 2) {
      for (const del of [",", "\t", ";", "|"]) {
        const counts = lines.map((l) => l.split(del).length);
        if (counts[0] > 1 && counts.every((c) => c === counts[0])) return true;
      }
    }
    // Key-value pairs
    if (lines.filter((l) => l.match(/^.+:\s*.+$/)).length >= 2) return true;
    return false;
  }

  /**
   * Run local data analysis pipeline
   */
  function runAnalysis(text: string): AnalysisResult | null {
    try {
      const { data, type } = parseData(text);
      if (data.length === 0) return null;

      const columns = Object.keys(data[0]);
      const stats = computeColumnStats(data);
      const correlations = computeCorrelationMatrix(data, stats);
      const causalGraph = buildCausalGraph(data, stats, correlations);
      const shapValues = computeShapValues(data, stats);

      const numericCount = stats.filter((s) => s.type === "numeric").length;
      const catCount = stats.filter((s) => s.type === "categorical").length;

      // Generate local insights
      const insights: string[] = [];
      const strongCorr = correlations.filter((c) => c.x !== c.y && Math.abs(c.value) > 0.6);
      const seen = new Set<string>();
      for (const c of strongCorr) {
        const key = [c.x, c.y].sort().join("__");
        if (seen.has(key)) continue;
        seen.add(key);
        insights.push(`Strong ${c.value > 0 ? "positive" : "negative"} correlation (${c.value.toFixed(2)}) between "${c.x}" and "${c.y}"`);
      }
      const causalEdges = causalGraph.edges.filter((e) => e.type === "causal");
      for (const edge of causalEdges.slice(0, 3)) {
        insights.push(`Potential causal link: "${edge.source}" -> "${edge.target}" (strength: ${edge.weight.toFixed(2)})`);
      }
      if (shapValues.globalImportance.length > 0) {
        insights.push(`Most influential feature: "${shapValues.globalImportance[0].feature}" (importance: ${shapValues.globalImportance[0].importance.toFixed(3)})`);
      }

      return {
        summary: `Analyzed ${data.length} records with ${stats.length} variables (${numericCount} numeric, ${catCount} categorical) from ${type.toUpperCase()} input.`,
        dataType: type,
        rowCount: data.length,
        columnCount: columns.length,
        columns,
        statistics: stats,
        causalGraph,
        shapValues,
        correlationMatrix: correlations,
        insights,
      };
    } catch {
      return null;
    }
  }

  /**
   * Call Cerebras LLM for conversational response
   */
  async function callCerebras(
    userMessage: string,
    history: { role: string; content: string }[]
  ): Promise<string> {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...history.slice(-10),
            { role: "user", content: userMessage },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.content;
    } catch (error) {
      console.error("Cerebras API error:", error);
      return "I encountered an issue connecting to the AI service. However, I can still analyze your data locally. Please paste CSV, JSON, or structured data for analysis.";
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");

    // Add user message
    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: userText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Check for data and run analysis
    const hasData = detectAnalyzableData(userText);
    let analysis: AnalysisResult | null = null;

    if (hasData) {
      analysis = runAnalysis(userText);
    }

    // Build message history for LLM
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content.slice(0, 500), // Truncate for context window
    }));

    // Enhance prompt with analysis context if available
    let llmPrompt = userText;
    if (analysis) {
      llmPrompt = `The user provided data. Here is the analysis summary:\n${analysis.summary}\n\nInsights found:\n${analysis.insights.join("\n")}\n\nCorrelation highlights: ${analysis.correlationMatrix.filter((c) => c.x !== c.y && Math.abs(c.value) > 0.5).map((c) => `${c.x} <-> ${c.y}: ${c.value.toFixed(2)}`).join(", ")}\n\nGraph metrics: density=${analysis.causalGraph.metrics.density}, clustering=${analysis.causalGraph.metrics.avgClustering}, components=${analysis.causalGraph.metrics.components}\n\nSHAP top features: ${analysis.shapValues.globalImportance.slice(0, 3).map((f) => `${f.feature}(${f.importance.toFixed(3)})`).join(", ")}\n\nPlease provide a detailed causal analysis interpretation of these results. Explain the causal relationships, which variables are most important, and what actions or conclusions can be drawn.`;
    }

    // Call Cerebras LLM
    const llmResponse = await callCerebras(llmPrompt, history);

    const assistantMsg: ChatMessage = {
      id: uuidv4(),
      role: "assistant",
      content: llmResponse,
      timestamp: new Date(),
      analysis: analysis ?? undefined,
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const loadSampleData = () => {
    setInput(`name,age,income,spending,satisfaction,loyalty_score
Alice,28,55000,2200,8,72
Bob,35,72000,3100,7,65
Carol,42,88000,4500,9,85
Dave,31,61000,2800,6,58
Eve,55,95000,5200,8,90
Frank,23,42000,1800,5,45
Grace,38,78000,3800,7,75
Henry,47,92000,4800,9,88
Iris,29,58000,2500,6,60
Jack,51,99000,5500,8,92
Karen,33,67000,3000,7,70
Leo,44,85000,4200,8,82
Mia,26,48000,2000,5,50
Noah,39,80000,3600,7,78
Olivia,36,74000,3400,8,76`);
  };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Navigation - Aura inspired */}
      <nav className="relative z-40 py-6 border-b border-aura-text/[0.06]">
        <div className="max-w-[88rem] mx-auto px-6 lg:px-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-aura-accent/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-aura-accent">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="sonar-ring" style={{ inset: "-2px" }}></div>
            </div>
            <span
              className="text-xl tracking-tighter uppercase font-light"
              style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
            >
              Shipo
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-aura-accent/10 text-aura-accent" style={{ fontFamily: "Geist, sans-serif" }}>
              Causal Analyst
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium tracking-tight opacity-60" style={{ fontFamily: "Geist, sans-serif" }}>
            <span>Graph Analytics</span>
            <span>SHAP Values</span>
            <span>Causal Inference</span>
          </div>
          <button
            onClick={loadSampleData}
            className="btn-beam relative inline-flex items-center gap-2 bg-aura-text text-aura-inverse px-5 py-2.5 rounded-full text-xs font-medium transition-transform hover:scale-105 active:scale-95"
            style={{ fontFamily: "Geist, sans-serif" }}
          >
            <span>Load Sample Data</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17l9.2-9.2M17 17V7H7" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-6 lg:px-12">
        <div className="max-w-[88rem] mx-auto py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <h1
                className="text-5xl md:text-7xl font-medium tracking-tighter leading-none mb-6"
                style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
              >
                <span>Causal</span>{" "}
                <span className="text-aura-text/20">Data</span>{" "}
                <span>Analyst</span>
              </h1>
              <p
                className="text-lg opacity-60 max-w-lg leading-relaxed mb-8"
                style={{ fontFamily: "Geist, sans-serif" }}
              >
                Paste your data -- CSV, JSON, or structured text -- and get instant
                causal graph analytics, SHAP values, and deep statistical insights.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
                {[
                  { title: "Graph Networks", desc: "Interactive causal graphs with Sigma.js & Graphology" },
                  { title: "SHAP Analysis", desc: "Feature importance, waterfall, beeswarm & dependence plots" },
                  { title: "Causal Inference", desc: "Correlation, community detection & centrality analysis" },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="p-4 rounded-xl bg-white/40 border border-aura-text/[0.06] text-left"
                  >
                    <h3 className="text-sm font-medium mb-1" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                      {item.title}
                    </h3>
                    <p className="text-xs opacity-50" style={{ fontFamily: "Geist, sans-serif" }}>
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`message-enter flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] ${
                  msg.role === "user"
                    ? "bg-aura-text text-aura-inverse rounded-2xl rounded-br-sm px-5 py-3"
                    : "bg-white/50 border border-aura-text/[0.06] rounded-2xl rounded-bl-sm px-5 py-3"
                }`}
              >
                {/* Message content */}
                <div
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ fontFamily: "Geist, sans-serif" }}
                >
                  {formatMessageContent(msg.content)}
                </div>

                {/* Inline analytics */}
                {msg.analysis && (
                  <div className="mt-4 space-y-4">
                    <StatsSummary
                      stats={msg.analysis.statistics}
                      rowCount={msg.analysis.rowCount}
                    />
                    {msg.analysis.causalGraph.nodes.length > 0 && (
                      <CausalGraph data={msg.analysis.causalGraph} />
                    )}
                    {msg.analysis.causalGraph.nodes.length > 0 && (
                      <CosmographView data={msg.analysis.causalGraph} />
                    )}
                    {msg.analysis.shapValues.features.length > 0 && (
                      <ShapCharts data={msg.analysis.shapValues} />
                    )}
                    {msg.analysis.correlationMatrix.length > 0 && (
                      <CorrelationHeatmap data={msg.analysis.correlationMatrix} />
                    )}
                    {/* Insights */}
                    {msg.analysis.insights.length > 0 && (
                      <div className="chart-container">
                        <h3
                          className="text-sm font-medium tracking-tight opacity-70 uppercase mb-2"
                          style={{ fontFamily: "Geist, sans-serif" }}
                        >
                          Key Insights
                        </h3>
                        <ul className="space-y-1.5">
                          {msg.analysis.insights.map((insight, i) => (
                            <li
                              key={i}
                              className="text-xs flex items-start gap-2"
                              style={{ fontFamily: "Geist, sans-serif" }}
                            >
                              <span className="text-aura-accent mt-0.5 shrink-0">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span className="opacity-70">{insight}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Timestamp */}
                <div
                  className={`text-xs mt-2 ${
                    msg.role === "user" ? "opacity-40" : "opacity-30"
                  }`}
                  style={{ fontFamily: "Geist, sans-serif" }}
                >
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start message-enter">
              <div className="bg-white/50 border border-aura-text/[0.06] rounded-2xl rounded-bl-sm px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-aura-accent typing-dot" />
                    <div className="w-2 h-2 rounded-full bg-aura-accent typing-dot" />
                    <div className="w-2 h-2 rounded-full bg-aura-accent typing-dot" />
                  </div>
                  <span className="text-xs opacity-40" style={{ fontFamily: "Geist, sans-serif" }}>
                    Analyzing with Cerebras AI...
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-aura-text/[0.06] bg-aura-bg/80 backdrop-blur-sm">
        <form
          onSubmit={handleSubmit}
          className="max-w-[88rem] mx-auto px-6 lg:px-12 py-4"
        >
          <div className="flex items-end gap-3 bg-white/50 border border-aura-text/[0.08] rounded-2xl px-4 py-3 focus-within:border-aura-accent/30 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste your CSV, JSON, or structured data here..."
              className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed max-h-[200px] placeholder:opacity-30"
              style={{ fontFamily: "Geist, sans-serif" }}
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="shrink-0 w-9 h-9 rounded-full bg-aura-text text-aura-inverse flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-xs opacity-30" style={{ fontFamily: "Geist, sans-serif" }}>
              Shift+Enter for new line. Supports CSV, JSON, and key-value data.
            </p>
            <p className="text-xs opacity-30" style={{ fontFamily: "Geist, sans-serif" }}>
              Powered by Cerebras AI
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Format markdown-like content in messages
 */
function formatMessageContent(content: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(
        <div key={i} className="font-medium text-sm mb-1" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
          {line.replace(/\*\*/g, "")}
        </div>
      );
    } else if (line.startsWith("- ")) {
      elements.push(
        <div key={i} className="flex items-start gap-2 text-xs ml-2">
          <span className="text-aura-accent mt-0.5">&#8226;</span>
          <span>{formatInlineBold(line.slice(2))}</span>
        </div>
      );
    } else if (line.match(/^\d+\.\s/)) {
      elements.push(
        <div key={i} className="flex items-start gap-2 text-xs ml-2">
          <span className="text-aura-accent opacity-60 shrink-0">{line.match(/^\d+/)?.[0]}.</span>
          <span>{formatInlineBold(line.replace(/^\d+\.\s/, ""))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <div key={i} className="text-sm">
          {formatInlineBold(line)}
        </div>
      );
    }
  });

  return <>{elements}</>;
}

function formatInlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-medium" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
