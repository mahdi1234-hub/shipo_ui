export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  analysis?: AnalysisResult;
}

export interface AnalysisResult {
  summary: string;
  dataType: "csv" | "json" | "text";
  rowCount: number;
  columnCount: number;
  columns: string[];
  statistics: ColumnStats[];
  causalGraph: CausalGraphData;
  shapValues: ShapData;
  correlationMatrix: CorrelationEntry[];
  insights: string[];
}

export interface ColumnStats {
  name: string;
  type: "numeric" | "categorical";
  mean?: number;
  median?: number;
  std?: number;
  min?: number;
  max?: number;
  uniqueValues?: number;
  topValues?: { value: string; count: number }[];
}

export interface CausalGraphData {
  nodes: CausalNode[];
  edges: CausalEdge[];
  communities: Record<string, number>;
  metrics: GraphMetrics;
}

export interface CausalNode {
  id: string;
  label: string;
  size: number;
  color: string;
  community?: number;
  centrality?: number;
  x?: number;
  y?: number;
}

export interface CausalEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  color: string;
  type: "causal" | "correlation" | "association";
  label?: string;
}

export interface GraphMetrics {
  density: number;
  modularity: number;
  avgClustering: number;
  diameter: number;
  nodeCount: number;
  edgeCount: number;
  components: number;
}

export interface ShapData {
  features: string[];
  baseValue: number;
  shapValues: ShapFeatureValue[];
  dependencePlots: DependencePlot[];
  interactionMatrix: number[][];
  globalImportance: { feature: string; importance: number }[];
}

export interface ShapFeatureValue {
  feature: string;
  shapValue: number;
  featureValue: number;
  contribution: "positive" | "negative";
}

export interface DependencePlot {
  feature: string;
  points: { x: number; y: number; color: number }[];
  interactionFeature: string;
}

export interface CorrelationEntry {
  x: string;
  y: string;
  value: number;
}

export type ParsedData = Record<string, string | number>[];
