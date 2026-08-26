// ตัวตามเตือนลูกค้าเรื่องขอทะเบียน — ตัวทำงานจริง
//
// ---------------------------------------------------------------------------
// เจ้าของร้านสั่ง (26 ส.ค. 2569)
//   "ขั้นตอนนี้สำคัญ ทำยังไงก็ได้ให้ลูกค้ากดเมื่อได้รับใบ ลซ.๒ แล้ว"
//   "ต้องมีระบบแจ้งเตือนถามลูกค้า"
//   "ให้กลับมากดและถ่ายรูปส่งมา แล้วร้านจะส่งที่อยู่ให้"
//
// ⚠️ ทำไมขั้นนี้ต้องมีคนตามเตือน ต่างจากขั้นอื่นทั้งหมด
//    ขั้นอื่นลูกค้าอยู่หน้าเว็บอยู่แล้ว ทำต่อได้ทันที
//    แต่ขั้นนี้เขาหายไปจากเว็บอย่างน้อย ๗ วันเพื่อรอซองจากไปรษณีย์
//    ระหว่างนั้นไม่มีอะไรบนเว็บที่จะเตือนเขาได้เลย พอใบมาถึงเขาก็ลืมไปแล้ว
//    ว่าต้องกลับมากดและส่งให้ร้าน ⇒ ของค้างอยู่ที่บ้านลูกค้า ร้านก็รอเก้อ
//
// ⚠️ เตือนเป็น "ชั้น ๆ ถูกสุดก่อน" ไม่ใช่เลือกทางเดียว
//    เจ้าของร้านเลือก LINE เป็นหลัก (26 ส.ค. 2569) แต่ทางเดียวไม่มีทางถึงทุกคน
//
//    ชั้น 1  LINE OA @gucut1 — อัตราการอ่านสูงสุด ฟรีในโควตา
//            ได้เฉพาะคนที่ล็อกอินด้วย LINE และเพิ่มเพื่อนกับ OA แล้ว
//    ชั้น 2  Web Push — ฟรี ไม่จำกัดจำนวน แต่ iPhone ต้องติดตั้งเป็นแอปก่อน
//            ลูกค้าส่วนใหญ่ไม่ได้ทำ จึงพึ่งทางนี้ทางเดียวไม่ได้
//    ชั้น 3  Telegram หาร้าน — รายชื่อคนที่ค้าง ให้ร้านโทรหรือทักไลน์ตามเอง
//            ⚠️ ห้ามตัดชั้นนี้ออกไม่ว่าจะมีช่องทางอื่นกี่ทาง
//            เป็นชั้นเดียวที่ไม่ต้องพึ่งสิทธิ์หรือการกดอนุญาตอะไรจากลูกค้าเลย
//            และรายงานให้ร้านเห็นด้วยว่าแต่ละคนส่งถึงทางไหนหรือไม่ถึงเลย
//
//    ไม่ใช้อีเมล — ลูกค้ากลุ่มนี้ไม่อ่าน และช่องอีเมลในฟอร์มก็ไม่บังคับกรอก
//    ยังไม่ใช้ SMS — เสียเงินต่อข้อความ เก็บไว้เป็นทางสุดท้ายถ้าวันหนึ่งพบว่ายังไม่พอ
//
// ⚠️ เตือนซ้ำได้ แต่ไม่เกินวันละครั้งต่อคน (จด lastRemind ไว้ในตัวเรื่อง)
//    ยิงรัวกว่านี้ = ลูกค้ารำคาญแล้วปิดแจ้งเตือนทิ้ง ซึ่งเสียยิ่งกว่าไม่ได้เตือน
//
// เรียกได้ ๒ ทาง
//   · Netlify เรียกเองตามเวลา (config.schedule ท้ายไฟล์)
//   · ร้านกดเองจากหลังร้าน (ต้องมีรหัส) เผื่ออยากตามเดี๋ยวนั้น
// ---------------------------------------------------------------------------

// ⚠️ แยกตัวทำงานออกมาเป็น lib เพราะ Netlify ไม่ให้ฟังก์ชันตามเวลามี URL ด้วย
//    ใส่ทั้ง schedule และ path = ฟังก์ชันเรียกผ่าน HTTP ไม่ได้ในโปรดักชัน
//    ⇒ ตัวทำงานอยู่ที่นี่ · ฟังก์ชันตามเวลาเรียกตัวนี้ · หลังร้านก็เรียกตัวนี้ได้
//      (/api/permit-doc?remind=1 ต้องมีรหัสหลังร้าน)

import { getStore } from "@netlify/blobs";
import { pushToUser } from "./push.mjs";
import { linePush } from "./line-push.mjs";
import { store as usersStore } from "./session.mjs";
import { SITE_URL } from "./site.mjs";

const DAY = 24 * 60 * 60 * 1000;
/** รอ ๗ วันหลังยื่นก่อนเริ่มเตือน — เร็วกว่านี้ใบยังไม่ถึงมือเขา */
const WAIT_DAYS = 7;
/** เตือนซ้ำได้ทุกกี่วัน */
const REPEAT_DAYS = 3;
/** เตือนได้มากสุดกี่ครั้งต่อเรื่อง — เกินนี้ปล่อยให้ร้านโทรเอง */
const MAX_REMINDS = 6;

const store = () => getStore({ name: "gucut-permits", consistency: "strong" });

