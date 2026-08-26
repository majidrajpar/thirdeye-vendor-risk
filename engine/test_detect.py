import json
import os
import tempfile
import csv

# Create a test CSV with shell company + SOD + velocity issues
headers = ['vendor_id','vendor_name','bank_account','address','email','phone','created_by','approved_by','payment_amount','payment_date']
rows = [
    ['V001','Acme Corp','123456789','123 Main St','acme@example.com','555-0101','alice','bob','5000.00','2024-01-15'],
    ['V002','Beta LLC','123456789','456 Oak Ave','beta@example.com','555-0202','charlie','dave','12000.00','2024-01-16'],
    ['V003','Gamma Inc','987654321','123 Main St','gamma@example.com','555-0101','alice','alice','8000.00','2024-01-17'],
    ['V004','Delta Co','111222333','789 Pine Rd','delta@example.com','555-0303','eve','frank','6000.00','2024-01-18'],
    ['V005','Epsilon Ltd','111222333','789 Pine Rd','epsilon@example.com','555-0303','alice','alice','50000.00','2024-01-19'],
    ['V006','Zeta Inc','444555666','999 Elm St','zeta@example.com','555-0404','george','hannah','1000.00','2024-01-20'],
    ['V007','Eta Corp','444555666','999 Elm St','eta@example.com','555-0404','george','hannah','1000.00','2024-01-20'],
    ['V008','Theta LLC','444555666','999 Elm St','theta@example.com','555-0404','george','hannah','1000.00','2024-01-20'],
]

# Write temp CSV
fd, path = tempfile.mkstemp(suffix='.csv')
with os.fdopen(fd, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(headers)
    w.writerows(rows)

# Prepare input for engine
input_data = {
    'files': [{
        'path': path,
        'mappings': {
            'vendor_id': 'vendor_id',
            'vendor_name': 'vendor_name',
            'bank_account': 'bank_account',
            'address': 'address',
            'email': 'email',
            'phone': 'phone',
            'created_by': 'created_by',
            'approved_by': 'approved_by',
            'payment_amount': 'payment_amount',
            'payment_date': 'payment_date'
        }
    }],
    'threshold': 10000
}

import subprocess
venv_python = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'venv', 'Scripts', 'python.exe')
result = subprocess.run(
    [venv_python, 'detect.py'],
    input=json.dumps(input_data),
    capture_output=True,
    text=True,
    cwd=os.path.dirname(os.path.abspath(__file__))
)

print("STDOUT:")
print(result.stdout)
if result.stderr:
    print("STDERR:")
    print(result.stderr)

os.unlink(path)
