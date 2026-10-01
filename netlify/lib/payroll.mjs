// เงินเดือนพนักงาน — คิดเงินรายเดือนและเตรียมไฟล์โอนให้ /api/payroll
//
// ท่านประธานสั่ง 1 ต.ค. 2569: ระบบ HR + โอนเงินให้ลูกน้องแต่ละคน
// รูปแบบที่เลือก: **เงินเดือนรายเดือนคงที่** · ธนาคาร **กสิกรไทย**
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 เส้นที่ระบบนี้ไม่ข้าม: **ไม่โอนเงินเอง**
//    ระบบคิดเลขและออก "ไฟล์โอนเงินเป็นชุด" ให้เท่านั้น
//    ท่านประธานอัปโหลดไฟล์ใน K BIZ แล้วกดยืนยันเอง → เงินถึงออกจากบัญชี
//    ⇒ คิดผิดก็ยังมีคนเห็นก่อนเงินออก · ไม่มีทางที่บั๊กตัวเดียวจะโอนเงินผิดเงียบ ๆ
//
// 🔴 **ห้ามหักเงินอัตโนมัติจากข้อมูลลงเวลา**
//    ระบบลงเวลาผิดพลาดได้จริงและผิดบ่อย: กล้องไม่ติด · GPS เพี้ยนในอาคาร ·
//    พนักงานลืมกดออก · เน็ตหลุดตอนกด — เรารู้อยู่แล้วว่าทั้งสามอย่างเกิดขึ้นจริง
//    ⇒ ระบบ **แสดง** ว่าใครขาดกี่วันมาสายกี่ครั้ง แต่ **ไม่หักให้เอง**
//      ท่านประธานเป็นคนกรอกว่าจะหักเท่าไหร่ (ช่อง `หัก`)
//    🔑 ตัวเลขที่เชื่อถือได้ไม่พอ ห้ามเอาไปตัดสินใจแทนคน — ยิ่งเป็นเรื่องเงินในกระเป๋าคนอื่น
//
// 💰 **เก็บเงินเป็น "สตางค์" เป็นจำนวนเต็มเสมอ ห้ามใช้ทศนิยม**
//    0.1 + 0.2 ในคอมพิวเตอร์ไม่เท่ากับ 0.3 — เงินเดือนหลายคนบวกกันแล้วเพี้ยนได้จริง
//    และยอดรวมในไฟล์โอนจะไม่ตรงกับยอดที่ธนาคารคิด ⇒ ธนาคารตีกลับทั้งไฟล์
//
// 🔒 **ข้อมูลในไฟล์นี้อ่อนไหวที่สุดในระบบ** (เงินเดือน + เลขบัญชีธนาคาร)
//    ⇒ ผ่าน admin-gate เสมอ · ห้าม log · ห้ามส่งเข้า Telegram · ห้ามโผล่หน้าร้าน
//    เก็บแยกคีย์ต่อคน (`pay/<id>`) ไม่ยัดรวมในรายชื่อพนักงานที่หน้าลงเวลาอ่านได้
// ═══════════════════════════════════════════════════════════════════════════
import { getStore } from "@netlify/blobs";

import { monthTable, readEmp, thaiDate } from "./attendance.mjs";

const store = () => getStore({ name: "gucut-staff", consistency: "strong" });

const unavailable = (message) => Object.assign(new Error(message), { status: 503 });
const bad = (message) => Object.assign(new Error(message), { status: 400 });

/** ชื่อธนาคารที่รองรับ — ตอนนี้ใช้กสิกรไทยอย่างเดียวตามที่ท่านประธานเลือก */
export const BANKS = { KBANK: "กสิกรไทย" };

// ---------------------------------------------------------------------------
// เงิน: เก็บเป็นสตางค์ (จำนวนเต็ม) ตลอดทาง แปลงเป็นบาทเฉพาะตอนแสดงผล
// ---------------------------------------------------------------------------

/**
 * "12,500.50" หรือ 12500.5 → 1250050 สตางค์ · ค่าที่แปลงไม่ได้ = โยนทิ้ง ไม่เดาเป็น 0
 *
 * ⚠️ **ตรวจจุลภาคก่อนตัดทิ้ง ห้ามตัดก่อนตรวจ** (เจอตอนเทสจริง 1 ต.ค. 2569)
 *    ตัดก่อน → `"1,2,3"` กลายเป็น `"123"` แล้วผ่านด่านเป็น **฿123 เงียบ ๆ**
 *    ซึ่งคือการพิมพ์ผิดที่กลายเป็นยอดโอนจริงโดยไม่มีอะไรทัก
 *    🔑 การล้างข้อมูลก่อนตรวจสอบ = ลบหลักฐานที่ตัวตรวจต้องใช้
 */
