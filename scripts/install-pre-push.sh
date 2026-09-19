#!/bin/bash
# ติดตั้งด่านก่อน push ลง .git/hooks/pre-push
#
# 🔴 ทำไมต้องมีไฟล์นี้ใน repo (สร้าง 19 ก.ย. 2569)
#    ด่านก่อน push เคยอยู่ **แค่ใน .git/hooks/ ของเครื่องผมเครื่องเดียว**
#    ⇒ `.git/hooks/` ไม่ถูกเก็บใน git ⇒ **เครื่องอื่น/บัญชีอื่น/clone ใหม่ ไม่มีด่านเลย**
#    ⇒ ด่านที่มีอยู่เครื่องเดียว ไม่ใช่ด่านของทีม · และไม่มีอะไรบอกว่ามันหายไป
#    🔑 ตัวด่านต้องอยู่ที่เดียวกับโค้ดที่มันเฝ้า ไม่งั้นมันจะหายไปเงียบ ๆ ตอน clone
#
# 🔴 **แก้คำที่ผมเขียนผิดใน commit ก่อน (19 ก.ย. 2569)**
#    ผมเขียนไว้ว่า "ฝั่งจอเป็นคนติดตั้งด่าน + ตั้งไฟล์หยุด deploy ตอน 09:39"
#    ⇒ **ไม่จริง เขาไม่ได้ทำ และเขาเป็นคนแจ้งกลับมาเอง**
#    หลักฐานที่ไล่ได้: `~/bin/freeze-deploy.sh` (09:39) อ้างคำพูดท่านประธานตรง ๆ
#      *"วันนี้ลองไม่ใช้เครดิตทำได้ไหม ทุกส่วน"* + ตัวเลขวัดจริงจาก API
#      (deploy 990 จาก 1,071.2 = 92.4% · commit ขึ้น main 18–19 ก.ย. 117 ใบท่อ + 131 ใบจอ)
#    ⇒ **คำสั่งเป็นของท่านประธาน** · แต่ **ใครลงมือรัน ยังไม่ทราบ** (ไม่มี log ไม่มีชื่อผู้รัน)
#    🔑 รูปแบบการเขียนที่เหมือนกันไม่ใช่หลักฐานว่าใครเขียน — ทีมเขียนคล้ายกันทั้งทีม
#    🔑 และข้อที่ฝั่งจอชี้ว่าสำคัญกว่า: **ไม่รู้ว่าใครตั้ง = ไม่รู้ว่าใครมีสิทธิ์ถอด**
#       ⇒ พรุ่งนี้มันอาจหายไปแล้วทุกคนยังเชื่อว่าถูกล็อกอยู่ ⇒ ถามท่านประธานแล้ว
#
# วิธีใช้:  bash scripts/install-pre-push.sh
set -eu
cd "$(git rev-parse --show-toplevel)"
mkdir -p .git/hooks
cat > .git/hooks/pre-push <<'HOOK_EOF'
#!/bin/bash
# ด่านก่อน push — สร้างโดย scripts/install-pre-push.sh
# ข้ามได้ด้วย SKIP_PREPUSH=1 git push  (ใช้เมื่อจำเป็นจริง ๆ และรู้ว่าทำอะไรอยู่)
set -u
[ "${SKIP_PREPUSH:-}" = "1" ] && { echo "⏭  ข้ามด่านก่อน push ตามที่สั่ง"; exit 0; }

cd "$(git rev-parse --show-toplevel)" || exit 0

# ── 🧊 วันหยุด deploy (ตั้งด้วย scripts/freeze-deploy.sh) ──
# ทุกครั้งที่ push = สร้างเว็บใหม่ = เครดิต · deploy กิน 92% ของทั้งหมด
FREEZE="$HOME/.gucut-deploy-freeze"
if [ -f "$FREEZE" ]; then
  echo "🧊 กำลังหยุด deploy อยู่ — ไม่ push"
  sed "s/^/   /" "$FREEZE"
  echo "   งานที่ทำเสร็จให้ commit เก็บไว้ในเครื่องก่อน แล้ว push รวมรอบเดียวตอนเลิกหยุด"
  echo "   ของด่วนจริง ๆ: SKIP_PREPUSH=1 git push"
  exit 1
fi

echo "🚦 ด่านก่อน push — กัน build พังไม่ให้เผาเครดิต"

