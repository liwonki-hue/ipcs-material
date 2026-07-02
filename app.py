from flask import Flask, render_template, make_response
from flask_compress import Compress
import os

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0  # 정적 파일 캐시 비활성화 (항상 최신 로드)
app.config['TEMPLATES_AUTO_RELOAD'] = True
Compress(app)  # 정적 파일(app.js 등) gzip 압축으로 전송량 축소

@app.route('/')
def index():
    response = make_response(render_template('index.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5200))
    app.run(host='0.0.0.0', port=port)
