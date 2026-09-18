#!/usr/bin/env node
/* ตัวกรองที่ท่อ "ประกาศว่ารับ" มีผลจริงไหม — ใบ t_mu2pekwt (ท่านประธานสั่ง 15 ก.ย. 2569:
 * "เทียบทุกจุด ทีละหน้า กดเข้าไปลึก ๆ ทดลองใช้ ใช้ไม่ได้ให้แก้")
 *
 * 🔴 ที่มา: เราเจอปุ่มกรองหลอกมาแล้วหลายรอบ และทุกรอบหน้าตาเหมือนสำเร็จ (200 + ตัวเลขสมเหตุสมผล)
 *    · `list=returnorders` เมินช่วงวันเงียบ ๆ (ฝั่งจอจับได้ 18 ก.ย.)
 *    · `list=stock` ค่า sort ที่ไม่รองรับกลายเป็นเรียงตาม qty เงียบ ๆ
 *    · `list=returnorders` เมิน `status=` ทั้งที่จอจะเอาไปทำแท็บ (ผมจับได้ 19 ก.ย.)
 *    · `?stockpushverify` เมิน `skus=` แล้วอ่านค่า `1` เป็นรหัสสินค้า (19 ก.ย.)
 *    🔑 ทุกตัวมีรูปเดียวกัน: **ท่อรับค่าไว้ แต่ไม่ได้ใช้ และไม่บอกว่าไม่ได้ใช้**
 *
 * วิธี: ส่งค่าที่ "ไม่ควรมีอยู่จริง" ให้ตัวกรองนั้นตัวเดียว แล้วเทียบจำนวนแถวกับคำขอเปล่า
 *
 * ⚠️ **ผลที่ยอมรับได้มีสามทาง ไม่ใช่ทางเดียว** — ไม่แยกสามทางนี้ ด่านจะร้องใส่ของที่ถูก
 *    ① จำนวนแถวเปลี่ยน            ⇒ ตัวกรองทำงาน ✅
 *    ② ตีกลับ 400 พร้อมเหตุผล      ⇒ ตัวกรองทำงาน (ปฏิเสธค่าที่ไม่รู้จัก ดีกว่าเมินเงียบ) ✅
 *    ③ เท่าเดิม **แต่ประกาศว่าเมิน** (`ignored` มีชื่อนั้น) ⇒ ซื่อสัตย์ ✅
 *    ④ เท่าเดิมและไม่ประกาศอะไร     ⇒ **ปุ่มหลอก** 🔴
 *
 * ⚠️ **ตัวควบคุมบังคับ**: ค่าฐานต้องมากกว่า 0 ไม่งั้นเทียบอะไรไม่ได้
 *    ฐาน 0 ⇒ "ตัดสินไม่ได้" ไม่ใช่ "ผ่าน" (0 → 0 ไม่พิสูจน์ว่าตัวกรองไม่ทำงาน)
 * ⚠️ **ตัวกรองหน้า/จำนวน (limit · offset · page) ไม่ใช่ตัวกรองเนื้อหา** ⇒ ข้าม
 *    (เปลี่ยน limit แล้วจำนวนแถวย่อมเปลี่ยน — ไม่ได้พิสูจน์อะไรเรื่องการกรอง)
 *
 * 🚫 GET เท่านั้น อ่านอย่างเดียว · ค่าที่ส่งเป็นค่าที่ไม่มีอยู่จริงทั้งหมด ⇒ ไม่แตะข้อมูล
 *
 * รัน: node scripts/check-filters-work.mjs [--base https://gucut.com]
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ราก = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARG = process.argv.slice(2);
const BASE = (ARG[ARG.indexOf("--base") + 1] || "").startsWith("http") ? ARG[ARG.indexOf("--base") + 1] : "https://gucut.com";
const คีย์ไฟล์ = join(homedir(), ".gucut-admin-key");
if (!existsSync(คีย์ไฟล์)) {
  console.error(`❌ ไม่มี ${คีย์ไฟล์} — นี่คือ "ยังไม่ได้ตรวจ" ไม่ใช่ "ผ่าน"`);
  process.exit(1);
}
const KEY = readFileSync(คีย์ไฟล์, "utf8").trim();

/* ค่าที่ส่งเข้าไปทดสอบ — เลือกให้ "ไม่มีอยู่จริงแน่ ๆ" และถูกรูปตามชนิดของช่อง
   ⚠️ ผิดรูป (เช่นส่งคำลงช่องวันที่) จะได้ 400 เสมอ ⇒ ผ่านโดยไม่ได้ทดสอบว่ากรองจริง
      ⇒ ต้องส่ง **ค่าที่ถูกรูปแต่ไม่มีของ** ถึงจะแยกแยะได้ */
