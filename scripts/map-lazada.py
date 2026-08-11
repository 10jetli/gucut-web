#!/usr/bin/env python3
# จับคู่รีวิว Lazada เข้ากับสินค้าในแคตตาล็อก แล้วเขียนทับ src/data/reviews.json
# กติกา: อะไหล่ใช้รหัส 5 หลักหน้าชื่อ / สินค้าหลักใช้กฎแบรนด์+เบอร์+ตัดหรือซอย
import json, re, sys, unicodedata
from collections import defaultdict

RAW = "/mnt/user-data/uploads/Downloads/gucut-lazada-raw.json"
CAP = 100000       # ไม่จำกัด — เอาขึ้นทุกใบที่มีอะไรให้อ่าน
MAX_IMG = 4

prods = json.load(open("src/data/products.json", encoding="utf-8"))
old = json.load(open("src/data/reviews.json", encoding="utf-8"))
handles = {p["h"] for p in prods}

# ---------- index อะไหล่ตามรหัส ----------
code2h = {}
for p in prods:
    m = re.match(r"^(\d{4,5})-", p["h"]) or re.match(r"^\s*(\d{4,5})\b", p["t"])
    if m:
        code2h.setdefault(m.group(1).zfill(5), p["h"])

# ---------- สินค้าหลัก ----------
H = {
 "file":      "ตะไบ-newwave",
 "plug":      "หัวเทียนเลื่อยยนต์-newwave-เลเซอร์-อิริเดียม",
 "bar_kk":    "บาร์-kingkong",
 "bar_nw":    "บาร์-newwave-speed-pro-มีทะเบียน",
 "kk_14":     "โซ่-kingkong-1-4-สำหรับเลื่อยแบตเตอรี่",
 "kk3623a_c": "โซ่-kingkong-3-8-3623-ตัด-เกรด-a",
 "kk3623a_s": "โซ่-kingkong-3-8-3623-ตัด-เกรด-a-1",
 "kk3623b":   "โซ่เลื่อยทอง-kingkong-3623-3-8-ขนาดกลาง-แบบตัด-แบบเส้น",
 "kk3636a":   "โซ่ตัด-kingkong-3636-3-8p-เกรด-a",
 "kk3636b":   "โซ่เลื่อยทอง-kingkong-3636-3-8p-ขนาดเล็ก-แบบตัด",
 "nw3623_c":  "โซ่เลื่อยยนต์-ตัด-newwave-3623-3-8-ขนาดกลาง-ทองคำผสมไทเทเนียม",
 "nw3623_s":  "โซ่เลื่อยยนต์-ซอย-newwave-3623-3-8-ขนาดกลาง-titanium100-แบบเส้น",
 "nw3636_c":  "โซ่เลื่อยยนต์-ตัด-newwave-3636-3-8p-ขนาดเล็ก-ทองคำผสมไทเทเนียม",
 "nw3636_s":  "โซ่ซอย-newwave-3636-3-8p-titanium100",
 "nw3652_c":  "โซ่เลื่อยยนต์-ตัด-newwave-3652-3-8-ขนาดใหญ่-ทองคำผสมไทเทเนียม",
 "nw3652_s":  "โซ่เลื่อยยนต์-ซอย-newwave-3652-3-8-ขนาดใหญ่-ทองคำผสมไทเทเนียม",
 "nw3860_c":  "โซ่เลื่อยยนต์-ตัด-newwave-3860-404-ขนาดใหญ่-ทองคำผสมไทเทเนียม",
 "nw3860_s":  "โซ่เลื่อยยนต์-ซอย-newwave-3860-404-ขนาดใหญ่-ทองคำผสมไทเทเนียม",
 "nw325":     "โซ่เลื่อยยนต์-ตัด-newwave-325-ขนาดกลาง-ทองคำผสมไทเทเนียม",
 "saw7800s":  "เลื่อยยนต์-newwave-7800-super-s",
 "saw7800t":  "เลื่อยยนต์-newwave-7800-turbo",
 "saw5800":   "เลื่อยยนต์-kingkong",
 "saw8800":   "เลื่อยยนต์-newwave-8800-super-s-28-มีเอกสารพร้อมขึ้นทะเบียน",
 "saw9800":   "เลื่อยยนต์-newwave-9800-super-pro-30-มีเอกสารพร้อมขึ้นทะเบียน",
 "mini":      "mini",
}
for k, v in H.items():
    if v not in handles:
        print(f"!! handle ไม่พบในแคตตาล็อก: {k} -> {v}", file=sys.stderr)

