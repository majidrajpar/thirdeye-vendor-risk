const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { spawn } = require('child_process');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (['.csv', '.xlsx', '.xls'].includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel files are allowed'), false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Column mapping suggestions
const COLUMN_PATTERNS = {
  vendor_id: ['vendor_id', 'vendorid', 'vendor_code', 'vendorcode', 'vendor_no', 'vendorno', 'vendor_number', 'supplier_id', 'supplierid', 'supplier_code', 'id', 'code'],
  vendor_name: ['vendor_name', 'vendorname', 'supplier_name', 'suppliername', 'name', 'company', 'company_name', 'vendor', 'supplier'],
  bank_account: ['bank_account', 'bankaccount', 'account_number', 'account_no', 'acct_no', 'bank_acct', 'iban', 'account'],
  address: ['address', 'street', 'street_address', 'location', 'office_address', 'registered_address'],
  email: ['email', 'email_address', 'contact_email', 'e_mail', 'mail'],
  phone: ['phone', 'phone_number', 'telephone', 'contact_phone', 'mobile', 'tel'],
  created_by: ['created_by', 'createdby', 'creator', 'created_user', 'user_created', 'entered_by', 'created'],
  created_date: ['created_date', 'createddate', 'date_created', 'creation_date', 'created'],
  payment_amount: ['payment_amount', 'paymentamount', 'amount', 'paid_amount', 'payment', 'value', 'total', 'amount_paid'],
  payment_date: ['payment_date', 'paymentdate', 'paid_date', 'date_paid', 'transaction_date', 'tx_date', 'date'],
  approved_by: ['approved_by', 'approvedby', 'approver', 'approved_user', 'approval_by', 'authorised_by', 'authorized_by']
};

function detectColumns(headers) {
  const detected = {};
  const unmatched = [];
  
  // Convert headers to lowercase for matching
  const lowerHeaders = headers.map(h => h.toLowerCase().trim().replace(/[_\s-]+/g, '_'));
  
  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    let matched = false;
    
    for (let i = 0; i < lowerHeaders.length; i++) {
      const header = lowerHeaders[i];
      
      // Exact match
      if (patterns.includes(header)) {
        detected[field] = {
          detected: headers[i],
          confidence: 'high',
          matchType: 'exact'
        };
        matched = true;
        break;
      }
      
      // Partial match (contains)
      for (const pattern of patterns) {
        if (header.includes(pattern) || pattern.includes(header)) {
          detected[field] = {
            detected: headers[i],
            confidence: 'medium',
            matchType: 'partial'
          };
          matched = true;
          break;
        }
      }
      
      if (matched) break;
    }
    
    if (!matched) {
      detected[field] = {
        detected: null,
        confidence: 'none',
        matchType: 'none'
      };
    }
  }
  
  // Find truly unmatched columns
  const matchedHeaders = new Set(Object.values(detected).map(d => d.detected).filter(Boolean));
  for (const header of headers) {
    if (!matchedHeaders.has(header)) {
      unmatched.push(header);
    }
  }
  
  return { detected, unmatched };
}

function parseCSV(filepath) {
  return new Promise((resolve, reject) => {
    const headers = [];
    let rowCount = 0;
    
    fs.createReadStream(filepath)
      .pipe(csv())
      .on('headers', (h) => {
        headers.push(...h);
      })
      .on('data', () => {
        rowCount++;
        if (rowCount > 5) return; // Only read first 5 rows for preview
      })
      .on('end', () => {
        resolve({ headers, rowCount, type: 'csv' });
      })
      .on('error', reject);
  });
}

function parseExcel(filepath) {
  const workbook = xlsx.readFile(filepath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Get headers from first row
  const range = xlsx.utils.decode_range(worksheet['!ref']);
  const headers = [];
  
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cell = worksheet[xlsx.utils.encode_cell({ r: range.s.r, c: C })];
    headers.push(cell ? cell.v : '');
  }
  
  // Count rows
  const rowCount = range.e.r;
  
  return { headers, rowCount, type: 'excel', sheetName };
}

