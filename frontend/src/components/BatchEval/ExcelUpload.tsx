import React, { useRef } from 'react';

interface ExcelUploadProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
  fileName: string | null;
}

export const ExcelUpload: React.FC<ExcelUploadProps> = ({
  onFileSelected,
  isLoading,
  fileName,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        onFileSelected(file);
      } else {
        alert('Please select a valid Excel file (.xlsx or .xls)');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="excel-upload-container">
      <div className="upload-card">
        <div className="upload-icon">📁</div>
        
        <h2>Upload Excel File for Batch Evaluation</h2>
        <p className="upload-subtitle">Select an Excel file (.xlsx or .xls) containing your evaluation datasets</p>

        <div className="upload-area">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            disabled={isLoading}
          />
          
          <button
            className="upload-button"
            onClick={handleClick}
            disabled={isLoading}
          >
            {isLoading ? '⏳ Processing...' : '📤 Select Excel File'}
          </button>

          {fileName && (
            <div className="file-info">
              <span className="file-icon">✓</span>
              <span className="file-name">{fileName}</span>
            </div>
          )}
        </div>

        <p className="upload-hint">
          💡 Supported formats: .xlsx, .xls
          <br />
          Maximum file size: 10MB
        </p>
      </div>
    </div>
  );
};
