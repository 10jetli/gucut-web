/* 🎬 `/api/ajthong-clips` — รายการคลิปของเพจ "อ.ธง" ให้หน้า /ajthong/ เอาไปฝัง
 *
 * ท่านประธานสั่ง 20 ต.ค. 2569: คลิปเพจ อ.ธง ต้องไปโผล่บน gucut.com
 * ⇒ หน้าเว็บเป็น HTML นิ่ง (output: export) ⇒ **คลิปใหม่ต้องขึ้นเองโดยไม่ต้อง deploy**
 *   จึงต้องมีฟังก์ชันตัวนี้อ่าน RSS สาธารณะของช่องให้ (ไม่ใช้คีย์ ไม่ใช้โควตา API)
 *
 * 🚫 **ไม่ดาวน์โหลดไฟล์คลิป** ส่งแค่รหัส+ลิงก์ฝัง (กติกาลิขสิทธิ์: ฝังได้ โหลดมาเก็บไม่ได้)
 * 🔒 กันซ้ำ 2 ชั้นอยู่ใน `netlify/lib/ajthong-clips.mjs` (รายการใบซ้ำ + กรองรหัสซ้ำในฟีด)
 *
 * ⚠️ **ฟีดล่มต้องโชว์ของเก่า ไม่ใช่หน้าว่าง** (ท่านสั่ง)
 *    ⇒ ทุกครั้งที่อ่านฟีดสำเร็จ เก็บผลล่าสุดลง Blobs · ล่มแล้วหยิบของเก่ามาตอบ
 *    ⇒ คำตอบติดธง `สด: false` + `ของเก่าเมื่อ` เสมอ **ทางถอยต้องประกาศตัว** ไม่งั้นมันกลายเป็นทางหลักเงียบ ๆ
 * ⚠️ ห้ามตอบ 200 พร้อมอาเรย์ว่างตอนอ่านไม่ได้ — จอจะอ่านว่า "ช่องไม่มีคลิป" ซึ่งคนละเรื่องกับ "เราอ่านไม่ได้"
 */
import { getStore } from "@netlify/blobs";
import { ช่องอธง, อ่านฟีดอธง, อ่านหน้าช่องอธง } from "../lib/ajthong-clips.mjs";

const คีย์ของเก่า = "ajthong/ฟีดล่าสุด";
const store = () => getStore({ name: "gucut-coupon", consistency: "strong" });

const ตอบ = (ข้อมูล, สถานะ = 200) =>
  new Response(JSON.stringify(ข้อมูล), {
    status: สถานะ,
    headers: {
      "content-type": "application/json; charset=utf-8",
      /* เบราว์เซอร์ถามทุกครั้ง · ขอบเครือข่ายเก็บ 30 นาที แล้วค่อย ๆ ต่ออายุเอง
         ⇒ คลิปใหม่ขึ้นภายใน ~30 นาทีโดยไม่ต้อง deploy และ YouTube ไม่ถูกยิงถี่ */
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });

/* เบราว์เซอร์จริง — หน้าช่องของ YouTube ส่งเนื้อหาคนละแบบถ้า user-agent ไม่เหมือนเบราว์เซอร์ */
const UA_เบราว์เซอร์ =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export default async () => {
  /* ① ทางหลักตั้งแต่ 12 พ.ย. 2569 — อ่านหน้าช่อง
   *    🔴 ฟีด RSS ตายแล้ว: วัดจริงวันนั้น `feeds/videos.xml` ตอบ 404 ทุก user-agent
   *       ⇒ หน้า /ajthong/ ค้างอยู่ที่คลิปวันที่ 20 ต.ค. มาสามสัปดาห์
   *       ธง `สด:false` ทำงานถูกต้องตามที่ออกแบบ **แต่ไม่มีใครไปดูธงนั้น**
   *       🔑 ทางถอยที่ประกาศตัวแล้วแต่ไม่มีคนอ่าน = ทางหลักเงียบ ๆ อยู่ดี
   *          ของแบบนี้ต้องมีตัวเฝ้าที่ "ทวง" ไม่ใช่แค่ "ติดธง"
   */
  let ผลหน้าช่อง = null;
  try {
    const r = await fetch(`https://www.youtube.com/channel/${ช่องอธง}/videos`, {
      headers: { "user-agent": UA_เบราว์เซอร์ },
      signal: AbortSignal.timeout(9000),
    });
    if (r.ok) ผลหน้าช่อง = อ่านหน้าช่องอธง(await r.text());
  } catch {
    ผลหน้าช่อง = null;
  }
  if (ผลหน้าช่อง?.คลิป?.length) {
    const ออก = { ...ผลหน้าช่อง, ช่อง: ช่องอธง, สด: true,
                  ที่มา: "หน้าช่อง", อ่านเมื่อ: new Date().toISOString() };
    await store().setJSON(คีย์ของเก่า, ออก).catch(() => {});
    return ตอบ(ออก);
  }

  /* ② ทางสำรอง — ฟีด RSS เดิม (เก็บไว้เผื่อ YouTube เปิดกลับ) */
  let xml = null;
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ช่องอธง}`, {
      headers: { "user-agent": "gucut.com/ajthong" },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) xml = await r.text();
    else xml = null;                    // 4xx/5xx ⇒ ถือว่าอ่านไม่ได้ ไม่ใช่ "ไม่มีคลิป"
  } catch {
    xml = null;
  }

  if (xml) {
    const ผล = อ่านฟีดอธง(xml);
    if (ผล.คลิป.length) {
      const ออก = { ...ผล, ช่อง: ช่องอธง, สด: true,
                    ที่มา: "ฟีด RSS", อ่านเมื่อ: new Date().toISOString() };
      /* await ตัวเขียน — Netlify แช่แข็งฟังก์ชันทันทีที่ตอบ promise ลอยตายกลางทาง */
      await store().setJSON(คีย์ของเก่า, ออก).catch(() => {});
      return ตอบ(ออก);
    }
  }

  /* ─ ถึงตรงนี้ = อ่านฟีดไม่ได้ หรืออ่านได้แต่ไม่มีคลิปเลย (ถือว่าผิดปกติทั้งคู่) ─ */
  const เก่า = await store().get(คีย์ของเก่า, { type: "json" }).catch(() => null);
  if (เก่า?.คลิป?.length) {
    return ตอบ({ ...เก่า, สด: false, ของเก่าเมื่อ: เก่า.อ่านเมื่อ ?? null,
                 หมายเหตุ: "อ่านฟีด YouTube ไม่ได้รอบนี้ ⇒ แสดงรายการที่เก็บไว้ล่าสุด" });
  }
  /* ไม่มีแม้ของเก่า ⇒ **ต้องบอกว่าอ่านไม่ได้** ห้ามตอบ 200 พร้อมรายการว่าง */
  return ตอบ({ error: "อ่านฟีดช่องไม่ได้ และยังไม่มีรายการเก่าเก็บไว้", สด: false, คลิป: [] }, 503);
};

export const config = { path: "/api/ajthong-clips" };
