// คลังเงา GUCUT Core — งานตามเวลา รันเองทุกครึ่งชั่วโมง (เหลื่อมจาก beam-sweep 13 นาที)
//
// ⚠️ ฟังก์ชันนี้ไม่มี URL โดยตั้งใจ (Netlify ไม่ให้ schedule พร้อม path)
//    สั่งเดี๋ยวนั้น/ย้อนหลัง ใช้ /api/core?sync=1 (ต้องมีรหัสหลังร้าน)
//
// ทุกรอบ: กระจกออเดอร์ 7 วันล่าสุด (กันสถานะยกเลิกย้อนหลังค้างเก่า) · รอบตี 1 (เวลาไทย): เทียบยอดเมื่อวาน + ถ่ายสต็อก
import { syncOrders, reconYesterday, snapshotStock } from "../lib/core-sync.mjs";
import { syncShopeeOrders, shopeeReconYesterdayLine } from "../lib/shopee-orders.mjs";
import { syncTiktokOrders, tiktokReconYesterdayLine } from "../lib/tiktok-orders.mjs";
import { shopeeStockLine } from "../lib/shopee-stock.mjs";
import { syncProducts } from "../lib/core-products.mjs";
import { stockReconDaily } from "../lib/core-stock.mjs";

export default async function handler() {
  try {
    // 7 วัน (เดิม 3) — ออเดอร์ถูกยกเลิกได้หลายวันหลังสั่ง ถ้าหลุดหน้าต่างกระจกไปก่อน
    // สถานะใน D1 จะค้างเก่าตลอดกาลแล้ว recon เพี้ยน (เจอจริง 29 ส.ค.: Voided 2 ใบไม่ถูกเก็บตาม)
    /* ⚠️ **หน้าต่าง 7 วันทำให้ฟิลด์ที่เพิ่มทีหลัง "แช่แข็ง" กับใบเก่าตลอดกาล** (พิสูจน์ 4 ก.ย. 2569)
        ตัวซิงก์เขียนเฉพาะใบที่เปลี่ยน (กันเผาโควตา D1) ⇒ ใบที่นิ่งแล้วและอยู่นอก 7 วัน
        **ไม่มีวันถูกอ่านมาเทียบอีกเลย** ⇒ คอลัมน์ที่เพิ่มทีหลังจะว่างเปล่าถาวร
        วัดจริง: pay_status ไม่ตรงกับ ZORT — ใน 7 วัน **0 ใบ** · 14 วัน **127 ใบ** · 30 วัน **426 ใบ**
        เส้นแบ่งอยู่ที่ขอบหน้าต่างพอดี ⇒ ไม่ใช่ข้อมูลพัง แต่เป็นของที่ไม่เคยถูกเก็บ
        ⇒ **กวาดกว้างวันละครั้ง** ตอนตี 2 ไทย (นอกช่วงงานรายวันตี 1 จะได้ไม่ชนกัน)
        เขียนน้อยอยู่แล้วเพราะเขียนเฉพาะใบที่ต่าง — รอบปกติจะไม่มีอะไรให้เขียนเลย */
    const utc = new Date();
    const wide = utc.getUTCHours() === 19 && utc.getUTCMinutes() < 30; // ตี 2 เวลาไทย
    /* ⚠️ **ตัวซิงก์ล้มต้องส่งเสียง** (เพิ่ม 5 ก.ย. 2569 คืน หลังย้ายฐาน)
        ของเดิม `await syncOrders(...)` ไม่มี catch ⇒ ล้มแล้วทั้งฟังก์ชันตาย
        ไม่มีใครรู้ นอกจากเข้าไปเปิด log เอง ซึ่งไม่มีใครทำ
        คืนนี้เจอของจริง: ย้ายฐานแล้วคอลัมน์ขาด ⇒ `no such column: ship_amount`
        ⇒ ถ้าไม่ได้ยิงมือตรวจ กระจกจะหยุดอัปเดตเงียบ ๆ ทุกครึ่งชั่วโมงไปเรื่อย ๆ
           จอยังโชว์เลขเดิมสวยงาม (ชีพจร `sync_orders` ค้างเป็นตัวเดียวที่ฟ้อง แต่ต้องมีคนเปิดดู)
        ⇒ ล้มเมื่อไหร่ **เด้ง Telegram ทันที** แล้วทำงานส่วนที่เหลือต่อ */
    let sync;
    try {
      sync = await syncOrders(wide ? 45 : 7);
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 300);
      sync = { error: msg };
      const { TELEGRAM_BOT_TOKEN: bt, TELEGRAM_CHAT_ID: ci } = process.env;
      if (bt && ci) {
        await fetch(`https://api.telegram.org/bot${bt}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: ci,
            text: `⚠️ ซิงก์ออเดอร์เข้าคลังเงาล้ม — กระจกหยุดอัปเดตแล้ว\n${msg}\n\nสั่งซิงก์เดี๋ยวนี้: /api/core?sync=1&days=7`,
          }),
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
      }
    }
    // ท่อที่สอง (แผนลับขั้น 3): ออเดอร์ตรงจาก Shopee API — พังไม่ล้มรอบ
    const shopee = await syncShopeeOrders(7).catch((e) => ({ error: String(e?.message || e) }));
    // ท่อที่สาม: ออเดอร์ตรงจาก TikTok API (เชื่อมได้ 6 ก.ย. 2569) — พังไม่ล้มรอบเช่นกัน
    // ⚠️ **งบเวลารวมของรอบนี้เพิ่มขึ้น** — ตอนนี้มี ZORT + Shopee + TikTok ในลูปเดียว
    //    ถ้ารอบเริ่มหลุด 26 วินาทีเมื่อไหร่ ให้แยกท่อ TikTok ไปเป็นงานตามเวลาของตัวเอง
    //    (ห้ามแก้ด้วยการลด days ของท่ออื่นเงียบ ๆ — ช่วงที่หายไปไม่มีอะไรฟ้อง)
    const tiktok = await syncTiktokOrders(7).catch((e) => ({ error: String(e?.message || e) }));
    /* ⚠️ **ผลที่คำนวณแล้วไม่มีใครเห็น เท่ากับไม่ได้คำนวณ** (ผู้ตรวจจับได้ 6 ก.ย. 2569)
        ของเดิม `unmapped` ไปจบใน response ของงานตามเวลา **ซึ่งไม่มีใครอ่าน**
        และท่อ TikTok ล้มก็เงียบสนิท ต่างจาก syncOrders ที่มีเด้ง Telegram ให้
        ⇒ ท่อ TikTok ตายได้เป็นสัปดาห์โดยไม่มีสัญญาณ
        ⚠️ เตือน **ครั้งเดียวต่อรอบ** และเฉพาะตอนมีเรื่องจริง — ไม่งั้นทุกครึ่งชั่วโมงคนจะเลิกอ่าน */
    {
      const problem = tiktok?.error
        ? `ท่อ TikTok ล้ม: ${String(tiktok.error).slice(0, 200)}`
        : tiktok?.unmapped?.length
          ? `ท่อ TikTok อ่านฟิลด์ไม่ได้: ${tiktok.unmapped.join(", ")} — ข้อมูลที่เขียนลงคลังเงารอบนี้ไม่ครบ`
          : null;
      const { TELEGRAM_BOT_TOKEN: bt2, TELEGRAM_CHAT_ID: ci2 } = process.env;
      if (problem && bt2 && ci2) {
        await fetch(`https://api.telegram.org/bot${bt2}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: ci2,
            text: `⚠️ ${problem}\n\nส่องชื่อฟิลด์จริง: /api/core?tiktokshape=1\nสั่งดึงใหม่: /api/core?tiktoksync=1&days=7`,
          }),
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
      }
    }

    // ตี 1 เวลาไทย (18:00-18:29 UTC) — งานรายวัน
    let daily = null;
    const utcH = new Date().getUTCHours();
    const utcM = new Date().getUTCMinutes();
    if (utcH === 18 && utcM < 30) {
      daily = {
        recon: await reconYesterday().catch((e) => ({ error: String(e?.message || e) })),
        stock: await snapshotStock().catch((e) => ({ error: String(e?.message || e) })),
        // ทะเบียนสินค้า (ชื่อ/ราคา) — วันละครั้งพอ ชื่อสินค้าแทบไม่เปลี่ยน
        products: await syncProducts().catch((e) => ({ error: String(e?.message || e) })),
      };
      // ⚠️ ต้องอยู่หลัง snapshotStock เสมอ — ตัวเทียบใช้ภาพถ่ายของ "วันนี้" เป็นวันปลาย
      //    สลับลำดับเมื่อไหร่ = เทียบกับภาพถ่ายเมื่อวานทั้งสองฝั่ง ส่วนต่างเป็นศูนย์หลอก ๆ
      const stockCmp = await stockReconDaily().catch((e) => ({ error: String(e?.message || e) }));
      daily.stockRecon = stockCmp;

      // เทียบ 3 ทางฝั่ง Shopee — ส่งบรรทัดเดียวต่อวัน เด้งรวมช่วงเดียวกับ recon หลัก
      // รวมทุกเรื่องของ Shopee เป็นข้อความเดียว — วันละหลายข้อความคนจะเลิกอ่าน
      const lines = [
        await shopeeReconYesterdayLine().catch(() => null),
        await shopeeStockLine().catch(() => null),
        await tiktokReconYesterdayLine().catch(() => null),
      ].filter(Boolean);
      const line = lines.length ? lines.join("\n") : null;
      const text = [line, stockCmp?.line].filter(Boolean).join("\n\n");
      const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
      if (text && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
        // ชื่อเดิม shopeeLine ไม่ตรงแล้ว — บรรทัดนี้รวมทั้ง Shopee และ TikTok
        daily.marketLines = line;
      }
    }

    return new Response(JSON.stringify({ ok: true, sync, shopee, tiktok, daily }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    // ห้ามโยน error — คลังเงาพลาดรอบนี้ อีกครึ่งชั่วโมงมาใหม่ ของจริง (ZORT) ไม่กระทบ
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

// เหลื่อมจาก beam-sweep (:00/:30) ไป :13/:43 — ไม่แย่ง ZORT พร้อมกัน
/* ⚠️ **เปลี่ยนรอบนี้เมื่อไหร่ ต้องบอกฝั่งจอทุกครั้ง** (ตกลงกัน 4 ก.ย. 2569)
    จอรายการขายเตือนว่า "ข้อมูลค้าง" เมื่อไม่มีชีพจรเกิน 3 รอบซิงก์ (= 90 นาที ที่รอบ 30 นาที)
    เกณฑ์ฝั่งจอผูกกับตัวเลขนี้ ⇒ เปลี่ยนที่นี่ที่เดียวแล้วไม่บอก
    จอจะเตือนผิดจังหวะแบบเงียบ ๆ (เตือนบ่อยเกินจนคนเลิกอ่าน หรือเตือนช้าจนไม่ทัน) */
export const config = { schedule: "13,43 * * * *" };
