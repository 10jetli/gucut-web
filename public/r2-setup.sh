#!/bin/bash
# =============================================================================
# GUCUT — ตัวช่วยย้ายคลิปขึ้น Cloudflare R2 (รันบน Mac)
#
# วิธีใช้: เปิดแอป Terminal แล้ววางบรรทัดนี้บรรทัดเดียว
#
#   bash <(curl -fsSL https://new78.com/r2-setup.sh)
#
# สคริปต์จะ: ลงเครื่องมือที่ขาด → โหลดโปรเจกต์ → ถามคีย์ R2 (3 ค่า) →
# ลองย้าย 5 คลิปแรก → ถามก่อนรันเต็ม 459 คลิป
# รันซ้ำได้เสมอ ใบที่เสร็จแล้วข้ามให้เอง ปิดเครื่องกลางทางแล้วมารันต่อได้
# =============================================================================
set -euo pipefail

say()  { printf '\n\033[1;33m== %s ==\033[0m\n' "$1"; }
ask()  { local v; read -rp "$1 " v </dev/tty; printf '%s' "$v"; }
asks() { local v; read -rsp "$1 " v </dev/tty; echo >/dev/tty; printf '%s' "$v"; }

# ---------- 1) Homebrew ----------
if ! command -v brew >/dev/null 2>&1; then
  # เครื่อง Apple Silicon ลง brew ไว้ที่ /opt/homebrew ซึ่งบางที Terminal ยังไม่รู้จัก
  [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)" || true
fi
if ! command -v brew >/dev/null 2>&1; then
  say "ยังไม่มี Homebrew — กำลังติดตั้ง (ระบบจะถามรหัสผ่านเครื่อง Mac)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/tty
  [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
  [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
fi

# ---------- 2) เครื่องมือ ----------
say "ตรวจเครื่องมือ (ffmpeg / rclone / node / git)"
need=()
for t in ffmpeg rclone node git; do
  command -v "$t" >/dev/null 2>&1 || need+=("$t")
done
if [ ${#need[@]} -gt 0 ]; then
  echo "กำลังลง: ${need[*]} (รอสักพัก)"
  brew install "${need[@]}"
else
  echo "ครบแล้ว ✓"
fi

# ---------- 3) โปรเจกต์ ----------
say "โหลดโปรเจกต์เว็บ"
cd "$HOME"
if [ -d "$HOME/gucut-web/.git" ]; then
  echo "มีอยู่แล้ว — ดึงเวอร์ชันล่าสุด"
  git -C "$HOME/gucut-web" pull --ff-only || true
else
  git clone --depth 1 https://github.com/10jetli/gucut-web.git
fi
cd "$HOME/gucut-web"

# ---------- 4) คีย์ R2 ----------
say "เชื่อมกับ Cloudflare R2"
if rclone listremotes 2>/dev/null | grep -q '^r2:'; then
  reuse=$(ask "เคยใส่คีย์ไว้แล้ว — ใช้คีย์เดิมเลยไหม? (y = ใช้เดิม / n = ใส่ใหม่):")
else
  reuse="n"
fi
if [ "$reuse" != "y" ] && [ "$reuse" != "Y" ]; then
  echo "เอาค่าจากหน้า Cloudflare ตอนสร้าง API token (Object Read & Write)"
  AK=$(ask  "1/3 Access Key ID:")
  SK=$(asks "2/3 Secret Access Key (พิมพ์แล้วไม่ขึ้นตัวหนังสือ ปกติครับ):")
  EP=$(ask  "3/3 Endpoint (https://xxxx.r2.cloudflarestorage.com):")
  # เผื่อวางมาแค่ Account ID เปล่า ๆ — ประกอบ URL ให้เอง
  case "$EP" in
    https://*) : ;;
    *) EP="https://${EP}.r2.cloudflarestorage.com" ;;
  esac
  rclone config create r2 s3 provider=Cloudflare \
    access_key_id="$AK" secret_access_key="$SK" endpoint="$EP" acl=private >/dev/null
fi

echo "ทดสอบการเชื่อมต่อ..."
if ! rclone lsd r2: >/dev/null 2>&1; then
  echo "✗ ต่อ R2 ไม่ได้ — เช็คว่าคีย์คัดลอกมาครบ แล้วรันสคริปต์นี้ใหม่อีกครั้ง"
  exit 1
fi
if ! rclone lsd r2: 2>/dev/null | grep -q 'gucut-video'; then
  echo "✗ ต่อได้แต่ไม่เห็น bucket gucut-video — เช็คว่าตอนสร้าง token เลือก bucket ถูก"
  exit 1
fi
echo "เชื่อม R2 สำเร็จ ✓"

# ---------- 5) ลอง 5 ใบแรก ----------
say "ทดลองย้าย 5 คลิปแรก (ใบละ 1-2 นาที)"
node scripts/video-to-r2.mjs --limit 5

# ---------- 6) รันเต็ม ----------
say "5 ใบแรกเรียบร้อย"
go=$(ask "รันต่อทั้งหมด 459 คลิปเลยไหม? ใช้เวลาหลายชั่วโมง ทิ้งเครื่องไว้ได้ (y/n):")
if [ "$go" = "y" ] || [ "$go" = "Y" ]; then
  node scripts/video-to-r2.mjs
  say "ย้ายครบทุกใบแล้ว 🎉 — กลับไปบอก Claude ในแชทว่า \"ย้ายคลิปเสร็จแล้ว\""
else
  echo "ไว้ค่อยรันต่อก็ได้ — พิมพ์:  cd ~/gucut-web && node scripts/video-to-r2.mjs"
fi
