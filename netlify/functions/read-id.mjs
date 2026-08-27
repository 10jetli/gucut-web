// อ่านบัตรประชาชนด้วย AI — /api/read-id
//
// ---------------------------------------------------------------------------
// เจ้าของร้านสั่ง (25 ส.ค. 2569): "ใช้ netlify AI อ่านบัตร จะได้แม่น ๆ ยอมจ่ายเครดิต"
// ตัวอ่านในเครื่อง (tesseract) อ่านตัวหนังสือไทยจากรูปถ่ายไม่แม่นพอ
// โดยเฉพาะวันเกิดและที่อยู่ ซึ่งเป็นช่องที่ผิดแล้วเสียเที่ยว
//
// ใช้ Netlify AI Gateway — ไม่ต้องหาคีย์จากที่อื่นมาใส่
// Netlify ใส่ ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL ให้เอง แล้วคิดเป็นเครดิตของร้าน
// ($1 = 180 เครดิต · ขีดจำกัดต่อนาทีขึ้นกับแพ็กเกจ)
//
// ⚠️ ข้อแลกเปลี่ยนที่ต้องรู้ — รูปบัตร "ออกจากเครื่องลูกค้า" แล้ว
//    ของเดิมอ่านในเครื่อง 100% รูปไม่เคยไปไหน ตอนนี้รูปวิ่งผ่านเซิร์ฟเวอร์ร้าน
//    ไปที่ผู้ให้บริการ AI — เจ้าของร้านรับทราบและตัดสินใจแล้ว
//    ⇒ หน้าเว็บต้องเขียนบอกลูกค้าตรง ๆ ก่อนกดถ่าย ไม่ใช่ซ่อนไว้
//
// ⚠️ กติกาการเก็บเปลี่ยนแล้ว (27 ส.ค. 2569) — เจ้าของร้านสั่ง "เก็บภาพไว้ตรวจสอบ"
//    รูปเก็บที่ keepScan (ถังปิด 7 วันลบเอง) · แต่ "ข้อมูลที่อ่านได้" ยังห้าม log
//    ห้ามส่งเข้า Telegram เหมือนเดิม — เลขบัตรเป็นข้อมูลอ่อนไหวตาม PDPA
//
// ⚠️ ตัวนี้เสียเงินจริงต่อการเรียกหนึ่งครั้ง ต้องมีตัวกันยิงรัวเสมอ
//    ไม่มีตัวกัน = ใครก็ยิงรูปเข้ามาเผาเครดิตร้านได้ทั้งคืน
// ---------------------------------------------------------------------------

import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 12;              // ถ่ายใหม่หลายรอบเป็นเรื่องปกติ แต่ไม่ควรเกินนี้
const MAX_BYTES = 4 * 1024 * 1024;  // รูปหลังย่อในเครื่องแล้วไม่ควรเกิน 4MB

// ⚠️ รูปเล็กเกินไปต้องตีกลับ "ก่อน" ส่งให้ AI เด็ดขาด
//    ยิงรูปขาวล้วนขนาด 1 พิกเซลไปทดสอบ แล้วมันแต่งบัตรขึ้นมาทั้งใบ
//    ชื่อ · เลข 13 หลัก · ที่อยู่ ครบหมด ทั้งที่ในรูปไม่มีอะไรเลย (เจอของจริง 25 ส.ค. 2569)
//    อันตรายที่สุดในระบบนี้ เพราะลูกค้าเอาไปเซ็นรับรองต่อนายทะเบียน
//    รูปบัตรจริงย่อ 1400px แล้วยังหนักเกิน 20KB เสมอ เล็กกว่านี้ไม่ใช่บัตรแน่นอน
const MIN_BYTES = 12 * 1024;

/**
 * ตรวจหลักสุดท้ายของเลขบัตรประชาชน
 *
 * ⚠️ ด่านสุดท้ายที่จับ "เลขที่ AI แต่งขึ้นมา" ได้
 *    เลขมั่วมีโอกาสผ่านแค่ 1 ใน 10 · เลขที่มันแต่งมาตอนทดสอบไม่ผ่าน
 *    ห้ามถอดออก และห้ามเชื่อเลขที่ไม่ผ่านด่านนี้
 */
