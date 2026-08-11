#!/usr/bin/env python3
"""
รวมรีวิวที่เก็บอยู่ใน metafield `mp_reviews.items` ของ Shopify เข้ากับ src/data/reviews.json

รีวิวชุดนี้เป็น "ของเก่า" ที่แอปรีวิวเคยดึงจาก Lazada/Shopee/TikTok ไว้ตั้งแต่ปี 2566-2567
บางใบแพลตฟอร์มไม่คืนมาแล้วตอนดึงรอบล่าสุด (Seller Center เก็บย้อนหลังจำกัด)
ถ้าไม่รวมเข้ามาก็หายไปพร้อมกับร้าน Shopify ตอนปิด

รันซ้ำได้ ไม่ซ้ำ — ใช้กติกากันซ้ำเดียวกับ add-new-reviews.py
"""
import json, re

SRC = "scripts/shopify-mp-reviews.json"
P = "src/data/reviews.json"

data = json.load(open(P, encoding="utf-8"))
incoming = json.load(open(SRC, encoding="utf-8"))
prods = json.load(open("src/data/products.json", encoding="utf-8"))
handles = {p["h"] for p in prods}
try:
    DEAD = set(json.load(open("src/data/dead-images.json", encoding="utf-8")))
except FileNotFoundError:
    DEAD = set()

norm = lambda s: re.sub(r"\s+", " ", (s or "").strip().lower())


def key_of(h, it):
    imgs = it.get("images") or []
    if not imgs:
        return (h, norm(it.get("text")))
    return (h, it.get("src"), it.get("date"), norm(it.get("text")),
            imgs[0].split("/")[-1].split("?")[0])


seen = {key_of(h, it) for h, e in data.items() for it in e["items"]}

added = skipped = nohandle = 0
per = {}
for h, items in incoming.items():
    if h not in handles:
        nohandle += len(items)
        continue
    for r in items:
        imgs = [u.split("?")[0] for u in (r.get("images") or [])]
        imgs = [u for u in imgs if u and u not in DEAD]
        txt = (r.get("content") or "").strip()
        if not txt and not imgs:
            continue
        it = {
            "src": r.get("source") or "shopify",
            "rating": int(r.get("rating") or 5),
            "author": (r.get("author") or "").strip() or "ลูกค้า GUCUT",
            "text": txt,
            "images": imgs[:4],
            "date": r.get("date") or "",
        }
        k = key_of(h, it)
        if k in seen:
            skipped += 1
            continue
        seen.add(k)
        data.setdefault(h, {"avg": 5.0, "count": 0, "items": []})["items"].append(it)
        per[h] = per.get(h, 0) + 1
        added += 1

for h, e in data.items():
    e["items"].sort(key=lambda x: (1 if x.get("video") else 0, x["date"]), reverse=True)
    if not e.get("count"):
        rs = [i["rating"] for i in e["items"]] or [5]
        e["count"] = len(e["items"])
        e["avg"] = round(sum(rs) / len(rs), 1)

json.dump(data, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

total = sum(len(v["items"]) for v in data.values())
print(f"กู้รีวิวเก่าจาก Shopify มาได้ {added} ใบ · มีอยู่แล้ว {skipped} · สินค้าไม่อยู่ในเว็บ {nohandle}")
for h, n in sorted(per.items(), key=lambda x: -x[1]):
    print(f"  +{n:3d}  {h[:58]}")
print(f"รวมทั้งหมด {len(data)} สินค้า · {total} การ์ด")
