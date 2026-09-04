// คลังเงา GUCUT Core — งานตามเวลา รันเองทุกครึ่งชั่วโมง (เหลื่อมจาก beam-sweep 13 นาที)
//
// ⚠️ ฟังก์ชันนี้ไม่มี URL โดยตั้งใจ (Netlify ไม่ให้ schedule พร้อม path)
//    สั่งเดี๋ยวนั้น/ย้อนหลัง ใช้ /api/core?sync=1 (ต้องมีรหัสหลังร้าน)
//
// ทุกรอบ: กระจกออเดอร์ 7 วันล่าสุด (กันสถานะยกเลิกย้อนหลังค้างเก่า) · รอบตี 1 (เวลาไทย): เทียบยอดเมื่อวาน + ถ่ายสต็อก
import { syncOrders, reconYesterday, snapshotStock } from "../lib/core-sync.mjs";
import { syncShopeeOrders, shopeeReconYesterdayLine } from "../lib/shopee-orders.mjs";
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
    const sync = await syncOrders(wide ? 45 : 7);
    // ท่อที่สอง (แผนลับขั้น 3): ออเดอร์ตรงจาก Shopee API — พังไม่ล้มรอบ
    const shopee = await syncShopeeOrders(7).catch((e) => ({ error: String(e?.message || e) }));

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
        daily.shopeeLine = line;
      }
    }

    return new Response(JSON.stringify({ ok: true, sync, shopee, daily }), {
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
export const config = { schedule: "13,43 * * * *" };
