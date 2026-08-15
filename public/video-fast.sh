#!/bin/bash
# =============================================================================
# GUCUT — ทำให้คลิปเล่นไวขึ้น (ตั้งตัวเสิร์ฟคลิปของเราเองบน Cloudflare)
#
# วิธีใช้: เปิดแอป Terminal แล้ววางบรรทัดนี้บรรทัดเดียว
#
#   bash <(curl -fsSL https://new78.com/video-fast.sh)
#
# ปัญหาที่แก้: ตอนนี้คลิปเสิร์ฟผ่านลิงก์ pub-xxx.r2.dev ซึ่ง Cloudflare
# ตั้งใจไม่แคชและจำกัดความเร็ว (มีไว้ให้ทดสอบ) ทุกคนที่เปิดดูจึงวิ่งไปถึง
# เซิร์ฟเวอร์ที่สิงคโปร์ทุกครั้ง  ตัวนี้ตั้ง "คนกลาง" ของเราเองที่แคชไฟล์ไว้
# ตามเมืองต่าง ๆ รวมถึงในไทย คนดูคนที่สองเป็นต้นไปจะได้ไฟล์จากในประเทศ
#
# ใช้เวลาราว 2 นาที · ระบบจะเปิดหน้าเว็บให้กดอนุญาต Cloudflare หนึ่งครั้ง
# =============================================================================
set -euo pipefail

say() { printf '\n\033[1;33m== %s ==\033[0m\n' "$1"; }

[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)" || true
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)" || true

say "ตรวจเครื่องมือ"
command -v node >/dev/null 2>&1 || { echo "ยังไม่มี node — รัน bash <(curl -fsSL https://new78.com/r2-setup.sh) ก่อน"; exit 1; }
command -v git  >/dev/null 2>&1 || { echo "ยังไม่มี git"; exit 1; }

say "โหลดโปรเจกต์เว็บ"
cd "$HOME"
if [ -d "$HOME/gucut-web/.git" ]; then
  git -C "$HOME/gucut-web" pull --ff-only || true
else
  git clone --depth 1 https://github.com/10jetli/gucut-web.git
fi
cd "$HOME/gucut-web/workers/video"

say "เข้าสู่ระบบ Cloudflare (เปิดหน้าเว็บให้กดอนุญาต)"
npx --yes wrangler@latest login </dev/tty

say "ติดตั้งตัวเสิร์ฟคลิป"
npx --yes wrangler@latest deploy 2>&1 | tee /tmp/gucut-worker.log

URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' /tmp/gucut-worker.log | head -1)
say "เสร็จแล้ว"
if [ -n "$URL" ]; then
  echo "ที่อยู่ใหม่ของคลิป:"
  echo "    $URL"
  echo
  echo "ก๊อปบรรทัดบนไปส่งให้ Claude ในแชท แล้วบอกว่า \"ตั้ง HOST เป็นอันนี้\""
else
  echo "ติดตั้งเสร็จแล้วแต่หา URL ไม่เจอในผลลัพธ์ — ก๊อปข้อความด้านบนส่งให้ Claude ดูได้เลย"
fi
