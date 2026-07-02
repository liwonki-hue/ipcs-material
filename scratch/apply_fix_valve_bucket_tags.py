# dryrun_fix_valve_bucket_tags.py가 만든 계획대로 receiving.tag/parent_tag 실제 업데이트 실행
import urllib.request, json, sys

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json'}

with open(r'C:\Users\PCLOVE\AppData\Local\Temp\claude\c--Users-PCLOVE-Downloads-ipcs-material\565a3270-4679-47da-bc13-498ce4c05c3b\scratchpad\valve_tag_fix_plan.json', encoding='utf-8') as f:
    updates = json.load(f)

print(f'applying {len(updates)} updates...')
ok, fail = 0, 0
for i, u in enumerate(updates):
    body = json.dumps({'tag': u['new_tag'], 'parent_tag': u['parent_tag']}).encode('utf-8')
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/receiving?id=eq.{u['id']}", data=body, headers=H, method='PATCH')
    try:
        urllib.request.urlopen(req)
        ok += 1
    except urllib.error.HTTPError as e:
        fail += 1
        print(f"  FAIL id={u['id']}: {e.code} {e.read().decode()}")
    if (i + 1) % 100 == 0:
        print(f'  {i+1}/{len(updates)} done')

print(f'done. ok={ok} fail={fail}')
