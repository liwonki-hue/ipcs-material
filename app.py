from flask import Flask, render_template, make_response
import pandas as pd
import json
import os

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0  # Disable static file caching
app.config['TEMPLATES_AUTO_RELOAD'] = True   # Always reload templates from disk

# --- API Endpoints for Dashboard ---
@app.route('/api/dashboard/stats')
def get_stats():
    try:
        # Load the latest analysis results
        report_path = os.path.join(os.getcwd(), 'BOM_PL_Automation_Final.xlsx')
        iso_path = os.path.join(os.getcwd(), 'ISO_Readiness_Analysis.xlsx')
        
        if not os.path.exists(report_path) or not os.path.exists(iso_path):
            return json.dumps({"error": "Analysis files not found. Run matching first."})

        # Basic Stats
        df_match = pd.read_excel(report_path)
        total_bom = int(df_match['BOM_Total_Qty'].sum())
        total_rec = int(df_match['PL_Total_Qty'].sum())
        progress = round((total_rec / total_bom * 100), 1) if total_bom > 0 else 0
        
        # ISO Stats
        df_iso = pd.read_excel(iso_path)
        status_counts = df_iso['Status'].value_counts().to_dict()
        
        return json.dumps({
            "total_bom": total_bom,
            "total_rec": total_rec,
            "progress": progress,
            "iso_ready": status_counts.get('READY TO INSTALL', 0),
            "iso_priority": status_counts.get('HIGH PRIORITY (Almost Ready)', 0),
            "iso_shortage": status_counts.get('CRITICAL SHORTAGE', 0)
        })
    except Exception as e:
        return json.dumps({"error": str(e)})

@app.route('/api/dashboard/priority-isos')
def get_priority_isos():
    try:
        iso_path = os.path.join(os.getcwd(), 'ISO_Readiness_Analysis.xlsx')
        if not os.path.exists(iso_path):
            return json.dumps([])
        
        df_iso = pd.read_excel(iso_path)
        # Filter for high readiness but not yet 100% (or include 100%)
        priority_df = df_iso.sort_values(by='Readiness_%', ascending=False).head(10)
        
        return priority_df.to_json(orient='records')
    except Exception as e:
        return json.dumps({"error": str(e)})

@app.route('/api/dashboard/intelligent-readiness')
def get_intelligent_readiness():
    try:
        # DB 뷰(material.v_iso_intelligent_status)에서 직접 조회하거나, 
        # 로직 연동을 위해 로컬 캐시를 활용할 수 있습니다. 
        # 여기서는 고성능을 위해 뷰의 데이터를 활용하는 가이드를 제공합니다.
        # (실제 구현 시 Supabase JS 클라이언트가 직접 뷰를 조회하도록 app.js에서 처리도 가능합니다)
        return json.dumps({"status": "success", "message": "View is ready in Supabase"})
    except Exception as e:
        return json.dumps({"error": str(e)})

@app.route('/')
def index():
    response = make_response(render_template('index.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Flask automatically serves files from 'static/' folder at '/static/...'
# But if you want to keep the root path for specific reasons (not recommended but for compatibility),
# you can add routes here. Let's go with standard Flask static handling.

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5100))
    # Use 0.0.0.0 for external access in Render performance environment
    app.run(host='0.0.0.0', port=port)
