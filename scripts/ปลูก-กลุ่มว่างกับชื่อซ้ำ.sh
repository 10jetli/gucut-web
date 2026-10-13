#!/bin/bash
# ยืนยันแล้ว: ต้องคืนไฟล์ข้อมูลทุกกรณีแม้เทสแดงตามแผน จึงคืนด้วย trap EXIT ไม่ผูกกับรหัสจบ
set -u
cd /home/jetli/gucut-web || exit 9
T=scripts/tests/parts-models-ของครบ.test.mjs
cp public/parts/f382.json "$CLAUDE_JOB_DIR/tmp/f382.bak2"
cp public/parts/f090.json "$CLAUDE_JOB_DIR/tmp/f090.bak2"
restore() {
  cp "$CLAUDE_JOB_DIR/tmp/f382.bak2" public/parts/f382.json
  cp "$CLAUDE_JOB_DIR/tmp/f090.bak2" public/parts/f090.json
  return 0
}
trap restore EXIT
try1() {
  out="$(node --experimental-test-module-mocks --test "$T" 2>&1)"; rc=$?
  printf '%s ⇒ rc=%s %s\n' "$1" "$rc" "$(printf '%s\n' "$out" | grep -E '^# (pass|fail)' | tr '\n' ' ')"
  printf '%s\n' "$out" | grep -E "ว่างแต่ไม่บอกเหตุ|ปุ่มอ่านเหมือนกันหมด" | head -1 | sed 's/^/     /'
}
try1 "⓪ ก่อนปลูก (ต้องเขียว)"
python3 -c "
import json,io
d=json.load(open('public/parts/f382.json'))
for g in d['กลุ่ม']: g.pop('ไม่มีอะไหล่เพราะ',None)
io.open('public/parts/f382.json','w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False))"
try1 "① กลุ่มว่างแบบเงียบ (ต้องแดง)"
restore
python3 -c "
import json,io
d=json.load(open('public/parts/f090.json'))
for g in d['กลุ่ม']: g['ชื่อ']='090, 090 G'
io.open('public/parts/f090.json','w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False))"
try1 "② ชื่อกลุ่มเหมือนกันหมด (ต้องแดง)"
restore
python3 -c "
import json,io
d=json.load(open('public/parts/f382.json'))
d['กลุ่ม']=[g for g in d['กลุ่ม'] if g['อะไหล่']]
io.open('public/parts/f382.json','w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False))"
try1 "③ แก้ด้วยการซ่อนกลุ่มว่าง (ต้องแดงที่ด่านภาพ ไม่ใช่เขียว)"
restore
try1 "④ คืนสภาพแล้ว (ต้องเขียว)"