F_MODELS = ["F288XP", "F250", "F361", "F038", "F381", "F440", "F660", "F070", "F880", "F090"]
F_HANDLE = {
 "F250": "เลื่อยยนต์-newwave-f250-มีเอกสารพร้อมขึ้นทะเบียน",
 "F361": "เลื่อยยนต์-newwave-f361-มีเอกสารพร้อมขึ้นทะเบียน",
 "F038": "เลื่อยยนต์-newwave-f038-มีเอกสารพร้อมขึ้นทะเบียน",
 "F381": "เลื่อยยนต์-newwave-f381-มีเอกสารพร้อมขึ้นทะเบียน",
 "F440": "เลื่อยยนต์-newwave-f440-มีเอกสารพร้อมขึ้นทะเบียน",
 "F288XP": "เลื่อยยนต์-newwave-f288xp-มีเอกสารพร้อมขึ้นทะเบียน",
 "F660": "เลื่อยยนต์-newwave-f660-มีเอกสารพร้อมขึ้นทะเบียน",
 "F070": "เลื่อยยนต์-newwave-f070-มีเอกสารพร้อมขึ้นทะเบียน",
 "F880": "เลื่อยยนต์-newwave-f880-มีเอกสารพร้อมขึ้นทะเบียน",
 "F090": "เลื่อยยนต์-newwave-090-มีเอกสารพร้อมขึ้นทะเบียน",
}
ROLL = {
 ("KK", "3623", "c"): "โซ่ม้วน-kingkong-3623-3-8-ตัด-เกรด-a",
 ("KK", "3623", "s"): "โซ่ม้วน-kingkong-3623-3-8-ซอย-เกรด-a",
 ("KK", "3636", "c"): "โซ่ม้วน-kingkong-3636-3-8p-ตัด-เกรด-a",
 ("KK", "14",   "c"): "โซ่ม้วน-kingkong-1-4-สำหรับเลื่อยโซ่แบตเตอรี่และไฟฟ้าไร้สายขนาดเล็ก",
 ("NW", "3623", "c"): "โซ่ม้วน-newwave-3623-3-8-แบบตัด",
 ("NW", "3623", "s"): "โซ่ม้วน-newwave-3623-3-8-แบบซอย-titanium100",
 ("NW", "3636", "c"): "โซ่ม้วน-newwave-3636-3-8p-แบบตัด",
 ("NW", "3636", "s"): "โซ่ม้วน-newwave-3636-3-8p-แบบซอย-titanium100",
 ("NW", "3652", "c"): "โซ่ม้วน-newwave-3652-3-8-381-แบบตัด",
 ("NW", "3652", "s"): "โซ่ม้วน-newwave-3652-3-8-381-แบบซอย",
 ("NW", "3860", "c"): "โซ่ม้วน-newwave-3860-404-แบบตัด",
 ("NW", "3860", "s"): "โซ่ม้วน-newwave-3860-404-แบบซอย",
 ("NW", "325",  "c"): "โซ่ม้วน-newwave-325-แบบตัด",
}


def match(title: str):
    t = title.upper()
    m = re.match(r"^\s*(\d{4,5})\b", t)
    if m and m.group(1).zfill(5) in code2h:
        return code2h[m.group(1).zfill(5)]

    if "ตะไบ" in t:
        return H["file"]
    if "หัวเทียน" in t:
        return H["plug"]

    kk = ("KINGKONG" in t) or ("KING KONG" in t) or ("คิงคอง" in t) or ("KINGKING" in t)
    nw = "NEWWAVE" in t
    soy = "ซอย" in t
    cut = "ตัด" in t
    roll = ("ม้วน" in t) or ("100 ฟุต" in t) or ("100ฟุต" in t)

    if t.strip().startswith("บาร์") or " บาร์" in t:
        if kk: return H["bar_kk"]
        if nw: return H["bar_nw"]
        return None

    if "เลื่อยยนต์" in t and "โซ่เลื่อย" not in t and not t.strip().startswith("โซ่"):
        # MINI-ONE เป็นคนละเครื่องกับ MINI — และยังไม่มีในแคตตาล็อก
        if "MINI-ONE" in t or "MINIONE" in t or "MINI ONE" in t: return None
        if "MINI" in t: return H["mini"]
        for mod in F_MODELS:
            if mod in t: return F_HANDLE[mod]
        if "9800" in t: return H["saw9800"]
        if "8800" in t: return H["saw8800"]
        if "7800" in t: return H["saw7800t"] if "TURBO" in t else H["saw7800s"]
        if "5800" in t or kk: return H["saw5800"]
        return None

    # ---- โซ่ ----
    if "โซ่" in t:
        if "STIHL" in t or "OREGON" in t:
            return None
        size = None
        for s in ("3623", "3636", "3652", "3860", "404", "325", "326"):
            if s in t:
                size = {"404": "3860", "326": "325"}.get(s, s)
                break
        if "1/4" in t:
            size = "14"
        if not size:
            return None
        kind = "s" if soy else ("c" if cut else ("s" if "TITANIUM" in t else "c"))
        if roll:
            return ROLL.get(("KK" if kk else "NW", size, kind))
        if kk:
            if size == "14": return H["kk_14"]
            gold = ("ทอง" in t) and ("เกรดA" not in t) and ("เกรด A" not in t)
            if size == "3636": return H["kk3636b"] if gold else H["kk3636a"]
            if size == "3623":
                if kind == "s": return H["kk3623a_s"]
                return H["kk3623b"] if gold else H["kk3623a_c"]
            return None
        if nw or True:  # โซ่ที่ไม่ระบุแบรนด์ = NEWWAVE (ร้านขายสองยี่ห้อนี้)
            if size == "3623": return H["nw3623_s"] if kind == "s" else H["nw3623_c"]
            if size == "3636": return H["nw3636_s"] if kind == "s" else H["nw3636_c"]
            if size == "3652": return H["nw3652_s"] if kind == "s" else H["nw3652_c"]
            if size == "3860": return H["nw3860_s"] if kind == "s" else H["nw3860_c"]
            if size == "325":  return H["nw325"]
    return None


