# ThirdEye • AI-Powered Vendor Risk Scanner

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

ThirdEye is an automated vendor risk analysis tool that evaluates vendor master files and payment transactions for forensic anomalies, fraud patterns, and internal control breaches.

---

## Overview

ThirdEye inspects structured vendor datasets (CSV and Excel formats) to identify three critical risk categories without relying on retrospective manual sampling:

1. **Shell Company Networks (Graph Clustering):** Uses bipartite graph clustering to detect distinct vendor entities sharing common bank accounts/IBANs, physical addresses, email domains, or telephone numbers.
2. **Segregation of Duties (SOD) Violations:** Identifies transactions where the initiator and approver are identical (`created_by == approved_by`), circumventing dual authorization controls.
3. **Transaction Velocity Anomalies:** Flags high-risk payment spikes, threshold bypasses, and abnormal disbursement velocities against historical baseline patterns.

---

## Architecture

ThirdEye operates across three decoupled layers:

```
┌─────────────────────────┐
│     Frontend UI         │  React 18 / Vite
│  (Port 5173 by default) │  File upload, column mapping, interactive risk tables
└───────────┬─────────────┘
            │ HTTP / JSON
┌───────────▼─────────────┐
│       Backend API       │  Node.js / Express
│       (Port 3001)       │  Multipart file handling, schema mapping, engine orchestration
└───────────┬─────────────┘
            │ Stdin / Stdout (Child Process)
┌───────────▼─────────────┐
│    Detection Engine     │  Python 3 (pandas, networkx)
│     (engine/detect.py)  │  Graph analysis, connected components, anomaly algorithms
└─────────────────────────┘
```

- **Frontend (`frontend/`):** React 18 single-page application built with Vite, offering drag-and-drop file ingestion, dynamic column-mapping verification, and structured forensic findings drill-down.
- **Backend API (`backend/`):** Express.js service handling multipart file uploads, CSV/XLSX schema normalization, and spawning the Python detection runtime with mapped payloads.
- **Detection Engine (`engine/`):** Standalone Python engine using `pandas` for tabular vector operations and `networkx` for entity relationship resolution and connected component clustering.

---

## Input Data Requirements

ThirdEye supports `.csv`, `.xlsx`, and `.xls` files. The system includes an interactive column mapper that aligns dataset headers to standard audit fields:

| Field Name | Standard Column | Description | Mandatory / Optional |
| :--- | :--- | :--- | :--- |
| `vendor_id` | Vendor ID | Unique vendor code or system identifier | Recommended |
| `vendor_name` | Vendor Name | Legal or operating entity name | Required |
| `bank_account` | Bank Account / IBAN | Vendor remittance bank account number or IBAN | Strongly Recommended |
| `address` | Address | Street or registered corporate address | Recommended |
| `email` | Email | Contact or invoicing email address | Recommended |
| `phone` | Phone Number | Primary telephone or mobile number | Recommended |
| `created_by` | Created By | User ID or name of vendor/invoice creator | Required for SOD analysis |
| `approved_by` | Approved By | User ID or name of approver | Required for SOD analysis |
| `payment_amount` | Payment Amount | Disbursed transaction value | Required for velocity checks |

---

## Prerequisites

- **Node.js** (v18.x or v20.x) & **npm**
- **Python** (v3.10 or higher)

---

## Setup & Running Instructions

### 1. Quick Start Commands

Run backend and frontend concurrently or from separate terminals:

#### Windows (PowerShell)
```powershell
# Terminal 1: Backend
cd backend
npm install
npm start

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

#### macOS / Linux
```bash
# Terminal 1: Backend
cd backend && npm install && npm start

# Terminal 2: Frontend
cd frontend && npm install && npm run dev
```

The frontend runs at `http://localhost:5173` and proxies API requests to `http://localhost:3001`.

---

### 2. Manual Step-by-Step Setup

#### Step A: Configure Detection Engine Virtual Environment
```bash
cd engine
python -m venv venv

# Windows
.\venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

> **Note on Custom Python:** The backend automatically defaults to the virtual environment in `engine/venv`. If you prefer to use system Python or an alternate interpreter, set the `PYTHON_PATH` environment variable:
> ```bash
> # Linux / macOS
> export PYTHON_PATH=/usr/bin/python3
> 
> # Windows PowerShell
> $env:PYTHON_PATH = "C:\Python312\python.exe"
> ```

#### Step B: Start Backend Service
```bash
cd backend
npm install
npm start
# Service listens on http://localhost:3001
```

#### Step C: Start Frontend Client
```bash
cd frontend
npm install
npm run dev
# Vite dev server listens on http://localhost:5173
```

---

## Author

**Majid Mumtaz** (CIA, ACA, FCCA)  
*Director of Internal Audit & Risk Advisory*  
- **Portfolio & Research:** [majidrajpar.github.io/portfolio_my](https://majidrajpar.github.io/portfolio_my)  
- **LinkedIn:** [linkedin.com/in/majid-m-4b097118](https://www.linkedin.com/in/majid-m-4b097118/)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