// Upload endpoint
app.post('/api/upload', upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const files = req.files.map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      path: file.path
    }));

    res.json({
      success: true,
      message: `${files.length} file(s) uploaded successfully`,
      files,
      nextStep: 'column_mapping'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Analyze columns endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { files } = req.body;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files to analyze' });
    }

    const analysis = [];
    
    for (const file of files) {
      const filepath = file.path;
      const ext = path.extname(file.originalName).toLowerCase();
      
      let parsed;
      if (ext === '.csv') {
        parsed = await parseCSV(filepath);
      } else {
        parsed = parseExcel(filepath);
      }
      
      const { detected, unmatched } = detectColumns(parsed.headers);
      
      // Determine what detections are possible
      const capabilities = {
        networkAnalysis: !!(detected.vendor_name?.detected || detected.vendor_id?.detected),
        sodDetection: !!(detected.created_by?.detected && detected.approved_by?.detected),
        velocityAnalysis: !!(detected.payment_amount?.detected && detected.payment_date?.detected),
        fullNetwork: !!detected.bank_account?.detected
      };
      
      analysis.push({
        filename: file.originalName,
        path: file.path,
        type: parsed.type,
        rowCount: parsed.rowCount,
        headers: parsed.headers,
        detectedColumns: detected,
        unmatchedColumns: unmatched,
        capabilities,
        suggestions: generateSuggestions(detected, capabilities)
      });
    }
    
    res.json({
      success: true,
      analysis
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

function generateSuggestions(detected, capabilities) {
  const suggestions = [];
  
  if (!capabilities.fullNetwork) {
    suggestions.push({
      type: 'missing_data',
      message: 'Bank account data not detected. Shell company detection will be limited to name/address matching.',
      recommendation: 'Include bank_account column for stronger network analysis'
    });
  }
  
  if (!capabilities.sodDetection) {
    suggestions.push({
      type: 'missing_data',
      message: 'SOD detection requires both vendor creator and payment approver data.',
      recommendation: 'Ensure files contain created_by and approved_by columns'
    });
  }
  
  if (!capabilities.velocityAnalysis) {
    suggestions.push({
      type: 'missing_data',
      message: 'Payment velocity analysis requires amount and date columns.',
      recommendation: 'Include payment_amount and payment_date columns'
    });
  }
  
  return suggestions;
}

// Run detection endpoint
app.post('/api/detect', async (req, res) => {
  try {
    const { files, mappings, threshold } = req.body;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files to analyze' });
    }

    // Build file configs for Python engine
    const fileConfigs = files.map((file, idx) => ({
      path: file.path,
      mappings: mappings[idx] || {}
    }));

    const engineInput = JSON.stringify({
      files: fileConfigs,
      threshold: threshold || 0
    });

    // Path to Python executable (checks PYTHON_PATH env var first, falling back to venv)
    const isWin = process.platform === 'win32';
    const defaultPythonPath = isWin
      ? path.join(__dirname, '../../engine/venv/Scripts/python.exe')
      : path.join(__dirname, '../../engine/venv/bin/python');
    const pythonPath = process.env.PYTHON_PATH || defaultPythonPath;
    const enginePath = path.join(__dirname, '../../engine/detect.py');

    // Spawn Python process
    const python = spawn(pythonPath, [enginePath]);
    
    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Engine stderr:', stderr);
        return res.status(500).json({ error: 'Detection engine failed', details: stderr });
      }

      try {
        const result = JSON.parse(stdout);
        res.json(result);
      } catch (e) {
        console.error('Failed to parse engine output:', stdout);
        res.status(500).json({ error: 'Invalid engine output' });
      }
    });

    python.stdin.write(engineInput);
    python.stdin.end();

  } catch (error) {
    console.error('Detection error:', error);
    res.status(500).json({ error: 'Detection failed' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'thirdeye-backend' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 ThirdEye backend running on port ${PORT}`);
  console.log(`📁 Upload directory: ${uploadDir}`);
});

module.exports = app;
