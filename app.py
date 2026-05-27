from flask import Flask, render_template, make_response, jsonify
import os, openpyxl

app = Flask(__name__)

PL_SUMMARY_PATH = os.path.join(os.path.dirname(__file__), 'Raw File', 'Packing List Summary.xlsx')

@app.route('/api/pl_summary')
def pl_summary():
    try:
        wb = openpyxl.load_workbook(PL_SUMMARY_PATH, read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(min_row=2, values_only=True))
        data = []
        for r in rows:
            if not r[1]:
                continue
            def _s(v):
                if v is None: return ''
                if hasattr(v, 'strftime'): return v.strftime('%Y-%m-%d')
                return str(v).strip()
            data.append({
                'packing':      _s(r[0]),
                'pkg_no':       _s(r[1]),
                'description':  _s(r[2]),
                'qty':          r[3] if isinstance(r[3], (int, float)) else '',
                'unit':         _s(r[4]),
                'status':       _s(r[5]),
                'on_site':      _s(r[6]),
                'custom_clear': _s(r[7]),
                'issue_date':   _s(r[8]),
                'request_date': _s(r[9]),
                'remark':       _s(r[10]),
            })
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/')
def index():
    response = make_response(render_template('index.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5100))
    app.run(host='0.0.0.0', port=port)
