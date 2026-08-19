// เจ้าของร้านเลือกได้ว่าจะให้บอตของ AI เจ้าไหนเก็บข้อมูลเว็บเราบ้าง
//
// นี่คือของที่แอป Avada AEO Optimizer บน Shopify เรียกว่า "control what AI reads"
//
// ⚠️ ทำไมถึงบังคับที่ edge ไม่ใช่แค่เขียนใน robots.txt
//    robots.txt เป็นแค่ "คำขอ" บอตจะทำตามหรือไม่ก็ได้ และหลายเจ้าไม่ทำตาม
//    ปิดที่ edge คือปิดจริง บอตได้ 403 กลับไป ไม่ได้เนื้อหาเลย
//    และถ้าระบบนี้พังขึ้นมา ผลคือ "ไม่ปิดใคร" ไม่ใช่ "ปิดทุกคน" (ดู edge-functions/ai-bots.js)
//
// ⚠️ ปิดได้เฉพาะบอตของผู้ช่วย AI เท่านั้น (kind === "ai")
//    บอตเครื่องค้นหา (Googlebot / Bingbot) ปิดไม่ได้เด็ดขาด — ปิดแล้วเว็บหายจาก Google
//    บอตโซเชียล (facebookexternalhit / LINE) ก็ปิดไม่ได้ — ปิดแล้วแชร์ลิงก์จะไม่ขึ้นรูป
//    เว็บนี้เคยโดน noindex ค้างไว้สองวันมาแล้ว จะไม่เปิดช่องให้พลาดซ้ำอีก
import { getStore } from "@netlify/blobs";
import { BOT_NOTES } from "./aibots.mjs";

const store = () => getStore({ name: "gucut-coupon", consistency: "strong" });
const KEY = "botrules";

/** บอตที่อนุญาตให้ปิดได้ — เฉพาะผู้ช่วย AI */
export const BLOCKABLE = Object.entries(BOT_NOTES)
  .filter(([, v]) => v.kind === "ai")
  .map(([name, v]) => ({ name, note: v.note }));

const blockableNames = new Set(BLOCKABLE.map((b) => b.name));

/** อ่านรายชื่อบอตที่ถูกปิด — พังเมื่อไหร่ให้ถือว่า "ไม่ปิดใคร" */
export async function readBlocked() {
  try {
    const v = await store().get(KEY, { type: "json" });
    const list = Array.isArray(v?.blocked) ? v.blocked : [];
    return list.filter((n) => blockableNames.has(n));
  } catch {
    return [];
  }
}

/** บันทึกรายชื่อบอตที่ปิด — กรองเอาเฉพาะตัวที่ปิดได้จริง */
export async function saveBlocked(list) {
  const blocked = (Array.isArray(list) ? list : []).filter((n) => blockableNames.has(n));
  await store().setJSON(KEY, { blocked, at: Date.now() });
  return blocked;
}
