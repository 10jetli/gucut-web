#!/usr/bin/env node
// ตรวจว่า "คำกล่าวอ้างในโค้ด" ยังจริงอยู่ไหม — **ยิงของจริง ไม่ได้อ่านโค้ด**
//
// วิธีใช้:  node scripts/verify-claims.mjs            (ยิงเว็บจริง)
//          node scripts/verify-claims.mjs --local     (ยิง localhost:8888)
//
// ⚠️ **ตัวนี้ต่างจาก `scripts/check-floating.mjs` และจากตัวไล่ข้อความของฝั่งจอ**
//    ตัวพวกนั้นตรวจว่า **เราเขียนอะไรไว้** (อ่านซอร์ส) — ตรวจได้เร็ว แต่ตรวจได้แค่ตัวเอง
//    ตัวนี้ตรวจว่า **โลกข้างนอกยังเป็นอย่างที่เราเขียนไว้ไหม** (ยิง API จริง)
//    ⇒ จับของที่เป็นจริงตอนเขียนแล้ววันหนึ่งกลายเป็นเท็จ **โดยที่ซอร์สไม่ได้เปลี่ยนสักตัวอักษร**
//    ซึ่งเป็นคลาสที่ตัวไล่ซอร์สมองไม่เห็นเลยตามนิยาม
//
// ที่มา: 6 ก.ย. 2569 — วันเดียวเจอคำกล่าวอ้างที่กลายเป็นเท็จ 3 จุดฝั่งท่อ + 6 จุดฝั่งจอ
//        ทั้งหมดเขียนละเอียดและมีวันที่กำกับ **จึงดูน่าเชื่อถือมาก** และไม่มีใครเทียบกับอะไรเลย
//
// ⚠️ **ไม่ผูกกับ build** โดยตั้งใจ — มันยิงเน็ตและต้องมีรหัสหลังร้าน
//    ผูกกับ build = build ตกเวลาเน็ตสะดุด ซึ่งเป็นราคาที่ไม่คุ้ม
//    ให้รันหลัง deploy ทุกครั้ง (คู่กับสคริปต์ตรวจของฝั่งจอ)
//
// ⚠️ **ทุกข้อต้องแยกสามสถานะ**: ผ่าน · ไม่ผ่าน · **ตรวจไม่ได้**
//    "ตรวจไม่ได้" ห้ามนับเป็นผ่านเด็ดขาด — ไม่งั้นวันที่เส้นล่ม ทุกข้อจะเขียวหมด
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOCAL = process.argv.includes("--local");
const API = LOCAL ? "http://localhost:8888/api/core" : "https://gucut.com/api/core";

let KEY = "";
try {
  KEY = readFileSync(join(homedir(), ".gucut-admin-key"), "utf8").trim();
} catch {
  console.error("❌ อ่าน ~/.gucut-admin-key ไม่ได้ — ตรวจไม่ได้ทั้งชุด (ไม่ใช่ 'ผ่าน')");
  process.exit(2);
}

