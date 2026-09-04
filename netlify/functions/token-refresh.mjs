// ต่ออายุ token ของมาร์เก็ตเพลสให้เอง — วันละครั้ง
//
// ⚠️ ฟังก์ชันนี้ไม่มี URL โดยตั้งใจ (Netlify ไม่ให้ฟังก์ชันมี schedule พร้อม path)
//    สั่งเดี๋ยวนั้นได้ที่ GET /api/core?tokens=1
//
// ⚠️ **ทำไมต้องมี** (4 ก.ย. 2569) — `validToken()` ของทั้งสามเจ้าต่ออายุให้เองอยู่แล้ว
//    **แต่มันต่อให้ก็ต่อเมื่อมีคนเรียกใช้** และไม่มีงานตามเวลาไหนเรียก Lazada/TikTok เลย
//    ⇒ ถ้าไม่มีใครเปิดหน้าสถานะการเชื่อมต่อนานพอ refresh_token (30 วัน) จะตายไปเอง
//       แล้วต้องให้เจ้าของร้านไปกดอนุญาตใหม่ทั้งกระบวนการ
//    "มีตัวต่ออายุอยู่แล้ว" ไม่เท่ากับ "จะได้ต่ออายุ" ถ้าไม่มีอะไรมาจุดชนวนให้มันวิ่ง
//
// ⚠️ อายุ token ต่างกันมาก: Shopee 4 ชม. · Lazada 7 วัน · TikTok สั้น
//    แต่ refresh_token ของทุกเจ้าอยู่ 30 วัน ⇒ วิ่งวันละครั้งพอสำหรับ "กันตาย"
//    (ตัวที่ใช้งานจริงยังต่ออายุตอนเรียกเหมือนเดิม ไม่ได้เปลี่ยน)
//
// ⚠️ **ล้มแล้วต้องส่งเสียง** — token ตายเงียบคือของที่ดูปกติทุกประการจนถึงวันที่ต้องใช้

/* ⚠️ **ต้องเขียนเส้นทางเป็นข้อความตรง ๆ ในคำสั่ง import ห้ามใส่ตัวแปร**
    เดิมเก็บเส้นทางไว้ในอาร์เรย์แล้ววน `await import(p.mod)` ⇒ ตัวรวมไฟล์ของ Netlify
    **มองไม่เห็นว่าต้องเอาโมดูลพวกนี้ไปด้วย** เพราะมันอ่านได้เฉพาะ import ที่เป็นข้อความคงที่
    ผลคือขึ้นจริงแล้วตอบ "Cannot find module .../lib/lazada.mjs" ทั้งสามเจ้า
    และเส้นทางที่ฟ้องเป็นของ core.mjs ไม่ใช่ของไฟล์นี้ เพราะหลังรวมไฟล์แล้วมันอยู่คนละที่

    ⚠️ **จับได้เพราะมีทางสั่งเดี๋ยวนั้น (/api/core?tokens=1)** — ถ้ามีแต่งานตามเวลา
       มันจะล้มเงียบทุกคืนตี 3 ครึ่ง แล้ว token จะตายจริงในอีก 30 วัน
       โดยไม่มีใครรู้ว่าตัวกันตายไม่เคยทำงานเลยสักครั้ง */
const PROVIDERS = [
  { key: "shopee", load: () => import("../lib/shopee.mjs") },
  { key: "lazada", load: () => import("../lib/lazada.mjs") },
  { key: "tiktok", load: () => import("../lib/tiktok.mjs") },
];