const ค่าทดสอบ = {
  q: "zzไม่มีคำนี้จริง",
  /* 🔴 **`from` ต้องเป็นวันในอนาคต ไม่ใช่อดีต** (แก้ 19 ก.ย. 2569 — ด่านให้ธงลวง 5 ใบเพราะข้อนี้)
     `from=1990-01-01` แปลว่า "ตั้งแต่ปี 1990" ⇒ **ครอบทุกเอกสารที่มี** ⇒ จำนวนเท่าเดิมคือคำตอบที่ถูก
     ⇒ ด่านอ่านว่า "ตัวกรองไม่ทำงาน" ทั้งที่มันทำงานถูกเป๊ะ
     พิสูจน์: `purchases&from=1990-01-01` = 33 (ทั้งหมด) · `from=2099-01-01` = 0 ⇒ กรองจริง
     🔑 บทเรียน: **ค่าทดสอบที่เลือกผิดทิศ ทำให้ด่านฟ้องของที่ถูก** — และมันดูเหมือนเจอบั๊ก 5 จุด */
  from: "2099-01-01",   // ไม่มีเอกสารในอนาคต
  to: "1990-01-01",     // ไม่มีเอกสารก่อนปีนั้น
  status: "สถานะที่ไม่มีจริง",
  store: "z9",                                    // ร้านที่ไม่มี
  channel: "ช่องทางที่ไม่มีจริง",
  carrier: "ขนส่งที่ไม่มีจริง",
  only: "ค่าที่ไม่รู้จัก", kind: "ค่าที่ไม่รู้จัก", by: "ค่าที่ไม่รู้จัก",
  sku: "SKU-ไม่มีจริง-zzz", member: "SKU-ไม่มีจริง-zzz",
  warehouse: "คลังที่ไม่มีจริง",
  source: "mirror",                               // ค่าที่มีความหมาย — ดูว่าเปลี่ยนเส้นทางไหม
  days: "1",                                      // แคบสุด
  withEmail: "1", withPhone: "1",
  quietDays: "9999", lookbackDays: "1", minSold: "999999",
  includeCancelled: "1",
};
/* 🔴 **ชื่อคีย์ใน `applied` ไม่ใช่ชื่อพารามิเตอร์ทุกตัว** — ด่านนี้เจอเองรอบแรก (19 ก.ย. 2569)
   ส่ง `includeCancelled=1` แล้วยอดไม่ขยับ ⇒ ด่านอ่านว่าปุ่มหลอก
   ของจริง: ท่อรับชื่อ `cancelled` (ส่งแล้วได้ 902 จาก 868) ⇒ **ตัวกรองทำงาน ชื่อไม่ตรง**
   ⇒ ท่อประกาศ `appliedParamNames` ให้แล้ว · ด่านอ่านจากตรงนั้นก่อน แล้วค่อยใช้ชื่อคีย์
   🔑 ถ้าไม่ทำ ด่านจะฟ้องของที่ถูกทุกครั้งที่ชื่อสองฝั่งต่างกัน [[ui-label-is-not-the-param-name]] */
