from flask import Flask, render_template, make_response, jsonify
import os, json

app = Flask(__name__)

PL_SUMMARY_PATH = os.path.join(os.path.dirname(__file__), 'static', 'data', 'pl_summary.json')

@app.route('/api/pl_summary')
def pl_summary():
    try:
        with open(PL_SUMMARY_PATH, encoding='utf-8') as f:
            data = json.load(f)
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
