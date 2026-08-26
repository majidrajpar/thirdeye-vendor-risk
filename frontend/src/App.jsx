import React, { useState, useCallback } from 'react';
import './index.css';

function App() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');

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
      setUploadStatus('Upload complete! Analyzing columns...');
      setUploadProgress(100);
      
      // TODO: Navigate to column mapping page
      console.log('Upload response:', data);
      
    } catch (err) {
      setError(err.message);
      setUploadStatus('');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>ThirdEye</h1>
        <p className="subtitle">Vendor Risk Scanner for Internal Audit</p>
      </header>

      <main className="main">
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

        <div className="info-section">
          <h3>What ThirdEye Detects</h3>
          <div className="detection-cards">
            <div className="card">
              <div className="card-icon">🔗</div>
              <h4>Shell Company Networks</h4>
              <p>Identifies vendors sharing bank accounts, addresses, or contacts</p>
            </div>
            <div className="card">
              <div className="card-icon">⚠️</div>
              <h4>SOD Violations</h4>
              <p>Flags users who create vendors and approve payments</p>
            </div>
            <div className="card">
              <div className="card-icon">📈</div>
              <h4>Payment Anomalies</h4>
              <p>Spots velocity spikes, round numbers, and unusual patterns</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>ThirdEye — Open Source Vendor Risk Scanner</p>
        <p>Built by auditors, for auditors</p>
      </footer>
    </div>
  );
}

export default App;
