import React, { useState, useCallback } from 'react';
import './index.css';

function App() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [confirmedMappings, setConfirmedMappings] = useState({});
  const [threshold, setThreshold] = useState('');
  const [results, setResults] = useState(null);
  const [detecting, setDetecting] = useState(false);

  const handleFileSelect = useCallback((e) => {
    const selectedFiles = Array.from(e.target.files);
    validateAndSetFiles(selectedFiles);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    validateAndSetFiles(droppedFiles);
  }, []);

  const validateAndSetFiles = (newFiles) => {
    setError('');
    const validFiles = newFiles.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ['csv', 'xlsx', 'xls'].includes(ext);
    });

    if (validFiles.length !== newFiles.length) {
      setError('Only CSV and Excel files are accepted');
    }

    setFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setAnalysis(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('Uploading files...');

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setUploadStatus('Analyzing columns...');
      setUploadProgress(100);
      
      // Now analyze columns
      await analyzeColumns(data.files);
      
    } catch (err) {
      setError(err.message);
      setUploadStatus('');
    } finally {
      setUploading(false);
    }
  };

  const analyzeColumns = async (uploadedFiles) => {
    try {
      const response = await fetch('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploadedFiles })
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
      
      // Initialize confirmed mappings with detected values
      const initialMappings = {};
      data.analysis.forEach((file, idx) => {
        initialMappings[idx] = {};
        Object.entries(file.detectedColumns).forEach(([field, info]) => {
          initialMappings[idx][field] = info.detected || '';
        });
      });
      setConfirmedMappings(initialMappings);
      
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMappingChange = (fileIndex, field, value) => {
    setConfirmedMappings(prev => ({
      ...prev,
      [fileIndex]: {
        ...prev[fileIndex],
        [field]: value
      }
    }));
  };

  const handleConfirmMappings = async () => {
    if (!threshold || isNaN(parseFloat(threshold)) || parseFloat(threshold) <= 0) {
      setError('Please enter a valid payment threshold > 0');
      return;
    }
    
    setDetecting(true);
    setError('');
    
    try {
      // Build files array from analysis (need paths)
      const files = analysis.map(a => ({
        originalName: a.filename,
        path: a.path || ''  // Need to include path in analysis response
      }));
      
      const response = await fetch('http://localhost:3001/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files,
          mappings: confirmedMappings,
          threshold: parseFloat(threshold)
        })
      });

      if (!response.ok) {
        throw new Error('Detection failed');
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetecting(false);
    }
  };

  const handleBackToMapping = () => {
    setResults(null);
    setError('');
  };

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return 'confidence-high';
      case 'medium': return 'confidence-medium';
      default: return 'confidence-low';
    }
  };

  const getConfidenceIcon = (confidence) => {
    switch (confidence) {
      case 'high': return '✓';
      case 'medium': return '~';
      default: return '?';
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>ThirdEye</h1>
        <p className="subtitle">Vendor Risk Scanner for Internal Audit</p>
      </header>

      <main className="main">
        {!analysis ? (
          <div className="upload-section">
            <h2>Upload Vendor Data</h2>
            <p className="instructions">
              Upload your vendor master file and payment history. 
              ThirdEye will analyze for shell companies, SOD violations, and payment anomalies.
            </p>

            <div 
              className={`drop-zone ${files.length > 0 ? 'has-files' : ''}`}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                type="file"
                id="file-input"
                multiple
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <label htmlFor="file-input" className="file-label">
                <div className="upload-icon">📁</div>
                <p>Drop files here or click to browse</p>
                <p className="file-types">CSV, Excel (.xlsx, .xls)</p>
              </label>
            </div>

            {files.length > 0 && (
              <div className="file-list">
                <h3>Selected Files ({files.length})</h3>
                {files.map((file, index) => (
                  <div key={index} className="file-item">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
                    <button 
                      className="remove-btn"
                      onClick={() => removeFile(index)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            {uploading && (
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                />
                <span className="progress-text">{uploadStatus}</span>
              </div>
            )}

            <button 
              className="upload-btn"
              onClick={handleUpload}
              disabled={uploading || files.length === 0}
            >
              {uploading ? 'Analyzing...' : 'Start Analysis'}
            </button>
          </div>
        ) : results ? (
          <div className="results-section">
            <h2>Detection Results</h2>

            <div className="summary-cards">
              <div className="summary-card">
                <span className="summary-number">{results.summary?.vendorsAnalyzed || 0}</span>
                <span className="summary-label">Vendors Analyzed</span>
              </div>
              <div className="summary-card">
                <span className="summary-number">{results.summary?.totalRecords || 0}</span>
                <span className="summary-label">Records Scanned</span>
              </div>
              <div className="summary-card findings">
                <span className="summary-number">{results.summary?.findingsCount || 0}</span>
                <span className="summary-label">Findings</span>
              </div>
            </div>

            {results.findings && results.findings.length > 0 ? (
              <div className="findings-list">
                {results.findings.map((finding, idx) => (
                  <div key={idx} className={`finding-card severity-${finding.severity}`}>
                    <div className="finding-header">
                      <span className={`finding-badge ${finding.type}`}>
                        {finding.type === 'shell_company' ? 'Shell Co' : finding.type === 'sod_violation' ? 'SOD' : 'Velocity'}
                      </span>
                      <span className={`severity-badge ${finding.severity}`}>{finding.severity}</span>
                    </div>
                    <p className="finding-message">{finding.message}</p>
                    {finding.vendors && (
                      <p className="finding-vendors">
                        <strong>Vendors:</strong> {finding.vendors.join(', ')}
                      </p>
                    )}
                    {finding.user && (
                      <p className="finding-user">
                        <strong>User:</strong> {finding.user}
                      </p>
                    )}
                    {finding.amount && (
                      <p className="finding-amount">
                        <strong>Amount:</strong> ${finding.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-findings">
                <p>No findings detected. Your vendor data looks clean!</p>
              </div>
            )}

            <div className="mapping-actions">
              <button className="secondary-btn" onClick={handleBackToMapping}>
                ← Back to Mappings
              </button>
              <button className="secondary-btn" onClick={() => { setResults(null); setAnalysis(null); setFiles([]); }}>
                New Scan
              </button>
            </div>
          </div>
        ) : (
          <div className="mapping-section">
            <h2>Confirm Column Mappings</h2>
            <p className="instructions">
              ThirdEye detected these columns. Please confirm or correct the mappings.
              Uncertain mappings are marked with ~ or ?.
            </p>

            {analysis.map((file, fileIdx) => (
              <div key={fileIdx} className="file-analysis">
                <div className="file-header">
                  <h3>{file.filename}</h3>
                  <span className="file-meta">{file.type} • {file.rowCount.toLocaleString()} rows</span>
                </div>

                <div className="capabilities">
                  <h4>Detection Capabilities</h4>
                  <div className="capability-grid">
                    <div className={`capability ${file.capabilities.networkAnalysis ? 'enabled' : 'disabled'}`}>
                      <span className="cap-icon">{file.capabilities.networkAnalysis ? '✓' : '✗'}</span>
                      <span>Network Analysis</span>
                    </div>
                    <div className={`capability ${file.capabilities.sodDetection ? 'enabled' : 'disabled'}`}>
                      <span className="cap-icon">{file.capabilities.sodDetection ? '✓' : '✗'}</span>
                      <span>SOD Detection</span>
                    </div>
                    <div className={`capability ${file.capabilities.velocityAnalysis ? 'enabled' : 'disabled'}`}>
                      <span className="cap-icon">{file.capabilities.velocityAnalysis ? '✓' : '✗'}</span>
                      <span>Velocity Analysis</span>
                    </div>
                  </div>
                </div>

                {file.suggestions.length > 0 && (
                  <div className="suggestions">
                    <h4>💡 Suggestions</h4>
                    {file.suggestions.map((sugg, idx) => (
                      <div key={idx} className="suggestion">
                        <p className="sugg-message">{sugg.message}</p>
                        <p className="sugg-rec">{sugg.recommendation}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mappings">
                  <h4>Column Mappings</h4>
                  <div className="mapping-grid">
                    {Object.entries(file.detectedColumns).map(([field, info]) => (
                      <div key={field} className="mapping-row">
                        <label className="field-label">{field.replace(/_/g, ' ')}</label>
                        <div className="mapping-input">
                          <select
                            value={confirmedMappings[fileIdx]?.[field] || ''}
                            onChange={(e) => handleMappingChange(fileIdx, field, e.target.value)}
                          >
                            <option value="">-- Not mapped --</option>
                            {file.headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          {info.detected && (
                            <span className={`confidence ${getConfidenceColor(info.confidence)}`}>
                              {getConfidenceIcon(info.confidence)} {info.confidence}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {file.unmatchedColumns.length > 0 && (
                  <div className="unmatched">
                    <h4>Unmatched Columns</h4>
                    <p className="unmatched-list">{file.unmatchedColumns.join(', ')}</p>
                  </div>
                )}
              </div>
            ))}

            <div className="threshold-input">
              <label htmlFor="threshold">Payment Threshold ($)</label>
              <input
                id="threshold"
                type="number"
                min="1"
                step="any"
                placeholder="e.g. 10000"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
              <p className="hint">Payments above this amount will be flagged</p>
            </div>

            <div className="mapping-actions">
              <button className="secondary-btn" onClick={() => setAnalysis(null)}>
                ← Back to Upload
              </button>
              <button className="upload-btn" onClick={handleConfirmMappings} disabled={detecting}>
                {detecting ? 'Running Detection...' : 'Confirm Mappings & Run Detection →'}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>ThirdEye — Open Source Vendor Risk Scanner</p>
        <p>Built by auditors, for auditors</p>
      </footer>
    </div>
  );
}

export default App;
