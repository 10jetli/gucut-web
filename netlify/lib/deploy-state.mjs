/* 🚩 "รุ่นที่ขึ้นเว็บอยู่จริง · เมื่อไหร่ · สำเร็จไหม" — จาก Netlify deploy API
 *
 * 🔴 ที่มา 19 ก.ย. 2569 ค่ำ · ฝั่งจอไล่กติกาตัวเองแล้วพบว่าข้อ "จดจุดเซฟ (deploy id + วันเวลา)
 *    แจ้งผู้ใช้เสมอ" **ทำตามครบไม่ได้โดยโครงสร้าง** — ที่จดอยู่ในเครื่องผู้ใช้ (นอกรีโป)
 *    เขาเสนอให้จดจาก `git reflog` · ผมค้านสามข้อ และข้อที่เขารับว่าสำคัญสุดคือ
 *    **`push` ≠ `deploy สำเร็จ`** ⇒ จดจาก push จะได้จุดเซฟที่ **ไม่มีของจริงอยู่ปลายทาง**
 *    และ **วันที่ build ตกคือวันที่บันทึกนั้นจะโกหกที่สุด** ซึ่งคือวันที่คนต้องพึ่งมันที่สุดพอดี
 *    ⇒ แหล่งเดียวที่รู้ทั้ง id และ "สำเร็จไหม" คือ Netlify เอง
 *
 * 🔑 ผู้ใช้ปลายทางยืนยันก่อนผมสร้าง (กฎ metrics-need-outside-leg): ฝั่งจอจะทำการ์ด
 *    "รุ่นที่ขึ้นเว็บ · เมื่อไหร่ · สำเร็จไหม" และขั้นแรกของทุกข้อใน `รอเปิด-deploy.md` ของเขา
 *    คือ **"ของที่เห็นอยู่ เป็นรุ่นใหม่จริงหรือยัง"** ซึ่งตอนนี้ตอบไม่ได้เลยสักวิธี
 *
 * ⚠️ **ตัวนี้ต้องไม่กลายเป็นตัวกินเครดิตเสียเอง** — ยิงไซต์เดียว (จาก `SITE_ID` ที่ Netlify ใส่ให้)
 *    หน้าเดียว · timeout 8 วิ · จอกดเอง ไม่มีใครเรียกวน (กฎ no-auto-polling ของร้าน)
 *
 * ⚠️ **ฟิลด์ที่ยังไม่เคยเห็นของจริง** — โค้ดที่ทำงานอยู่ (`netlify-usage.mjs`) พิสูจน์แล้วแค่
 *    `created_at` · `deploy_time` · ส่วน `state` · `commit_ref` · `published_at` · `error_message`
 *    ผมอ่านจากเอกสาร **ยังไม่เคยเห็นของจริงเพราะยิงจากเครื่องไม่ได้ (token อยู่ที่ Netlify)**
 *    ⇒ ทุกฟิลด์จึงกันด้วย `?? null` และคำตอบ **ประกาศรายชื่อฟิลด์ที่ยังไม่ยืนยัน**
 *    ⇒ จอต้องอ่าน `null` ว่า **"ยังไม่รู้" ไม่ใช่ "ไม่มี"** (กฎ three-states-not-two)
 */
const API = "https://api.netlify.com/api/v1";

const token = () => process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || "";

/** ฟิลด์ที่ยังไม่เคยเห็นในของจริง — ติดไปกับคำตอบ ห้ามลบก่อนยิงจริงแล้วเห็นครบ
 *  🔑 ตัดชื่อออกจากรายชื่อนี้ได้ **เฉพาะหลังเห็นค่าจริงในคำตอบ** ไม่ใช่หลังอ่านเอกสารซ้ำ */
export const ฟิลด์ที่ยังไม่ยืนยัน = ["state", "commit_ref", "published_at", "error_message", "branch"];

const แถว = (d) => ({
  id: d?.id ?? null,
  state: d?.state ?? null,
  สำเร็จไหม: d?.state == null ? null : d.state === "ready",
  created_at: d?.created_at ?? null,
  published_at: d?.published_at ?? null,
  commit_ref: d?.commit_ref ?? null,
  branch: d?.branch ?? null,
  "วินาทีที่ build": Number.isFinite(Number(d?.deploy_time)) ? Number(d.deploy_time) : null,
  error_message: d?.error_message ?? null,
});

