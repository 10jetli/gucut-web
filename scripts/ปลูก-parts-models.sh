#!/bin/bash
# ยืนยันแล้ว: ตัวคืนสภาพต้องเดินทุกกรณีโดยตั้งใจ เพราะของที่ปลูกคือไฟล์ข้อมูลจริงในรีโปร่วม
#   ถ้าให้มันขึ้นกับรหัสจบของเทส (ซึ่งต้อง "แดง" ตามแผน) ไฟล์จะค้างสภาพปลูกไว้ถาวร
#   ⇒ จึงคืนด้วย trap EXIT + คืนซ้ำหลังแต่ละตา · และตัดสินผลจาก rc ที่เก็บไว้ ไม่ใช่จากไปป์
set -u
cd /home/jetli/gucut-web || exit 9
T=scripts/tests/parts-models-ของครบ.test.mjs
cp public/parts/f180.json "$CLAUDE_JOB_DIR/tmp/f180.bak"
cp public/parts/f660.json "$CLAUDE_JOB_DIR/tmp/f660.bak"
restore() {
  cp "$CLAUDE_JOB_DIR/tmp/f180.bak" public/parts/f180.json
  cp "$CLAUDE_JOB_DIR/tmp/f660.bak" public/parts/f660.json
  if [ -f "$CLAUDE_JOB_DIR/tmp/a.webp.bak" ]; then mv "$CLAUDE_JOB_DIR/tmp/a.webp.bak" public/parts/f180/a.webp; fi
  rmdir public/parts/zzz 2>/dev/null
  return 0
}
trap restore EXIT
try1() {
  out="$(node --experimental-test-module-mocks --test "$T" 2>&1)"
  rc=$?
  SUM="$(printf '%s\n' "$out" | grep -E '^# (pass|fail)' | tr '\n' ' ')"
  WHY="$(printf '%s\n' "$out" | grep -E 'ไม่มีไฟล์|ไม่บอกเหตุ|ได้ของผิดชิ้น|ไม่อยู่ในรายการรุ่น' | head -1)"
  printf '%s ⇒ rc=%s %s\n' "$1" "$rc" "$SUM"
  if [ -n "$WHY" ]; then printf '     %s\n' "$WHY"; fi
}
try1 "⓪ ก่อนปลูก        (ต้องเขียว)"
mv public/parts/f180/a.webp "$CLAUDE_JOB_DIR/tmp/a.webp.bak"
try1 "① ภาพหาย          (ต้องแดง)"
restore
python3 -c "
import json,io
d=json.load(open('public/parts/f180.json')); d.pop('จุดกดอ่านไม่ได้')
io.open('public/parts/f180.json','w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False))"
try1 "② ไม่มีจุดไม่บอกเหตุ (ต้องแดง)"
restore
python3 -c "
import json,io
d=json.load(open('public/parts/f660.json')); d.pop('จุดกดอ่านไม่ได้',None)
for g in d['กลุ่ม']: g['จุด']=[{'เลข':'99','x':0.4732,'y':0.9787}]
io.open('public/parts/f660.json','w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False))"
try1 "③ จุดขยะกลับมา     (ต้องแดง)"
restore
mkdir -p public/parts/zzz
try1 "④ โฟลเดอร์ค้าง     (ต้องแดง)"
restore
try1 "⑤ คืนสภาพแล้ว      (ต้องเขียว)"
