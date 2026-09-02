// รุ่นเลื่อยยนต์: ต้องขอใบอนุญาต vs ไม่ต้องขอ — สำหรับฝั่งเซิร์ฟเวอร์
//
// ⚠️ **นี่คือสำเนาของ `src/lib/permit.ts` โดยตั้งใจ ห้ามแก้ที่นี่ที่เดียว**
//    ต้นฉบับคือไฟล์ .ts ซึ่งฟังก์ชัน .mjs ของ Netlify import ตรง ๆ ไม่ได้
//    มี `scripts/check-permit-models.mjs` รันตอน prebuild คอยเทียบสองที่ให้
//    **ไม่ตรงกันเมื่อไหร่ build ตก** — ข้อมูลกฎหมายห้ามหลุดจากกัน
//
// ⚠️ **สามสถานะ ไม่ใช่สอง** — "ไม่รู้จักรุ่น" ต้องไม่ถูกตีเป็น "ไม่ต้องขอ"
//    ต้องขอ (true) · ไม่ต้องขอ (false) · ไม่รู้จัก (null → ต้องให้คนตรวจเอง)
//    ถ้าเดาว่า "ไม่ต้องขอ" แล้วผิด ลูกค้าถือเลื่อยที่ต้องมีทะเบียนออกจากร้านโดยไม่รู้ตัว

/** รุ่นที่ต้องขอใบอนุญาต (ลซ.๑ → ลซ.๒) */
export const PERMIT_MODELS = [
  "F250",
  "F361",
  "F038",
  "F381",
  "F440",
  "8800 SUPER-S",
  "F288XP",
  "F070",
  "F660",
  "F090",
  "F880",
  "9800 SUPER PRO",
];

/** รุ่นที่ไม่ต้องขอใบอนุญาต — **เป็นจุดขายของร้าน** ห้ามติดป้ายเตือนผิด */
export const EXEMPT_MODELS = [
  "7800 SUPER-S (รุ่นใหม่ 2025)",
  "7800 SUPER-S",
  "7800 TURBO",
  "5800 (รุ่นใหม่ 2025)",
  "MINI",
];

const norm = (s) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * ชื่อสินค้านี้เป็นเลื่อยยนต์ที่ต้องขอใบอนุญาตไหม
 * @returns {{ permit: "required"|"exempt"|"unknown"|null, needsPermit: boolean|null, model, why }}
 *   ⚠️ ใช้ `permit` เป็นหลัก — `needsPermit` เก็บไว้เพื่อความเข้ากันได้ แต่ **กำกวม**
 *      เพราะ null ของมันแปลได้สองอย่าง: "ไม่เกี่ยว" กับ "เป็นเลื่อยแต่ไม่รู้จักรุ่น"
 *      ซึ่งบนจอต้องแสดงคนละแบบสุดขั้ว (ไม่ต้องขึ้นอะไรเลย vs ขึ้นเตือนให้คนตรวจ)
 *   required = ต้องขอทะเบียน · exempt = ไม่ต้องขอ (จุดขาย) ·
 *   unknown  = เป็นเลื่อยยนต์แต่จับรุ่นไม่ได้ ต้องให้คนตรวจ · null = ไม่ใช่ตัวเครื่อง
 */
export function permitInfo(name) {
  const n = norm(name);
  // ไม่ใช่ตัวเครื่อง (โซ่ · บาร์ · อะไหล่) = ไม่เกี่ยวกับใบอนุญาต
  const isSaw = /เลื่อยยนต์|เลื่อยโซ่/.test(String(name ?? "")) && !/^โซ่|^บาร์/.test(String(name ?? "").trim());
  if (!isSaw) return { permit: null, needsPermit: null, model: null, why: "ไม่ใช่ตัวเครื่องเลื่อยยนต์" };

  // เทียบตัวที่ยาวกว่าก่อน — "7800 SUPER-S (รุ่นใหม่ 2025)" ต้องชนะ "7800 SUPER-S"
  const exempt = [...EXEMPT_MODELS].sort((a, b) => b.length - a.length).find((m) => n.includes(norm(m)));
  if (exempt)
    return { permit: "exempt", needsPermit: false, model: exempt, why: "อยู่ในรายการรุ่นที่ไม่ต้องขอใบอนุญาต" };

  const permit = [...PERMIT_MODELS].sort((a, b) => b.length - a.length).find((m) => n.includes(norm(m)));
  if (permit)
    return { permit: "required", needsPermit: true, model: permit, why: "อยู่ในรายการรุ่นที่ต้องขอใบอนุญาต" };

  // ⚠️ เป็นเลื่อยยนต์แต่จับรุ่นไม่ได้ — ห้ามเดาไปทางไหนทั้งนั้น ต้องให้คนตรวจ
  return { permit: "unknown", needsPermit: null, model: null, why: "เป็นเลื่อยยนต์แต่ไม่รู้จักรุ่น — ต้องตรวจก่อนขาย" };
}