async function tell(text) {
  const { TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!tok || !chat) return;
  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

const days = (from) => (Date.now() - new Date(from).getTime()) / DAY;

/**
 * ข้อความที่ส่งหาลูกค้า — ต่างกันตามว่าค้างอยู่ขั้นไหน
 *
 * ⚠️ ต้องบอกให้ชัดว่า "ต้องทำอะไร" ไม่ใช่แค่ "มีอะไรค้างอยู่"
 *    แจ้งเตือนที่อ่านแล้วยังไม่รู้ว่าต้องกดอะไร ก็เท่ากับไม่ได้เตือน
 */
const MESSAGE = {
  submitted: {
    title: "ได้ใบ ลซ.๒ มาแล้วหรือยัง",
    body: "ถ้าได้แล้ว กดเข้ามาถ่ายรูปส่งให้ร้าน แล้วร้านจะส่งที่อยู่จ่าหน้าซองให้",
  },
  gotlz2: {
    title: "ยังไม่ได้ส่งรูปใบ ลซ.๒ ให้ร้าน",
    body: "ถ่ายรูปส่งให้ร้าน ร้านจะได้เตรียมเครื่องและส่งที่อยู่ให้",
  },
  lz2: {
    title: "อย่าลืมส่งใบ ลซ.๒ ตัวจริงมาที่ร้าน",
    body: "รูปใช้แทนไม่ได้ ร้านต้องเก็บตอนกลางตัวจริงไว้เป็นหลักฐาน",
  },
};

/** ขั้นที่ต้องตามเตือน — ขั้นอื่นเป็นหน้าที่ร้านหรือจบแล้ว */
const NUDGE = Object.keys(MESSAGE);

export async function runReminders() {
  const s = store();
  const { blobs } = await s.list({ prefix: "c/" }).catch(() => ({ blobs: [] }));

  const pushed = [];
  const forShop = [];

  for (const b of blobs) {
    const rec = await s.get(b.key, { type: "json" }).catch(() => null);
    if (!rec || !NUDGE.includes(rec.stage)) continue;

    // นับจากตอนที่เข้าขั้นนี้ ไม่ใช่ตอนเปิดเรื่อง
    const since = rec.history?.[rec.stage] || rec.updatedAt || rec.at;
    const waited = days(since);
    if (waited < WAIT_DAYS) continue;

    const sent = rec.remindCount || 0;
    if (sent >= MAX_REMINDS) continue;
    if (rec.lastRemind && days(rec.lastRemind) < REPEAT_DAYS) continue;

    const msg = MESSAGE[rec.stage];
    const link = `${SITE_URL}/permit/`;
    const reached = [];

    // ---- ชั้น 1: LINE
    // ⚠️ อ่าน userId จากบัญชีลูกค้า ไม่ได้เก็บซ้ำไว้ในตัวเรื่อง
    //    เก็บซ้ำเมื่อไหร่ = วันที่ลูกค้าเปลี่ยน LINE แล้วสองที่ไม่ตรงกัน
    let lineId = "";
    try {
      const u = await usersStore().get(`u/${rec.phone}`, { type: "json" });
      lineId = u?.social?.line?.id || "";
    } catch { /* อ่านบัญชีไม่ได้ก็ข้ามชั้นนี้ไป */ }

    if (lineId) {
      const r = await linePush(lineId, `${msg.title}\n${msg.body}`, link).catch(() => "error");
      if (r === "sent") reached.push("LINE");
      else if (r === "blocked") reached.push("LINE ส่งไม่ได้ (ยังไม่ได้เพิ่มเพื่อน)");
    }

    // ---- ชั้น 2: Web Push
    const n = await pushToUser(rec.phone, {
      title: msg.title,
      body: msg.body,
      url: "/permit/",
    }).catch(() => 0);
    if (n) reached.push("แจ้งเตือนมือถือ");

    rec.lastRemind = new Date().toISOString();
    rec.remindCount = sent + 1;
    await s.setJSON(b.key, rec).catch(() => {});

    // ---- ชั้น 3: บอกร้านเสมอ พร้อมบอกว่าถึงทางไหนบ้าง
    // ⚠️ ต้องบอกด้วยว่า "ไม่ถึงเลย" เพื่อให้ร้านรู้ว่าต้องโทรเอง
    //    ถ้าเขียนแค่รายชื่อ ร้านจะเดาว่าระบบเตือนไปแล้วเรียบร้อย
    const how = reached.length ? reached.join(" · ") : "ไม่ถึงเลย — ต้องโทรตามเอง";
    forShop.push(
      `${rec.name || "-"} · ${rec.phone} — ค้าง "${rec.stage}" มา ${Math.floor(waited)} วัน\n   ↳ ${how}`,
    );
    if (reached.length) pushed.push(rec.phone);
  }

  // ⚠️ ไม่มีใครค้าง = ไม่ต้องส่งอะไรเข้ากลุ่ม
  //    ส่ง "วันนี้ไม่มีใครค้าง" ทุกวัน คนจะเลิกอ่านข้อความจากบอตนี้ไปเลย
  if (forShop.length) {
    await tell(
      `🔔 <b>ลูกค้าค้างเรื่องขอทะเบียน ${forShop.length} ราย</b>\n` +
      `ทักไลน์หรือโทรตามได้เลย\n\n` +
      forShop.join("\n"),
    );
  }

  return { checked: blobs.length, nudged: forShop.length, pushed: pushed.length };
}

