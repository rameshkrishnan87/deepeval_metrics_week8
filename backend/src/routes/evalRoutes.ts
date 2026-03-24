import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { evalWithFields } from "../services/evalClient.js";
import { parseExcelFile } from "../services/excelService.js";
import { generateHTMLReport, generateExcelReport } from "../services/reportService.js";

/*multer is used for handling file uploads in the /batch/upload-excel endpoint.
It saves uploaded files to a temporary directory and provides file information in the request object for further processing. In this code, we configure multer to only accept Excel files and store them in an 'uploads' directory. After processing the file, we also ensure that the temporary file is deleted to prevent clutter and save storage space.*/
const router = Router();

/**
 * Error handler middleware for async routes
 */
const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

/**
 * GET /health
 * Health check endpoint
 */
router.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /eval-only
 * DeepEval evaluation endpoint 
 * Request body:
 * {
 *   query?: string - the input question,
 *   output?: string - the response to evaluate (required for most metrics, NOT required for contextual_precision and contextual_recall),
 *   context?: string | string[] - context for faithfulness evaluation
 *   expected_output?: string - reference/expected answer (required for contextual_precision and contextual_recall),
 *   metric?: string (optional, defaults to 'answer_relevancy')
 * }
 *
 * Response:
 * {
 *   metric: string,
 *   score: number,
 *   verdict: string,
 *   explanation: string,
 *   query?: string,
 *   output?: string (not included for contextual metrics),
 *   context?: string[]
 * }
 */
