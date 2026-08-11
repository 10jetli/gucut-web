#!/usr/bin/env python3
# รวมรีวิว TikTok Shop (พร้อมคลิป) เข้ากับ src/data/reviews.json
# คลิปโหลดมาเก็บไว้เองที่ public/rv-video/<id>.mp4 + <id>.jpg (poster) แล้ว
# ใช้กฎจับคู่สินค้าตัวเดียวกับ map-lazada.py
import json, re, datetime, os

RAW = "/mnt/user-data/uploads/Downloads/gucut-tiktok.json"

src = open("scripts/map-lazada.py", encoding="utf-8").read()
ns = {}
exec(compile(src[: src.index("raw = json.load(open(RAW")], "m", "exec"), ns)
match = ns["match"]

prods = json.load(open("src/data/products.json", encoding="utf-8"))
handles = {p["h"] for p in prods}
data = json.load(open("src/data/reviews.json", encoding="utf-8"))
tt = json.load(open(RAW, encoding="utf-8"))["rows"]

def iso(ms):
    try:
        return datetime.datetime.utcfromtimestamp(int(ms) / 1000).strftime("%Y-%m-%d")
    except Exception:
        return ""

added = 0
unmatched = 0
novideo_missing = 0
cache = {}
for r in tt:
    txt = (r.get("c") or "").strip()
    imgs = [u for u in r.get("m", []) if u]
    vids = r.get("v", [])
    if not txt and not imgs and not vids:
        continue                       # ให้ดาวเปล่า ๆ ไม่ต้องโชว์
    t = r.get("p", "")
    if t not in cache:
        cache[t] = match(t)
    h = cache[t]
    if not h or h not in handles:
        unmatched += 1
        continue
    item = {
        "src": "tiktok",
        "rating": int(r.get("r") or 5),
        "author": (r.get("a") or "").strip() or "ลูกค้า GUCUT",
        "text": txt,
        "images": imgs,
        "date": iso(r.get("t")),
    }
    v = vids[0] if vids else None
    if v:
        mp4 = f"public/rv-video/{v['id']}.mp4"
        if os.path.exists(mp4):
            item["video"] = {"id": v["id"], "dur": v.get("dur") or 0,
                             "w": v.get("w") or 480, "h": v.get("h") or 854}
        else:
            novideo_missing += 1
    entry = data.setdefault(h, {"avg": 5.0, "count": 0, "items": []})
    key = (item["text"].strip().lower(), item["date"])
    have = {(i["text"].strip().lower(), i["date"]) for i in entry["items"]}
    if key in have and not item.get("video"):
        continue
    entry["items"].append(item)
    added += 1

# เรียงใหม่: มีคลิปขึ้นก่อน แล้วค่อยไล่ตามวันที่
for h, e in data.items():
    e["items"].sort(key=lambda x: (1 if x.get("video") else 0, x["date"]), reverse=True)
    if not e["count"]:
        e["count"] = len(e["items"])
        rs = [i["rating"] for i in e["items"]] or [5]
        e["avg"] = round(sum(rs) / len(rs), 1)

json.dump(data, open("src/data/reviews.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

with_video = sum(1 for e in data.values() for i in e["items"] if i.get("video"))
print(f"เพิ่มรีวิว TikTok {added} ใบ · จับคู่ไม่ได้ {unmatched} · คลิปหาย {novideo_missing}")
print(f"รวมทั้งหมด: {len(data)} สินค้า · {sum(len(e['items']) for e in data.values())} การ์ด · มีคลิป {with_video}")