THAI_M = {"ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,
          "ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12}

def thai_date(s: str) -> str:
    """Lazada ส่งมาเป็น '10 ส.ค. 2026' (ปี ค.ศ.) → คืน 2026-08-10"""
    s = (s or "").strip()
    m = re.match(r"^(\d{1,2})\s+(\S+)\s+(\d{4})$", s)
    if m and m.group(2) in THAI_M:
        y = int(m.group(3))
        if y > 2400:          # เผื่อบางรายการส่งเป็น พ.ศ.
            y -= 543
        return f"{y:04d}-{THAI_M[m.group(2)]:02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m.group(0)
    return ""


raw = json.load(open(RAW, encoding="utf-8"))["rows"]
buckets = defaultdict(list)
unmatched = defaultdict(int)
for r in raw:
    h = match(r["p"])
    if not h or h not in handles:
        unmatched[r["p"]] += 1
        continue
    txt = (r["c"] or "").strip()
    imgs = [u for u in r["m"] if u.startswith("http")][:MAX_IMG]
    if not txt and not imgs:
        continue                       # ให้ดาวเปล่า ๆ ไม่ต้องโชว์เป็นการ์ด
    buckets[h].append({
        "src": "lazada",
        "rating": int(r["r"] or 5),
        "author": (r["a"] or "").strip() or "ลูกค้า GUCUT",
        "text": txt,
        "images": imgs,
        "date": thai_date(r["g"]),
    })

def rank(x):
    return (2 if x["images"] else 0) + (1 if x["text"] else 0)

out = {}
for h, items in buckets.items():
    seen, uniq = set(), []
    for it in items:
        # ตัดเฉพาะข้อความซ้ำที่ "ไม่มีรูป" — รีวิวมีรูปถือเป็นคนละใบเสมอ
        k = it["text"].lower() if not it["images"] else ""
        if k and k in seen:
            continue
        if k:
            seen.add(k)
        uniq.append(it)
    photos = sorted([x for x in uniq if x["images"]], key=lambda x: x["date"], reverse=True)
    texts  = sorted([x for x in uniq if not x["images"]], key=lambda x: x["date"], reverse=True)
    # ผสมรีวิวมีรูปกับข้อความล้วน ไม่ให้ตัวกรอง "มีรูป" เท่ากับ "ทั้งหมด"
    take = photos[: int(CAP * 0.7)]
    take += texts[: max(0, CAP - len(take))]
    take.sort(key=lambda x: x["date"], reverse=True)
    out[h] = take[:CAP]

# ---- รวมกับของเดิม: ใช้ count จาก Shopify ถ้ามี ----
final = {}
for h in set(list(out.keys()) + list(old.keys())):
    lz = out.get(h, [])
    prev = old.get(h)
    # กันซ้ำกับการ์ดเดิม (Shopee/TikTok ที่ Shopify มีอยู่แล้ว)
    have = {(i["text"].strip().lower(), i["date"]) for i in lz}
    merged = list(lz)
    for i in (prev or {}).get("items", []):
        k = (i["text"].strip().lower(), i["date"])
        if i["src"] == "lazada":
            continue
        if k in have:
            continue
        merged.append(i)
        have.add(k)
    merged.sort(key=lambda x: x["date"], reverse=True)
    merged = merged[:CAP]
    if prev:
        avg, count = prev["avg"], prev["count"]
    else:
        rs = [i["rating"] for i in merged] or [5]
        avg = round(sum(rs) / len(rs), 1)
        count = len(lz)
    if not merged and not prev:
        continue
    final[h] = {"avg": avg, "count": count, "items": merged}

json.dump(final, open("src/data/reviews.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

tot_cards = sum(len(v["items"]) for v in final.values())
print(f"สินค้าที่มีรีวิว: {len(final)}  · การ์ดรีวิว: {tot_cards}")
print(f"รีวิว Lazada ที่จับคู่ได้: {sum(len(v) for v in buckets.values())}")
print("จับคู่ไม่ได้ (top 15):")
for t, n in sorted(unmatched.items(), key=lambda x: -x[1])[:15]:
    print(f"  {n:5d}  {t[:80]}")
print("รวมจับคู่ไม่ได้:", sum(unmatched.values()))
