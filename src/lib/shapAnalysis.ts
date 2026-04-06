import type { ParsedData, ColumnStats, ShapData, ShapFeatureValue, DependencePlot } from "@/types";
import { pearsonCorrelation } from "./dataParser";

/**
 * Compute SHAP-like values for a dataset.
 * This implements a simplified Kernel SHAP approach where we estimate
 * the marginal contribution of each feature to the target variable.
 */
export function computeShapValues(
  data: ParsedData,
  stats: ColumnStats[],
  targetColumn?: string
): ShapData {
  const numericCols = stats.filter((s) => s.type === "numeric").map((s) => s.name);

  if (numericCols.length === 0) {
    return emptyShapData();
  }

  // Auto-select target as the last numeric column if not specified
  const target = targetColumn && numericCols.includes(targetColumn)
    ? targetColumn
    : numericCols[numericCols.length - 1];

  const features = numericCols.filter((c) => c !== target);

  if (features.length === 0) {
    return emptyShapData();
  }

  const targetValues = data.map((r) => Number(r[target])).filter((v) => !isNaN(v));
  const baseValue = targetValues.reduce((a, b) => a + b, 0) / targetValues.length;

  // Compute marginal contributions (simplified SHAP)
  const shapValues: ShapFeatureValue[] = [];
  const globalImportance: { feature: string; importance: number }[] = [];

  for (const feature of features) {
    const featureValues = data.map((r) => Number(r[feature]));
    const validIndices = featureValues
      .map((v, i) => (!isNaN(v) && !isNaN(targetValues[i]) ? i : -1))
      .filter((i) => i >= 0);

    if (validIndices.length < 3) {
      shapValues.push({
        feature,
        shapValue: 0,
        featureValue: 0,
        contribution: "positive",
      });
      globalImportance.push({ feature, importance: 0 });
      continue;
    }

    const fVals = validIndices.map((i) => featureValues[i]);
    const tVals = validIndices.map((i) => targetValues[i]);

    // Compute linear contribution
    const corr = pearsonCorrelation(fVals, tVals);
    const fMean = fVals.reduce((a, b) => a + b, 0) / fVals.length;
    const fStd = Math.sqrt(fVals.reduce((a, v) => a + (v - fMean) ** 2, 0) / fVals.length);
    const tStd = Math.sqrt(tVals.reduce((a, v) => a + (v - baseValue) ** 2, 0) / tVals.length);

    // SHAP value approximation: correlation * target_std * feature_deviation
    const beta = fStd > 0 ? (corr * tStd) / fStd : 0;
    const meanDeviation = fVals.reduce((a, v) => a + Math.abs(v - fMean), 0) / fVals.length;
    const shapValue = beta * meanDeviation;

    shapValues.push({
      feature,
      shapValue: Math.round(shapValue * 1000) / 1000,
      featureValue: Math.round(fMean * 1000) / 1000,
      contribution: shapValue >= 0 ? "positive" : "negative",
    });

    globalImportance.push({
      feature,
      importance: Math.round(Math.abs(shapValue) * 1000) / 1000,
    });
  }

  // Sort global importance
  globalImportance.sort((a, b) => b.importance - a.importance);

  // Compute dependence plots
  const dependencePlots = computeDependencePlots(data, features, target, targetValues, baseValue);

  // Compute interaction matrix
  const interactionMatrix = computeInteractionMatrix(data, features, targetValues);

  return {
    features,
    baseValue: Math.round(baseValue * 1000) / 1000,
    shapValues,
    dependencePlots,
    interactionMatrix,
    globalImportance,
  };
}

/**
 * Compute SHAP dependence plots for each feature
 */
