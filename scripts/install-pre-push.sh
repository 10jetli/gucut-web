#!/bin/bash
# ติดตั้งด่านก่อน push — กัน build ที่พังไม่ให้ขึ้นไปเผาเครดิต
#
# 🔴 ทำไมต้องมี (19 ก.ย. 2569)
#    เครดิต Netlify เผา 3,965/วัน ⇒ เหลืออีก ~4.8 วัน
#    วัดจริง: **92.2% ของเครดิตทั้งหมดคือการสร้างเว็บใหม่ (deploy)**
#    (deploy 960 · ฟังก์ชัน 41 · คำขอ 20 · แบนด์วิดท์ 19 จาก 1,040.7)
#    เมื่อวันเดียวมี commit ขึ้น main 107 ใบ · build ครั้งละ ~1 นาที 45 วินาที
#    และมี 3 รอบที่ build **พัง** เพราะบั๊กที่ทดสอบในเครื่องจับได้อยู่แล้ว
#    ⇒ build ที่พังกินเครดิตเท่ากับ build ที่สำเร็จ = เผาทิ้งเปล่า ๆ
#
# 🔑 ด่านนี้ไม่ได้ห้าม push — มันห้าม push **ของที่รู้อยู่แล้วว่าพัง**
#
# ติดตั้ง: bash scripts/install-pre-push.sh   (ทุกเครื่อง ทุกบัญชี ต้องติดตั้งเอง)
set -u
HOOK="$(git rev-parse --git-dir)/hooks/pre-push"

cat > "$HOOK" <<'HOOKEOF'
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

# ── เตือนเรื่องความถี่ (ไม่บล็อก) ──
# 🔑 เตือน ไม่ห้าม — วันที่ของพังจริงต้องแก้ได้ทันที การบล็อกจะไปขวางของด่วน
STAMP="$(git rev-parse --git-dir)/.last-push-at"
NOW=$(date +%s)
if [ -f "$STAMP" ]; then
  LAST=$(cat "$STAMP" 2>/dev/null || echo 0)
  DIFF=$(( (NOW - LAST) / 60 ))
  if [ "$DIFF" -lt 45 ]; then
    echo "⚠️  push ครั้งก่อนเพิ่งผ่านไป $DIFF นาที"
    echo "    ทุกครั้งที่ push = สร้างเว็บใหม่ทั้งก้อน (~1 นาที 45 วินาที)"
    echo "    deploy กินเครดิต 92% ของทั้งหมด ⇒ รวบงานแล้ว push รอบเดียวประหยัดกว่ามาก"
  fi
fi
echo "$NOW" > "$STAMP"

echo "✅ ผ่านด่าน — push ได้"
HOOKEOF

chmod +x "$HOOK"
echo "✅ ติดตั้งด่านก่อน push แล้วที่ $HOOK"
echo "   ทดสอบ: git push --dry-run  (จะรันชุดทดสอบให้ดูก่อน)"
