// ถามสถานะออเดอร์จาก ZORT — "สถานะก็ไปดึงเอาที่ ZORT" (เจ้าของร้านสั่ง 27 ส.ค. 2569)
//
// ร้านทำงานจริงใน ZORT (แพ็ค/ส่ง/ใส่เลขพัสดุ) ไม่ได้มากดในหลังร้านเว็บ
// เว็บจึงต้องดึงสถานะ+เลขพัสดุจาก ZORT มาโชว์ให้ลูกค้าเอง
// ออเดอร์เว็บถูกส่งเข้า ZORT ด้วย number = เลขออเดอร์เว็บ (orders.mjs) จึงตามกันเจอ

const BASE = "https://open-api.zortout.com/v4";

function creds() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME || !ZORT_APIKEY || !ZORT_APISECRET) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

/**
 * ดึงออเดอร์จาก ZORT ด้วยเลขออเดอร์เว็บ — **คืนสามสถานะ ไม่ใช่สองสถานะ**
 * ใช้ GetOrders แบบ keyword ค้นเลขที่เราตั้งเอง (GetOrderDetail ต้องใช้ id ภายในของ ZORT)
 *
 * 🔴 ที่มา 28 ก.ย. 2569 (ใบ t_muacc3nw) — ของเดิมคืน `null` ทั้งสามกรณี:
 *    "ZORT ไม่มีใบนี้" · "ถามไม่ได้ (ไม่มีคีย์/เน็ตล่ม/ZORT ตอบ 5xx)" · "ตอบมาแต่อ่านไม่ออก"
 *    ⇒ ผู้เรียกเขียน `if (!z) continue` ได้อย่างเป็นธรรมชาติ แล้ว **ความล้มเหลวกลายเป็นข่าวดี**
 *    ⇒ สายนี้คือสายที่บอกลูกค้าว่า "พัสดุออกแล้ว" ⇒ เงียบผิด = ลูกค้าไม่ได้รับแจ้ง และตัวนับขึ้นเขียว
 *
 * @returns {Promise<{ถามได้: boolean, ใบ: object|null, เหตุ?: string}>}
 *   · `{ถามได้:true, ใบ:{...}}` ถามแล้วเจอ
 *   · `{ถามได้:true, ใบ:null}`  ถามแล้ว **ZORT ยืนยันว่าไม่มีใบนี้** ⇒ ข้ามได้สบายใจ
 *   · `{ถามได้:false, ใบ:null, เหตุ}` **ยังไม่ได้ถาม/ถามไม่สำเร็จ** ⇒ ห้ามตีความว่าไม่มีใบ
 */