export async function refreshAllTokens() {
  const out = {};
  for (const p of PROVIDERS) {
    try {
      const m = await p.load();
      if (typeof m.validToken !== "function") {
        out[p.key] = { ok: false, why: "ไม่มี validToken" };
        continue;
      }
      const t = await m.validToken();
      if (!t?.accessToken) {
        // ยังไม่เคยกดอนุญาต — ไม่ใช่ความผิดพลาด ห้ามเตือน
        out[p.key] = { ok: true, connected: false, why: "ยังไม่ได้กดอนุญาต" };
        continue;
      }
      /* ⚠️ **แต่ละเจ้าเก็บวันหมดอายุคนละชื่อ คนละหน่วย** — อย่าเดาว่าเหมือนกัน
          Lazada · TikTok : `expiresAt` เป็น **มิลลิวินาที**
          Shopee          : `expireAt`  เป็น **วินาที**  (ไม่มี s และคนละหน่วย)
          รอบแรกผมอ่าน expiresAt ตัวเดียว ⇒ Shopee ได้ undefined → 0
          แล้วรายงานว่า "เหลือ -496,817 ชั่วโมง" ซึ่งอ่านแล้วเหมือนระบบพัง
          ทั้งที่ token ของ Shopee ปกติดีทุกอย่าง (ตรรกะในไฟล์ของมันเองถูกต้องอยู่แล้ว)
          ⇒ ตัวรายงานผิด อันตรายกว่าไม่มีตัวรายงาน เพราะมันชี้ไปผิดที่ */
      const ms = Number(t.expiresAt || 0);
      const sec = Number(t.expireAt || 0);
      const expiresMs = ms > 0 ? ms : sec > 0 ? sec * 1000 : 0;
      out[p.key] = {
        ok: true,
        connected: true,
        // ชั่วโมงที่เหลือ — ปัดลง เพื่อไม่ให้ 0.9 ชม. อ่านเป็น 1 · ไม่รู้วันหมดอายุ = null ไม่ใช่ 0
        hoursLeft: expiresMs ? Math.floor((expiresMs - Date.now()) / 3600e3) : null,
        expiresAtUtc: expiresMs ? new Date(expiresMs).toISOString() : null,
        account: t.account || null,
      };
    } catch (e) {
      out[p.key] = { ok: false, why: String(e?.message || e).slice(0, 200) };
    }
  }

  // ⚠️ เตือนเฉพาะเจ้าที่ "เคยเชื่อมแล้วแต่ต่ออายุไม่ผ่าน" — เจ้าที่ยังไม่เคยเชื่อมไม่ใช่ปัญหา
  const bad = Object.entries(out).filter(([, v]) => !v.ok);
  if (bad.length) {
    // ⚠️ ยิง Telegram ตรง ๆ แบบเดียวกับที่อื่นในโปรเจกต์ (ไม่มีตัวช่วยกลาง)
    //    และต้อง await — Netlify แช่แข็งฟังก์ชันทันทีที่ตอบ ปล่อยลอย = ข้อความหาย
    try {
      const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        const text =
          `⚠️ ต่ออายุ token ไม่ผ่าน: ` +
          bad.map(([k, v]) => `${k} (${v.why})`).join(" · ") +
          `\nปล่อยไว้จน refresh_token หมดอายุ (30 วัน) ต้องกดอนุญาตใหม่ทั้งกระบวนการ`;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
          signal: AbortSignal.timeout(8000),
        });
      }
    } catch {
      // แจ้งเตือนไม่ได้ก็ไม่ควรทำให้งานทั้งรอบล้ม — ผลยังถูกบันทึกไว้ข้างล่าง
    }
  }

  // บันทึกชีพจรไว้ให้จอเห็นว่าตัวนี้ยังวิ่งอยู่ (กติกาเดียวกับ sync_orders)
  try {
    const { coreQuery } = await import("../lib/coredb.mjs");
    await coreQuery(
      `INSERT INTO core_meta (k,v,at) VALUES ('token_refresh', ?, datetime('now'))
       ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at`,
      [JSON.stringify(out)]
    );
  } catch {
    // ตารางยังไม่ถูกสร้าง — ชีพจรหายดีกว่างานล้ม (ตั้งใจกลืน)
  }
  return out;
}

export default async function handler() {
  const r = await refreshAllTokens();
  return new Response(JSON.stringify({ ok: true, tokens: r }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/* ⚠️ เปลี่ยนเวลานี้แล้วไม่มีผลกับจอไหน — ต่างจาก core-sync ที่จอผูกเกณฑ์เตือนไว้
   ตี 3 ครึ่งเวลาไทย = 20:30 UTC (เลี่ยงชั่วโมงที่งานอื่นวิ่งกันเยอะ) */
export const config = { schedule: "30 20 * * *" };
