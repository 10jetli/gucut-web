// ย่อรูปสินค้าจาก ZORT (products.image_path) แล้วส่งเข้าถังเราผ่าน POST /api/core?imgmirror=1 — ใบ t_mu2utot5
//
//   node scripts/zort-images-to-r2.mjs --limit 5 --save-dir /tmp/ดูรูป   # ลองน้อย ๆ + เก็บไฟล์ไว้เปิดดูด้วยตา
//   node scripts/zort-images-to-r2.mjs                                   # ทำทุกรหัสที่ยังไม่มีรูป
//
// รันบน g1 (มี sharp ใน node_modules · ห้ามใส่ package.json) · รหัสหลังร้านอ่านจาก ~/.gucut-admin-key (ไม่ commit)
// เลือกเฉพาะ: sku ที่แผนที่ public/sku-images.json ไม่มี · มี imagePath · ยังไม่มี imageFile ⇒ รันซ้ำได้ ข้ามของที่ทำแล้ว
// ⚠️ รูปที่แปลงแล้วต้องเปิดดูด้วยตาอย่างน้อยรอบแรก (converted-files-need-eyes) ⇒ ใช้ --save-dir
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (n, fb) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : fb; };
const LIMIT = Number(arg("--limit", 0));
const SAVE = arg("--save-dir", "");
const API = "https://gucut.com/api/core";
const LADDER = [128, 256, 384, 640];
const KEY = fs.readFileSync(path.join(os.homedir(), ".gucut-admin-key"), "utf8").trim();
const H = { "x-admin-key": KEY };

const { default: sharp } = await import("sharp").catch(() => { throw new Error("ยังไม่มี sharp — npm i --no-save sharp"); });
const map = JSON.parse(fs.readFileSync("public/sku-images.json", "utf8"));

const rows = [];
for (let off = 0; ; off += 200) {
  const r = await fetch(`${API}?list=stock&limit=200&offset=${off}`, { headers: H });
  if (!r.ok) throw new Error(`list=stock ${r.status}`);
  const d = await r.json();
  const b = ["rows", "items", "stock", "list"].map((k) => d[k]).find(Array.isArray);
  if (!b) throw new Error("list=stock ไม่มีแถว");
  rows.push(...b);
  if (b.length < 200) break;
}
let todo = rows.filter((x) => !map[x.sku] && /^https:\/\//.test(x.imagePath || "") && !x.imageFile);
console.log(`สต็อก ${rows.length} · ต้องย่อ ${todo.length}${LIMIT ? ` · รอบนี้ ${Math.min(LIMIT, todo.length)}` : ""}`);
if (LIMIT) todo = todo.slice(0, LIMIT);
if (SAVE) fs.mkdirSync(SAVE, { recursive: true });

const res = { ok: 0, fail: 0, reasons: {} };
for (const x of todo) {
  try {
    const src = await fetch(x.imagePath, { signal: AbortSignal.timeout(20000) });
    if (!src.ok) throw new Error(`โหลดรูป ${src.status}`);
    const raw = Buffer.from(await src.arrayBuffer());
    if (raw.length > 15 * 1024 * 1024) throw new Error("รูปต้นทางใหญ่เกิน 15 MB");
    const files = {};
    for (const step of LADDER) {
      const out = await sharp(raw).rotate().resize(step, step, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      files[step] = out.toString("base64");
      if (SAVE) fs.writeFileSync(path.join(SAVE, `${x.sku.replace(/[^\w.-]/g, "_")}-${step}.webp`), out);
    }
    const p = await fetch(`${API}?imgmirror=1`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ sku: x.sku, source: x.imagePath, files }) });
    const j = await p.json().catch(() => ({}));
    if (!p.ok || !j.ok) throw new Error(`ส่งไม่ผ่าน ${p.status} ${String(j.error || "").slice(0, 80)}`);
    res.ok++;
  } catch (e) {
    res.fail++;
    const k = String(e?.message || e).slice(0, 60);
    res.reasons[k] = (res.reasons[k] || 0) + 1;
  }
}
console.log(`สำเร็จ ${res.ok} · ไม่สำเร็จ ${res.fail}`, res.reasons);