router.post(
  "/eval-only",
  asyncHandler(async (req: Request, res: Response) => {
    const { query, output, context, metric, expected_output } = req.body;

    // Validation
    // Output is NOT required for contextual_precision and contextual_recall (context quality metrics)
    const effectiveMetric = metric || "answer_relevancy";
    const metricsNotRequiringOutput = ["contextual_precision", "contextual_recall"];
    
    if (!metricsNotRequiringOutput.includes(effectiveMetric) && !output) {
      return res.status(400).json({
        error: "Missing required field: output"
      });
    }
    if (effectiveMetric === "pii_leakage" && !query) {
      return res.status(400).json({
        error: "Missing required field: query (required for pii_leakage metric)"
      });
    }
    if (effectiveMetric === "bias" && !query) {
      return res.status(400).json({
        error: "Missing required field: query (required for bias metric)"
      });
    }
    if (effectiveMetric === "hallucination" && !query) {
      return res.status(400).json({
        error: "Missing required field: query (required for hallucination metric)"
      });
    }
    if (effectiveMetric === "hallucination" && !context) {
      return res.status(400).json({
        error: "Missing required field: context (required for hallucination metric)"
      });
    }
    if (effectiveMetric === "hallucination" && Array.isArray(context) && context.length === 0) {
      return res.status(400).json({
        error: "Context cannot be empty for hallucination metric (requires at least one context item)"
      });
    }

    try {
      // Build evaluation parameters
      const evalParams: any = {
        metric: effectiveMetric,
        provider: req.body.provider || "groq",  // Use provider from request, default to groq
        output: output
      };

      if (query) evalParams.query = query;
      if (context) evalParams.context = Array.isArray(context) ? context : [context];
      if (expected_output) evalParams.expected_output = expected_output;

      console.log(`DeepEval - Metric: ${effectiveMetric}`);
      console.log(`DeepEval - Full evalParams:`, JSON.stringify(evalParams, null, 2));
      if (query) console.log(`Query: ${query.substring(0, 80)}...`);
      if (output) console.log(`Output: ${output.substring(0, 80)}...`);
      if (context) console.log(`Context:`, JSON.stringify(context, null, 2));

      // Evaluate using DeepEval
      const evalResult = await evalWithFields(evalParams);

      console.log("DeepEval Raw Response:", JSON.stringify(evalResult, null, 2));

      // Handle "all" metrics - return all results, otherwise return single metric result
      if (effectiveMetric.toLowerCase() === "all" && evalResult.results && Array.isArray(evalResult.results)) {
        // For "all" metrics, return the complete results array
        console.log(`✓ Returning all ${evalResult.results.length} metrics`);
        const response: any = {
          metric: "all",
          allMetrics: true,
          totalMetrics: evalResult.results.length,
          results: evalResult.results,
          output: output
        };

        if (query) response.query = query;
        if (evalParams.context) response.context = evalParams.context;

        console.log("Backend Response being sent to frontend:", JSON.stringify(response, null, 2));
        res.json(response);
      } else {
        // For single metric, extract the first result
        // The Python API returns: { results: [...], metric_name, score, explanation }
        // Extract verdict from results array (it's not at top level)
        let verdict: string | undefined = undefined;
        
        if (evalResult.results && Array.isArray(evalResult.results) && evalResult.results.length > 0) {
          const firstResult = evalResult.results[0];
          verdict = firstResult.verdict;
          console.log("✓ Extracted verdict from results[0]:", verdict);
        }

        // Return in same format as RAGAS for frontend consistency
        const response: any = {
          metric: evalResult.metric_name || effectiveMetric,
          score: evalResult.score,
          verdict: verdict,  // Include verdict from results array
          explanation: evalResult.explanation,
          output: output
        };

        if (query) response.query = query;
        if (evalParams.context) response.context = evalParams.context;

        console.log("Backend Response being sent to frontend:", JSON.stringify(response, null, 2));
        res.json(response);
      }

    } catch (error) {
      console.error("DeepEval evaluation error:", error);
      res.status(500).json({
        error: "DeepEval evaluation failed",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  })
);

/**
 * POST /batch/upload-excel
 * Upload and parse Excel file for batch evaluation
 * 
 * Request: multipart/form-data with Excel file
 * Response: {
 *   fileName: string,
 *   sheetNames: string[],
 *   datasets: {
 *     sheetName: string,
 *     data: object[],
 *     rowCount: number,
 *     columnNames: string[]
 *   }[],
 *   totalDatasets: number
 * }
 */
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  fileFilter: (req, file, cb) => {
    // Only accept Excel files
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
});

router.post(
  '/batch/upload-excel',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please upload an Excel file',
      });
    }

    try {
      console.log(`📁 Processing Excel file: ${req.file.originalname}`);
      
      // Parse the Excel file
      const parseResult = await parseExcelFile(req.file.path);
      
      console.log(`✅ Successfully parsed Excel file with ${parseResult.totalDatasets} total datasets`);
      console.log(`📊 Sheets: ${parseResult.sheetNames.join(', ')}`);

      // Clean up temporary file after parsing
      setTimeout(() => {
        fs.unlink(req.file!.path, (err) => {
          if (err) console.warn('⚠️ Failed to delete temp file:', err);
        });
      }, 1000);

      res.json({
        success: true,
        ...parseResult,
      });
    } catch (error) {
      console.error('❌ Error parsing Excel file:', error);
      
      // Clean up file on error
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.warn('⚠️ Failed to delete temp file:', err);
        });
      }

      res.status(500).json({
        error: 'Failed to parse Excel file',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

/**
 * POST /batch/evaluate
 * Run batch evaluation on JSON dataset using metric from each row
 * 
 * Request body:
 * {
 *   jsonData: object[] - array of records from JSON conversion,
 *   metricColumn?: string - name of column containing metric (defaults to "Metrics"),
 *   provider?: string - optional provider override (defaults to "groq")
 * }
 * 
 * Each record should have a "Metrics" column with one of:
 * - faithfulness, answer_relevancy, contextual_precision, contextual_recall, 
 *   pii_leakage, bias, hallucination
 * 
 * Response: {
 *   success: boolean,
 *   totalRecords: number,
 *   successCount: number,
 *   errorCount: number,
 *   metricsUsed: string[] - unique metrics used,
 *   results: {
 *     rowIndex: number,
 *     originalData: object,
 *     metric_name: string,
 *     score: number,
 *     verdict?: string,
 *     explanation?: string,
 *     error?: string
 *   }[]
 * }
 */
router.post(
  '/batch/evaluate',
  asyncHandler(async (req: Request, res: Response) => {
    const { jsonData, metricColumn = 'Metrics', provider = 'groq' } = req.body;

    // Validation
    if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'jsonData must be a non-empty array'
      });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;
    const metricsUsed = new Set<string>();

    console.log(`🔄 Starting batch evaluation using "${metricColumn}" column`);
    console.log(`📊 Processing ${jsonData.length} records...`);

    // Helper function to check if a value is "NA" or empty
    const isNA = (value: any): boolean => {
      if (value === null || value === undefined) return true;
      if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        return trimmed === 'na' || trimmed === 'n/a' || trimmed === '' || trimmed === 'none';
      }
      return false;
    };

    // Helper to get metric from record, with default fallback
    const getMetric = (record: any): string => {
      const metricValue = record[metricColumn];
      if (metricValue && !isNA(metricValue)) {
        // Normalize metric name: lowercase, trim, consolidate spaces+underscores into single underscore
        return String(metricValue)
          .toLowerCase()
          .trim()
          .replace(/[\s_]+/g, '_'); // Replace all whitespace AND multiple underscores with single underscore
      }
      return 'answer_relevancy'; // Default metric if not specified or NA
    };

    // Process each record
    for (let i = 0; i < jsonData.length; i++) {
      const record = jsonData[i];
      
      try {
        // Get metric for this row
        const metric = getMetric(record);
        metricsUsed.add(metric);

        console.log(`Row ${i + 1}: Metric from record = "${metric}"`, {
          metricsColumn: record[metricColumn],
          allMetricsColumns: Object.keys(record).filter(k => k.toLowerCase().includes('metric'))
        });

        // Build evaluation parameters - only include non-NA fields
        const evalParams: any = {
          metric,
          provider,
        };

        // Extract relevant fields based on metric requirements
        if (record.query && !isNA(record.query)) {
          evalParams.query = record.query;
        }

        if (record.output && !isNA(record.output)) {
          evalParams.output = record.output;
        }

        if (record.context && !isNA(record.context)) {
          // Handle context as array or string
          if (Array.isArray(record.context)) {
            evalParams.context = record.context.filter((c: any) => !isNA(c));
          } else {
            evalParams.context = [record.context];
          }
        }

        if (record.expected_output && !isNA(record.expected_output)) {
          evalParams.expected_output = record.expected_output;
        }

        // Validate that required fields are present for this metric
        const metricsNotRequiringOutput = ['contextual_precision', 'contextual_recall'];
        const metricsRequiringContext = ['faithfulness', 'contextual_precision', 'contextual_recall', 'hallucination'];

        // For "all" metric, skip individual metric validation - Python will validate per metric
        if (metric !== 'all') {
          if (!metricsNotRequiringOutput.includes(metric) && !evalParams.output) {
            throw new Error(`output field is required for ${metric} metric`);
          }

          if (metricsRequiringContext.includes(metric) && (!evalParams.context || evalParams.context.length === 0)) {
            throw new Error(`context field is required for ${metric} metric`);
          }

          if ((metric === 'contextual_precision' || metric === 'contextual_recall') && !evalParams.expected_output) {
            throw new Error(`expected_output field is required for ${metric} metric`);
          }
        } else {
          // For "all" metric, ensure at least output is available (most metrics need it)
          if (!evalParams.output) {
            throw new Error(`output field is required for 'all' metrics`);
          }
        }

        console.log(`Row ${i + 1}: Using metric "${metric}"`);

        // Run evaluation
        const evalResult = await evalWithFields(evalParams);

        // Handle "all" metric - include all results
        if (metric === "all" && evalResult.results && Array.isArray(evalResult.results)) {
          const allMetricsResult = {
            rowIndex: i + 1,
            originalData: record,
            metric_name: "all",
            allMetrics: true,
            totalMetrics: evalResult.results.length,
            metricsResults: evalResult.results,  // Include all metric results
          };
          results.push(allMetricsResult);
          console.log(`✅ Row ${i + 1} "all" metrics result:`, {
            allMetrics: allMetricsResult.allMetrics,
            totalMetrics: allMetricsResult.totalMetrics,
            metricsCount: allMetricsResult.metricsResults?.length,
            metricsNames: allMetricsResult.metricsResults?.map((m: any) => m.metric_name)
          });
        } else {
          // For single metric, extract first result
          results.push({
            rowIndex: i + 1,
            originalData: record,
            metric_name: evalResult.metric_name || metric,
            score: evalResult.score,
            verdict: evalResult.results?.[0]?.verdict || evalResult.verdict,
            explanation: evalResult.explanation,
          });
        }

        successCount++;
        console.log(`✓ Row ${i + 1} (${metric}): Success - ${metric === "all" ? `${evalResult.results?.length || 1} metrics evaluated` : `Score: ${evalResult.score}`}`);

      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        results.push({
          rowIndex: i + 1,
          originalData: record,
          metric_name: 'unknown',
          error: errorMessage,
        });

        console.log(`✗ Row ${i + 1}: Error - ${errorMessage}`);
      }
    }

    console.log(`✅ Batch evaluation completed: ${successCount} success, ${errorCount} errors`);
    console.log(`📊 Metrics used: ${Array.from(metricsUsed).join(', ')}`);

    console.log(`\n📊 BATCH EVALUATION COMPLETE`);
    const allMetricsCount = results.filter((r: any) => r.allMetrics).length;
    console.log(`   Rows with allMetrics=true: ${allMetricsCount}`);
    if (allMetricsCount > 0) {
      const sample: any = results.find((r: any) => r.allMetrics);
      console.log(`   Sample metricsResults:`, sample?.metricsResults?.map((m: any) => ({
        metric: m.metric_name,
        score: m.score,
        verdict: m.verdict
      })));
    }

    res.json({
      success: true,
      totalRecords: jsonData.length,
      successCount,
      errorCount,
      metricsUsed: Array.from(metricsUsed),
      results,
    });
  })
);

