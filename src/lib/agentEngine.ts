import { v4 as uuidv4 } from "uuid";
import type { ChatMessage, AnalysisResult } from "@/types";
import { parseData, computeColumnStats, computeCorrelationMatrix } from "./dataParser";
import { buildCausalGraph } from "./causalAnalysis";
import { computeShapValues } from "./shapAnalysis";

/**
 * The AI agent that processes user messages, detects data,
 * performs analysis, and produces structured results.
 */
export function processUserMessage(userInput: string): ChatMessage {
  const trimmed = userInput.trim();

  // Check if the input contains analyzable data
  const hasData = detectAnalyzableData(trimmed);

  if (!hasData) {
    return {
      id: uuidv4(),
      role: "assistant",
      content: generateHelpResponse(trimmed),
      timestamp: new Date(),
    };
  }

  // Parse and analyze the data
  const { data, type } = parseData(trimmed);

  if (data.length === 0) {
    return {
      id: uuidv4(),
      role: "assistant",
      content:
        "I detected some data in your message but couldn't parse it into a usable format. Please try pasting your data as CSV (with headers), JSON array, or key-value pairs.",
      timestamp: new Date(),
    };
  }

  const columns = Object.keys(data[0]);
  const stats = computeColumnStats(data);
  const correlations = computeCorrelationMatrix(data, stats);
  const causalGraph = buildCausalGraph(data, stats, correlations);
  const shapValues = computeShapValues(data, stats);

  const numericCols = stats.filter((s) => s.type === "numeric");
  const categoricalCols = stats.filter((s) => s.type === "categorical");

  // Generate insights
  const insights = generateInsights(stats, correlations, causalGraph, shapValues);

  const analysis: AnalysisResult = {
    summary: generateSummary(data, stats, type),
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

  const content = formatAnalysisResponse(analysis);

  return {
    id: uuidv4(),
    role: "assistant",
    content,
    timestamp: new Date(),
    analysis,
  };
}

/**
 * Detect if user input contains analyzable data
 */
function detectAnalyzableData(input: string): boolean {
  // JSON data
  if (
    (input.startsWith("[") && input.endsWith("]")) ||
    (input.startsWith("{") && input.endsWith("}"))
  ) {
    try {
      JSON.parse(input);
      return true;
    } catch {
      // Not JSON
    }
  }

  // CSV-like data (multiple lines with consistent delimiters)
  const lines = input.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length >= 2) {
    const delimiters = [",", "\t", ";", "|"];
    for (const del of delimiters) {
      const counts = lines.map((l) => l.split(del).length);
      if (counts[0] > 1 && counts.every((c) => c === counts[0])) {
        return true;
      }
    }
  }

  // Key-value pairs
  const kvLines = lines.filter((l) => l.match(/^.+:\s*.+$/));
  if (kvLines.length >= 2) return true;

  return false;
}

/**
 * Generate insights from the analysis
 */
function generateInsights(
  stats: import("@/types").ColumnStats[],
  correlations: import("@/types").CorrelationEntry[],
  causalGraph: import("@/types").CausalGraphData,
  shapValues: import("@/types").ShapData
): string[] {
  const insights: string[] = [];

  // Strong correlations
  const strongCorr = correlations.filter(
    (c) => c.x !== c.y && Math.abs(c.value) > 0.6
  );
  const seen = new Set<string>();
  for (const c of strongCorr) {
    const key = [c.x, c.y].sort().join("__");
    if (seen.has(key)) continue;
    seen.add(key);
    const dir = c.value > 0 ? "positive" : "negative";
    insights.push(
      `Strong ${dir} correlation (${c.value.toFixed(2)}) between "${c.x}" and "${c.y}"`
    );
  }

  // Causal relationships
  const causalEdges = causalGraph.edges.filter((e) => e.type === "causal");
  for (const edge of causalEdges.slice(0, 3)) {
    insights.push(
      `Potential causal link: "${edge.source}" -> "${edge.target}" (strength: ${edge.weight.toFixed(2)})`
    );
  }

  // Top SHAP features
  if (shapValues.globalImportance.length > 0) {
    const topFeature = shapValues.globalImportance[0];
    insights.push(
      `Most influential feature: "${topFeature.feature}" (importance: ${topFeature.importance.toFixed(3)})`
    );
  }

  // Graph structure
  if (causalGraph.metrics.components > 1) {
    insights.push(
      `The variable network has ${causalGraph.metrics.components} disconnected components, suggesting independent variable groups`
    );
  }

  if (causalGraph.metrics.density > 0.6) {
    insights.push("High network density indicates most variables are interconnected");
  } else if (causalGraph.metrics.density < 0.2) {
    insights.push("Low network density suggests sparse relationships between variables");
  }

  // Outlier detection
  for (const stat of stats.filter((s) => s.type === "numeric")) {
    if (stat.std && stat.mean && stat.std > stat.mean * 0.5) {
      insights.push(
        `High variance in "${stat.name}" (CV: ${((stat.std / Math.abs(stat.mean)) * 100).toFixed(1)}%) may indicate outliers or distinct subgroups`
      );
    }
  }

  return insights.slice(0, 8);
}

