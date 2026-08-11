#!/usr/bin/env python3
# รวมรีวิว Shopee เข้ากับ src/data/reviews.json (ใช้กฎจับคู่ตัวเดียวกับ map-lazada.py)
# รูป Shopee ส่งมาเป็น id ล้วน ต้องประกอบเป็น URL เอง
import json, re, datetime, sys
from collections import defaultdict

RAW = "/mnt/user-data/uploads/Downloads/gucut-shopee.json"
IMG_BASE = "https://down-th.img.susercontent.com/file/"

src = open("scripts/map-lazada.py", encoding="utf-8").read()
ns = {}
exec(compile(src[: src.index("raw = json.load(open(RAW")], "m", "exec"), ns)
match = ns["match"]

prods = json.load(open("src/data/products.json", encoding="utf-8"))
handles = {p["h"] for p in prods}
data = json.load(open("src/data/reviews.json", encoding="utf-8"))
rows = json.load(open(RAW, encoding="utf-8"))["rows"]


def img_url(v: str) -> str:
    v = (v or "").strip()
    if not v:
        return ""
    if v.startswith("http"):
        return v.split("?")[0]
    return IMG_BASE + v


def iso(ts) -> str:
    try:
        return datetime.datetime.utcfromtimestamp(int(ts)).strftime("%Y-%m-%d")
    except Exception:
        return ""


added = unmatched = 0
cache = {}
by_handle = defaultdict(int)

for r in rows:
    txt = (r.get("c") or "").strip()
    imgs = [img_url(u) for u in (r.get("m") or [])][:4]
    imgs = [u for u in imgs if u]
    if not txt and not imgs:
        continue
    title = (r.get("p") or "").strip()
    if not title:
        unmatched += 1
        continue
    if title not in cache:
        cache[title] = match(title)
    h = cache[title]
    if not h or h not in handles:
        unmatched += 1
        continue

    item = {
        "src": "shopee",
        "rating": int(r.get("r") or 5),
        "author": (r.get("a") or "").strip() or "ลูกค้า GUCUT",
        "text": txt,
        "images": imgs,
        "date": iso(r.get("t")),
    }
    entry = data.setdefault(h, {"avg": 5.0, "count": 0, "items": []})
    have = {(i["text"].strip().lower(), i["date"]) for i in entry["items"]}
    key = (item["text"].strip().lower(), item["date"])
    if key in have and not imgs:
        continue
    entry["items"].append(item)
    by_handle[h] += 1
    added += 1

# เรียงใหม่: มีคลิปก่อน แล้วไล่ตามวันที่ล่าสุด
for h, e in data.items():
    e["items"].sort(key=lambda x: (1 if x.get("video") else 0, x["date"]), reverse=True)
    if not e.get("count"):
        e["count"] = len(e["items"])
        rs = [i["rating"] for i in e["items"]] or [5]
        e["avg"] = round(sum(rs) / len(rs), 1)

json.dump(data, open("src/data/reviews.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

total = sum(len(v["items"]) for v in data.values())
print(f"เพิ่มรีวิว Shopee {added} ใบ · จับคู่ไม่ได้ {unmatched}")
print(f"รวมทั้งหมด {len(data)} สินค้า · {total} การ์ด")
print("สินค้าที่ได้เพิ่มเยอะสุด:")
for h, n in sorted(by_handle.items(), key=lambda x: -x[1])[:6]:
    print(f"  +{n:4d}  {h[:52]}")
