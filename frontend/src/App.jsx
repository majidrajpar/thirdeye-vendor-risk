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

  const handleConfirmMappings = () => {
    // TODO: Send confirmed mappings to backend
    console.log('Confirmed mappings:', confirmedMappings);
    alert('Mappings confirmed! Ready for detection. (Day 3 implementation)');
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
          <!-- Upload Phase -->
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
        ) : (
          <!-- Column Mapping Phase -->
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

            <div className="mapping-actions">
              <button className="secondary-btn" onClick={() => setAnalysis(null)}>
                ← Back to Upload
              </button>
              <button className="upload-btn" onClick={handleConfirmMappings}>
                Confirm Mappings & Run Detection →
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