/**
 * Generate a summary of the data
 */
function generateSummary(
  data: import("@/types").ParsedData,
  stats: import("@/types").ColumnStats[],
  type: string
): string {
  const numericCount = stats.filter((s) => s.type === "numeric").length;
  const catCount = stats.filter((s) => s.type === "categorical").length;

  return `Analyzed ${data.length} records with ${stats.length} variables (${numericCount} numeric, ${catCount} categorical) from ${type.toUpperCase()} input.`;
}

/**
 * Format the analysis into a readable response
 */
function formatAnalysisResponse(analysis: AnalysisResult): string {
  let response = `**Data Analysis Complete**\n\n`;
  response += `${analysis.summary}\n\n`;

  if (analysis.insights.length > 0) {
    response += `**Key Insights:**\n`;
    analysis.insights.forEach((insight, i) => {
      response += `${i + 1}. ${insight}\n`;
    });
    response += "\n";
  }

  response += `**Network Metrics:**\n`;
  response += `- Nodes: ${analysis.causalGraph.metrics.nodeCount} | Edges: ${analysis.causalGraph.metrics.edgeCount}\n`;
  response += `- Density: ${analysis.causalGraph.metrics.density} | Clustering: ${analysis.causalGraph.metrics.avgClustering}\n`;
  response += `- Communities: ${new Set(Object.values(analysis.causalGraph.communities)).size}\n\n`;

  if (analysis.shapValues.globalImportance.length > 0) {
    response += `**Feature Importance (SHAP):**\n`;
    analysis.shapValues.globalImportance.slice(0, 5).forEach((f) => {
      const bar = "█".repeat(Math.round(f.importance * 20));
      response += `- ${f.feature}: ${bar} ${f.importance.toFixed(3)}\n`;
    });
  }

  return response;
}

/**
 * Generate help/conversational response when no data is detected
 */
function generateHelpResponse(input: string): string {
  const lower = input.toLowerCase();

  if (lower.includes("help") || lower.includes("how") || lower.includes("what")) {
    return `**I'm your Causal Data Analyst.**

I can analyze data you paste directly into the chat. Here's what I support:

**Data Formats:**
- **CSV** - Paste comma-separated data with headers
- **JSON** - Paste JSON arrays or objects
- **Key-Value** - Paste "key: value" pairs

**Analytics I Provide:**
- Causal graph network (interactive Sigma.js visualization)
- SHAP value analysis (feature importance, dependence plots, waterfall charts)
- Correlation matrix heatmap
- Statistical summaries
- Community detection
- Centrality analysis
- Interaction effects

**Try pasting some data to get started!** For example:

\`\`\`
name,age,income,spending,satisfaction
Alice,28,55000,2200,8
Bob,35,72000,3100,7
Carol,42,88000,4500,9
Dave,31,61000,2800,6
Eve,55,95000,5200,8
\`\`\``;
  }

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! I'm ready to analyze your data. Paste any CSV, JSON, or structured data and I'll generate causal graphs, SHAP values, and comprehensive analytics right here in the chat.";
  }

  return "I'm a causal data analyst. Paste your data (CSV, JSON, or structured text) and I'll analyze it with interactive graph networks, SHAP values, and statistical insights. Type **help** for more details.";
}
