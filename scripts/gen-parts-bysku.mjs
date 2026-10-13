/* สร้างดัชนีย้อนกลับ SKU → แผนผังอะไหล่ (13 ต.ค. 2569 · ท่านประธานสั่ง "ลอง 1")
 *
 * ทำไมต้องมี: หน้า /parts/ ทำเสร็จ 14 รุ่นแล้วแต่ **ไม่มีทางเข้าเลยสักทาง**
 *   ลูกค้าเปิดหน้าอะไหล่ชิ้นหนึ่งแล้วไม่แน่ใจว่าใช่ชิ้นที่ต้องการไหม ⇒ ไม่กล้าสั่ง
 *   (คนเข้าเว็บสัปดาห์ละ 13,510 แต่สั่ง 27 ออเดอร์) ⇒ ให้กดดูตำแหน่งจริงในเครื่องได้
 *
 * 🔑 ทำตอน build ไม่ใช่ตอนลูกค้าเปิดหน้า
 *    หน้าสินค้าเป็นหน้าที่คนเข้ามากที่สุด ยิง API ทุกครั้งที่เปิด = เผาเครดิต Netlify
 *    ตารางจับคู่เปลี่ยนไม่บ่อย ⇒ แช่ไว้ตอน build คุ้มกว่ามาก
 *
 * ⚠️ **ห้ามทำให้ build ตก** — ดึงไม่ได้/เน็ตล่ม ⇒ ใช้ไฟล์เดิมต่อ แล้วเตือนใน log
 *    (กติกาเดียวกับ merge-pending-reviews.mjs: ของใหม่ไม่ขึ้น ดีกว่า deploy ไม่ได้)
 * ⚠️ รายชื่อรุ่น **ถามหน้าร้าน** ไม่เก็บสำเนา — สำเนาจะตกรุ่นเงียบ ๆ ทุกครั้งที่เพิ่มรุ่นใหม่
 *    (คุณส้มเจอมาแล้ว 13 ต.ค.: สำเนาที่สามทำให้ 5 รุ่นใหม่ไม่ติดเม็ดเขียว โดยไม่มีอะไรฟ้อง)
 */
import fs from "node:fs";
import path from "node:path";

const ฐาน = process.env.PARTS_INDEX_BASE || "https://gucut.com";
const ไฟล์ออก = path.join(process.cwd(), "src/data/parts-bysku.json");

const ดึง = async (u) => {
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${u} → HTTP ${r.status}`);
  return r.json();
};

async function main() {
  const รายชื่อ = await ดึง(`${ฐาน}/parts/models.json`);
  const รุ่น = รายชื่อ?.รุ่น;
  if (!Array.isArray(รุ่น) || !รุ่น.length) throw new Error("รายชื่อรุ่นว่าง — ไม่เขียนทับของเดิม");

  const ดัชนี = {};
  let อ่านได้ = 0;
  for (const m of รุ่น) {
    const slug = typeof m === "string" ? m : m.slug;
    const ชื่อรุ่น = typeof m === "string" ? slug : (m.ชื่อ || slug);
    try {
      const d = await ดึง(`${ฐาน}/api/parts-map?model=${encodeURIComponent(slug)}`);
      const map = d?.map || {};
      for (const [รหัส, sku] of Object.entries(map)) {
        if (!sku) continue;
        const k = String(sku).trim();
        if (!k) continue;
        /* ⚠️ หนึ่ง SKU อยู่ได้หลายรุ่น (สกรูตัวเดียวใช้หลายเครื่อง) — เก็บเป็นรายการ ห้ามทับ
           เก็บทับ = ลูกค้าเห็นรุ่นเดียวทั้งที่ชิ้นนั้นใช้ได้หลายรุ่น และไม่มีอะไรฟ้อง */
        (ดัชนี[k] ||= []).push({ รุ่น: slug, ชื่อรุ่น, รหัส });
      }
      อ่านได้++;
    } catch (e) {
      console.warn(`  ⚠️ ข้ามรุ่น ${slug}: ${e.message}`);
    }
  }

  /* 🔴 อ่านไม่ได้สักรุ่น = **ไม่รู้** ไม่ใช่ "ไม่มีการจับคู่" — เขียนทับคือลบดัชนีทิ้งทั้งก้อน */
  if (อ่านได้ === 0) throw new Error("อ่านตารางจับคู่ไม่ได้สักรุ่น — คงไฟล์เดิมไว้");

  const เดิม = fs.existsSync(ไฟล์ออก)
    ? Object.keys(JSON.parse(fs.readFileSync(ไฟล์ออก, "utf8"))).length : 0;
  const ใหม่ = Object.keys(ดัชนี).length;

  /* 🔒 ตาข่ายกันข้อมูลหาย: จำนวนลดลงเกิน 20% = มีอะไรผิด ไม่เขียน
     (บทเรียนจาก reviews.json ที่เคยยอดตกเพราะคิดใหม่จากของที่ดึงได้รอบนั้น) */
  if (เดิม && ใหม่ < เดิม * 0.8) {
    throw new Error(`จำนวนลดจาก ${เดิม} เหลือ ${ใหม่} (เกิน 20%) — ไม่เขียนทับ`);
  }

  fs.mkdirSync(path.dirname(ไฟล์ออก), { recursive: true });
  fs.writeFileSync(ไฟล์ออก, JSON.stringify(ดัชนี, null, 0) + "\n", "utf8");
  console.log(`gen-parts-bysku: ${ใหม่} SKU จาก ${อ่านได้}/${รุ่น.length} รุ่น (เดิม ${เดิม})`);
}

main().catch((e) => {
  console.warn(`gen-parts-bysku: ข้าม — ${e.message}`);
  if (!fs.existsSync(ไฟล์ออก)) {
    fs.mkdirSync(path.dirname(ไฟล์ออก), { recursive: true });
    fs.writeFileSync(ไฟล์ออก, "{}\n", "utf8");
    console.warn("  สร้างไฟล์ว่างไว้ให้ import ไม่พัง");
  }
});