/**
 * POST /batch/generate-report
 * Generate HTML and Excel reports from evaluation results
 * 
 * Request body:
 * {
 *   originalData: object[] - original data from Excel
 *   evaluationResults: object[] - results from /batch/evaluate endpoint
 *   metricsUsed: string[] - metrics that were used
 *   reportType: 'html' | 'excel' | 'both' (optional, defaults to 'both')
 * }
 * 
 * Response (html):
 * - Returns HTML file with charts and detailed results
 * 
 * Response (excel):
 * - Returns Excel workbook with Summary, Results, and Data sheets
 * 
 * Response (both):
 * - Returns ZIP file containing both HTML and Excel
 */
router.post(
  '/batch/generate-report',
  asyncHandler(async (req: Request, res: Response) => {
    const { originalData, evaluationResults, metricsUsed, reportType = 'both' } = req.body;

    // Validation
    if (!evaluationResults || !Array.isArray(evaluationResults)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'evaluationResults must be an array'
      });
    }

    const successCount = evaluationResults.filter(r => !r.error).length;
    const errorCount = evaluationResults.filter(r => r.error).length;

    const reportData = {
      originalData: originalData || [],
      evaluationResults,
      totalRecords: evaluationResults.length,
      successCount,
      errorCount,
      metricsUsed: metricsUsed || Array.from(new Set(evaluationResults.map((r: any) => r.metric_name))),
    };

    // Debug logging
    console.log(`📄 Generating ${reportType} report(s)...`);
    const allMetricsCount = evaluationResults.filter((r: any) => r.allMetrics || r.metricsResults).length;
    console.log(`   - Total results: ${evaluationResults.length}, All metrics results: ${allMetricsCount}`);
    if (allMetricsCount > 0) {
      const sample = evaluationResults.find((r: any) => r.metricsResults);
      console.log(`   - Sample "all" metrics result:`, {
        allMetrics: sample?.allMetrics,
        totalMetrics: sample?.totalMetrics,
        metricsResultsCount: sample?.metricsResults?.length,
        metricsResultsSample: sample?.metricsResults?.slice(0, 2).map((m: any) => ({
          metric_name: m.metric_name,
          score: m.score,
          verdict: m.verdict
        }))
      });
    }

    try {
      if (reportType === 'html') {
        const htmlContent = generateHTMLReport(reportData);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="evaluation-report.html"');
        res.send(htmlContent);
      } else if (reportType === 'excel') {
        const excelBuffer = await generateExcelReport(reportData);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="evaluation-report.xlsx"');
        res.send(excelBuffer);
      } else if (reportType === 'both') {
        // For now, send both as separate files
        // In a more advanced implementation, you could create a ZIP file
        const htmlContent = generateHTMLReport(reportData);
        const excelBuffer = await generateExcelReport(reportData);
        
        res.json({
          success: true,
          message: 'Reports generated successfully',
          reports: {
            html: Buffer.from(htmlContent).toString('base64'),
            excel: excelBuffer.toString('base64'),
          }
        });
      }
    } catch (error) {
      console.error('❌ Error generating report:', error);
      res.status(500).json({
        error: 'Failed to generate report',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

export default router;
