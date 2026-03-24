# Testleaf LLM Evaluation Framework - Architecture & Request Flow

## 📋 Table of Contents
1. [TL;DR](#tldr)
2. [Complete Request Flow Diagram](#complete-request-flow-diagram)
3. [Architecture Overview](#architecture-overview)
4. [Important Impacted Files](#important-impacted-files)
5. [Frontend → Backend → DeepEval Flow](#frontend--backend--deepeval-flow)
6. [Metrics Evaluation Details](#metrics-evaluation-details)
7. [System Architecture Components](#system-architecture-components)

---

## 🎯 TL;DR

**Single Evaluation Flow (Frontend → Backend → DeepEval)**

1. **Frontend User Action**: User fills LLMEvalForm with query, output, context, and selects a metric (faithfulness, answer_relevancy, etc.)
2. **Form Submission**: `handleEvaluate()` calls `evaluateLLM(formState)` 
3. **HTTP Request**: Frontend sends POST to `http://localhost:3002/api/eval-only` with metric & data
4. **Backend Processing**: Backend validates input, builds payload, forwards to DeepEval server
5. **DeepEval Evaluation**: Python service evaluates the metric, returns score, verdict, and explanation
6. **Response**: Backend transforms response to frontend format, returns to UI
7. **Display**: ResponsePanel displays score, verdict, and detailed explanation

**Batch Evaluation Flow**: Same as above but processes multiple rows from Excel/JSON sequentially.

---

## 📊 Complete Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React/TypeScript)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  1. USER INTERACTION (LLMEvalForm.tsx)                                            │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ User fills form:                                                      │    │
│     │  • Metric: 'faithfulness' (dropdown select)                           │    │
│     │  • Query: "What is Salesforce?"                                       │    │
│     │  • Output: "Salesforce is a cloud CRM platform"                       │    │
│     │  • Context: ["Salesforce is a Customer Relationship Management..."]   │    │
│     │  • Expected Output: (optional, for contextual metrics)                │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                                  ▼                                                │
│  2. VALIDATION (validation.ts)                                                    │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ validateForm() checks:                                                │    │
│     │  ✓ Metric is present                                                  │    │
│     │  ✓ Query is not empty                                                 │    │
│     │  ✓ Output required (except for contextual_precision/recall)           │    │
│     │  ✓ Context required (depends on metric)                               │    │
│     │  ✓ Expected output required (for contextual_precision/recall)         │    │
│     │                                                                        │    │
│     │ Returns: FormValidationErrors object (if valid, empty object)         │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                                  ▼ (if valid)                                     │
│  3. API CALL (llmEvalApi.ts → evaluateLLM)                                        │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ evaluateWithDeepEval(formState)                                       │    │
│     │                                                                        │    │
│     │ Builds payload:                                                        │    │
│     │ {                                                                      │    │
│     │   metric: "faithfulness",                                              │    │
│     │   query: "What is Salesforce?",                                        │    │
│     │   output: "Salesforce is a cloud CRM...",                              │    │
│     │   context: ["Salesforce definition..."],                               │    │
│     │   expected_output: undefined                                           │    │
│     │ }                                                                      │    │
│     │                                                                        │    │
│     │ Sets headers:                                                          │    │
│     │  • Content-Type: application/json                                      │    │
│     │  • baseURL: http://localhost:3002                                      │    │
│     │  • timeout: 1200000ms (20 minutes)                                     │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                  ┌───────────────┴────────────────┐                              │
│                  │ HTTP POST                      │                              │
│                  │ /api/eval-only                 │                              │
│                  ▼                                 ▼                              │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                           ⬇️  NETWORK REQUEST  ⬇️
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express.js/TypeScript)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  4. REQUEST ENTRY POINT (index.ts)                                               │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ Express Server ( 3002)                                   │    │
│     │  • Middleware: express.json(), cors()                                 │    │
│     │  • Routing: app.use("/api", evalRoutes)                               │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                                  ▼                                                │
│  5. ROUTE HANDLER (evalRoutes.ts → POST /eval-only)                              │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ Extracts request body:                                                │    │
│     │  const { query, output, context, metric, expected_output } = req.body │    │
│     │                                                                        │    │
│     │ INPUT VALIDATION:                                                     │    │
│     │  ✓ Metric defaults to "answer_relevancy" if not provided              │    │
│     │  ✓ Output is NOT required for metrics:                                │    │
│     │    - contextual_precision                                              │    │
│     │    - contextual_recall                                                 │    │
│     │  ✓ Query required for: pii_leakage, bias, hallucination               │    │
│     │  ✓ Context required for: hallucination                                │    │
│     │  ✓ Expected output for: contextual_precision, contextual_recall       │    │
│     │                                                                        │    │
│     │ PAYLOAD CONSTRUCTION:                                                 │    │
│     │  const evalParams = {                                                 │    │
│     │    metric: effectiveMetric,                                            │    │
│     │    provider: req.body.provider || "groq",                              │    │
│     │    output: output,                                                     │    │
│     │    query: query,                                                       │    │
│     │    context: Array.isArray(context) ? context : [context],              │    │
│     │    expected_output: expected_output                                    │    │
│     │  }                                                                     │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                                  ▼                                                │
│  6. DEEPEVAL CLIENT (evalClient.ts → evalWithFields)                             │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ evalWithFields(params) {                                              │    │
│     │                                                                        │    │
│     │   // Validation                                                        │    │
│     │   if (!metricsNotRequiringOutput.includes(metric) && !output) {        │    │
│     │     throw "output field is required"                                  │    │
│     │   }                                                                    │    │
│     │                                                                        │    │
│     │   // Build payload for DeepEval                                        │    │
│     │   const payload = {                                                   │    │
│     │     metric: "faithfulness",                                            │    │
│     │     query: "What is Salesforce?",                                      │    │
│     │     output: "Salesforce is a cloud CRM...",                            │    │
│     │     context: ["Salesforce definition..."],                             │    │
│     │     expected_output: undefined,  // Only if provided                  │    │
│     │     provider: "groq"                                                  │    │
│     │   }                                                                    │    │
│     │                                                                        │    │
│     │   // HTTP call to DeepEval                                             │    │
│     │   axios.post(DEEPEVAL_URL, payload)                                   │    │
│     │ }                                                                      │    │
│     │                                                                        │    │
│     │ DEEPEVAL_URL: http://localhost:8000/eval (from ENV)                   │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                  ┌───────────────┴────────────────┐                              │
│                  │ HTTP POST (axios)              │                              │
│                  │ http://localhost:8000/eval     │                              │
│                  ▼                                 ▼                              │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                           ⬇️  NETWORK REQUEST  ⬇️
┌─────────────────────────────────────────────────────────────────────────────────┐
│              DEEPEVAL SERVICE (FastAPI/Python on port 8000)                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  7. DEEPEVAL REQUEST HANDLER (deepeval_server.py)                                │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ @app.post("/eval")                                                   │    │
│     │ async def evaluate(request: EvalRequest) -> EvalResponse              │    │
│     │                                                                        │    │
│     │ Receives payload:                                                     │    │
│     │ {                                                                      │    │
│     │   metric: "faithfulness",                                              │    │
│     │   query: "What is Salesforce?",                                        │    │
│     │   output: "Salesforce is a cloud CRM...",                              │    │
│     │   context: ["Salesforce definition..."],                               │    │
│     │   expected_output: null,                                               │    │
│     │   provider: "groq"  // or "openai"                                     │    │
│     │ }                                                                      │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                                  ▼                                                │
│  8. METRIC EVALUATION (MetricEvaluator class)                                    │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ def evaluate(self, metric_name, test_case):                           │    │
│     │                                                                        │    │
│     │ CREATE TEST CASE:                                                     │    │
│     │   LLMTestCase(                                                        │    │
│     │     input="What is Salesforce?",  # the query                         │    │
│     │     actual_output="Salesforce is a cloud CRM...",  # output to eval   │    │
│     │     retrieval_context=["Salesforce definition..."],  # context        │    │
│     │     expected_output=None  # only for contextual metrics               │    │
│     │   )                                                                    │    │
│     │                                                                        │    │
│     │ ROUTE TO METRIC-SPECIFIC EVALUATOR:                                   │    │
│     │  if metric == "faithfulness":                                          │    │
│     │    return evaluate_faithfulness(test_case)                             │    │
│     │  else if metric == "answer_relevancy":                                 │    │
│     │    return evaluate_answer_relevancy(test_case)                        │    │
│     │  else if metric == "contextual_precision":                             │    │
│     │    return evaluate_contextual_precision(test_case)                     │    │
│     │  ... (other metrics)                                                  │    │
│     │                                                                        │    │
│     │ EACH METRIC EVALUATOR:                                                │    │
│     │  • Uses DeepEval's metric class (FaithfulnessMetric, etc.)             │    │
│     │  • Calls metric.measure(test_case)                                    │    │
│     │  • Returns (score, explanation, optional_detail)                      │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
│  9. METRIC DETAILS (Example: Faithfulness)                                       │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ evaluate_faithfulness(test_case):                                     │    │
│     │                                                                        │    │
│     │ • Initialize FaithfulnessMetric with:                                 │    │
│     │   - model: DeepEvalBaseLLM (Groq or OpenAI)                            │    │
│     │   - strict_mode: False  (natural LLM judgment)                         │    │
│     │   - include_reason: True  (get explanation)                            │    │
│     │   - penalize_ambiguous_claims: True                                    │    │
│     │                                                                        │    │
│     │ • DeepEval internally:                                                │    │
│     │   1. Extracts TRUTHS from context (factual statements)                 │    │
│     │   2. Extracts CLAIMS from output (statements to verify)                │    │
│     │   3. Evaluates each claim: "yes" | "no" | "idk"                       │    │
│     │   4. Computes score based on verdicts                                  │    │
│     │      - High score: Most claims supported by context                    │    │
│     │      - Low score: Claims contradict context                            │    │
│     │      - IDK: Ambiguous claims penalize score                            │    │
│     │                                                                        │    │
│     │ • Output:                                                              │    │
│     │   - score: 0.85 (float between 0-1)                                    │    │
│     │   - verdict: "FAITHFUL" | "PARTIAL" | "NOT_FAITHFUL"                  │    │
│     │   - explanation: "Most claims are supported by the context..."        │    │
│     │   - detail: FaithfulnessDetail with individual claim verdicts         │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
│ 10. RESPONSE CONSTRUCTION (deepeval_server.py)                                   │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ return EvalResponse(                                                  │    │
│     │   results: [                                                          │    │
│     │     MetricResult(                                                      │    │
│     │       metric_name="faithfulness",                                      │    │
│     │       score=0.85,                                                      │    │
│     │       verdict="FAITHFUL",                                              │    │
│     │       explanation="8/10 claims supported by context...",               │    │
│     │       error=None                                                       │    │
│     │     )                                                                  │    │
│     │   ],                                                                   │    │
│     │   # Legacy top-level fields for backward compatibility:                │    │
│     │   metric_name="faithfulness",                                          │    │
│     │   score=0.85,                                                          │    │
│     │   explanation="8/10 claims supported by context...",                   │    │
│     │   error=None                                                           │    │
│     │ )                                                                      │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                           ⬅️  RESPONSE TRAVELS BACK  ⬅️
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express.js/TypeScript)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│ 11. BACKEND RESPONSE TRANSFORMATION (evalRoutes.ts)                              │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ // Receive from DeepEval                                              │    │
│     │ const evalResult = {                                                  │    │
│     │   results: [                                                          │    │
│     │     {                                                                  │    │
│     │       metric_name: "faithfulness",                                     │    │
│     │       score: 0.85,                                                     │    │
│     │       verdict: "FAITHFUL",                                             │    │
│     │       explanation: "8/10 claims supported...",                         │    │
│     │       error: null                                                      │    │
│     │     }                                                                  │    │
│     │   ],                                                                   │    │
│     │   metric_name: "faithfulness",                                         │    │
│     │   score: 0.85,                                                         │    │
│     │   explanation: "8/10 claims supported...",                             │    │
│     │   error: null                                                          │    │
│     │ }                                                                      │    │
│     │                                                                        │    │
│     │ // Transform for frontend                                              │    │
│     │ // Extract verdict from results array (if present)                     │    │
│     │ let verdict = undefined                                               │    │
│     │ if (evalResult.results && evalResult.results[0]) {                    │    │
│     │   verdict = evalResult.results[0].verdict  // "FAITHFUL"              │    │
│     │ }                                                                      │    │
│     │                                                                        │    │
│     │ const response = {                                                    │    │
│     │   metric: evalResult.metric_name || effectiveMetric,                  │    │
│     │   score: evalResult.score,                                             │    │
│     │   verdict: verdict,  // "FAITHFUL" (extracted from results array)    │    │
│     │   explanation: evalResult.explanation,                                 │    │
│     │   output: output,  // Echo back input                                 │    │
│     │   query: query,    // Echo back input                                 │    │
│     │   context: context // Echo back input                                 │    │
│     │ }                                                                      │    │
│     │                                                                        │    │
│     │ res.json(response)                                                    │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                  ┌───────────────┴────────────────┐                              │
│                  │ HTTP 200 JSON Response         │                              │
│                  │ /api/eval-only                 │                              │
│                  ▼                                 ▼                              │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                           ⬅️  HTTP RESPONSE RECEIVED  ⬅️
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React/TypeScript)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│ 12. RESPONSE HANDLING (llmEvalApi.ts)                                             │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ const response = await backendInstance.post<LLMEvalResponse>(         │    │
│     │   '/api/eval-only',                                                  │    │
│     │   payload                                                             │    │
│     │ );                                                                    │    │
│     │                                                                        │    │
│     │ console.log('📥 DeepEval Response:', response.data)                   │    │
│     │ return response.data  // LLMEvalResponse type                         │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                                  ▼                                                │
│ 13. STATE UPDATE (LLMEvalForm.tsx → handleEvaluate)                              │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ const result = await evaluateLLM(formState)                           │    │
│     │                                                                        │    │
│     │ // Result object:                                                     │    │
│     │ {                                                                      │    │
│     │   metric: "faithfulness",                                              │    │
│     │   score: 0.85,                                                         │    │
│     │   verdict: "FAITHFUL",                                                 │    │
│     │   explanation: "8/10 claims supported by context",                     │    │
│     │   output: "Salesforce is a cloud CRM...",                              │    │
│     │   query: "What is Salesforce?",                                        │    │
│     │   context: ["Salesforce definition..."]                                │    │
│     │ }                                                                      │    │
│     │                                                                        │    │
│     │ setResponse(result)  // Update React state                             │    │
│     │ setIsLoading(false)  // Stop loading spinner                           │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                                  ▼                                                │
│ 14. DISPLAY (ResponsePanel.tsx)                                                   │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │ if (isLoading) {                                                      │    │
│     │   return <LoadingSpinner>Evaluating...</LoadingSpinner>               │    │
│     │ }                                                                      │    │
│     │                                                                        │    │
│     │ if (!response) {                                                      │    │
│     │   return <Placeholder>Click "Evaluate" to see results</Placeholder>   │    │
│     │ }                                                                      │    │
│     │                                                                        │    │
│     │ // Extract response data                                              │    │
│     │ const score = response.score  // 0.85                                 │    │
│     │ const metricName = response.metric_name || response.metric            │    │
│     │ const explanation = response.explanation                              │    │
│     │ const verdict = response.verdict  // "FAITHFUL"                       │    │
│     │                                                                        │    │
│     │ // Render:                                                            │    │
│     │ <div className="llm-eval-response-panel">                             │    │
│     │   <h3>Response</h3>                                                   │    │
│     │   <div>                                                                │    │
│     │     <strong>Metric:</strong> Faithfulness                             │    │
│     │     <strong>Score:</strong> 0.85 (85%)                                │    │
│     │     <strong>Verdict:</strong> ✓ FAITHFUL                              │    │
│     │     <p className={getVerdictClass("FAITHFUL")}>                       │    │
│     │       {explanation}                                                    │    │
│     │     </p>                                                               │    │
│     │   </div>                                                               │    │
│     │ </div>                                                                │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                  │                                                │
│                                  ▼                                                │
│     ┌──────────────────────────────────────────────────────────────────────┐    │
│     │           ✅ USER SEES EVALUATION RESULT ON SCREEN                    │    │
│     │                                                                        │    │
│     │  ┌─────────────────────────────────────────────────────────────────┐ │    │
│     │  │ Metric: Faithfulness                                            │ │    │
│     │  │ Score: 0.85 (85%)                                               │ │    │
│     │  │ Verdict: ✓ FAITHFUL                                             │ │    │
│     │  │                                                                  │ │    │
│     │  │ Explanation:                                                    │ │    │
│     │  │ "8 out of 10 claims in the output are supported by the         │ │    │
│     │  │ retrieval context. The statement about Salesforce CRM and      │ │    │
│     │  │ cloud platform are well-supported. Minor ambiguity on one      │ │    │
│     │  │ feature claim."                                                 │ │    │
│     │  └─────────────────────────────────────────────────────────────────┘ │    │
│     └──────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture Overview

### Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React + TypeScript | Latest | User interface for evaluation forms |
| **Frontend Build** | Vite | Latest | Module bundling & dev server |
| **Frontend HTTP** | Axios | Latest | HTTP client for API calls |
| **Backend** | Express.js | v4 | Node.js REST API server |
| **Backend Language** | TypeScript | v5 | Type-safe backend code |
| **Backend Port** | Device Port 3002 or 5174 | - | Backend service port |
| **DeepEval Service** | FastAPI + Python | 0.115.0 | LLM metric evaluation engine |
| **DeepEval Port** | Device Port 8000 | - | DeepEval service port |
| **LLM Providers** | OpenAI / Groq | APIs | Model inference for metrics |

### System Architecture

```
┌─────────────────────────┐
│  Frontend (React/TS)    │  Runs on: http://localhost:5173
│  • LLMEvalForm          │  Port: 5173 (Vite dev server)
│  • BatchEvalForm        │
│  • ResponsePanel        │
└────────────┬────────────┘
             │ HTTP (Axios)
             │ POST /api/eval-only
             │ POST /api/batch/evaluate
             │
┌────────────▼────────────┐
│ Backend (Express/TS)    │  Runs on: http://localhost:3002 or 5174
│ • evalRoutes            │  Port: 3002 | 5174 (configurable)
│ • evalClient            │
│ • excelService          │
│ • reportService         │
└────────────┬────────────┘
             │ HTTP (Axios)
             │ POST http://localhost:8000/eval
             │
┌────────────▼────────────┐
│ DeepEval (FastAPI)      │  Runs on: http://localhost:8000
│ • Metric Evaluators     │  Port: 8000
│ • GroqModel             │  Provider: Groq/OpenAI
└────────────┬────────────┘
             │ LLM API Calls
             │ OpenAI / Groq API
             │
┌────────────▼────────────┐
│ LLM Models              │  External Services
│ • gpt-4o-mini (OpenAI)  │  API Keys: Env vars
│ • llama-3.3-70b (Groq)  │
└─────────────────────────┘
```

---

## 📍 Important Impacted Files

### **[CRITICAL] Frontend Components**

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/components/LLMEval/LLMEvalForm.tsx` | Single metric evaluation form | ✅ Active |
| `frontend/src/components/LLMEval/ResponsePanel.tsx` | Display evaluation results | ✅ Active |
| `frontend/src/components/LLMEval/validation.ts` | Form validation logic | ✅ Active |
| `frontend/src/components/LLMEval/types.ts` | TypeScript interfaces | ✅ Active |
| `frontend/src/components/LLMEval/ContextList.tsx` | Context input manager | ✅ Active |
| `frontend/src/services/llmEvalApi.ts` | API client for evaluation | ✅ Active |

### **[CRITICAL] Backend Routes & Services**

| File | Purpose | Status |
|------|---------|--------|
| `backend/src/routes/evalRoutes.ts` | Main API endpoints | ✅ Active |
| `backend/src/services/evalClient.ts` | DeepEval HTTP client | ✅ Active |
| `backend/src/config/env.ts` | Environment configuration | ✅ Active |
| `backend/src/index.ts` | Express server setup | ✅ Active |

### **[CRITICAL] DeepEval Service**

| File | Purpose | Status |
|------|---------|--------|
| `llm-eval-providers/deepeval_server.py` | Metric evaluation engine | ✅ Active |

### **[DEPRECATED] Batch Processing (Still Active)**

| File | Purpose | Status |
|------|---------|--------|
| `backend/src/services/excelService.ts` | Excel file parsing | ✅ Active |
| `backend/src/services/reportService.ts` | Report generation (HTML/Excel) | ✅ Active |
| `frontend/src/components/BatchEval/*` | Batch evaluation UI | ✅ Active |

### **[REMOVED] Unused Files**

| File | Reason |
|------|--------|
| `backend/src/services/llmClient.ts` | ❌ RAGAS provider - removed |
| `backend/src/services/ragService.ts` | ❌ RAGAS context retrieval - removed |
| `frontend/src/styles/provider-toggle.css` | ❌ Multi-provider UI - removed |

---

## 🔄 Frontend → Backend → DeepEval Flow

### **Phase 1: User Input & Form Submission**

```typescript
// File: frontend/src/components/LLMEval/LLMEvalForm.tsx
const handleEvaluate = async () => {
  setApiError(null);
  setResponse(null);

  // Step 1: Validate form
  const validationErrors = validateForm(formState);  // from validation.ts
  setErrors(validationErrors);

  if (!isFormValid(validationErrors)) {
    return;  // Early exit if validation fails
  }

  setIsLoading(true);

  try {
    // Step 2: Call API service
    console.log('📊 Starting LLM evaluation with DeepEval...');
    const result = await evaluateLLM(formState);  // from llmEvalApi.ts
    console.log('✅ LLM Evaluation successful:', result);
    
    // Step 3: Update UI with results
    setResponse(result);
  } catch (error) {
    const err = error as ApiError;
    console.error('❌ LLM Evaluation error:', err);
    setApiError(err);
  } finally {
    setIsLoading(false);
  }
};
```

### **Phase 2: Frontend Form Validation**

```typescript
// File: frontend/src/components/LLMEval/validation.ts
export const validateForm = (formData: FormState): FormValidationErrors => {
  const errors: FormValidationErrors = {};

  // Metric required
  if (!formData.metric) {
    errors.metric = 'Metric is required';
  }

  // Query always required
  if (!formData.query || !formData.query.trim()) {
    errors.query = 'Query is required';
  }

  // Output NOT required for some metrics
  const metricsNotRequiringOutput = ['contextual_precision', 'contextual_recall'];
  if (!metricsNotRequiringOutput.includes(formData.metric)) {
    if (!formData.output || !formData.output.trim()) {
      errors.output = 'Output is required';
    }
  }

  // Context required for some metrics
  const metricsRequiringContext = [
    'faithfulness',
    'contextual_precision',
    'contextual_recall',
    'hallucination'
  ];
  if (metricsRequiringContext.includes(formData.metric)) {
    const validContexts = formData.context.filter(
      (ctx) => ctx && ctx.trim().length > 0
    );
    if (validContexts.length === 0) {
      errors.context = 'At least one context item is required';
    }
  }

  // Expected output required for contextual metrics
  if (
    formData.metric === 'contextual_precision' ||
    formData.metric === 'contextual_recall'
  ) {
    if (!formData.expected_output || !formData.expected_output.trim()) {
      errors.expected_output = `Expected output is required for ${formData.metric}`;
    }
  }

  return errors;
};
```

### **Phase 3: HTTP Request to Backend**

```typescript
// File: frontend/src/services/llmEvalApi.ts
export const evaluateWithDeepEval = async (
  formData: FormState
): Promise<LLMEvalResponse> => {
  try {
    // Build payload from form data
    const payload = {
      metric: formData.metric,
      query: formData.query,
      output: formData.output,
      context: formData.context.filter((ctx) => ctx.trim().length > 0),
      expected_output: formData.expected_output,
    };

    console.log('📤 DeepEval Request:', payload);

    // AXIOS HTTP CALL TO BACKEND
    // baseURL: http://localhost:3002
    // endpoint: /api/eval-only
    // method: POST
    const response = await backendInstance.post<LLMEvalResponse>(
      '/api/eval-only',
      payload
    );

    console.log('📥 DeepEval Response:', response.data);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{
      message?: string;
      error?: string;
      detail?: string;
    }>;

    console.error('❌ DeepEval Error:', axiosError);

    const apiError: ApiError = {
      message: 'Failed to evaluate with DeepEval',
      status: axiosError.response?.status,
      details: axiosError.response?.data?.detail || axiosError.message,
    };

    throw apiError;
  }
};

export const evaluateLLM = async (
  formData: FormState
): Promise<LLMEvalResponse> => {
  return evaluateWithDeepEval(formData);
};
```

**HTTP Request Details:**
```
POST http://localhost:3002/api/eval-only
Content-Type: application/json
Timeout: 1200000ms (20 minutes)

Body:
{
  "metric": "faithfulness",
  "query": "What is Salesforce?",
  "output": "Salesforce is a cloud CRM platform",
  "context": ["Salesforce is a customer relationship management cloud..."],
  "expected_output": undefined
}
```

---

### **Phase 4: Backend Route Handler**

```typescript
// File: backend/src/routes/evalRoutes.ts
router.post('/eval-only', asyncHandler(async (req: Request, res: Response) => {
  const { query, output, context, metric, expected_output } = req.body;

  // Step 1: Determine effective metric (default to answer_relevancy)
  const effectiveMetric = metric || 'answer_relevancy';

  // Step 2: VALIDATION
  const metricsNotRequiringOutput = [
    'contextual_precision',
    'contextual_recall'
  ];

  if (!metricsNotRequiringOutput.includes(effectiveMetric) && !output) {
    return res.status(400).json({
      error: 'Missing required field: output'
    });
  }

  if (effectiveMetric === 'hallucination' && !query) {
    return res.status(400).json({
      error: 'Missing required field: query (required for hallucination metric)'
    });
  }

  if (effectiveMetric === 'hallucination' && !context) {
    return res.status(400).json({
      error: 'Missing required field: context (required for hallucination metric)'
    });
  }

  try {
    // Step 3: Build evaluation parameters
    const evalParams: any = {
      metric: effectiveMetric,
      provider: req.body.provider || 'groq', // Default to groq
      output: output
    };

    if (query) evalParams.query = query;
    if (context) {
      evalParams.context = Array.isArray(context) ? context : [context];
    }
    if (expected_output) evalParams.expected_output = expected_output;

    console.log(`DeepEval - Metric: ${effectiveMetric}`);
    console.log(`DeepEval - Full evalParams:`, JSON.stringify(evalParams, null, 2));

    // Step 4: Call DeepEval service
    const evalResult = await evalWithFields(evalParams);

    console.log('DeepEval Raw Response:', JSON.stringify(evalResult, null, 2));

    // Step 5: Extract verdict from results array (if present)
    let verdict: string | undefined = undefined;

    if (
      evalResult.results &&
      Array.isArray(evalResult.results) &&
      evalResult.results.length > 0
    ) {
      const firstResult = evalResult.results[0];
      verdict = firstResult.verdict;
      console.log('✓ Extracted verdict from results[0]:', verdict);
    }

    // Step 6: Transform response for frontend
    const response: any = {
      metric: evalResult.metric_name || effectiveMetric,
      score: evalResult.score,
      verdict: verdict, // "FAITHFUL", "NOT_FAITHFUL", etc.
      explanation: evalResult.explanation,
      output: output
    };

    if (query) response.query = query;
    if (evalParams.context) response.context = evalParams.context;

    console.log('Backend Response being sent:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('DeepEval evaluation error:', error);
    res.status(500).json({
      error: 'DeepEval evaluation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));
```

---

### **Phase 5: Backend calls DeepEval Service**

```typescript
// File: backend/src/services/evalClient.ts
export async function evalWithFields(params: {
  query?: string;
  context?: string[];
  output?: string;
  expected_output?: string;
  metric?: string;
  provider?: string;
}): Promise<EvalResult> {
  const payload: any = {
    metric: params.metric || 'faithfulness'
  };

  // Validation
  const metricsNotRequiringOutput = [
    'contextual_precision',
    'contextual_recall'
  ];
  const metricName = params.metric || 'faithfulness';

  if (!metricsNotRequiringOutput.includes(metricName) && !params.output) {
    throw new Error('output field is required');
  }

  // Build payload
  if (params.output) payload.output = params.output;
  if (params.query) payload.query = params.query;
  if (params.context) payload.context = params.context;
  if (params.expected_output) payload.expected_output = params.expected_output;
  if (params.provider) payload.provider = params.provider;

  console.log(`evalWithFields - Sending payload:`, JSON.stringify(payload, null, 2));

  try {
    // HTTP call to DeepEval service
    // axios.post(DEEPEVAL_URL: "http://localhost:8000/eval", payload)
    const res = await axios.post<EvalResult>(ENV.DEEPEVAL_URL, payload);
    return res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if ((err as any).code === 'ECONNREFUSED') {
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
```

**HTTP Request to DeepEval:**
```
POST http://localhost:8000/eval
Content-Type: application/json

Body:
{
  "metric": "faithfulness",
  "query": "What is Salesforce?",
  "output": "Salesforce is a cloud CRM platform",
  "context": ["Salesforce is a customer relationship management cloud..."],
  "provider": "groq"
}
```

---

### **Phase 6: DeepEval Metric Evaluation**

```python
# File: llm-eval-providers/deepeval_server.py
@app.post("/eval")
async def evaluate(request: EvalRequest) -> EvalResponse:
    """
    Main evaluation endpoint
    Receives: metric, query, output, context, expected_output, provider
    Returns: EvalResponse with results array
    """
    
    # Step 1: Get evaluator
    evaluator = MetricEvaluator(
        api_key=os.getenv(f"{provider.upper()}_API_KEY"),
        model_name=model_name,
        use_groq=(provider == "groq"),
        idk_handling="count"  # Count IDK verdicts in faithfulness
    )

    # Step 2: Create test case for DeepEval
    test_case = evaluator.create_test_case(
        query=request.query,
        context=request.context,
        output=request.output,
        expected_output=request.expected_output
    )

    # LLMTestCase {
    #   input: "What is Salesforce?",
    #   actual_output: "Salesforce is a cloud CRM platform",
    #   retrieval_context: ["Salesforce definition..."],
    #   expected_output: None
    # }

    # Step 3: Route to metric evaluator
    metric_name = request.metric.lower()

    if metric_name == "faithfulness":
        score, explanation, detail = evaluator.evaluate_faithfulness(test_case)
        
    elif metric_name == "answer_relevancy":
        score, explanation = evaluator.evaluate_answer_relevancy(test_case)
        detail = None
        
    elif metric_name == "contextual_precision":
        score, explanation = evaluator.evaluate_contextual_precision(test_case)
        detail = None
        
    elif metric_name == "contextual_recall":
        score, explanation = evaluator.evaluate_contextual_recall(test_case)
        detail = None
        
    elif metric_name == "pii_leakage":
        score, explanation = evaluator.evaluate_pii_leakage(test_case)
        detail = None
        
    elif metric_name == "bias":
        score, explanation = evaluator.evaluate_bias(test_case)
        detail = None
        
    elif metric_name == "hallucination":
        score, explanation = evaluator.evaluate_hallucination(test_case)
        detail = None

    # Step 4: Generate verdict based on metric type and score
    verdict = get_verdict_for_metric(request.metric, score)
    # e.g., faithfulness: score 0.85 -> "FAITHFUL"

    # Step 5: Build response
    metric_result = MetricResult(
        metric_name=request.metric,
        score=score,
        verdict=verdict,
        explanation=explanation,
        error=None,
        detail=detail  # For faithfulness
    )

    response = EvalResponse(
        results=[metric_result],
        # Legacy fields for backward compatibility
        metric_name=request.metric,
        score=score,
        explanation=explanation,
        error=None
    )

    return response
```

---

### **Phase 7: Metrics Evaluation (DeepEval Internals)**

#### **Faithfulness Example:**

```python
def evaluate_faithfulness(self, test_case) -> tuple[float, str, Optional[FaithfulnessDetail]]:
    """
    Enhanced DeepEval faithfulness with IDK verdict support:
    - Extracts truths from context
    - Extracts claims from output
    - Evaluates each claim: "yes" | "no" | "idk"
    """
    from deepeval.metrics.faithfulness.faithfulness import FaithfulnessMetric

    # Create DeepEval metric instance
    metric = FaithfulnessMetric(
        model=self.model,              # Groq or OpenAI LLM
        include_reason=True,           # Generate explanation
        async_mode=False,              # Synchronous
        strict_mode=False,             # Natural judgment, not hard clamp
        penalize_ambiguous_claims=True # IDK claims affect score
    )

    # INPUT TEST CASE:
    # {
    #   input: "What is Salesforce?",
    #   actual_output: "Salesforce is a cloud CRM platform",
    #   retrieval_context: [
    #     "Salesforce is a customer relationship management (CRM) cloud platform..."
    #   ],
    #   expected_output: None
    # }

    # Call DeepEval's measure() method
    # DeepEval internally:
    #   1. Uses LLM to extract TRUTHS from context:
    #      - "Salesforce is a customer relationship management platform"
    #      - "Salesforce is a cloud platform"
    #   2. Uses LLM to extract CLAIMS from output:
    #      - "Salesforce is a cloud CRM platform"
    #   3. For each claim, evaluates against truths:
    #      - Verdict: "yes" (supported), "no" (contradicts), "idk" (ambiguous)
    score = metric.measure(test_case)

    # OUTPUT: score between 0 and 1
    # 0.85 means 85% of claims are supported
    #
    # Score calculation:
    # - Each "yes" verdict: +1
    # - Each "no" verdict: 0 (contradicts)
    # - Each "idk" verdict: penalized (counts negative because ambiguous)
    # Final: sum(positive_verdicts) / total_claims

    explanation = metric.reason or "Faithfulness (DeepEval core)."
    # explanation = "8/10 claims in the output are supported by the context..."

    # Extract claim-level details
    if hasattr(metric, 'verdicts') and hasattr(metric, 'claims'):
        claim_verdicts = []
        yes_count = 0
        no_count = 0
        idk_count = 0

        for claim, verdict_obj in zip(metric.claims, metric.verdicts):
            verdict_str = verdict_obj.verdict.strip().lower()
            reason = verdict_obj.reason

            if verdict_str == "yes":
                yes_count += 1
            elif verdict_str == "no":
                no_count += 1
            elif verdict_str == "idk":
                idk_count += 1

            claim_verdicts.append(ClaimVerdict(
                claim=claim,
                verdict=verdict_str,
                reason=reason
            ))

        detail = FaithfulnessDetail(
            truths=metric.truths,  # Extracted from context
            claims=metric.claims,  # Extracted from output
            verdicts=claim_verdicts,  # Verdict for each claim
            idk_count=idk_count,
            yes_count=yes_count,
            no_count=no_count
        )

    return score, explanation, detail
```

---

### **Phase 8: Response Back Through Stack**

```
DeepEval Server (port 8000)
  ↓ HTTP 200 JSON
Backend evalClient (evalClient.ts)
  ↓ Returns EvalResult
Backend Route Handler (evalRoutes.ts)
  ↓ Transforms & sends HTTP 200
Frontend API Service (llmEvalApi.ts)
  ↓ Returns LLMEvalResponse
Frontend Form Handler (LLMEvalForm.tsx)
  ↓ setResponse(result)
Frontend Display (ResponsePanel.tsx)
  ↓ Renders result to user
```

**Response Object Structure:**

```typescript
// Frontend receives this from backend:
interface LLMEvalResponse {
  metric: string;           // "faithfulness"
  score: number;            // 0.85
  verdict: string;          // "FAITHFUL"
  explanation: string;      // "8/10 claims supported..."
  output?: string;          // Echoed from request
  query?: string;           // Echoed from request
  context?: string[];       // Echoed from request
}
```

---

## 📊 Metrics Evaluation Details

### **Supported Metrics**

| Metric | What It Measures | Required Fields | DeepEval Internals |
|--------|------------------|-----------------|-------------------|
| **faithfulness** | Is output faithful to context? | query, output, context | Extracts truths from context, claims from output, verifies each claim |
| **answer_relevancy** | Is output relevant to query? | query, output | Evaluates if output answers the query appropriately |
| **contextual_precision** | Are retrieved contexts relevant? | query, context, expected_output | Checks if context items are ranked correctly (relevant ranked higher) |
| **contextual_recall** | Does context contain info to answer? | query, context, expected_output | Verifies context has enough information to answer query |
| **pii_leakage** | Does output leak PII? | query, output | Scans output for personally identifiable information |
| **bias** | Is output biased? | query, output | Detects bias/fairness issues in output |
| **hallucination** | Does output hallucinate? | query, output, context | Detects false information not in context |

### **Metric Evaluation Flow (Example: Answer Relevancy)**

```
User Input:
  query: "What features does Salesforce have?"
  output: "Salesforce features include CRM, Marketing Cloud, and Service Cloud"

DeepEval AnswerRelevancyMetric Flow:
  1. Create LLMTestCase from input
  2. Send to AnswerRelevancyMetric.measure(test_case)
  3. DeepEval uses LLM to evaluate:
     - Does the output directly answer the query?
     - Is the response logically relevant?
     - Is the tone and context appropriate?
  4. Returns score 0-1 (higher = more relevant)
  5. Generate verdict:
     - score >= 0.75: "RELEVANT"
     - 0.3 <= score < 0.75: "PARTIAL"
     - score < 0.3: "NOT_RELEVANT"

Output:
  score: 0.88
  verdict: "RELEVANT"
  explanation: "The output directly addresses the query by listing key Salesforce features..."
```

---

## 🔧 System Architecture Components

### **Environment Configuration**

```typescript
// backend/src/config/env.ts

export const ENV = {
  PORT: process.env.PORT || 5174,              // Backend port
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,  // For GPT models
  GROQ_API_KEY: process.env.GROQ_API_KEY,      // For Groq models
  DEEPEVAL_URL: process.env.DEEPEVAL_URL || 
                "http://localhost:8000/eval"  // DeepEval service
};
```

**Environment Variables Required:**
```bash
# Backend config
PORT=3002                          # or 5174
DEEPEVAL_URL=http://localhost:8000/eval

# LLM Provider Keys
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk-...
```

### **Frontend Configuration**

```typescript
// frontend/src/services/llmEvalApi.ts

const BACKEND_URL = 'http://localhost:3002';

const backendInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 1200000,  // 20 minutes
  headers: {
    'Content-Type': 'application/json',
  },
});
```

---

## 🚀 Starting the System

### **1. Start DeepEval Service**
```bash
cd llm-eval-providers
python deepeval_server.py
# Runs on: http://localhost:8000
```

### **2. Start Backend Server**
```bash
cd backend
npm install
npm run dev
# Runs on: http://localhost:3002 (or port from ENV.PORT)
```

### **3. Start Frontend Dev Server**
```bash
cd frontend
npm install
npm run dev
# Runs on: http://localhost:5173
```

### **4. Access the Application**
```
http://localhost:5173
```

---

## ✅ Request Validation Matrix

### **FormState Validation (Frontend)**

| Metric | Query | Output | Context | Expected Output |
|--------|-------|--------|---------|-----------------|
| faithfulness | ✅ | ✅ | ✅ | ❌ |
| answer_relevancy | ✅ | ✅ | ❌ | ❌ |
| contextual_precision | ✅ | ❌ | ✅ | ✅ |
| contextual_recall | ✅ | ❌ | ✅ | ✅ |
| pii_leakage | ✅ | ✅ | ❌ | ❌ |
| bias | ✅ | ✅ | ❌ | ❌ |
| hallucination | ✅ | ✅ | ✅ | ❌ |

---

## 🔐 Error Handling

### **Frontend Error Handling**
```typescript
// llmEvalApi.ts
catch (error) {
  const axiosError = error as AxiosError;
  const apiError: ApiError = {
    message: 'Failed to evaluate with DeepEval',
    status: axiosError.response?.status,
    details: axiosError.response?.data?.detail || axiosError.message,
  };
  throw apiError;
}

// LLMEvalForm.tsx
catch (error) {
  const err = error as ApiError;
  console.error('❌ LLM Evaluation error:', err);
  setApiError(err);  // Display to user
}
```

### **Backend Error Handling**
```typescript
// evalRoutes.ts
catch (error) {
  console.error('DeepEval evaluation error:', error);
  res.status(500).json({
    error: 'DeepEval evaluation failed',
    details: error instanceof Error ? error.message : 'Unknown error'
  });
}

// evalClient.ts
if ((err as any).code === 'ECONNREFUSED') {
  throw new Error(
    `DeepEval service unavailable at ${ENV.DEEPEVAL_URL}.`
  );
}
```

### **DeepEval Error Handling**
```python
# deepeval_server.py
try:
    score = metric.measure(test_case)
    explanation = metric.reason
except Exception as e:
    logger.error(f"Metric evaluation error: {str(e)}")
    return MetricResult(
        metric_name=request.metric,
        score=None,
        verdict=None,
        explanation=None,
        error=str(e)
    )
```

---

## 📈 Performance Optimization

### **Frontend**
- **Timeout**: 20 minutes (1200000ms) for long evaluations
- **Loading State**: Spinner shown during evaluation
- **Error Display**: User-friendly error messages in UI

### **Backend**
- **Async Route Handlers**: Non-blocking request processing
- **Validation Before Forwarding**: Reduces unnecessary DeepEval calls
- **Streaming Support**: Can handle large context arrays

### **DeepEval**
- **Async Mode**: Can process multiple requests concurrently
- **LLM Caching**: May cache embeddings/evaluations (implementation-dependent)
- **Strict Mode**: False (natural LLM judgment, faster than strict verification)

---

## 🧪 Testing the Complete Flow

### **cURL Example - Single Evaluation**
```bash
curl -X POST http://localhost:3002/api/eval-only \
  -H "Content-Type: application/json" \
  -d '{
    "metric": "faithfulness",
    "query": "What is Salesforce?",
    "output": "Salesforce is a cloud CRM platform",
    "context": ["Salesforce is a customer relationship management cloud platform"],
    "provider": "groq"
  }'
```

**Expected Response:**
```json
{
  "metric": "faithfulness",
  "score": 0.85,
  "verdict": "FAITHFUL",
  "explanation": "The output is faithful to the provided context...",
  "query": "What is Salesforce?",
  "output": "Salesforce is a cloud CRM platform",
  "context": ["Salesforce is a customer relationship management cloud platform"]
}
```

---

## 📝 Batch Evaluation Flow

### **Similar but for Multiple Rows**

1. **User uploads Excel file** (ExcelUpload.tsx)
2. **Frontend parses sheets** (JsonConverter.tsx)
3. **User selects sheet & metric column** (DatasetPreview.tsx)
4. **Backend receives batch data** (POST /batch/evaluate)
5. **Backend processes row-by-row**:
   - For each row, extract metric, query, output, context, expected_output
   - Call evalWithFields() for each row
   - Collect results
6. **Return results array** (BatchEvaluationResults.tsx)
7. **Generate & download report** (ReportGenerator.tsx)

---

## 🎯 Summary

This architecture implements a **three-tier LLM evaluation system**:

1. **Frontend Tier**: React form for user input, submits to backend API
2. **Backend Tier**: Express validation & routing, forwards to DeepEval service
3. **DeepEval Tier**: Python FastAPI service performing actual metric evaluations

The **request-response cycle** is fully type-safe with TypeScript interfaces, includes comprehensive error handling, and supports both single and batch evaluations.

All metrics use DeepEval's built-in LLM-based evaluation engine with Groq or OpenAI models, providing intelligent, context-aware scoring of LLM outputs.