const get = async (qs) => {
  const r = await fetch(`${API}?${qs}`, {
    headers: { "x-admin-key": KEY },
    signal: AbortSignal.timeout(90000),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

/* 🔴 **ด่านสำคัญที่สุดในไฟล์นี้ — ตัวตรวจจับตัวเองได้ตอนรันครั้งแรก 6 ก.ย. 2569**
   `/api/core` ที่ **ยังไม่รู้จักพารามิเตอร์** จะ **ไม่ตอบ 404** แต่ตกไปที่ "คำตอบหน้าแรก"
   (นับแถว · เทียบยอด · ช่องทาง) พร้อม **HTTP 200** ⇒ ดูเหมือนสำเร็จทุกประการ
   รอบแรกตัวตรวจอ่าน `lines` จากคำตอบหน้าแรกได้ `undefined` แล้วสรุปว่า
   **"ใบนี้ไม่มีบรรทัดสินค้า ⇒ ข้อความยังตรง ⇒ ✅ ผ่าน"**
   = **ขึ้นเขียวจากเส้นที่ยังไม่มีอยู่จริง** ซึ่งแย่กว่าไม่มีตัวตรวจ
   เพราะมันสร้างหลักฐานปลอมว่าตรวจแล้ว

   ⇒ ทุกข้อ **ต้องพิสูจน์ก่อนว่าคำตอบมาจากเส้นที่ตั้งใจถาม** ด้วยคีย์ประจำเส้นนั้น
      พิสูจน์ไม่ได้ = **"ตรวจไม่ได้" ห้ามตีความเนื้อคำตอบต่อเด็ดขาด** */
const HOMEPAGE_KEYS = ["counts", "recon"]; // ลายเซ็นของ "คำตอบหน้าแรก"
function wrongEndpoint(body, mustHave) {
  if (!body || typeof body !== "object") return "คำตอบไม่ใช่ JSON";
  if (HOMEPAGE_KEYS.every((k) => k in body))
    return "ตกไปที่คำตอบหน้าแรกของ /api/core ⇒ เส้นนี้ยังไม่ได้ deploy";
  if (!mustHave.some((k) => k in body))
    return `ไม่มีคีย์ประจำเส้นนี้เลย (${mustHave.join(" หรือ ")}) ⇒ ยังไม่ได้ deploy หรือรูปคำตอบเปลี่ยน`;
  return null;
}

/* คำกล่าวอ้างแต่ละข้อ = { ที่มาในโค้ด, สิ่งที่อ้าง, วิธีพิสูจน์ }
   ⚠️ `where` ต้องชี้ไฟล์จริงเสมอ — คนที่เห็นข้อนี้แดงต้องรู้ทันทีว่าไปแก้ข้อความที่ไหน
      ไม่มี where = รายงานที่บอกว่ามีปัญหาแต่ไม่บอกว่าปัญหาอยู่ไหน ซึ่งแทบไม่ต่างจากไม่รายงาน */
const CLAIMS = [
  {
    id: "transfer-lines",
    where: "netlify/lib/core-stock.mjs (stockCard · coverage)",
    claim: "เส้นดึงรายละเอียดใบโอนมีอยู่ แต่ยังไม่ยืนยันว่าส่งบรรทัดสินค้ามาด้วย",
    async check() {
      const list = await get("list=transfers&limit=1");
      const id = list.body?.rows?.[0]?.id;
      if (!id) return { state: "ตรวจไม่ได้", why: "หยิบเลขใบโอนจากกระจกไม่ได้" };
      const one = await get(`transfer=${encodeURIComponent(id)}`);
      const bad = wrongEndpoint(one.body, ["number", "fields", "lines", "error"]);
      if (bad) return { state: "ตรวจไม่ได้", why: bad };
      const lines = one.body?.lines;
      if (one.body?.error) return { state: "ตรวจไม่ได้", why: one.body.error };
      /* สามสถานะของ `lines` — ห้ามยุบรวม (คลาสเดียวกับ "ดึงไม่สำเร็จ vs ไม่มีของ") */
      if (lines === null)
        return { state: "ผ่าน", why: "ZORT ไม่ส่งช่องบรรทัดสินค้ามา — ข้อความยังตรง" };
      if (Array.isArray(lines) && lines.length)
        return {
          state: "ไม่ผ่าน",
          why: `ZORT ส่งบรรทัดสินค้ามาจริง ${lines.length} บรรทัด ⇒ ข้อความ "ยังไม่ยืนยัน" ล้าสมัยแล้ว` +
            " ⇒ อัปเดตข้อความ และพิจารณาให้ stockCard นับใบโอนรายสินค้าได้",
        };
      return { state: "ผ่าน", why: "ใบนี้ไม่มีบรรทัดสินค้า (ช่องมีแต่ว่าง) — ยังยืนยันไม่ได้ตามเดิม" };
    },
  },
  {
    id: "returnorder-api",
    where: "netlify/functions/zort-archive.mjs (รายการของที่ต้องคัดมือก่อนปิดบัญชี)",
    claim: "ใบคืนสินค้าดึงด้วย API ได้ ⇒ ไม่ต้องอยู่ในรายการคัดมือ",
    async check() {
      const r = await get("list=returnorders&limit=3");
      /* ⚠️ **แยกสองเรื่องที่หน้าตาเหมือนกันให้ขาด** (ตัวตรวจรอบแรกฟ้องแดงผิดเพราะไม่แยก)
          ① เส้นของ **เรา** ยังไม่ deploy ⇒ ตรวจไม่ได้ — ไม่ใช่ความผิดของ ZORT
          ② เส้นเรามีแล้ว แต่ **ZORT** ดึงไม่ได้ ⇒ ไม่ผ่านจริง ต้องเอากลับเข้ารายการคัดมือ
          ฟ้องแดงผิดแบบ ① คือทางที่ทำให้คนเลิกเชื่อตัวตรวจ แล้วเมินตอนมันแดงจริง */
      const bad = wrongEndpoint(r.body, ["rows", "total", "live", "error"]);
      if (bad) return { state: "ตรวจไม่ได้", why: bad };
      if (/ไม่รู้จัก/.test(String(r.body?.error ?? "")))
        return { state: "ตรวจไม่ได้", why: `เส้นฝั่งเรายังไม่ deploy: ${r.body.error}` };
      if (r.body?.error) return { state: "ไม่ผ่าน", why: `ZORT ดึงไม่ได้: ${r.body.error} ⇒ ต้องเอากลับเข้ารายการคัดมือ` };
      if (!Array.isArray(r.body?.rows))
        return { state: "ตรวจไม่ได้", why: "ไม่มีคีย์ rows" };
      return { state: "ผ่าน", why: `ดึงได้ ${r.body.rows.length} ใบตัวอย่าง` };
    },
  },
  {
    id: "returnorder-fullname",
    where: "netlify/lib/core-purchases.mjs (listReturnOrders)",
    claim: "ส่งชื่อลูกค้าเต็ม ไม่ปิดบัง (เจ้าของร้านชี้ขาด 6 ก.ย. 2569)",
    async check() {
      const r = await get("list=returnorders&limit=20");
      const bad = wrongEndpoint(r.body, ["rows", "total", "live", "error"]);
      if (bad) return { state: "ตรวจไม่ได้", why: bad };
      const rows = r.body?.rows;
      if (!Array.isArray(rows)) return { state: "ตรวจไม่ได้", why: "ไม่มีคีย์ rows" };
      const named = rows.map((x) => String(x?.customer ?? "")).filter((s) => s.trim());
      if (!named.length) return { state: "ตรวจไม่ได้", why: "ไม่มีใบที่มีชื่อลูกค้าให้ดู" };
      /* ⚠️ ห้ามตัดสินจาก "มีดาว/จุดไหม" — มาร์เก็ตเพลสปิดชื่อผู้ซื้อมาเองบางแถว
          ต้องดูว่า **ทุกแถว** ถูกปิด แบบนั้นถึงแปลว่าเป็นฝีมือท่อเรา (ฝั่งจอคิดเกณฑ์นี้) */
      const allMasked = named.every((s) => s.includes("•"));
      return allMasked
        ? { state: "ไม่ผ่าน", why: "ปิดบังทุกแถว ⇒ ตัวปิดชื่อกลับมาอยู่ในท่อ" }
        : { state: "ผ่าน", why: `ตัวอย่าง: ${named.slice(0, 2).join(" · ")}` };
    },
  },
  {
    id: "transfer-gap",
    where: "netlify/lib/core-purchases.mjs (listTransfers · ส่วนต่าง 194)",
    claim: "ส่วนต่างกระจก vs ZORT ยังเป็นข้อสันนิษฐาน ยังไม่มีคำอธิบายที่พิสูจน์แล้ว",
    async check() {
      const r = await get("list=transfers&limit=1");
      const bad = wrongEndpoint(r.body, ["total", "rows", "oldest"]);
      if (bad) return { state: "ตรวจไม่ได้", why: bad };
      const t = r.body?.total;
      if (!Number.isFinite(t)) return { state: "ตรวจไม่ได้", why: "อ่าน total ไม่ได้" };
      /* ⚠️ ตั้งใจ **ไม่ตัดสินว่าผ่าน/ไม่ผ่าน** — ข้อนี้ไม่มีคำตอบที่ถูกจนกว่าจะเทียบกับ ZORT ด้วยตา
          ตัวเลขที่พิมพ์ออกมาคือของให้คนเอาไปเทียบ ไม่ใช่คำตัดสินของเครื่อง
          ⚠️ ห้ามเปลี่ยนเป็น "ผ่าน" เพราะเลขไม่เปลี่ยน — เลขนิ่งไม่ได้แปลว่าอธิบายได้แล้ว */
      return {
        state: "ต้องดูด้วยตา",
        why: `กระจกมี ${t.toLocaleString()} ใบ · ใบเก่าสุด ${r.body?.oldest ?? "?"} ` +
          `⇒ เปิดจอรายการโอนสินค้าใน ZORT เทียบยอดรวม **วันนี้** และดูว่าใบเก่าสุดตรงกันไหม`,
      };
    },
  },
  {
    id: "zort-capabilities",
    where: "netlify/lib/zort-write.mjs (ZORT_NO_API · ZORT_CAN_BUT_NOT_BUILT)",
    claim: "ทะเบียนความสามารถ ZORT ยังตรง และของที่ยังไม่ยิงจริงต้องติดธง untested",
    async check() {
      const r = await get("zortnoapi=1");
      const bad = wrongEndpoint(r.body, ["canButNotBuilt", "noApi"]);
      if (bad) return { state: "ตรวจไม่ได้", why: bad };
      const cb = r.body?.canButNotBuilt;
      if (!Array.isArray(cb)) return { state: "ตรวจไม่ได้", why: "ไม่มีคีย์ canButNotBuilt" };
      const claimed = cb.filter((x) => !x?.untested);
      /* ⚠️ ธงต้องเป็น `untested` ไม่ใช่ `tested` — ฟิลด์ที่หายไปต้องแปลว่า "ยังไม่พิสูจน์"
          ถ้ากลับด้าน คนลืมใส่ธงจะได้ "พิสูจน์แล้ว" ฟรี ๆ */
      return claimed.length
        ? {
            state: "ต้องดูด้วยตา",
            why: `มี ${claimed.length} รายการที่ถอดธง untested แล้ว — ต้องแน่ใจว่ายิงของจริงสำเร็จจริง: ` +
              claimed.map((x) => x.what).join(" · "),
          }
        : { state: "ผ่าน", why: `${cb.length} รายการ ยังติดธง 'ยังไม่เคยยิงจริง' ครบ` };
    },
  },
];

const ICON = { ผ่าน: "✅", ไม่ผ่าน: "🔴", ตรวจไม่ได้: "⚪", ต้องดูด้วยตา: "👁" };
const tally = {};
console.log(`ตรวจคำกล่าวอ้างกับของจริงที่ ${API}\n`);
for (const c of CLAIMS) {
  let r;
  try {
    r = await c.check();
  } catch (e) {
    r = { state: "ตรวจไม่ได้", why: `ยิงไม่สำเร็จ: ${e?.message ?? e}` };
  }
  tally[r.state] = (tally[r.state] ?? 0) + 1;
  console.log(`${ICON[r.state] ?? "?"} [${c.id}] ${c.claim}`);
  console.log(`   ${r.why}`);
  console.log(`   ที่มา: ${c.where}\n`);
}
console.log(
  Object.entries(tally)
    .map(([k, v]) => `${ICON[k] ?? ""} ${k} ${v}`)
    .join(" · ")
);
/* ⚠️ ออกด้วยรหัสไม่ศูนย์เฉพาะตอน "ไม่ผ่าน" เท่านั้น
    "ตรวจไม่ได้" ไม่ทำให้ตก แต่ **ต้องเห็นบนจอ** — เงียบไปคือกลืนหายเป็นผ่าน */
process.exit(tally["ไม่ผ่าน"] ? 1 : 0);
