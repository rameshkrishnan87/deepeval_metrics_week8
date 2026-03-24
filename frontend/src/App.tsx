import React, { useState } from 'react';
import { LLMEvalPage } from './pages/LLMEvalPage';
import { BatchEvalPage } from './pages/BatchEvalPage';
import './styles/app-nav.css';

type PageType = 'llm-eval' | 'batch-eval';

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('llm-eval');

  return (
    <div className="app-container">
      {/* Navigation */}
      <nav className="app-nav">
        <div className="nav-brand">
          <span className="nav-icon">🎯</span>
          <span className="nav-title">Testleaf Evaluation Suite</span>
        </div>
        
        <div className="nav-menu">
          <button
            className={`nav-link ${currentPage === 'llm-eval' ? 'active' : ''}`}
            onClick={() => setCurrentPage('llm-eval')}
          >
            📊 Single Evaluation
          </button>
          <button
            className={`nav-link ${currentPage === 'batch-eval' ? 'active' : ''}`}
            onClick={() => setCurrentPage('batch-eval')}
          >
            📁 Batch Evaluation
          </button>
        </div>
      </nav>

      {/* Page Content */}
      <div className="app-content">
        {currentPage === 'llm-eval' && <LLMEvalPage />}
        {currentPage === 'batch-eval' && <BatchEvalPage />}
      </div>
    </div>
  );
}

export default App;
