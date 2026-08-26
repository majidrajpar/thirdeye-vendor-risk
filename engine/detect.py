import json
import sys
import os
import pandas as pd
import networkx as nx
from collections import defaultdict

# --- File Loading ---

def load_file(filepath, mappings):
    """Load CSV or Excel into DataFrame with standardized column names."""
    ext = os.path.splitext(filepath)[1].lower()
    if ext == '.csv':
        df = pd.read_csv(filepath)
    else:
        df = pd.read_excel(filepath)
    
    # Rename columns according to mappings (reverse: detected -> standard)
    # mappings: {standard_field: original_column_name}
    reverse_map = {v: k for k, v in mappings.items() if v}
    df = df.rename(columns=reverse_map)
    return df

def merge_files(file_configs):
    """Load and merge multiple files into a single DataFrame."""
    dfs = []
    for cfg in file_configs:
        df = load_file(cfg['path'], cfg['mappings'])
        dfs.append(df)
    
    if len(dfs) == 1:
        return dfs[0]
    
    # Try to merge on common columns (vendor_id, vendor_name)
    common_cols = set(dfs[0].columns)
    for df in dfs[1:]:
        common_cols &= set(df.columns)
    
    if 'vendor_id' in common_cols or 'vendor_name' in common_cols:
        merge_on = [c for c in ['vendor_id', 'vendor_name'] if c in common_cols]
        result = dfs[0]
        for df in dfs[1:]:
            result = pd.merge(result, df, on=merge_on, how='outer', suffixes=('', '_dup'))
        return result
    else:
        # Just concatenate
        return pd.concat(dfs, ignore_index=True)

# --- Detection Modules ---

def detect_shell_companies(df):
    """Find vendors sharing bank accounts, addresses, emails, or phones."""
    findings = []
    
    # We need at least vendor identifier
    if 'vendor_name' not in df.columns and 'vendor_id' not in df.columns:
        return findings
    
    id_col = 'vendor_id' if 'vendor_id' in df.columns else 'vendor_name'
    
    # Build graph: vendors connected by shared attributes
    G = nx.Graph()
    
    for _, row in df.iterrows():
        vendor = str(row.get(id_col, '')).strip()
        if not vendor or vendor == 'nan':
            continue
        G.add_node(vendor)
    
    # Connect by shared bank_account
    if 'bank_account' in df.columns:
        acct_to_vendors = defaultdict(set)
        for _, row in df.iterrows():
            vendor = str(row.get(id_col, '')).strip()
            acct = str(row.get('bank_account', '')).strip()
            if vendor and acct and acct != 'nan':
                acct_to_vendors[acct].add(vendor)
        
        for acct, vendors in acct_to_vendors.items():
            if len(vendors) > 1:
                # Add edges between all vendors sharing this account
                vendors = list(vendors)
                for i in range(len(vendors)):
                    for j in range(i+1, len(vendors)):
                        G.add_edge(vendors[i], vendors[j], reason=f'shared_bank_account:{acct}')
                
                masked_acct = acct[-4:] if len(acct) > 4 else acct
                findings.append({
                    'type': 'shell_company',
                    'severity': 'high',
                    'message': f"{len(vendors)} vendors share bank account ending in {masked_acct}",
                    'vendors': list(vendors),
                    'attribute': 'bank_account',
                    'value': f"****{masked_acct}",
                    'details': {'account': f"****{masked_acct}", 'vendor_count': len(vendors)}
                })
    
    # Connect by shared address
    if 'address' in df.columns:
        addr_to_vendors = defaultdict(set)
        for _, row in df.iterrows():
            vendor = str(row.get(id_col, '')).strip()
            addr = str(row.get('address', '')).strip().lower()
            if vendor and addr and addr != 'nan':
                addr_to_vendors[addr].add(vendor)
        
        for addr, vendors in addr_to_vendors.items():
            if len(vendors) > 1:
                vendors = list(vendors)
                for i in range(len(vendors)):
                    for j in range(i+1, len(vendors)):
                        G.add_edge(vendors[i], vendors[j], reason=f'shared_address')
                
                findings.append({
                    'type': 'shell_company',
                    'severity': 'medium',
                    'message': f"{len(vendors)} vendors share the same address",
                    'vendors': list(vendors),
                    'attribute': 'address',
                    'value': addr[:50] + '...' if len(addr) > 50 else addr,
                    'details': {'address': addr, 'vendor_count': len(vendors)}
                })
    
    # Connect by shared email
    if 'email' in df.columns:
        email_to_vendors = defaultdict(set)
        for _, row in df.iterrows():
            vendor = str(row.get(id_col, '')).strip()
            email = str(row.get('email', '')).strip().lower()
            if vendor and email and email != 'nan':
                email_to_vendors[email].add(vendor)
        
        for email, vendors in email_to_vendors.items():
            if len(vendors) > 1:
                vendors = list(vendors)
                for i in range(len(vendors)):
                    for j in range(i+1, len(vendors)):
                        G.add_edge(vendors[i], vendors[j], reason=f'shared_email:{email}')
                
                findings.append({
                    'type': 'shell_company',
                    'severity': 'high',
                    'message': f"{len(vendors)} vendors share email {email}",
                    'vendors': list(vendors),
                    'attribute': 'email',
                    'value': email,
                    'details': {'email': email, 'vendor_count': len(vendors)}
                })
    
    # Connect by shared phone
    if 'phone' in df.columns:
        phone_to_vendors = defaultdict(set)
        for _, row in df.iterrows():
            vendor = str(row.get(id_col, '')).strip()
            phone = str(row.get('phone', '')).strip()
            if vendor and phone and phone != 'nan':
                phone_to_vendors[phone].add(vendor)
        
        for phone, vendors in phone_to_vendors.items():
            if len(vendors) > 1:
                vendors = list(vendors)
                for i in range(len(vendors)):
                    for j in range(i+1, len(vendors)):
                        G.add_edge(vendors[i], vendors[j], reason=f'shared_phone:{phone}')
                
                findings.append({
                    'type': 'shell_company',
                    'severity': 'medium',
                    'message': f"{len(vendors)} vendors share phone {phone}",
                    'vendors': list(vendors),
                    'attribute': 'phone',
                    'value': phone,
                    'details': {'phone': phone, 'vendor_count': len(vendors)}
                })
    
    # Find connected components (clusters of related vendors)
    for component in nx.connected_components(G):
        if len(component) > 2:
            findings.append({
                'type': 'shell_company',
                'severity': 'high',
                'message': f"Network of {len(component)} potentially related vendors detected",
                'vendors': list(component),
                'attribute': 'network_cluster',
                'value': f"{len(component)} vendors",
                'details': {'cluster_size': len(component), 'vendors': list(component)}
            })
    
    return findings

