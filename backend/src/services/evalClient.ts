import axios from "axios";
import { ENV } from "../config/env.js";

export interface MetricResult {
  metric_name: string;
  score?: number;
  verdict?: string;
  explanation?: string;
  error?: string;
}

export interface EvalResult {
  results: MetricResult[];
  metric_name?: string;
  score?: number;
  verdict?: string;
  explanation?: string;
  error?: string;
}

/**
 * Evaluate with full control over all fields
 */
export async function evalWithFields(params: {
  query?: string;
  context?: string[];
  output?: string;
  expected_output?: string;
  metric?: string;
  provider?: string;
}): Promise<EvalResult> {
  const payload: any = {
    metric: params.metric || "faithfulness",
  };

  // Contextual metrics (contextual_precision, contextual_recall) do not require output
  // They evaluate context quality based on expected_output
  const metricsNotRequiringOutput = ["contextual_precision", "contextual_recall"];
  const metricName = params.metric || "faithfulness";
  
  // For "all" metric, skip this validation - let Python handle it
  if (metricName !== "all" && !metricsNotRequiringOutput.includes(metricName) && !params.output) {
    throw new Error("output field is required");
  }
  
  // Only include output if it's provided
  if (params.output) {
    payload.output = params.output;
  }

  if (params.query) payload.query = params.query;
  if (params.context) payload.context = params.context;
  if (params.expected_output) payload.expected_output = params.expected_output;  // NEW: Pass expected_output
  if (params.provider) payload.provider = params.provider;

  console.log(`evalWithFields - Sending payload:`, JSON.stringify(payload, null, 2));

  try {
    const res = await axios.post<EvalResult>(ENV.DEEPEVAL_URL, payload);
    return res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if ((err as any).code === "ECONNREFUSED") {
        throw new Error(
          `DeepEval service unavailable at ${ENV.DEEPEVAL_URL}. Is it running?`
        );
      }
      const errorDetail = err.response?.data?.detail || err.message;
      throw new Error(
        `DeepEval Error (${err.response?.status || 'unknown'}): ${errorDetail}`
      );
    }
    throw err;
  }
}