/** @param {string} coreBuild เวลาที่ท่อตัวที่กำลังตอบถูก build (ค่าเดียวกับหัว `x-core-build`) */
export async function สถานะการปล่อยของ(coreBuild = "") {
  const t = token();
  const siteId = process.env.SITE_ID || "";

  /* 🔑 `skip` = ทำต่อไม่ได้ · ห้ามปน `note` (ฟิลด์ที่เป็นคำอธิบายห้ามมีอำนาจตัดสินใจ) */
  if (!t) {
    return {
      skip: "ยังไม่ได้ตั้ง NETLIFY_API_TOKEN / NETLIFY_AUTH_TOKEN ที่ Netlify ⇒ ถามรายการ deploy ไม่ได้",
      ท่อรุ่นนี้: coreBuild || null,
    };
  }
  if (!siteId) {
    return {
      skip: "ไม่มี SITE_ID ใน env ของฟังก์ชัน (ปกติ Netlify ใส่ให้เอง) ⇒ ไม่รู้ว่าจะถามไซต์ไหน",
      ท่อรุ่นนี้: coreBuild || null,
    };
  }

  let list = null, httpStatus = null, error = null;
  try {
    const r = await fetch(`${API}/sites/${siteId}/deploys?per_page=10`, {
      headers: { authorization: `Bearer ${t}` },
      signal: AbortSignal.timeout(8000),
    });
    httpStatus = r.status;
    if (!r.ok) error = `netlify ตอบ ${r.status}`;
    else {
      const j = await r.json();
      /* 🔑 200 แต่รูปไม่ใช่อาร์เรย์ ⇒ **ไม่ใช่ "ไม่มี deploy"** แต่คือ "แปลผลไม่ได้" */
      list = Array.isArray(j) ? j : null;
      if (!list) error = "netlify ตอบ 200 แต่ไม่ใช่อาร์เรย์ ⇒ รูปข้อมูลเปลี่ยน";
    }
  } catch (e) {
    error = String(e?.message || e).slice(0, 200);
  }

  if (!list) {
    return {
      inconclusive: true, // 🚫 ห้ามมีคีย์ ok คู่กับ inconclusive ("แปลไม่ได้" ≠ "ไม่ผ่าน")
      error,
      httpStatus,
      ท่อรุ่นนี้: coreBuild || null,
      ฟิลด์ที่ยังไม่ยืนยัน,
    };
  }

  const แถวทั้งหมด = list.map(แถว);
  /* รุ่นที่ "เสิร์ฟอยู่จริง" = ใบที่ published
     🔑 **ห้ามเดาจากใบล่าสุด** ถ้าไม่มี state/published_at — ใบล่าสุดอาจเป็นใบที่ build ตก
        ซึ่งคือเคสเดียวที่ของชิ้นนี้ถูกสร้างมาตอบ ⇒ เดา = ตอบผิดในวันที่คนมาถามจริง */
  const ที่เสิร์ฟอยู่ = แถวทั้งหมด.find((d) => d.state === "ready" && d.published_at) ?? null;
  const รู้สถานะไหม = แถวทั้งหมด.some((d) => d.state || d.published_at);

  return {
    ok: true,
    ที่เสิร์ฟอยู่,
    ...(ที่เสิร์ฟอยู่
      ? {}
      : {
          ทำไมไม่รู้ว่าใบไหนเสิร์ฟอยู่: รู้สถานะไหม
            ? "มี state/published_at แต่ไม่เจอใบที่ ready+published ใน 10 ใบล่าสุด ⇒ อาจกำลัง build หรือตกติดกัน"
            : "netlify ไม่ส่ง state/published_at มาเลย ⇒ **ไม่เดาจากใบล่าสุด** (ใบล่าสุดอาจเป็นใบที่ตก)",
        }),
    ล่าสุด: แถวทั้งหมด[0] ?? null,
    build10ใบล่าสุด: แถวทั้งหมด,
    ตกกี่ใบใน10ใบ: รู้สถานะไหม ? แถวทั้งหมด.filter((d) => d.state && d.state !== "ready").length : null,
    ท่อรุ่นนี้: coreBuild || null,
    ฟิลด์ที่ยังไม่ยืนยัน,
  };
}