function computeDependencePlots(
  data: ParsedData,
  features: string[],
  target: string,
  targetValues: number[],
  baseValue: number
): DependencePlot[] {
  const plots: DependencePlot[] = [];

  for (let fi = 0; fi < Math.min(features.length, 6); fi++) {
    const feature = features[fi];
    const interactionFeature = features[(fi + 1) % features.length] || feature;

    const points: { x: number; y: number; color: number }[] = [];

    for (let i = 0; i < Math.min(data.length, 200); i++) {
      const fVal = Number(data[i][feature]);
      const tVal = Number(data[i][target]);
      const iVal = Number(data[i][interactionFeature]);

      if (isNaN(fVal) || isNaN(tVal)) continue;

      // Approximate SHAP value for this point
      const shapApprox = tVal - baseValue;

      points.push({
        x: Math.round(fVal * 1000) / 1000,
        y: Math.round(shapApprox * 1000) / 1000,
        color: isNaN(iVal) ? 0 : iVal,
      });
    }

    plots.push({
      feature,
      points,
      interactionFeature,
    });
  }

  return plots;
}

/**
 * Compute feature interaction matrix using correlation of residuals
 */
function computeInteractionMatrix(
  data: ParsedData,
  features: string[],
  targetValues: number[]
): number[][] {
  const n = features.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
        continue;
      }

      const valsI = data.map((r) => Number(r[features[i]]));
      const valsJ = data.map((r) => Number(r[features[j]]));

      // Product interaction effect on target
      const valid = valsI
        .map((v, k) => ({ vi: v, vj: valsJ[k], t: targetValues[k] }))
        .filter((d) => !isNaN(d.vi) && !isNaN(d.vj) && !isNaN(d.t));

      if (valid.length < 3) continue;

      const products = valid.map((d) => d.vi * d.vj);
      const targets = valid.map((d) => d.t);
      const interaction = Math.abs(pearsonCorrelation(products, targets));

      matrix[i][j] = Math.round(interaction * 1000) / 1000;
      matrix[j][i] = matrix[i][j];
    }
  }

  return matrix;
}

/**
 * Compute per-sample SHAP values for waterfall/force plots
 */
export function computeSampleShapValues(
  data: ParsedData,
  stats: ColumnStats[],
  sampleIndex: number,
  targetColumn?: string
): { feature: string; value: number; shapValue: number }[] {
  const numericCols = stats.filter((s) => s.type === "numeric").map((s) => s.name);
  const target = targetColumn || numericCols[numericCols.length - 1];
  const features = numericCols.filter((c) => c !== target);

  const targetValues = data.map((r) => Number(r[target])).filter((v) => !isNaN(v));
  const baseValue = targetValues.reduce((a, b) => a + b, 0) / targetValues.length;

  const sample = data[sampleIndex];
  if (!sample) return [];

  const result: { feature: string; value: number; shapValue: number }[] = [];

  for (const feature of features) {
    const fVal = Number(sample[feature]);
    if (isNaN(fVal)) continue;

    const allFVals = data.map((r) => Number(r[feature])).filter((v) => !isNaN(v));
    const fMean = allFVals.reduce((a, b) => a + b, 0) / allFVals.length;
    const fStd = Math.sqrt(allFVals.reduce((a, v) => a + (v - fMean) ** 2, 0) / allFVals.length);

    const corr = pearsonCorrelation(
      data.map((r) => Number(r[feature])).filter((v) => !isNaN(v)),
      targetValues
    );

    const tStd = Math.sqrt(targetValues.reduce((a, v) => a + (v - baseValue) ** 2, 0) / targetValues.length);
    const beta = fStd > 0 ? (corr * tStd) / fStd : 0;
    const shapValue = beta * (fVal - fMean);

    result.push({
      feature,
      value: Math.round(fVal * 1000) / 1000,
      shapValue: Math.round(shapValue * 1000) / 1000,
    });
  }

  return result.sort((a, b) => Math.abs(b.shapValue) - Math.abs(a.shapValue));
}

function emptyShapData(): ShapData {
  return {
    features: [],
    baseValue: 0,
    shapValues: [],
    dependencePlots: [],
    interactionMatrix: [],
    globalImportance: [],
  };
}