function validThaiId(id) {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

// ---------------------------------------------------------------------------
// เก็บภาพที่สแกนไว้ให้ร้านตรวจสอบย้อนหลัง — เจ้าของร้านสั่งเอง 27 ส.ค. 2569
// ("คุณต้องเก็บภาพไว้ · เก็บภาพไว้ตรวจสอบ") ⇒ กลับคำกติกาเดิมที่ห้ามเก็บ
//
// ⚠️ เงื่อนไขที่ทำให้เก็บได้โดยไม่ผิด PDPA — ห้ามถอดข้อไหนออก
//   1. ถังปิด (Netlify Blobs store gucut-idscan) เปิดดูได้เฉพาะรหัสหลังร้าน
//      ห้ามย้ายไป R2 เด็ดขาด — ถังที่มีเปิดสาธารณะ (กติกาเดียวกับใบ ลซ.๒)
//   2. เก็บ 7 วันแล้วลบอัตโนมัติ — มีไว้ไล่ปัญหาการอ่าน ไม่ใช่คลังเอกสาร
//   3. หน้าเว็บบอกลูกค้าตรง ๆ ก่อนกดถ่ายว่าเก็บ 7 วัน (แก้ประกาศแล้ว)
//   4. ตัวเขียนรูปต้อง await — Netlify แช่แข็งฟังก์ชันทันทีหลังตอบ
//      promise ที่ปล่อยลอยตายกลางทาง รูปไม่ถูกเก็บเลยสักใบ (เจอจริงตอนยิงทดสอบ)
//      ช้าเพิ่มหลักสิบ ms ยอมได้ · ส่วนงานเก็บกวาดของเก่าฝาก waitUntil ถ้ามี
// ---------------------------------------------------------------------------
async function keepScan(b64, turn, zone, outcome, context) {
  try {
    const store = getStore({ name: "gucut-idscan", consistency: "strong" });
    const day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const key = `img/${day}/${Date.now()}-t${turn}${zone === "address" ? "z" : ""}-${outcome}`;
    await store.set(key, Buffer.from(b64, "base64"));
    const cleanup = (async () => {
      const cutoff = new Date(Date.now() + 7 * 3600 * 1000 - 7 * 24 * 3600 * 1000)
        .toISOString().slice(0, 10);
      const { blobs } = await store.list({ prefix: "img/" });
      for (const b of blobs) {
        const d = b.key.split("/")[1];
        if (d && d < cutoff) await store.delete(b.key).catch(() => {});
      }
    })().catch(() => {});
    if (context?.waitUntil) context.waitUntil(cleanup);
    else await cleanup;
  } catch { /* เก็บไม่ได้ต้องไม่กระทบลูกค้า */ }
}

/** กันยิงรัว — หนึ่งคีย์ต่อ IP เก็บเวลาที่ยิง */
async function overLimit(ip) {
  try {
    const s = getStore({ name: "gucut-coupon", consistency: "strong" });
    const key = `rl/readid/${ip}`;
    const now = Date.now();
    const hits = ((await s.get(key, { type: "json" }).catch(() => null)) || [])
      .filter((t) => now - t < WINDOW_MS);
    if (hits.length >= MAX_PER_IP) return true;
    hits.push(now);
    await s.setJSON(key, hits).catch(() => {});
    return false;
  } catch {
    return false;   // ตัวนับพังต้องไม่ทำให้ลูกค้าใช้งานไม่ได้
  }
}

// ⚠️ สั่งให้ตอบเป็น JSON อย่างเดียว และ "ไม่รู้ให้ตอบว่าง" ห้ามเดา
//    เดาแล้วผิดอันตรายกว่าเว้นว่าง เพราะลูกค้าเอาไปรับรองต่อนายทะเบียน
const PROMPT = `ก่อนอื่น ดูก่อนว่ารูปนี้เป็นบัตรประจำตัวประชาชนไทยหรือไม่

ถ้ารูปว่างเปล่า · เป็นสีพื้นล้วน · หรือไม่ใช่บัตรประชาชนไทยเลย
ให้ตอบแค่ {"notIdCard": true} แล้วหยุด

ถ้าเป็นบัตรจริงแต่บางส่วนเบลอหรือมืด **ให้อ่านเฉพาะส่วนที่เห็นชัดและมั่นใจจริง**
ช่องไหนอ่านไม่ชัดให้ตอบค่าว่าง "" — อ่านได้บางช่องดีกว่าปฏิเสธทั้งใบ
(ระบบปลายทางมีด่านตรวจของมันเอง ช่องว่างลูกค้ากรอกเองได้ แต่ค่าที่เดามาตรวจจับยาก)
**ห้ามแต่งหรือเดาข้อมูลเด็ดขาดไม่ว่ากรณีใด** ข้อมูลนี้ลูกค้าจะเอาไปเซ็นรับรองต่อทางราชการ
ข้อมูลที่แต่งขึ้นสร้างความเสียหายมากกว่าการเว้นว่างอย่างเทียบกันไม่ได้

ถ้าเห็นบัตรจริงและอ่านออก ให้อ่านข้อมูลแล้วตอบกลับเป็น JSON เท่านั้น

{
  "name": "คำนำหน้า ชื่อ นามสกุล ภาษาไทย เช่น นาย สมชาย ใจดี",
  "idNumber": "เลข 13 หลักติดกันไม่มีขีด",
  "birth": "YYYY-MM-DD เป็นปี ค.ศ. (ถ้าบัตรเขียน พ.ศ. ให้ลบ 543)",
  "houseNo": "บ้านเลขที่ เช่น 82 หรือ 295/1",
  "moo": "หมู่ที่ เป็นตัวเลข",
  "soi": "ตรอก/ซอย",
  "road": "ถนน",
  "tambon": "ชื่อที่อยู่หลัง ต. หรือ แขวง",
  "amphoe": "ชื่อที่อยู่หลัง อ. หรือ เขต",
  "province": "ชื่อที่อยู่หลัง จ. หรือ จังหวัด"
}

กติกา
- ช่องไหนอ่านไม่ออกหรือไม่มีบนบัตร ให้ใส่ค่าว่าง "" ห้ามเดาเด็ดขาด

- **ชื่อต้องเป็นภาษาไทยเท่านั้น** อ่านจากบรรทัด "ชื่อตัวและชื่อสกุล"
  **ห้ามใช้บรรทัด Name / Last name ที่เป็นภาษาอังกฤษเด็ดขาด**
  เอกสารที่ลูกค้าเอาไปยื่นเป็นแบบฟอร์มราชการไทย ชื่ออังกฤษใช้ไม่ได้
  ถ้าอ่านชื่อไทยไม่ออก ให้ตอบค่าว่าง อย่าเอาชื่ออังกฤษมาแทน

- **ที่อยู่ให้ดูที่คำนำหน้าเป็นหลัก ห้ามสลับกัน**
  บนบัตรเขียนติดกันเป็นบรรทัดเดียว เช่น "25 หมู่ที่ 1 ต.กู่กาสิงห์ อ.เกษตรวิสัย จ.ร้อยเอ็ด"
  ⇒ houseNo=25 · moo=1 · tambon=กู่กาสิงห์ · amphoe=เกษตรวิสัย · province=ร้อยเอ็ด
  คำที่อยู่หลัง "ต." คือ tambon เท่านั้น · หลัง "อ." คือ amphoe เท่านั้น
  ห้ามเอาชื่ออำเภอไปใส่ช่องตำบล หรือเอาชื่อตำบลไปใส่ช่องอำเภอ
  (กรุงเทพฯ ใช้ "แขวง" แทน ต. และ "เขต" แทน อ.)
  **ห้ามเลื่อนช่อง**: ถ้าอ่านตำบลไม่ออก ช่อง tambon ต้องเป็นค่าว่าง
  ห้ามขยับอำเภอมาใส่แทน แล้วห้ามคิดชื่อขึ้นมาเติมช่องที่ขาดเด็ดขาด
  (เคยมีเคสจริง: อ่าน "ต.หนองแคน อ.ดงหลวง" แล้วตอบ tambon เป็นชื่อ
  ที่ไม่มีบนบัตรเลย ส่วนชื่อจริงถูกเลื่อนไปอยู่ผิดช่องทั้งแถว)

- **รูปอาจเอียงหรือหมุน 90/180 องศา** — บัตรถ่ายแนวนอนหรือกลับหัวเป็นเรื่องปกติ
  ให้หมุนภาพในใจก่อนอ่าน ถ้าหมุนแล้วยังอ่านส่วนไหนไม่ชัด ตอบค่าว่างส่วนนั้น

- วันเกิดต้องเป็นวันที่ข้างป้าย "เกิดวันที่" หรือ "Date of Birth" เท่านั้น
  ห้ามเอาวันออกบัตรหรือวันบัตรหมดอายุมาตอบ
- ถ้ารูปไม่ใช่บัตรประจำตัวประชาชนไทย ให้ตอบ {"notIdCard": true}
- ตอบ JSON ล้วน ไม่ต้องมีคำอธิบายหรือเครื่องหมาย code fence`;

// โหมดอ่านเฉพาะ "โซนที่อยู่" — หน้าเว็บครอปส่วนล่างซ้ายของบัตรซูมส่งมา
// เมื่ออ่านเต็มใบแล้วบรรทัดที่อยู่เล็กเกินอ่าน (บทเรียน 26 ส.ค. 2569:
// เต็มใบอ่านชื่อ/เลขได้หมดแต่ที่อยู่เบลอ พอครอปซูมเฉพาะส่วนก็อ่านออก)
const PROMPT_ADDR = `รูปนี้คือภาพซูมบางส่วนของบัตรประจำตัวประชาชนไทย เพื่ออ่านบรรทัดชื่อและที่อยู่ให้ชัด

ตอบเป็น JSON เท่านั้น:
{
  "name": "จากบรรทัด \"ชื่อตัวและชื่อสกุล\" — คำนำหน้า ชื่อ นามสกุล ภาษาไทยเท่านั้น",
  "houseNo": "บ้านเลขที่ เช่น 82 หรือ 295/1",
  "moo": "หมู่ที่ เป็นตัวเลข",
  "soi": "ตรอก/ซอย",
  "road": "ถนน",
  "tambon": "ชื่อหลัง ต. หรือ แขวง",
  "amphoe": "ชื่อหลัง อ. หรือ เขต",
  "province": "ชื่อหลัง จ. หรือบรรทัดจังหวัด"
}

กติกา: ช่องไหนอ่านไม่ชัดหรือไม่มีในภาพ ให้ตอบค่าว่าง "" **ห้ามเดาเด็ดขาด**
ชื่ออ่านทีละตัวอักษรอย่างระวัง โดยเฉพาะตัวที่คล้ายกัน (บ/ม · ุ/ู · ญ/ล)
ห้ามใช้บรรทัด Name/Last name ภาษาอังกฤษ — เอาเฉพาะบรรทัดภาษาไทย
ห้ามเลื่อนช่อง — คำหลัง ต. คือ tambon เท่านั้น หลัง อ. คือ amphoe เท่านั้น
ถ้าไม่เห็นทั้งบรรทัดชื่อและบรรทัดที่อยู่เลย ตอบ {"notIdCard": true}
ตอบ JSON ล้วน ไม่มีคำอธิบาย`;

export default async function handler(req, context) {
  // ---------- ฝั่งร้าน: เปิดดูภาพที่เก็บไว้ตรวจสอบ ----------
  // GET ?scan=<key> = ตัวรูป · GET เฉย ๆ = รายชื่อ 300 รายการล่าสุด
  // ⚠️ ดูรูปต้องดึงผ่าน adminFetch (รหัสอยู่ในหัวข้อความ) เปิด URL ตรง ๆ ไม่ได้
  if (req.method === "GET") {
    const gate = await adminGate(req, context);
    if (gate.deny) return gate.deny;
    if (!gate.ok) return json({ error: "unauthorized" }, 401);
    const u = new URL(req.url);
    const store = getStore({ name: "gucut-idscan", consistency: "strong" });
    const key = u.searchParams.get("scan");
    if (key) {
      const buf = await store.get(key, { type: "arrayBuffer" }).catch(() => null);
      if (!buf) return json({ error: "not found" }, 404);
      return new Response(buf, {
        headers: { "content-type": "image/jpeg", "cache-control": "no-store" },
      });
    }
    const { blobs } = await store.list({ prefix: "img/" });
    return json({ scans: blobs.map((b) => b.key).sort().reverse().slice(0, 300) });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // ⚠️ ต้องใช้ NETLIFY_AI_GATEWAY_* เป็นตัวแรกเสมอ ห้ามเอา ANTHROPIC_API_KEY ขึ้นก่อน
  //
  //    Netlify AI Gateway "ไม่ใส่ ANTHROPIC_API_KEY/ANTHROPIC_BASE_URL ให้ ถ้ามีคนตั้งค่าไว้เองแล้ว"
  //    ร้านนี้มี ANTHROPIC_API_KEY ตั้งไว้เองอยู่ก่อน Gateway จึงเงียบไปทั้งคู่
  //    ผลคือได้คีย์ที่ตั้งไว้เองมาโดยไม่มี base url แล้วยิงไป api.anthropic.com
  //    ปลายทางตอบ invalid x-api-key — อาการหลอกตามาก ดูเหมือนคีย์เสีย ทั้งที่เป็นเรื่องคนละเรื่อง
  //    (เจอของจริง 25 ส.ค. 2569 หลังยิงทดสอบสองรอบ)
  //
  //    NETLIFY_AI_GATEWAY_KEY / _BASE_URL ถูกใส่ให้ "เสมอ" ไม่สนใจว่าใครตั้งอะไรไว้
  //    จึงเป็นทางเดียวที่ไม่พังเมื่อร้านไปตั้งคีย์ของตัวเองเพิ่มทีหลัง
  //    ⚠️ ต้อง deploy ขึ้น production อย่างน้อยหนึ่งครั้ง Gateway ถึงจะเริ่มใส่ค่าให้
  //    คิดเงินเป็นเครดิต Netlify ของร้าน — $1 = 180 เครดิต
  //
  //    ⚠️ ชื่อตัวแปรคือ NETLIFY_AI_GATEWAY_URL — **ไม่ใช่** _BASE_URL ตามที่เอกสารเขียนไว้
  //       เอกสาร Netlify เขียนชื่อผิด เสียเวลาไปสองรอบ deploy กว่าจะรู้
  //       ถามระบบตรง ๆ ว่ามีตัวแปรชื่ออะไรบ้างถึงได้คำตอบ
  //       (ของจริงมี 4 ตัว: ANTHROPIC_API_KEY · ANTHROPIC_BASE_URL ·
  //        NETLIFY_AI_GATEWAY_KEY · NETLIFY_AI_GATEWAY_URL)
  const gwKey = process.env.NETLIFY_AI_GATEWAY_KEY;
  const gwBase = process.env.NETLIFY_AI_GATEWAY_URL;
  //
  // ⚠️ คีย์กับที่อยู่ปลายทางต้อง "มาเป็นคู่" เสมอ ห้ามหยิบข้ามคู่กัน
  //    คีย์ของ Gateway ใช้กับ api.anthropic.com ไม่ได้ และกลับกันก็เช่นกัน
  //    ใช้คู่ Gateway ก่อน เพราะเป็นคู่เดียวที่ Netlify ใส่ให้เสมอไม่ว่าร้านจะตั้งอะไรไว้เอง
  const pair = gwKey && gwBase
    ? { key: gwKey, base: gwBase }
    : { key: process.env.ANTHROPIC_API_KEY, base: process.env.ANTHROPIC_BASE_URL };
  const key = pair.key;
  const base = (pair.base || "https://api.anthropic.com").replace(/\/+$/, "");
  if (!key) {
    // ⚠️ บอกให้ชัดว่าเป็นเรื่องการตั้งค่า ไม่ใช่รูปลูกค้าไม่ดี
    //    หน้าเว็บจะได้บอกลูกค้าให้กรอกเองแทนการให้ถ่ายซ้ำไปเรื่อย ๆ
    return json({ error: "ยังไม่ได้ตั้งค่าตัวอ่าน", setup: true }, 503);
  }

  const ip = req.headers.get("x-nf-client-connection-ip") || "unknown";
  if (await overLimit(ip)) {
    return json({ error: "ถ่ายบัตรถี่เกินไป พักสัก 10 นาทีแล้วลองใหม่" }, 429);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const b64 = String(body?.image || "").replace(/^data:image\/\w+;base64,/, "");
  if (!b64) return json({ error: "ไม่มีรูป" }, 400);
  // ⚠️ log ได้แค่นี้ — ขนาดรูปกับรอบหมุน ห้าม log เนื้อหาบัตรเด็ดขาด (กติกา PDPA)
  //    มีไว้ไล่ปัญหา "อ่านเพี้ยนซ้ำ ๆ" จาก log ฟังก์ชันโดยไม่ต้องเดา
  const turn = Number(body.turn) || 0;
  const zone = body.zone === "address" ? "address" : "full";
  const bytes = b64.length * 0.75;
  if (bytes > MAX_BYTES) return json({ error: "รูปใหญ่เกินไป" }, 413);
  // ⚠️ ตีกลับก่อนถึง AI — ไม่งั้นมันแต่งบัตรขึ้นมาทั้งใบจากรูปเปล่า (ดูหมายเหตุที่ MIN_BYTES)
  //    และประหยัดเครดิตไปในตัว
  if (bytes < MIN_BYTES) {
    return json({ error: "รูปไม่ชัดหรือไม่ใช่บัตรประชาชน ลองถ่ายใหม่ให้เต็มกรอบ" }, 422);
  }

  const media = /^data:(image\/\w+);/.exec(String(body?.image || ""))?.[1] || "image/jpeg";

  try {
    // ⚠️ รูปแบบที่อยู่ของ NETLIFY_AI_GATEWAY_BASE_URL ไม่มีเขียนไว้ในเอกสาร
    //    บางแบบต้องต่อชื่อผู้ให้บริการเข้าไปด้วย (/anthropic) บางแบบไม่ต้อง
    //    จึงลองแบบตรง ๆ ก่อน เจอ 404 ค่อยลองแบบมีชื่อผู้ให้บริการ
    //    404 ไม่เสียเครดิต จึงถูกกว่าการเดาผิดแล้วต้อง deploy ใหม่ (deploy ละ 15 เครดิต)
    const paths = base.includes("/anthropic")
      ? ["/v1/messages"]
      : ["/v1/messages", "/anthropic/v1/messages"];

    const send = (path) => fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        authorization: `Bearer ${key}`,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // ⚠️ ใส่ชื่อรุ่นแบบมีวันที่ ตามรายชื่อที่ Netlify AI Gateway รองรับ
        //    ชื่อย่อไม่มีวันที่ Gateway อาจไม่รู้จัก
        model: process.env.READ_ID_MODEL || "claude-sonnet-4-5-20250929",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data: b64 } },
            { type: "text", text: zone === "address" ? PROMPT_ADDR : PROMPT },
          ],
        }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    // -----------------------------------------------------------------------
    // ⚠️ อ่าน "สองรอบพร้อมกัน" แล้วเชื่อเฉพาะช่องที่สองรอบตอบตรงกัน
    //
    //    บทเรียน 26 ส.ค. 2569 ค่ำ: รูปบัตรเบลอ AI เดาออกมาเป็น "คนละคนที่ดูสมจริง"
    //    ชื่อคล้ายของจริง (อติ บุญปราโมช) · ที่อยู่เป็นอำเภอจริงในจังหวัดอื่น
    //    จนด่านตรวจทะเบียนราชการผ่านฉลุย — เลขบัตรรอดเพราะมี checksum ค้ำ
    //    ช่องอื่นไม่มีอะไรค้ำเลย
    //
    //    การเดาจากรูปเบลอเป็นการสุ่ม สองรอบอิสระจะเดาไม่ตรงกัน
    //    ช่องที่ตรงกันสองรอบ = อ่านจริงเกือบแน่นอน · ไม่ตรงกัน = เว้นว่างให้กรอกเอง
    //    แลกกับเครดิต 2 เท่าต่อการสแกน — เจ้าของร้านสั่งไว้เองว่ายอมจ่ายเพื่อความแม่น
    // -----------------------------------------------------------------------
    const readOnce = async () => {
      let r = await send(paths[0]);
      if (r.status === 404 && paths[1]) r = await send(paths[1]);
      const out = await r.json().catch(() => null);
      if (!r.ok) return { httpFail: r.status, out };
      const text = (out?.content || []).map((c) => c.text || "").join("").trim();
      const m = /\{[\s\S]*\}/.exec(text);
      if (!m) return { parseFail: true };
      try { return { data: JSON.parse(m[0]) }; } catch { return { parseFail: true }; }
    };

    // ⚠️ อ่าน "สามรอบ" เอาเสียงข้างมาก 2 ใน 3 — เจ้าของร้านสั่ง "ทำระบบกันเหนียว"
    //    (27 ส.ค. 2569 หลังบ้านเลขที่หายเพราะสองรอบอ่านไม่ตรงกันแล้วถูกตัดว่าง)
    //    ช่องจะว่างก็ต่อเมื่อทั้งสามรอบตอบไม่ตรงกันเลย ซึ่งเกิดยากกว่ามาก
    //    ความปลอดภัยเท่าเดิม: สองเสียงตรงกันยังเป็นหลักฐานแข็ง ค่าที่เดามั่ว
    //    แบบสุ่มไม่มีทางตรงกันสองรอบ · ยิงขนานเวลารอเท่าเดิม · เครดิต ~4.5/คำขอ
    const reads = await Promise.all([readOnce(), readOnce(), readOnce()]);
    const datas = reads.filter((x) => x.data).map((x) => x.data);
    const r1 = datas[0] ? { data: datas[0] } : reads[0];
    const r2 = datas[1] ? { data: datas[1] } : reads[1];
    const fail = reads.find((x) => x.httpFail);
    if (fail && datas.length < 2) {
      const r = { status: fail.httpFail }; const out = fail.out;
      // ⚠️ ต้องแยก "เครดิตหมด / ยิงเร็วเกินโควตาต่อนาที" ออกจาก "ของพัง"
      //    ถ้าเหมารวมเป็น 502 หมด หน้าเว็บจะถอยไปใช้ตัวอ่านในเครื่องเงียบ ๆ
      //    แล้วเจ้าของร้านจะไม่มีวันรู้ว่าเครดิตหมดไปตั้งแต่เมื่อไหร่
      //    รู้แต่ว่า "หลัง ๆ อ่านบัตรไม่ค่อยแม่น" ซึ่งตามหาสาเหตุไม่เจอ
      const why = out?.error?.message || `ตัวอ่านตอบ ${r.status}`;
      if (r.status === 429) return json({ error: "ตัวอ่านคิวเต็ม รอสักครู่แล้วลองใหม่", why }, 429);
      if (r.status === 402) return json({ error: "เครดิตตัวอ่านหมด", credit: true, why }, 402);
      // ⚠️ บอกแค่ "ใช้ตัวแปรไหน" กับ "โฮสต์ปลายทาง" ห้ามใส่ค่าคีย์ลงไปเด็ดขาด
      //    ชื่อตัวแปรกับชื่อโฮสต์ไม่ใช่ความลับ แต่ค่าคีย์เป็น
      //    มีไว้เพื่อแยก "คีย์ผิด" กับ "ที่อยู่ปลายทางผิด" ออกจากกันได้โดยไม่ต้อง deploy ซ้ำ
      let host = "";
      try { host = new URL(base).host; } catch { /* ที่อยู่เพี้ยนก็ปล่อยว่าง */ }
      // ตัวถามชื่อตัวแปรถูกถอดออกแล้ว รู้ชื่อจริงแล้ว (NETLIFY_AI_GATEWAY_URL)
      return json({ error: why, via: gwKey && gwBase ? "gateway" : "own-key", host }, 502);
    }
    if (datas.length < 2) return json({ error: "อ่านผลไม่ได้ ลองใหม่อีกครั้ง" }, 502);

    const d1 = r1.data, d2 = r2.data;
    // ไม่ใช่บัตร = ต้องมีอย่างน้อย 2 ใน 3 เห็นตรงกัน — เสียงเดียวไม่พอตัดสิน
    if (datas.filter((d) => d.notIdCard).length >= 2) {
      console.log(`read-id turn=${turn} bytes=${bytes} out=notIdCard`);
      await keepScan(b64, turn, zone, "notIdCard", context);
      // ⚠️ สาเหตุที่พบบ่อยจริงคือ "รูปเบลอ/มืด" ไม่ใช่รูปผิดประเภท (เจอจริง 26 ส.ค. 2569
      //    บัตรจริงถ่ายกลางคืนแสงน้อย AI ปฏิเสธถูกต้องแล้ว แต่ข้อความเดิมทำลูกค้างง)
      return json({ error: "อ่านบัตรจากรูปนี้ไม่ได้ — รูปอาจเบลอหรือมืดเกินไป ลองถ่ายใหม่ในที่สว่าง ถือมือนิ่ง ๆ ให้บัตรชัดเต็มกรอบ" }, 422);
    }

    // ⚠️ คืนเฉพาะช่องที่ "เสียงข้างมากตอบตรงกัน" (≥2 เสียง) — ไม่มีเสียงข้างมาก = ว่าง
    const norm = (d, k) => (typeof d[k] === "string" ? d[k].replace(/\s+/g, " ").trim() : "");
    const voters = datas.filter((d) => !d.notIdCard);
    const agree = (k) => {
      const count = new Map();
      for (const d of voters) {
        const v = norm(d, k);
        if (!v) continue;
        count.set(v, (count.get(v) || 0) + 1);
      }
      for (const [v, n] of count) if (n >= 2) return v;
      return "";
    };

    if (zone === "address") {
      const AF = ["name", "houseNo", "moo", "soi", "road", "tambon", "amphoe", "province"];
      const o = {};
      let ag = 0;
      for (const k of AF) { o[k] = agree(k); if (o[k]) ag++; }
      console.log(`read-id turn=${turn} bytes=${bytes} out=ok-zone agree=${ag}/8`);
      await keepScan(b64, turn, zone, `zone-agree${ag}`, context);
      return json(o);
    }

    // ⚠️ ด่านสุดท้าย — เลขบัตรต้อง "ตรงกันสองรอบ" และผ่านหลักตรวจ
    //    ไม่ผ่านข้อใดข้อหนึ่ง = ทิ้งทั้งชุด (เหตุผลเดิม: ถ้าเลขยังมั่ว ช่องอื่นก็เชื่อไม่ได้)
    const idVotes = new Map();
    for (const d of voters) {
      const v = norm(d, "idNumber").replace(/\D/g, "").slice(0, 13);
      if (v) idVotes.set(v, (idVotes.get(v) || 0) + 1);
    }
    const id = [...idVotes.entries()].find(([, n]) => n >= 2)?.[0] || "";
    if (!validThaiId(id)) {
      console.log(`read-id turn=${turn} bytes=${bytes} out=id-mismatch`);
      await keepScan(b64, turn, zone, "id-mismatch", context);
      return json({ error: "อ่านเลขบัตรไม่ชัด ลองถ่ายใหม่ให้เห็นเลขครบทั้ง ๑๓ หลัก" }, 422);
    }

    const FIELDS = ["name", "birth", "houseNo", "moo", "soi", "road", "tambon", "amphoe", "province"];
    const outData = { idNumber: id };
    let agreed = 0;
    for (const k of FIELDS) { outData[k] = agree(k); if (outData[k]) agreed++; }
    console.log(`read-id turn=${turn} bytes=${bytes} out=ok agree=${agreed}/9 addr=${outData.tambon && outData.province ? "full" : "partial"}`);
    await keepScan(b64, turn, zone, `ok-agree${agreed}`, context);
    return json(outData);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 502);
  }
}

export const config = { path: "/api/read-id" };
