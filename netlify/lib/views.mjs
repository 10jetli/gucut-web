// ยอดวิวต่อคลิป — นับที่เซิร์ฟเวอร์ ไม่พึ่งบริการใคร
//
// ⚠️ ห้ามเก็บแบบ "อ่านก้อนเดียวมาบวกแล้วเขียนกลับ" เหมือน counts ของ social.mjs
//    คนดูคลิปพร้อมกันหลายคนจะเขียนทับกันจนยอดหาย
//    ใช้ "หนึ่งคนดูหนึ่งคลิป = หนึ่งคีย์" แล้วนับจำนวนคีย์เอา
//      w/<hash คลิป>/<รหัสผู้ชม>
//    คนเดิมดูซ้ำ = เขียนทับคีย์เดิม นับเป็น 1 เหมือนเดิม (ยอดจึงเป็น "คนดู" ไม่ใช่ "ครั้ง")
//    ซึ่งตรงกับที่เอาไปใช้จัดอันดับมากกว่า — กันคนกดรีเฟรชปั่นยอดตัวเองด้วย
import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "gucut-social", consistency: "eventual" });

const safe = (v, max = 64) => String(v ?? "").replace(/[^\w-]/g, "").slice(0, max);

/** จดว่ามีคนดูคลิปนี้ — เรียกเมื่อดูค้างนานพอเท่านั้น ไม่ใช่ทุกครั้งที่เลื่อนผ่าน */
export async function addView(id, vid) {
  const k = safe(id, 40);
  const who = safe(vid, 40);
  if (!k || !who) return;
  await store().setJSON(`w/${k}/${who}`, 1).catch(() => {});
}

/** ยอดวิวทุกคลิป — นับคีย์อย่างเดียว ไม่ต้องอ่านเนื้อ */
export async function readViews() {
  const out = {};
  try {
    const { blobs } = await store().list({ prefix: "w/" });
    for (const b of blobs) {
      const id = b.key.split("/")[1];
      if (id) out[id] = (out[id] || 0) + 1;
    }
  } catch { /* ดึงไม่ได้ก็ส่งของว่างไป ฟีดยังทำงานได้ */ }
  return out;
}