def detect_sod_violations(df):
    """Find records where creator also approved (SOD violation)."""
    findings = []
    
    if 'created_by' not in df.columns or 'approved_by' not in df.columns:
        return findings
    
    # Find rows where created_by == approved_by
    sod_mask = df['created_by'].astype(str).str.strip().str.lower() == df['approved_by'].astype(str).str.strip().str.lower()
    sod_rows = df[sod_mask]
    
    if len(sod_rows) == 0:
        return findings
    
    # Group by user
    user_violations = sod_rows.groupby('created_by').agg({
        'approved_by': 'count',
        'payment_amount': 'sum' if 'payment_amount' in sod_rows.columns else 'size'
    }).reset_index()
    user_violations.columns = ['user', 'violation_count', 'total_amount']
    
    for _, row in user_violations.iterrows():
        user = str(row['user']).strip()
        count = int(row['violation_count'])
        amount = float(row['total_amount']) if pd.notna(row['total_amount']) else 0
        
        severity = 'critical' if count > 10 else 'high' if count > 3 else 'medium'
        
        findings.append({
            'type': 'sod_violation',
            'severity': severity,
            'message': f"User '{user}' created and approved {count} payment(s)" + (f" totaling ${amount:,.2f}" if amount > 0 else ""),
            'user': user,
            'count': count,
            'total_amount': amount,
            'details': {'violation_count': count, 'total_amount': amount}
        })
    
    return findings