const ชื่อพารามิเตอร์ = { includeCancelled: "cancelled" };

/* ตรวจด้วยตาแล้วว่าไม่ใช่ปุ่มหลอก — **ทุกบรรทัดต้องมีเหตุผลที่ยิงพิสูจน์แล้ว**
   🚫 ห้ามเติมโดยเดา (กติกาเดียวกับ allowNear ของ check-leaks) */
const ไม่ใช่ปุ่มหลอก = {
  "contacts.withPhone": "ผู้ติดต่อ 28,347 คนมีเบอร์เกือบทั้งหมด ⇒ กรองแล้วยอดไม่ขยับคือคำตอบที่ถูก (ต้องยิงนับคนไม่มีเบอร์เพื่อพิสูจน์ให้แน่ — ยังไม่ทำ)",
  "contacts.withEmail": "เหตุผลเดียวกับ withPhone — ยังไม่ได้พิสูจน์ด้วยตัวเลข ⇒ ถือเป็น 'ยังไม่ตัดสิน' ไม่ใช่ 'ผ่าน'",
};

/* ไม่ใช่ตัวกรองเนื้อหา ⇒ ข้าม (เปลี่ยนแล้วจำนวนแถวเปลี่ยนโดยไม่เกี่ยวกับการกรอง) */
const ข้าม = new Set(["limit", "offset", "page", "advancedFilters"]);

const นับแถว = (d) => {
  if (!d || typeof d !== "object") return null;
  if (Number.isFinite(d.total)) return d.total;
  for (const k of ["rows", "items", "lines"]) if (Array.isArray(d[k])) return d[k].length;
  if (Number.isFinite(d.lines)) return d.lines;
  return null;
};

async function ยิง(qs) {
  try {
    const res = await fetch(`${BASE}/api/core?${qs}`, { headers: { "x-admin-key": KEY }, signal: AbortSignal.timeout(45000) });
    const t = await res.text();
    try { return { http: res.status, data: JSON.parse(t) }; } catch { return { http: res.status, ผิดรูป: t.slice(0, 80) }; }
  } catch (e) {
    return { ยิงไม่ถึง: String(e?.message || e).slice(0, 90) };
  }
}

/* ── ตัวควบคุม: เส้นมั่วต้องได้ accepts · ไม่มีรหัสต้องไม่ 200 ── */
const ค1 = await ยิง("list=เส้นที่ไม่มีจริง-zzz");
if (!ค1.data?.accepts) { console.error("❌ ตัวควบคุม ①: เส้นมั่วไม่ได้คำตอบ 'ไม่รู้จัก' ⇒ อ่านผิดที่ ทิ้งผลรอบนี้"); process.exit(1); }
const ค2 = await fetch(`${BASE}/api/core?list=orders&limit=1`).then((r) => r.status).catch(() => 0);
if (ค2 === 200) { console.error("❌ ตัวควบคุม ②: ไม่ส่งรหัสแล้วได้ 200 ⇒ ด่านรหัสไม่ทำงาน หยุด"); process.exit(1); }

/* ── หาตัวกรองของแต่ละเส้นจากสารบัญที่ยิงของจริงมาแล้ว ──
   ⚠️ **ไม่พิมพ์รายชื่อตัวกรองด้วยมือ** — พิมพ์มือจะล้าสมัยทันทีที่ใครเพิ่มช่อง
      อ่านจาก `applied.*` และ `supportedFilters` ที่ท่อประกาศเอง */
const สารบัญ = join(ราก, "netlify", "lib", "returned-fields.mjs");
if (!existsSync(สารบัญ)) { console.error("❌ ไม่มี returned-fields.mjs — รัน gen-returned-fields.mjs ก่อน"); process.exit(1); }
const { catalogue } = await import(สารบัญ);
const บังคับ = { stockcard: { sku: "00023-24NW" }, bundleitems: { sku: "00023-24NW" } };