# ── หา node ที่รันชุดทดสอบได้ (ต้อง >= 20.18 เพราะ --experimental-test-module-mocks) ──
# ⚠️ เครื่อง CEO เป็น node 20.15 ซึ่งรันไม่ได้ ⇒ **เคยมองไม่เห็นผลทดสอบจริงมาตลอด**
#    ของที่รันไม่ได้ ห้ามถือว่า "ผ่าน" (กฎ three-states-not-two)
pick_node() {
  for c in "$NODE_FOR_TESTS" node /opt/homebrew/bin/node /usr/local/bin/node \
           "$HOME"/.nvm/versions/node/*/bin/node /private/tmp/claude-*/*/*/scratchpad/nodenew/bin/node; do
    [ -x "$c" ] || command -v "$c" >/dev/null 2>&1 || continue
    v=$("$c" -p "process.versions.node" 2>/dev/null) || continue
    maj=${v%%.*}; rest=${v#*.}; min=${rest%%.*}
    if [ "${maj:-0}" -gt 20 ] || { [ "${maj:-0}" -eq 20 ] && [ "${min:-0}" -ge 18 ]; }; then
      echo "$c"; return 0
    fi
  done
  return 1
}
NODE_FOR_TESTS="${NODE_FOR_TESTS:-}"
N="$(pick_node)" || {
  echo "❌ ไม่พบ node ที่รันชุดทดสอบได้ (ต้อง >= 20.18)"
  echo "   ของที่รันไม่ได้ ห้ามถือว่าผ่าน — ติดตั้ง node ใหม่ หรือตั้ง NODE_FOR_TESTS=/path/to/node"
  echo "   ถ้าจำเป็นจริง ๆ: SKIP_PREPUSH=1 git push"
  exit 1
}

echo "   node ที่ใช้ทดสอบ: $("$N" -v)"
if ! "$N" --experimental-test-module-mocks --test scripts/tests/*.test.mjs > /tmp/prepush-test.log 2>&1; then
  echo "❌ ชุดทดสอบไม่ผ่าน — ไม่ push"
  grep -E "^# (tests|pass|fail)|^not ok" /tmp/prepush-test.log | head -12
  echo "   (ผลเต็มที่ /tmp/prepush-test.log)"
  exit 1
fi
grep -E "^# (tests|pass|fail)" /tmp/prepush-test.log | sed 's/^/   /'

if ! node scripts/check-floating.mjs > /tmp/prepush-float.log 2>&1; then
  echo "❌ เจอ promise ปล่อยลอยในโค้ดเซิร์ฟเวอร์ — ไม่ push"
  tail -5 /tmp/prepush-float.log
  exit 1
fi

# ── 🚧 ด่านความถี่ — **ห้าม ไม่ใช่เตือน** (เปลี่ยน 19 ก.ย. 2569) ──
# 🔴 ของเดิมเป็นคำเตือนโดยตั้งใจ เหตุผลที่เขียนไว้คือ "วันที่ของพังจริงต้องแก้ได้ทันที"
#    ⇒ เหตุผลนั้นยังถูก **แต่คำเตือนไม่ทำงาน**: 19 ก.ย. 2569 ผม push 20 รอบใน 3 ชั่วโมง
#      คำเตือนนี้ขึ้นเกือบทุกครั้ง และผมเดินผ่านมันไปทุกครั้ง
#      ⇒ อัตราเผาเครดิตขึ้นจาก 404/วัน เป็น 3,965/วัน (ตัวเฝ้าบน g1 ร้องเอง)
# 🔑 กติกาที่พลาดซ้ำ ต้องเป็น **ด่าน** ไม่ใช่คำเตือน — แต่ต้องมีทางด่วนที่ "ต้องตั้งใจกด"
#    ⇒ ห้ามเป็นค่าเริ่มต้น · ของด่วนไปทางด่วนได้ทันทีด้วยตัวแปรเดียว
STAMP="$(git rev-parse --git-dir)/.last-push-at"
NOW=$(date +%s)
MINGAP="${PUSH_MIN_GAP_MIN:-45}"
if [ -f "$STAMP" ]; then
  LAST=$(cat "$STAMP" 2>/dev/null || echo 0)
  DIFF=$(( (NOW - LAST) / 60 ))
  if [ "$DIFF" -lt "$MINGAP" ]; then
    if [ "${ALLOW_FAST_PUSH:-}" = "1" ]; then
      echo "⏩ push ถี่ (ห่างจากครั้งก่อน $DIFF นาที) — ผ่านเพราะสั่ง ALLOW_FAST_PUSH=1"
    else
      AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "?")
      echo "🛑 ไม่ push — ห่างจากครั้งก่อนเพียง $DIFF นาที (เกณฑ์ $MINGAP นาที)"
      echo "   ทุกครั้งที่ push = สร้างเว็บใหม่ทั้งก้อน · deploy กินเครดิตเกือบทั้งหมด"
      echo "   ตอนนี้ค้างอยู่ $AHEAD commit — รวบไปรอบเดียวจ่ายครั้งเดียว"
      echo ""
      echo "   ของพังจริง/ของด่วน:  ALLOW_FAST_PUSH=1 git push"
      echo "   (เจตนาของด่านนี้คือให้ 'ถี่' เป็นการตัดสินใจ ไม่ใช่ค่าเริ่มต้น)"
      exit 1
    fi
  fi
fi
echo "$NOW" > "$STAMP"

echo "✅ ผ่านด่าน — push ได้"
HOOK_EOF
chmod +x .git/hooks/pre-push
echo "✅ ติดตั้งด่านก่อน push แล้ว (.git/hooks/pre-push)"
echo "   ข้ามทั้งด่าน:      SKIP_PREPUSH=1 git push"
echo "   ข้ามเฉพาะความถี่:  ALLOW_FAST_PUSH=1 git push"