def detect_velocity_anomalies(df, threshold):
    """Flag payments above threshold and unusual velocity patterns."""
    findings = []
    
    if 'payment_amount' not in df.columns:
        return findings
    
    # Convert to numeric
    df['payment_amount_num'] = pd.to_numeric(df['payment_amount'], errors='coerce')
    
    # 1. Threshold violations
    if threshold is not None and threshold > 0:
        over_threshold = df[df['payment_amount_num'] > threshold]
        for _, row in over_threshold.iterrows():
            vendor = str(row.get('vendor_name', row.get('vendor_id', 'Unknown'))).strip()
            amount = float(row['payment_amount_num'])
            
            findings.append({
                'type': 'velocity_anomaly',
                'severity': 'high',
                'message': f"Payment of ${amount:,.2f} to {vendor} exceeds threshold of ${threshold:,.2f}",
                'vendor': vendor,
                'amount': amount,
                'threshold': threshold,
                'details': {'amount': amount, 'threshold': threshold, 'vendor': vendor}
            })
    
    # 2. Same-day multiple payments to same vendor (potential splitting)
    if 'payment_date' in df.columns and ('vendor_id' in df.columns or 'vendor_name' in df.columns):
        id_col = 'vendor_id' if 'vendor_id' in df.columns else 'vendor_name'
        df['payment_date_parsed'] = pd.to_datetime(df['payment_date'], errors='coerce')
        
        # Group by vendor and date
        daily = df.groupby([id_col, 'payment_date_parsed']).agg({
            'payment_amount_num': ['count', 'sum']
        }).reset_index()
        daily.columns = [id_col, 'date', 'payment_count', 'daily_total']
        
        # Flag vendors with 3+ payments same day
        multi_pay = daily[daily['payment_count'] >= 3]
        for _, row in multi_pay.iterrows():
            vendor = str(row[id_col]).strip()
            count = int(row['payment_count'])
            total = float(row['daily_total'])
            date_str = str(row['date'])[:10]
            
            findings.append({
                'type': 'velocity_anomaly',
                'severity': 'medium',
                'message': f"{count} payments to {vendor} on {date_str} totaling ${total:,.2f} — possible payment splitting",
                'vendor': vendor,
                'date': date_str,
                'payment_count': count,
                'daily_total': total,
                'details': {'payment_count': count, 'daily_total': total, 'date': date_str}
            })
    
    # 3. Vendor with abnormally high total payments
    if 'vendor_id' in df.columns or 'vendor_name' in df.columns:
        id_col = 'vendor_id' if 'vendor_id' in df.columns else 'vendor_name'
        vendor_totals = df.groupby(id_col)['payment_amount_num'].sum().reset_index()
        if len(vendor_totals) > 3:
            mean = vendor_totals['payment_amount_num'].mean()
            std = vendor_totals['payment_amount_num'].std()
            if std > 0:
                vendor_totals['zscore'] = (vendor_totals['payment_amount_num'] - mean) / std
                outliers = vendor_totals[vendor_totals['zscore'] > 2.5]
                for _, row in outliers.iterrows():
                    vendor = str(row[id_col]).strip()
                    total = float(row['payment_amount_num'])
                    findings.append({
                        'type': 'velocity_anomaly',
                        'severity': 'medium',
                        'message': f"Vendor {vendor} has unusually high total payments: ${total:,.2f}",
                        'vendor': vendor,
                        'total_amount': total,
                        'details': {'total_amount': total, 'zscore': float(row['zscore'])}
                    })
    
    return findings

# --- Main ---

def main():
    # Read JSON from stdin
    input_data = json.load(sys.stdin)
    
    files = input_data.get('files', [])
    threshold = input_data.get('threshold', 0)
    
    if not files:
        print(json.dumps({'error': 'No files provided'}))
        sys.exit(1)
    
    # Load and merge data
    try:
        df = merge_files(files)
    except Exception as e:
        print(json.dumps({'error': f'Failed to load files: {str(e)}'}))
        sys.exit(1)
    
    # Run detections
    findings = []
    findings.extend(detect_shell_companies(df))
    findings.extend(detect_sod_violations(df))
    findings.extend(detect_velocity_anomalies(df, threshold))
    
    # Build summary
    vendors = set()
    if 'vendor_id' in df.columns:
        vendors.update(df['vendor_id'].dropna().astype(str).tolist())
    if 'vendor_name' in df.columns:
        vendors.update(df['vendor_name'].dropna().astype(str).tolist())
    
    findings_by_type = defaultdict(int)
    for f in findings:
        findings_by_type[f['type']] += 1
    
    result = {
        'success': True,
        'findings': findings,
        'summary': {
            'totalRecords': len(df),
            'vendorsAnalyzed': len(vendors),
            'findingsCount': len(findings),
            'findingsByType': dict(findings_by_type)
        }
    }
    
    print(json.dumps(result, indent=2, default=str))

if __name__ == '__main__':
    main()
