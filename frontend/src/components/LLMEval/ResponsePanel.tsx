import React from 'react';
import { LLMEvalResponse } from './types';

interface ResponsePanelProps {
  response: LLMEvalResponse | null;
  isLoading: boolean;
}

interface MetricResult {
  metric_name: string;
  score: number | null;
  verdict: string | null;
  explanation: string | null;
  error: string | null;
  detail?: any;
}

export const ResponsePanel: React.FC<ResponsePanelProps> = ({ response, isLoading }) => {
  if (isLoading) {
    return (
      <div className="llm-eval-response-panel">
        <h3 className="llm-eval-response-title">Response</h3>
        <div className="llm-eval-loading-container">
          <div className="llm-eval-loader"></div>
          <span className="llm-eval-loading-text">Evaluating your metrics...</span>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="llm-eval-response-panel">
        <h3 className="llm-eval-response-title">Response</h3>
        <div className="llm-eval-placeholder-text">
          Click "Evaluate" to see results
        </div>
      </div>
    );
  }

  try {
    console.log("📥 ResponsePanel received:", JSON.stringify(response, null, 2));

    const getVerdictClass = (verdict: string | null | undefined): string => {
      if (!verdict) return 'llm-eval-verdict-neutral';
      const lowerVerdict = verdict.toLowerCase();
      
      if (
        lowerVerdict.includes('faithful') ||
        lowerVerdict.includes('high') ||
        lowerVerdict.includes('relevant') ||
        lowerVerdict === 'yes' ||
        lowerVerdict === 'excellent' ||
        lowerVerdict === 'good'
      ) {
        return 'llm-eval-verdict-faithful';
      }
      
      if (
        lowerVerdict.includes('not_') ||
        lowerVerdict.includes('low') ||
        lowerVerdict === 'poor' ||
        lowerVerdict === 'no' ||
        lowerVerdict === 'false'
      ) {
        return 'llm-eval-verdict-unfaithful';
      }
      
      if (
        lowerVerdict.includes('partial') ||
        lowerVerdict.includes('acceptable') ||
        lowerVerdict.includes('medium')
      ) {
        return 'llm-eval-verdict-partial';
      }
      
      return 'llm-eval-verdict-neutral';
    };

    // ────────────────────────────────────────────────────────────────
    // HANDLE "ALL" METRICS RESPONSE
    // ────────────────────────────────────────────────────────────────
    if ((response as any).allMetrics === true && (response as any).results && Array.isArray((response as any).results)) {
      const allResults: MetricResult[] = (response as any).results;
      const totalMetrics = (response as any).totalMetrics || allResults.length;
      
      // Filter out the "all" metric result itself to avoid duplication
      const individualMetrics = allResults.filter((r: MetricResult) => r.metric_name !== 'all');
      const successCount = individualMetrics.filter((r: MetricResult) => !r.error).length;
      const errorCount = individualMetrics.filter((r: MetricResult) => r.error).length;

      console.log(`📊 All Metrics Response: ${successCount} successful, ${errorCount} errors`);

      return (
        <div className="llm-eval-response-panel">
          <h3 className="llm-eval-response-title">📊 All Metrics Evaluation Results</h3>
          
          {/* Summary Bar */}
          <div className="llm-eval-all-metrics-summary">
            <div className="llm-eval-summary-stat">
              <span className="llm-eval-summary-label">Total Metrics:</span>
              <span className="llm-eval-summary-value">{totalMetrics}</span>
            </div>
            <div className="llm-eval-summary-stat">
              <span className="llm-eval-summary-label">✓ Successful:</span>
              <span className="llm-eval-summary-value llm-eval-success-count">{successCount}</span>
            </div>
            <div className="llm-eval-summary-stat">
              <span className="llm-eval-summary-label">✗ Errors:</span>
              <span className="llm-eval-summary-value llm-eval-error-count">{errorCount}</span>
            </div>
          </div>

          {/* Individual Metrics Grid */}
          <div className="llm-eval-all-metrics-grid">
            {individualMetrics.map((metric: MetricResult, index: number) => (
              <div key={index} className="llm-eval-metric-card">
                {/* Card Header */}
                <div className="llm-eval-metric-card-header">
                  <h4 className="llm-eval-metric-card-title">
                    {metric.metric_name.replace(/_/g, ' ').toUpperCase()}
                  </h4>
                  {metric.error && (
                    <span className="llm-eval-metric-error-icon">⚠️</span>
                  )}
                </div>

                {/* Error State */}
                {metric.error ? (
                  <div className="llm-eval-metric-error-content">
                    <p className="llm-eval-metric-error-message">{metric.error}</p>
                  </div>
                ) : (
                  <>
                    {/* Score & Verdict Row */}
                    <div className="llm-eval-metric-score-section">
                      <div className="llm-eval-metric-score-item">
                        <span className="llm-eval-metric-label">Score:</span>
                        <span className="llm-eval-metric-score">
                          {metric.score !== null ? (typeof metric.score === 'number' ? metric.score.toFixed(4) : metric.score) : 'N/A'}
                        </span>
                      </div>

                      {metric.verdict && (
                        <div className="llm-eval-metric-verdict-item">
                          <span className="llm-eval-metric-label">Verdict:</span>
                          <span className={`llm-eval-verdict ${getVerdictClass(metric.verdict)}`}>
                            {metric.verdict}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Explanation */}
                    {metric.explanation && (
                      <div className="llm-eval-metric-explanation">
                        <p className="llm-eval-metric-explanation-text">
                          {metric.explanation}
                        </p>
                      </div>
                    )}

                    {/* Detail Section (for Faithfulness) */}
                    {metric.detail && metric.detail.truths && (
                      <div className="llm-eval-metric-detail">
                        <div className="llm-eval-metric-detail-subsection">
                          <strong className="llm-eval-detail-label">Truths Found:</strong>
                          <ul className="llm-eval-detail-list">
                            {metric.detail.truths.map((truth: string, i: number) => (
                              <li key={i}>{truth}</li>
                            ))}
                          </ul>
                        </div>

                        {metric.detail.verdicts && metric.detail.verdicts.length > 0 && (
                          <div className="llm-eval-metric-detail-subsection">
                            <strong className="llm-eval-detail-label">Claim Verdicts:</strong>
                            <ul className="llm-eval-detail-list">
                              {metric.detail.verdicts.map((v: any, i: number) => (
                                <li key={i}>
                                  <span className="llm-eval-claim">{v.claim}</span>
                                  <span className={`llm-eval-claim-verdict llm-eval-verdict-${v.verdict}`}>
                                    [{v.verdict.toUpperCase()}]
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {(metric.detail.yes_count !== undefined || metric.detail.no_count !== undefined || metric.detail.idk_count !== undefined) && (
                          <div className="llm-eval-metric-detail-stats">
                            {metric.detail.yes_count !== undefined && (
                              <span className="llm-eval-stat llm-eval-stat-yes">✓ Supported: {metric.detail.yes_count}</span>
                            )}
                            {metric.detail.no_count !== undefined && (
                              <span className="llm-eval-stat llm-eval-stat-no">✗ Contradictory: {metric.detail.no_count}</span>
                            )}
                            {metric.detail.idk_count !== undefined && (
                              <span className="llm-eval-stat llm-eval-stat-idk">? Ambiguous: {metric.detail.idk_count}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Input Data Summary */}
          {((response as any).query || (response as any).output || (response as any).context) && (
            <div className="llm-eval-response-section llm-eval-all-metrics-input-summary">
              <h4 className="llm-eval-response-section-title">Evaluation Input</h4>
              {(response as any).query && (
                <div className="llm-eval-response-subsection">
                  <strong className="llm-eval-response-sublabel">Query:</strong>
                  <p className="llm-eval-response-text">{(response as any).query}</p>
                </div>
              )}
              {(response as any).output && (
                <div className="llm-eval-response-subsection">
                  <strong className="llm-eval-response-sublabel">Output:</strong>
                  <p className="llm-eval-response-text">{(response as any).output}</p>
                </div>
              )}
              {(response as any).context && Array.isArray((response as any).context) && (
                <div className="llm-eval-response-subsection">
                  <strong className="llm-eval-response-sublabel">Context ({(response as any).context.length} items):</strong>
                  <ul className="llm-eval-context-list">
                    {(response as any).context.map((ctx: string, i: number) => (
                      <li key={i} className="llm-eval-context-item">{ctx}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // ────────────────────────────────────────────────────────────────
    // HANDLE SINGLE METRIC RESPONSE (existing logic)
    // ────────────────────────────────────────────────────────────────
    const score = response.score ?? null;
    const metricName = String(response.metric_name || response.metric || 'Unknown Metric').replace(/_/g, ' ');
    const explanation = response.explanation || null;
    let verdict = response.verdict || null;
    const reference_used = response.reference_used || null;
    const query = response.query || null;
    const output = response.output || null;

    console.log("🎯 Extracted verdict:", verdict);

    return (
      <div className="llm-eval-response-panel">
        <h3 className="llm-eval-response-title">Response</h3>
        <div className="llm-eval-response-content">
          {/* Metric & Score Row */}
          <div className="llm-eval-response-grid">
            <div className="llm-eval-response-card llm-eval-response-metric">
              <div className="llm-eval-response-card-label">Metric</div>
              <div className="llm-eval-response-card-value">
                {metricName.toUpperCase()}
              </div>
            </div>

            <div className="llm-eval-response-card llm-eval-response-score">
              <div className="llm-eval-response-card-label">Score</div>
              <div className="llm-eval-response-card-score">
                {score !== null ? (typeof score === 'number' ? score.toFixed(4) : score) : 'N/A'}
              </div>
            </div>

            {verdict && (
              <div className="llm-eval-response-card llm-eval-response-verdict-card">
                <div className="llm-eval-response-card-label">Verdict</div>
                <div className={`llm-eval-verdict ${getVerdictClass(verdict)}`}>
                  {verdict}
                </div>
              </div>
            )}
          </div>

          {/* Explanation Section */}
          {explanation && (
            <div className="llm-eval-response-section">
              <h4 className="llm-eval-response-section-title">Explanation</h4>
              <p className="llm-eval-response-text">{explanation}</p>
            </div>
          )}

          {/* Reference Section */}
          {reference_used && (
            <div className="llm-eval-response-section">
              <h4 className="llm-eval-response-section-title">Reference Used</h4>
              <div className="llm-eval-response-reference">
                <p className="llm-eval-response-text">{reference_used}</p>
              </div>
            </div>
          )}

          {/* Query & Output Section */}
          {(query || output) && (
            <div className="llm-eval-response-section">
              <h4 className="llm-eval-response-section-title">Evaluation Input</h4>
              {query && (
                <div className="llm-eval-response-subsection">
                  <strong className="llm-eval-response-sublabel">Query:</strong>
                  <p className="llm-eval-response-text">{query}</p>
                </div>
              )}
              {output && !metricName.toLowerCase().includes('contextual') && (
                <div className="llm-eval-response-subsection">
                  <strong className="llm-eval-response-sublabel">Output:</strong>
                  <p className="llm-eval-response-text">{output}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error('ResponsePanel render error:', error);
    return (
      <div className="llm-eval-response-panel">
        <h3 className="llm-eval-response-title">Response</h3>
        <div className="llm-eval-error-alert">
          <p>⚠️ Error displaying response data</p>
        </div>
      </div>
    );
  }
};