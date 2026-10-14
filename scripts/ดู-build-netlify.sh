#!/bin/bash
# ดูว่า Netlify ยังสร้างเว็บให้อยู่ไหม — **อ่านอย่างเดียว ไม่แตะอะไร**
# 🔴 ทำไมต้องมีไฟล์นี้ (14 ต.ค. 2569): ด่านก่อน push อ่านสถานะจากไฟล์กลางที่ **คนต้องมาเขียนเอง**
#    ⇒ เก่าเกิน 24 ชม. ด่านจะบอกว่า "ไม่รู้" ซึ่งถูก **แต่ไม่ช่วยอะไรคนที่ยืนอยู่หน้าจอ**
#    🔑 เปลี่ยน "ไม่รู้" ให้เป็น "นี่คือวิธีรู้" (ฝั่งจอเสนอ · ผมเห็นด้วย)
# 🚫 **ห้ามให้สคริปต์นี้ไปเขียนไฟล์สถานะกลางเอง** — ไฟล์นั้นตอบว่า "มีคนไปกดสวิตช์หรือยัง"
#    ถ้าเครื่องเขียนให้ มันจะกลายเป็น "มีคนยืนยันแล้ว" ทั้งที่ไม่มีใครไปดูสวิตช์จริง
#    (ฝั่งจอปฏิเสธการเขียนเวลาใหม่เพื่อให้ด่านหายเตือน และนั่นถูก)
set -u
TOKEN_FILE="$HOME/.netlify-token"
[ -r "$TOKEN_FILE" ] || { echo "ไม่มี $TOKEN_FILE ⇒ ตรวจเองไม่ได้ ⇒ ยังถือว่าไม่รู้"; exit 2; }
T=$(tr -d '\n' < "$TOKEN_FILE" | sed 's/.*=//')
SITE="${1:-fe172c91-cd2d-42e3-9b58-f7542f72c5a4}"   # ปริยาย = gucut-storefront (หน้าร้าน gucut.com)
curl -s --max-time 20 -H "Authorization: Bearer $T" \
  "https://api.netlify.com/api/v1/sites/$SITE/deploys?per_page=3" |
python3 -c "
import json,sys,datetime
try: ds=json.load(sys.stdin)
except Exception as e:
    print('อ่านคำตอบไม่ได้:',e); sys.exit(2)
if not isinstance(ds,list) or not ds:
    print('ไม่มีรายการ deploy ⇒ ยังถือว่าไม่รู้'); sys.exit(2)
print('3 ใบล่าสุด (ของจริงจาก Netlify ตอนนี้):')
for d in ds[:3]:
    print('  %-10s %-8s %s  %s วิ' % (d.get('state'), str(d.get('commit_ref'))[:8], str(d.get('created_at'))[:19], d.get('deploy_time') or '-'))
now=datetime.datetime.now(datetime.timezone.utc)
def อายุ(d):
    try: return (now-datetime.datetime.fromisoformat(str(d.get('created_at')).replace('Z','+00:00'))).total_seconds()
    except Exception: return 1e9
สด=[d for d in ds if อายุ(d)<86400]
ok=('ready','building','uploading','processing')
if any(str(d.get('state')) in ok for d in สด):
    print('⇒ **build ยังเปิดอยู่** (มีใบที่สร้างสำเร็จ/กำลังสร้างใน 24 ชม.)')
elif สด:
    print('⇒ มีใบใน 24 ชม. แต่ไม่มีใบไหนสำเร็จ ⇒ **ไปดูสาเหตุที่ช่อง Deploys** ห้ามสรุปว่า build ถูกปิด')
else:
    print('⇒ ไม่มี deploy ใน 24 ชม. ⇒ **ยังสรุปไม่ได้** (อาจไม่มีใคร push เลย ไม่ใช่ build ถูกปิด)')
"
