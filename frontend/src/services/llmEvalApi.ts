import axios, { AxiosError } from 'axios';
import { FormState, LLMEvalResponse, ApiError } from '../components/LLMEval/types';

const BACKEND_URL = 'http://localhost:3002';

const backendInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 1200000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Evaluate using DeepEval provider
 */
export const evaluateWithDeepEval = async (formData: FormState): Promise<LLMEvalResponse> => {
  try {
    const payload = {
      metric: formData.metric,
      query: formData.query,
      output: formData.output,
      context: formData.context.filter((ctx) => ctx.trim().length > 0),
      expected_output: formData.expected_output, // Required for contextual_recall
    };

    console.log('📤 DeepEval Request:', payload);

    // Route through backend for clean response (without results array)
    const response = await backendInstance.post<LLMEvalResponse>(
      '/api/eval-only',
      payload
    );

    console.log('📥 DeepEval Response:', response.data);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string; error?: string; detail?: string }>;

    console.error('❌ DeepEval Error:', axiosError);

    const apiError: ApiError = {
      message: 'Failed to evaluate with DeepEval',
      status: axiosError.response?.status,
      details:
        axiosError.response?.data?.detail ||
        axiosError.response?.data?.message ||
        axiosError.response?.data?.error ||
        axiosError.message,
    };

    throw apiError;
  }
};

/**
 * Universal LLM evaluation function - uses DeepEval provider
 */
export const evaluateLLM = async (formData: FormState): Promise<LLMEvalResponse> => {
  return evaluateWithDeepEval(formData);
};