export function toSatang(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const s = String(v).replace(/[\s฿]/g, "");
  // จุลภาคต้องคั่นทีละ 3 หลักเท่านั้น · หรือไม่มีจุลภาคเลย
  if (!/^-?(\d{1,3}(,\d{3})*|\d+)(\.\d{1,2})?$/.test(s))
    throw bad(`จำนวนเงินไม่ถูกต้อง: ${v}`);
  // 🔑 คูณบนสตริงไม่ได้ ใช้ Math.round กัน 12.07*100 = 1206.9999999999998
  return Math.round(parseFloat(s.replace(/,/g, "")) * 100);
}

/** 1250050 → "12,500.50" */
export const toBaht = (satang) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// ข้อมูลเงินเดือนรายคน
// ---------------------------------------------------------------------------

const PAY_KEY = (id) => `pay/${id}`;

/** เลขบัญชีกสิกร 10 หลัก — ตัดขีด/ช่องว่างออกก่อนตรวจ */
function cleanAcc(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length < 10 || d.length > 15) throw bad(`เลขบัญชีไม่ถูกต้อง (${d.length} หลัก)`);
  return d;
}

export async function readPay(id) {
  try {
    return (await store().get(PAY_KEY(id), { type: "json" })) || null;
  } catch {
    throw unavailable("อ่านข้อมูลเงินเดือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
}

export async function savePay(id, input) {
  if (!id) throw bad("ไม่รู้ว่าเป็นพนักงานคนไหน");
  const emp = (await readEmp()).find((e) => e.id === id);
  if (!emp) throw bad("ไม่พบพนักงานคนนี้");
  const rec = {
    salary: toSatang(input?.salary),           // เงินเดือนคงที่ (สตางค์)
    bank: "KBANK",
    acc: cleanAcc(input?.acc),
    accName: String(input?.accName ?? "").trim(),   // ชื่อบัญชี — ต้องตรงกับที่ธนาคาร
    position: String(input?.position ?? "").trim(),
    startDate: String(input?.startDate ?? "").trim(),
    note: String(input?.note ?? "").trim().slice(0, 300),
    updated: Date.now(),
  };
  try {
    await store().setJSON(PAY_KEY(id), rec);
  } catch {
    throw unavailable("บันทึกข้อมูลเงินเดือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  return rec;
}

// ---------------------------------------------------------------------------
// รายการปรับของเดือน (โบนัส / หัก) — ท่านประธานกรอกเอง ระบบไม่คิดให้
// ---------------------------------------------------------------------------

const ADJ_KEY = (month) => `adj/${month}`;

export async function readAdj(month) {
  try {
    return (await store().get(ADJ_KEY(month), { type: "json" })) || {};
  } catch {
    throw unavailable("อ่านรายการปรับเงินเดือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
}

/** { "<id>": { add, cut, why } } — add/cut เป็นบาท แปลงเป็นสตางค์ตอนเก็บ */
export async function saveAdj(month, id, input) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) throw bad("เดือนไม่ถูกต้อง");
  const all = await readAdj(month);
  all[id] = {
    add: toSatang(input?.add),
    cut: toSatang(input?.cut),
    why: String(input?.why ?? "").trim().slice(0, 200),
  };
  try {
    await store().setJSON(ADJ_KEY(month), all);
  } catch {
    throw unavailable("บันทึกรายการปรับเงินเดือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  return all[id];
}

// ---------------------------------------------------------------------------
// คิดเงินทั้งเดือน
// ---------------------------------------------------------------------------

/**
 * สรุปเงินเดือนของเดือนนั้น
 *
 * ⚠️ `มาทำงาน` / `สาย` เป็นข้อมูล **ประกอบการตัดสินใจ** ไม่ได้ถูกเอาไปคิดเงิน
 *    ดูเหตุผลที่หัวไฟล์ — ห้ามเอามาคูณหารเป็นยอดหักโดยไม่ได้สั่ง
 */
export async function buildMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) throw bad("เดือนไม่ถูกต้อง เช่น 2026-10");
  const [emps, days, adj] = await Promise.all([readEmp(), monthTable(month), readAdj(month)]);

  // นับวันมาทำงาน/สาย จากตารางลงเวลา
  const มา = {};
  const สาย = {};
  for (const วัน of Object.values(days)) {
    for (const [id, rec] of Object.entries(วัน)) {
      มา[id] = (มา[id] || 0) + 1;
      if (rec?.late) สาย[id] = (สาย[id] || 0) + 1;
    }
  }

  const rows = [];
  for (const e of emps) {
    if (e.active === false) continue;
    const pay = await readPay(e.id);
    const a = adj[e.id] || { add: 0, cut: 0, why: "" };
    const salary = pay?.salary || 0;
    const net = salary + (a.add || 0) - (a.cut || 0);
    rows.push({
      id: e.id,
      name: e.name,
      position: pay?.position || "",
      acc: pay?.acc || "",
      accName: pay?.accName || "",
      salarySatang: salary,
      addSatang: a.add || 0,
      cutSatang: a.cut || 0,
      whyAdj: a.why || "",
      netSatang: net,
      // ── ข้อมูลประกอบ ไม่ได้เอาไปคิดเงิน ──
      daysPresent: มา[e.id] || 0,
      daysLate: สาย[e.id] || 0,
      // ── ความพร้อมสำหรับโอน ──
      ready: Boolean(pay?.acc && pay?.accName && net > 0),
      problem: !pay?.salary ? "ยังไม่ได้ตั้งเงินเดือน"
        : !pay?.acc ? "ยังไม่มีเลขบัญชี"
          : !pay?.accName ? "ยังไม่มีชื่อบัญชี"
            : net <= 0 ? "ยอดสุทธิไม่เกินศูนย์" : "",
    });
  }
  rows.sort((x, y) => x.name.localeCompare(y.name, "th"));
  const totalSatang = rows.filter((r) => r.ready).reduce((s, r) => s + r.netSatang, 0);
  return { month, rows, totalSatang, countReady: rows.filter((r) => r.ready).length };
}

// ---------------------------------------------------------------------------
// ไฟล์โอนเงินเป็นชุด
// ---------------------------------------------------------------------------

/**
 * ⚠️ **รูปแบบไฟล์นี้ยังไม่ได้ยืนยันกับเทมเพลตจริงของ K BIZ**
 *    ธนาคารแต่ละเจ้า (และแต่ละบริการในเจ้าเดียวกัน) ใช้คอลัมน์ไม่เหมือนกัน
 *    และเปลี่ยนได้โดยไม่ประกาศ ⇒ **ห้ามเดาแล้วบอกว่าใช้ได้**
 *    ให้ท่านประธานโหลดเทมเพลตตัวอย่างจาก K BIZ มาหนึ่งไฟล์ แล้วปรับให้ตรงเป๊ะ
 *    ระหว่างนี้ไฟล์นี้ใช้เป็น "ใบตรวจก่อนโอน" ได้เต็มที่ — ตัวเลขถูกต้องแน่นอน
 *
 * 🔑 ใส่ BOM ไว้หน้าไฟล์ ไม่งั้น Excel ไทยเปิดแล้วชื่อคนเป็นตัวต่างดาว
 *    (แล้วคนจะแก้ชื่อในไฟล์เอง ซึ่งทำให้ชื่อไม่ตรงกับบัญชีจนธนาคารตีกลับ)
 */
export function transferCsv({ month, rows }) {
  const พร้อม = rows.filter((r) => r.ready);
  const หัว = ["ลำดับ", "เลขที่บัญชี", "ชื่อบัญชี", "จำนวนเงิน", "อ้างอิง", "ชื่อพนักงาน"];
  const บรรทัด = พร้อม.map((r, i) => [
    i + 1,
    r.acc,
    r.accName,
    (r.netSatang / 100).toFixed(2),      // ⚠️ ธนาคารต้องการทศนิยม 2 ตำแหน่งเสมอ
    `SALARY${month.replace("-", "")}`,
    r.name,
  ]);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [หัว, ...บรรทัด].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

/** สลิปเงินเดือนรายคน — ข้อความล้วน ส่งให้พนักงานได้ */
export function slipText(row, month) {
  const บรรทัด = [
    `สลิปเงินเดือน ${month}`,
    `ชื่อ: ${row.name}${row.position ? ` (${row.position})` : ""}`,
    "",
    `เงินเดือน      ${toBaht(row.salarySatang)} บาท`,
  ];
  if (row.addSatang) บรรทัด.push(`เพิ่ม          ${toBaht(row.addSatang)} บาท${row.whyAdj ? ` — ${row.whyAdj}` : ""}`);
  if (row.cutSatang) บรรทัด.push(`หัก            ${toBaht(row.cutSatang)} บาท${row.whyAdj ? ` — ${row.whyAdj}` : ""}`);
  บรรทัด.push("", `รับสุทธิ       ${toBaht(row.netSatang)} บาท`);
  บรรทัด.push("", `มาทำงาน ${row.daysPresent} วัน${row.daysLate ? ` · สาย ${row.daysLate} ครั้ง` : ""}`);
  บรรทัด.push(`ออกเมื่อ ${thaiDate()}`);
  return บรรทัด.join("\n");
}
