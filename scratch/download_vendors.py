# CDN 라이브러리를 로컬로 다운로드하는 스크립트
import urllib.request
import re
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'static', 'vendor')
JS_DIR = os.path.join(BASE, 'js')
CSS_DIR = os.path.join(BASE, 'css')
FONT_DIR = os.path.join(BASE, 'webfonts')

os.makedirs(JS_DIR, exist_ok=True)
os.makedirs(CSS_DIR, exist_ok=True)
os.makedirs(FONT_DIR, exist_ok=True)

def download(url, dest):
    print(f'  {url}')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    with open(dest, 'wb') as f:
        f.write(data)
    print(f'  → {os.path.basename(dest)} ({len(data):,} bytes)')
    return data

print('=== JS 라이브러리 ===')
download('https://cdn.jsdelivr.net/npm/chart.js', os.path.join(JS_DIR, 'chart.min.js'))
download('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js', os.path.join(JS_DIR, 'xlsx.full.min.js'))
download('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', os.path.join(JS_DIR, 'supabase.min.js'))
download('https://cdn.jsdelivr.net/npm/flatpickr', os.path.join(JS_DIR, 'flatpickr.min.js'))
download('https://code.jquery.com/jquery-3.7.1.min.js', os.path.join(JS_DIR, 'jquery.min.js'))
download('https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js', os.path.join(JS_DIR, 'jquery.dataTables.min.js'))

print('\n=== CSS 라이브러리 ===')
download('https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css', os.path.join(CSS_DIR, 'flatpickr.min.css'))
download('https://cdn.datatables.net/1.13.6/css/jquery.dataTables.min.css', os.path.join(CSS_DIR, 'jquery.dataTables.min.css'))

print('\n=== Font Awesome ===')
fa_css_data = download(
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    os.path.join(CSS_DIR, 'fa-all.min.css')
)
# CSS에서 webfont 파일 목록 추출
fa_css_text = fa_css_data.decode('utf-8')
font_files = re.findall(r'url\(\.\.\/webfonts\/(fa-[^)]+\.(?:woff2|woff|ttf|eot|svg)[^)]*)\)', fa_css_text)
font_files = list(set(f.split('?')[0].split('#')[0] for f in font_files))
print(f'  webfont 파일 {len(font_files)}개 발견')
for fname in sorted(font_files):
    url = f'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/{fname}'
    download(url, os.path.join(FONT_DIR, fname))

print('\n=== Google Fonts (Inter) ===')
# CSS 다운로드 (woff2 URL 포함)
gf_url = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
req = urllib.request.Request(gf_url, headers={
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        gf_css = r.read().decode('utf-8')
    # woff2 URL들 다운로드
    woff2_urls = re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)', gf_css)
    woff2_urls = list(set(woff2_urls))
    print(f'  woff2 파일 {len(woff2_urls)}개 발견')
    local_css = gf_css
    for wurl in woff2_urls:
        fname = wurl.split('/')[-1].split('?')[0]
        dest = os.path.join(FONT_DIR, fname)
        download(wurl, dest)
        local_css = local_css.replace(wurl, f'../webfonts/{fname}')
    with open(os.path.join(CSS_DIR, 'inter.css'), 'w', encoding='utf-8') as f:
        f.write(local_css)
    print(f'  → inter.css 저장 완료')
except Exception as e:
    print(f'  Google Fonts 실패 (무시): {e}')

# Font Awesome CSS에서 ../webfonts/ 경로를 /static/vendor/webfonts/ 로 수정
fa_css_fixed = fa_css_text.replace('../webfonts/', '/static/vendor/webfonts/')
with open(os.path.join(CSS_DIR, 'fa-all.min.css'), 'w', encoding='utf-8') as f:
    f.write(fa_css_fixed)
print('\nFont Awesome CSS 경로 수정 완료')
print('\n✅ 다운로드 완료')
