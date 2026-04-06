import Papa from "papaparse";
import type { ParsedData, ColumnStats } from "@/types";

/**
 * Detect whether user input contains CSV, JSON, or plain text data
 */
export function detectDataType(input: string): "csv" | "json" | "text" {
  const trimmed = input.trim();

  // Try JSON
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // not valid JSON
    }
  }

  // Try CSV (heuristic: multiple lines with consistent delimiters)
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length >= 2) {
    const delimiters = [",", "\t", ";", "|"];
    for (const del of delimiters) {
      const counts = lines.map((l) => l.split(del).length);
      if (counts[0] > 1 && counts.every((c) => c === counts[0])) {
        return "csv";
      }
    }
  }

  return "text";
}

/**
 * Parse CSV string into structured data
 */
export function parseCSV(input: string): ParsedData {
  const result = Papa.parse(input.trim(), {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  return result.data as ParsedData;
}

/**
 * Parse JSON string into structured data
 */
export function parseJSON(input: string): ParsedData {
  const parsed = JSON.parse(input.trim());
  if (Array.isArray(parsed)) {
    return parsed;
  }
  // If it's an object with array values, try to tabularize
  if (typeof parsed === "object") {
    const keys = Object.keys(parsed);
    const arrayKeys = keys.filter((k) => Array.isArray(parsed[k]));
    if (arrayKeys.length > 0) {
      const length = parsed[arrayKeys[0]].length;
      const rows: ParsedData = [];
      for (let i = 0; i < length; i++) {
        const row: Record<string, string | number> = {};
        for (const key of arrayKeys) {
          row[key] = parsed[key][i];
        }
        rows.push(row);
      }
      return rows;
    }
    // Single object -> single row
    return [parsed];
  }
  return [];
}

/**
 * Extract data from natural text (key-value pairs, tables, etc.)
 */
export function parseText(input: string): ParsedData {
  const lines = input.split("\n").filter((l) => l.trim().length > 0);
  const data: ParsedData = [];

  // Try to find table-like patterns
  for (const line of lines) {
    const kvMatch = line.match(/^(.+?):\s*(.+)$/);
    if (kvMatch) {
      data.push({ key: kvMatch[1].trim(), value: isNaN(Number(kvMatch[2].trim())) ? kvMatch[2].trim() : Number(kvMatch[2].trim()) });
    }
  }

  if (data.length === 0) {
    // Treat each line as a data point
    lines.forEach((line, i) => {
      data.push({ index: i, text: line.trim() });
    });
  }

  return data;
}

/**
 * Main parse function that auto-detects format
 */
export function parseData(input: string): { data: ParsedData; type: "csv" | "json" | "text" } {
  const type = detectDataType(input);
  let data: ParsedData;

  switch (type) {
    case "csv":
      data = parseCSV(input);
      break;
    case "json":
      data = parseJSON(input);
      break;
    default:
      data = parseText(input);
  }

  return { data, type };
}

/**
 * Compute column statistics
 */
export function computeColumnStats(data: ParsedData): ColumnStats[] {
  if (data.length === 0) return [];

  const columns = Object.keys(data[0]);
  return columns.map((col) => {
    const values = data.map((row) => row[col]).filter((v) => v !== null && v !== undefined && v !== "");
    const numericValues = values.map(Number).filter((v) => !isNaN(v));

    if (numericValues.length > values.length * 0.5) {
      // Numeric column
      const sorted = [...numericValues].sort((a, b) => a - b);
      const sum = numericValues.reduce((a, b) => a + b, 0);
      const mean = sum / numericValues.length;
      const median =
        numericValues.length % 2 === 0
          ? (sorted[numericValues.length / 2 - 1] + sorted[numericValues.length / 2]) / 2
          : sorted[Math.floor(numericValues.length / 2)];
      const variance = numericValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / numericValues.length;
      const std = Math.sqrt(variance);

      return {
        name: col,
        type: "numeric" as const,
        mean: Math.round(mean * 1000) / 1000,
        median: Math.round(median * 1000) / 1000,
        std: Math.round(std * 1000) / 1000,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        uniqueValues: new Set(numericValues).size,
      };
    } else {
      // Categorical column
      const counts: Record<string, number> = {};
      values.forEach((v) => {
        const key = String(v);
        counts[key] = (counts[key] || 0) + 1;
      });
      const topValues = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));

      return {
        name: col,
        type: "categorical" as const,
        uniqueValues: Object.keys(counts).length,
        topValues,
      };
    }
  });
}

/**
 * Compute correlation between two numeric arrays
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denom = Math.sqrt(sumX2 * sumY2);
  return denom === 0 ? 0 : Math.round((sumXY / denom) * 1000) / 1000;
}

/**
 * Compute correlation matrix for all numeric columns
 */
export function computeCorrelationMatrix(
  data: ParsedData,
  stats: ColumnStats[]
): { x: string; y: string; value: number }[] {
  const numericCols = stats.filter((s) => s.type === "numeric").map((s) => s.name);
  const matrix: { x: string; y: string; value: number }[] = [];

  for (const colX of numericCols) {
    for (const colY of numericCols) {
      const x = data.map((r) => Number(r[colX])).filter((v) => !isNaN(v));
      const y = data.map((r) => Number(r[colY])).filter((v) => !isNaN(v));
      matrix.push({ x: colX, y: colY, value: pearsonCorrelation(x, y) });
    }
  }

  return matrix;
}