export async function zortGetOrderResult(number) {
  const h = creds();
  if (!h) return { ถามได้: false, ใบ: null, เหตุ: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify" };
  if (!number) return { ถามได้: false, ใบ: null, เหตุ: "ไม่ได้ส่งเลขออเดอร์มา" };
  try {
    const r = await fetch(
      `${BASE}/Order/GetOrders?keyword=${encodeURIComponent(number)}&page=1&limit=5`,
      { headers: h, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return { ถามได้: false, ใบ: null, เหตุ: `ZORT ตอบ HTTP ${r.status}` };
    let d = null, พังตอนอ่าน = null;
    try { d = await r.json(); } catch (e) { พังตอนอ่าน = String(e?.message || e).slice(0, 120); }
    if (พังตอนอ่าน) return { ถามได้: false, ใบ: null, เหตุ: `ZORT ตอบ 200 แต่อ่านเป็น JSON ไม่ได้: ${พังตอนอ่าน}` };
    const list = d?.list || d?.List;
    /* ⚠️ ไม่มีคีย์ list เลย ≠ list ว่าง — อันแรกคือรูปคำตอบไม่ใช่อย่างที่คิด (ห้ามอ่านเป็น "ไม่มีใบ") */
    if (!Array.isArray(list))
      return { ถามได้: false, ใบ: null, เหตุ: "ZORT ตอบ 200 แต่ไม่มีคีย์ list ในคำตอบ" };
    // keyword ค้นกว้าง — ต้องเทียบเลขให้ตรงตัวเอง
    const ใบ = list.find((o) => String(o.number || "").trim() === String(number).trim()) || null;
    return { ถามได้: true, ใบ };
  } catch (e) {
    return { ถามได้: false, ใบ: null, เหตุ: String(e?.message || e).slice(0, 160) };
  }
}

/** รูปเดิมไว้ให้โค้ดเก่าเรียกต่อได้ — คืนใบหรือ null
 *  🚫 **ห้ามใช้กับกิ่งที่ตัดสินใจอะไรจากการ "ไม่เจอ"** เพราะ null ของตัวนี้ยังกลืนสามสถานะอยู่
 *     กิ่งแบบนั้นต้องใช้ `zortGetOrderResult` แล้วอ่าน `ถามได้` */
export async function zortGetOrder(number) {
  return (await zortGetOrderResult(number)).ใบ;
}

/**
 * กวาดออเดอร์ที่จ่ายแล้วแต่ยังไม่ส่ง ไปถาม ZORT — ส่งแล้วขยับสถานะ + แจ้ง LINE ลูกค้า
 * เรียกจากงานตามเวลาเดียวกับตัวกวาด Beam (ทุกครึ่งชั่วโมง) และไม่พึ่งลูกค้าเปิดหน้า
 *
 * ⚠️ แจ้งครั้งเดียวต่อใบ (ธง o.notified.shipped) — ห้ามสแปมลูกค้า
 * ⚠️ เดินหน้าอย่างเดียว ห้ามถอยสถานะ · จำกัด 14 วันล่าสุด + 10 ใบ/รอบ
 */
export async function syncShippingAll(store) {
  const { blobs } = await store.list({ prefix: "o/" });
  const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
  /* 🔴 28 ก.ย. 2569 (ใบ t_muacc3nw) — เดิมมีตัวนับเดียว `checked` ซึ่งเพิ่ม **ก่อน**ถาม ZORT
     แล้วกิ่งถัดไปเขียน `if (!z) continue` ⇒ ZORT ล่ม = เผาโควตา 10 ใบ/รอบไปกับการถามที่ไม่สำเร็จ
     แล้วคืน `{checked:10, shipped:0}` ซึ่งอ่านว่า **"ตรวจครบแล้ว ไม่มีใบไหนจัดส่ง"** = ข่าวดีจากความล้มเหลว
     ⇒ สายนี้คือสายที่แจ้งลูกค้าว่าพัสดุออกแล้ว ⇒ ลูกค้าไม่ได้รับแจ้ง และไม่มีตัวเลขไหนฟ้อง
     ✅ แยกสามตัว: `ยิง` = ลองถามกี่ครั้ง (คุมเพดาน/เวลา) · `checked` = ถามสำเร็จกี่ใบ · `askFailed` = ถามไม่สำเร็จกี่ใบ */
  let ยิง = 0, checked = 0, shipped = 0, askFailed = 0, askFailReason = null;
  for (const b of blobs) {
    if (ยิง >= 10) break;
    /* ⚠️ ล้มติดกัน 3 ใบ = ZORT ล่มอยู่ ไม่ใช่ใบใดใบหนึ่งมีปัญหา ⇒ หยุด ไม่ต้องรอ timeout อีก 7 ครั้ง
       (Netlify ให้ฟังก์ชันรอผลได้ 26 วินาที · ยิงละ timeout 8 วินาที ⇒ ล้มรัว ๆ กินเวลาทั้งรอบได้) */
    if (askFailed >= 3) break;
    const o = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!o || (o.at || 0) < cutoff) continue;
    if (!["new", "confirmed"].includes(o.status)) continue;
    ยิง++;
    const ผล = await zortGetOrderResult(o.id);
    if (!ผล.ถามได้) {
      askFailed++;
      if (!askFailReason) askFailReason = ผล.เหตุ || "ไม่ทราบเหตุ";
      continue;   // 🚫 ห้ามนับเป็น "ตรวจแล้ว" — เรายังไม่รู้อะไรเลยเกี่ยวกับใบนี้
    }
    checked++;
    const z = ผล.ใบ;
    if (!z) continue;   // ✅ ZORT ยืนยันเองว่าไม่มีใบนี้ — ข้ามได้สบายใจ (ต่างจากกิ่งบน)
    let changed = false;
    if (z.trackingno) {
      o.tracking = { no: z.trackingno, channel: z.shippingchannel || "", at: z.shippingdate || "" };
      o.status = "shipped";
      changed = true;
      shipped++;
      o.notified = o.notified || {};
      if (!o.notified.shipped) {
        o.notified.shipped = true;
        // เด้งเข้าเครื่องลูกค้า (Web Push) ก่อน — ไม่ต้องล็อกอิน LINE ก็ได้รับ
        const { pushToUser } = await import("./push.mjs");
        await pushToUser(o.customer?.phone, {
          title: "GUCUT — จัดส่งแล้ว 🚚",
          body: `ออเดอร์ #${o.id} · ${o.tracking.channel || "ขนส่ง"} เลขพัสดุ ${o.tracking.no}`,
          url: "/account/orders/?tab=receive",
          tag: `order-${o.id}`,
        }).catch(() => {});
        const { lineToCustomer } = await import("./notify-customer.mjs");
        await lineToCustomer(
          o.customer?.phone,
          `GUCUT: ออเดอร์ #${o.id} จัดส่งแล้วนะคะ 🚚\n${o.tracking.channel || "ขนส่ง"} เลขพัสดุ ${o.tracking.no}\nติดตามพัสดุ: https://www.flashexpress.com/fle/tracking?se=${o.tracking.no}`,
          "https://gucut.com/account/orders/?tab=receive",
        ).catch(() => {});
      }
    } else if (String(z.status).toLowerCase() === "voided" && o.status !== "cancelled") {
      o.status = "cancelled";
      changed = true;
    }
    if (changed) await store.setJSON(`o/${o.id}`, o).catch(() => {});
  }
  return {
    checked, shipped, askFailed,
    /* ⚠️ `checked` = ถาม ZORT สำเร็จกี่ใบ **ไม่ใช่** กี่ใบที่อยู่ในคิว ⇒ `checked:0` อ่านได้สองแบบ
       จึงต้องมี `askFailed` เดินคู่มาเสมอ: 0 = ไม่มีอะไรขัด · >0 = รอบนี้ไม่ครบ */
    ...(askFailed
      ? {
          askFailReason,
          "⚠️ อ่านยังไง":
            `ถาม ZORT ไม่สำเร็จ ${askFailed} ใบในรอบนี้ ⇒ **ไม่ได้แปลว่าใบเหล่านั้นยังไม่ส่ง** ` +
            "แปลว่ายังไม่ได้ตรวจ · ใบพวกนั้นไม่ถูกจดว่าตรวจแล้ว รอบหน้าถามซ้ำเอง",
        }
      : {}),
  };
}