let ปุ่มหลอก = [], ผ่าน = 0, ตัดสินไม่ได้ = [];
for (const [เส้น, e] of Object.entries(catalogue.เส้น)) {
  const ช่อง = [...new Set(Object.keys(e.คีย์).filter((k) => k.startsWith("applied.")).map((k) => k.split(".")[1]))]
    .filter((f) => !ข้าม.has(f) && ค่าทดสอบ[f] !== undefined);
  if (!ช่อง.length) continue;
  const ฐานQs = new URLSearchParams({ list: เส้น, limit: "5", ...(บังคับ[เส้น] || {}) }).toString();
  const ฐาน = await ยิง(ฐานQs);
  const ฐานN = นับแถว(ฐาน.data);
  if (!ฐานN) { ตัดสินไม่ได้.push(`${เส้น}: ฐาน = ${ฐานN} ⇒ เทียบไม่ได้ (ไม่ใช่ "ตัวกรองไม่ทำงาน")`); continue; }
  for (const f of ช่อง) {
    const ชื่อส่ง = (r2 => r2 && typeof r2 === "object" && r2[f] ? String(r2[f]).split(" ")[0] : (ชื่อพารามิเตอร์[f] || f))(ฐาน.data?.appliedParamNames);
    const r = await ยิง(new URLSearchParams({ list: เส้น, limit: "5", ...(บังคับ[เส้น] || {}), [ชื่อส่ง]: ค่าทดสอบ[f] }).toString());
    if (r.http === 400 || r.data?.error) { ผ่าน++; continue; }          // ② ตีกลับ = ทำงาน
    const n = นับแถว(r.data);
    if (n === null) { ตัดสินไม่ได้.push(`${เส้น}.${f}: นับแถวไม่ได้`); continue; }
    if (n !== ฐานN) { ผ่าน++; continue; }                               // ① เปลี่ยน = ทำงาน
    const ig = r.data?.ignored;
    if (ig && typeof ig === "object" && f in ig) { ผ่าน++; continue; }   // ③ ประกาศว่าเมิน = ซื่อสัตย์
    const คีย์เต็ม = `${เส้น}.${f}`;
    if (ไม่ใช่ปุ่มหลอก[คีย์เต็ม]) { ตัดสินไม่ได้.push(`${คีย์เต็ม}: ${ไม่ใช่ปุ่มหลอก[คีย์เต็ม]}`); continue; }
    ปุ่มหลอก.push(`${คีย์เต็ม}: ส่ง "${ค่าทดสอบ[f]}" ทางชื่อ "${ชื่อส่ง}" แล้วแถวเท่าเดิม (${ฐานN}) และไม่ประกาศว่าเมิน`);
  }
}

console.log(`\ncheck-filters-work: ตัวกรองที่ทำงาน ${ผ่าน} ช่อง`);
if (ตัดสินไม่ได้.length) {
  console.log(`⏸️  ตัดสินไม่ได้ ${ตัดสินไม่ได้.length} (ไม่นับเป็นผ่าน):`);
  for (const x of ตัดสินไม่ได้) console.log(`   · ${x}`);
}
if (ปุ่มหลอก.length) {
  console.log(`\n🔴 ปุ่มกรองหลอก ${ปุ่มหลอก.length} ช่อง — จอจะมีปุ่มที่กดแล้วไม่เกิดอะไร`);
  for (const x of ปุ่มหลอก) console.log(`   · ${x}`);
  console.log("   ℹ️ แก้ได้สองทาง: ทำให้กรองจริง **หรือ** ประกาศใน `ignored` ว่าไม่รองรับ");
  console.log("      🚫 ห้ามแก้ด่านให้ผ่าน — อ่านก่อนว่าช่องนั้นควรกรองหรือไม่ควรมีแต่แรก");
}
process.exit(ปุ่มหลอก.length ? 1 : 0);
