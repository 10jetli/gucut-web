#!/usr/bin/env python3
"""
เติมรีวิวที่ยัง "จับคู่สินค้าไม่ได้" ตอนรันรอบก่อน เข้า src/data/reviews.json

ใช้ตอนเพิ่มสินค้าใหม่เข้าแคตตาล็อก (เช่นปลด DRAFT) แล้วอยากดึงรีวิวเก่าที่ค้างอยู่มาใส่
รันซ้ำได้ปลอดภัย — มีตัวกันซ้ำ ถ้าไม่มีอะไรใหม่ก็ไม่เปลี่ยนไฟล์

    python3 scripts/add-new-reviews.py
"""
import json, os, re, datetime
from collections import defaultdict

UP = "/mnt/user-data/uploads/Downloads"
SOURCES = [
    ("lazada", f"{UP}/gucut-lazada-raw.json", ""),
    ("shopee", f"{UP}/gucut-shopee.json", "https://down-th.img.susercontent.com/file/"),
    ("tiktok", f"{UP}/gucut-tiktok.json", ""),
]
MAX_IMG = 4

# ใช้ตัวจับคู่ตัวเดียวกับ map-lazada.py (แค่ส่วนหัว ไม่รันส่วนเขียนไฟล์)
_src = open("scripts/map-lazada.py", encoding="utf-8").read()
_ns = {}
exec(compile(_src[: _src.index("raw = json.load(open(RAW")], "map-lazada", "exec"), _ns)
match, thai_date = _ns["match"], _ns["thai_date"]

prods = json.load(open("src/data/products.json", encoding="utf-8"))
handles = {p["h"] for p in prods}
data = json.load(open("src/data/reviews.json", encoding="utf-8"))


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def key_of(h, it):
    """กติกาเดียวกับ map-lazada.py: ข้อความซ้ำที่ 'ไม่มีรูป' ถือเป็นใบเดียวกัน
    ส่วนรีวิวที่มีรูปถือเป็นคนละใบเสมอ (คนละคนถ่ายคนละรูป)"""
    imgs = it.get("images") or []
    if not imgs:
        return (h, norm(it.get("text")))
    return (h, it.get("src"), it.get("date"), norm(it.get("text")),
            imgs[0].split("/")[-1].split("?")[0])


seen = {key_of(h, it) for h, e in data.items() for it in e["items"]}


def img_url(v, base):
    v = (v or "").strip()
    if not v:
        return ""
    return v.split("?")[0] if v.startswith("http") else base + v


def date_of(src, r):
    if src == "lazada":
        return thai_date(r.get("g") or r.get("t") or "")
    try:
        return datetime.datetime.utcfromtimestamp(int(r.get("t"))).strftime("%Y-%m-%d")
    except Exception:
        return ""


added = defaultdict(int)
skipped_dupe = unmatched = 0

for src, path, base in SOURCES:
    if not os.path.exists(path):
        print(f"  – ข้าม {src} (ไม่เจอไฟล์ดิบ)")
        continue
    raw = json.load(open(path, encoding="utf-8"))
    rows = raw["rows"] if isinstance(raw, dict) and "rows" in raw else raw
    cache = {}
    for r in rows:
        txt = (r.get("c") or "").strip()
        imgs = [u for u in (img_url(u, base) for u in (r.get("m") or [])) if u][:MAX_IMG]
        if not txt and not imgs:
            continue
        title = (r.get("p") or "").strip()
        if title not in cache:
            cache[title] = match(title) if title else None
        h = cache[title]
        if not h or h not in handles:
            unmatched += 1
            continue
        it = {
            "src": src,
            "rating": int(r.get("r") or 5),
            "author": (r.get("a") or "").strip() or "ลูกค้า GUCUT",
            "text": txt,
            "images": imgs,
            "date": date_of(src, r),
        }
        k = key_of(h, it)
        if k in seen:
            skipped_dupe += 1
            continue
        seen.add(k)
        vid = r.get("v")
        vid_id = vid.get("id") if isinstance(vid, dict) else vid
        if vid_id and os.path.exists(f"public/rv-video/{vid_id}.mp4"):
            it["video"] = vid if isinstance(vid, dict) else {"id": vid_id}
        data.setdefault(h, {"avg": 5.0, "count": 0, "items": []})["items"].append(it)
        added[h] += 1

if not added:
    print("ไม่มีรีวิวใหม่ให้เพิ่ม")
    raise SystemExit

for h, e in data.items():
    e["items"].sort(key=lambda x: (1 if x.get("video") else 0, x["date"]), reverse=True)
    if not e.get("count"):
        rs = [i["rating"] for i in e["items"]] or [5]
        e["count"] = len(e["items"])
        e["avg"] = round(sum(rs) / len(rs), 1)

json.dump(data, open("src/data/reviews.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

total = sum(len(v["items"]) for v in data.values())
print(f"เพิ่มรีวิวใหม่ {sum(added.values())} ใบ · ข้ามที่ซ้ำ {skipped_dupe} · ยังจับคู่ไม่ได้ {unmatched}")
for h, n in sorted(added.items(), key=lambda x: -x[1]):
    print(f"  +{n:4d}  {h}")
print(f"รวมทั้งหมด {len(data)} สินค้า · {total} การ์ด")
