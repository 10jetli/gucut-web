// GUCUT Core — ประตูสั่งงาน/ดูสถานะคลังเงา (หลังร้านเท่านั้น)
//
//   GET /api/core                 สถานะ: จำนวนแถว · เทียบยอดล่าสุด · ช่องทางที่เห็น
//   GET /api/core?sync=1&days=30  กระจกย้อนหลัง N วัน (backfill · สูงสุด 60)
//   GET /api/core?blankwhere=1     ใบที่ integration_status ว่าง อยู่ช่องทาง/ร้าน/เดือนไหน + เขียนเมื่อไหร่
//   GET /api/core?pending=1        งานค้างจริง vs ใบผี (ช่องทางที่ปิดไปแล้ว) · store=z1|z2
//   GET /api/core?monthly=1&months=6  ยอดขายรายเดือน (คิดที่ฐาน · จอไม่ต้องดึงแถวมานับเอง)
//   GET /api/core?daily=1&days=90      ยอดขายรายวัน · ?bycustomer=1  ยอดรายลูกค้า
//   GET /api/core?tokens=1         ต่ออายุ token มาร์เก็ตเพลสเดี๋ยวนั้น (ตัวจริงวิ่งวันละครั้ง)
//   GET /api/core?noitems=1&days=N ออเดอร์ที่ไม่มีบรรทัดสินค้า — ต้องเป็น 0 ก่อนเปิดสะพาน PEAK
//   GET /api/core?orderitems=<เลขที่ใบ>  ดูบรรทัดสินค้าของใบเดียว
//   GET /api/core?recon=1         สั่งเทียบยอดเมื่อวานเดี๋ยวนี้
//   GET /api/core?snapshot=1      สั่งถ่ายสต็อกเดี๋ยวนี้
//   GET /api/core?stock=1&days=N  เทียบสต็อกที่เราคำนวณเองกับ ZORT (ไม่จด · ดูเฉย ๆ)
import { adminGate } from "../lib/admin-gate.mjs";
import { coreQuery, coreReady, coreInit } from "../lib/coredb.mjs";
import { syncContacts, listContacts } from "../lib/core-contacts.mjs";
import { syncOrders, reconYesterday, snapshotStock } from "../lib/core-sync.mjs";
import { syncShopeeOrders, shopeeRecon } from "../lib/shopee-orders.mjs";
import { shopeeStockCompare, shopeeMissingSkus } from "../lib/shopee-stock.mjs";
import { applyMoves, listMoves, deleteMove } from "../lib/stock-moves.mjs";
import { peakStatus, toInvoice, sendInvoices } from "../lib/peak.mjs";
import {
  deleteVoidedSale, createSale, voidSale, listSales, branches, lookup, posCats, listCategories,
} from "../lib/pos.mjs";
import {
  syncProducts, syncBundles, listBundles, saveBundleItems, listBundleItems, blockedByNegative,
  reorderPlan, linkStatus,
} from "../lib/core-products.mjs";
import { stockRecon, stockReconLog, listStock, listDeadStock, stockCard, channelGaps,
} from "../lib/core-stock.mjs";
import { listOrders, getOrder, listChannels, listLogistics,
} from "../lib/core-orders.mjs";
import { runBackup, backupStatus, restore } from "../lib/backup.mjs";
import {
  syncPurchases, listPurchases, listWarehouses, syncTransfers, listTransfers, resetTransfers, listQuotations, listPurchaseItems,
} from "../lib/core-purchases.mjs";

export default async function handler(req, context) {
  // adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็คสองชั้น (บทเรียน 25 ส.ค.)
  // และ "ไม่ส่งรหัสมาเลย" gate จะไม่ deny ให้เอง (wants:false) — API หลังร้านล้วน
  // แบบตัวนี้ต้องบังคับ ok เท่านั้น (เจอจริงตอนยิงทดสอบ 30 ส.ค. — ไม่มีรหัสได้ 200)
  // ⚠️ **ต้องตอบ preflight ก่อนด่านรหัสเสมอ** — คำขอ OPTIONS ไม่มีรหัสติดมาโดยธรรมชาติ
  //    (เบราว์เซอร์ไม่ส่ง header ที่กำหนดเองไปกับ preflight) ถ้าปล่อยให้ด่านตรวจก่อน
  //    มันจะตอบ 401 แล้วเบราว์เซอร์จะบล็อกคำขอจริงทิ้งด้วย **โดยฟ้องแค่ว่า Failed to fetch**
  //    ซึ่งไม่ได้บอกเลยว่าเป็นเพราะ preflight (เจอจริง 3 ก.ย. 2569 ตอนส่งรายการสินค้าในชุด)
  //    เปิดเฉพาะเส้นทางนี้ · เฉพาะโดเมน ZORT · และยังต้องมีรหัสในคำขอจริงเหมือนเดิม
  // ⚠️ **เพิ่มเส้นทางคัดข้อมูลจากจอ ZORT ต้องเพิ่มชื่อทั้ง 3 จุด** (preflight · ตั๋ว · ตัวรับ)
  //    ลืมจุดใดจุดหนึ่ง = เบราว์เซอร์ฟ้องแค่ "Failed to fetch" ไม่บอกว่าตกตรงไหน
  const UPLOAD_PATHS = ["bundleitems", "categoryvalues"];
  const isUpload = (u) => UPLOAD_PATHS.some((k) => u.searchParams.get(k));
  if (req.method === "OPTIONS" && isUpload(new URL(req.url))) {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "https://secure.zortout.com",
        "access-control-allow-headers": "content-type, x-admin-key, x-upload-token",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-max-age": "600",
      },
    });
  }

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  // ⚠️ ทางเข้าที่สองสำหรับ "ส่งรายการสินค้าในชุด" เท่านั้น — ใช้รหัสใช้ครั้งเดียว
  //    เพราะข้อมูลนี้อยู่แค่ในหน้าเว็บ ZORT และเราไม่อยากเอารหัสหลังร้านไปวางที่นั่น
  //    ⚠️ ตรวจแล้วลบทิ้งทันที ใช้ซ้ำไม่ได้ · หมดอายุ 10 นาที
  let ticket = false;
  if (!gate.ok && isUpload(new URL(req.url)) && req.method === "POST") {
    try {
      const { getStore } = await import("@netlify/blobs");
      const store = getStore("gucut-admin");
      const saved = await store.get("upload/harvest", { type: "json" });
      const sent = req.headers.get("x-upload-token") || "";
      if (saved?.token && sent && saved.token === sent && Date.now() < Number(saved.until || 0)) {
        await store.delete("upload/harvest");
        ticket = true;
      }
    } catch { /* อ่านไม่ได้ = ไม่ให้ผ่าน */ }
  }
  if (!gate.ok && !ticket) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  /* ⚠️ **ถ้าเราตัดค่าที่ผู้เรียกขอมา ต้องบอกทุกครั้ง — ที่เดียว ใช้ได้ทุก endpoint**
      (ฝั่งจอชี้ 5 ก.ย. 2569: ขอ list=topproducts&limit=200 ได้กลับมา 100
       มี applied.limit บอกอยู่ แต่จอไม่ได้อ่าน ⇒ ถ้าใครนึกว่าได้ 200 ก็เข้าใจผิดเงียบ ๆ)

      ทำที่ตัวห่อคำตอบตัวเดียว แทนการไล่เติมทีละ endpoint (มี 16 จุด)
      — ไล่เติมทีละจุดคือของที่ตกหล่นแน่นอนเมื่อมี endpoint ใหม่

      ⚠️ **ตั้งชื่อว่า limitClamped ไม่ใช่ truncated โดยตั้งใจ** — สองอย่างนี้คนละคำถาม
         `limitClamped` = เราให้น้อยกว่าที่คุณขอ (เพราะชนเพดานของ endpoint)
         `truncated`    = ยังมีข้อมูลเหลืออีกนอกเหนือจากที่ส่งไป
         ขอ 200 · เพดาน 100 · มีของจริง 30 ⇒ clamped จริง แต่ truncated ไม่จริง
         ยุบสองอันเป็นชื่อเดียวเมื่อไหร่ จะมีคนอ่านผิดสักวัน */
  const askedLimit = (() => {
    const raw = url.searchParams.get("limit");
    const n = parseInt(raw ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const json = (obj, status = 200) => {
    let out = obj;
    if (askedLimit && obj && typeof obj === "object" && !Array.isArray(obj)) {
      const applied = Number(obj.limit ?? obj.applied?.limit);
      if (Number.isFinite(applied) && applied > 0) {
        out = {
          ...obj,
          limitRequested: askedLimit,
          limitApplied: applied,
          limitClamped: applied < askedLimit,
          ...(applied < askedLimit
            ? { limitNote: `ขอ ${askedLimit} แต่ endpoint นี้ให้ได้สูงสุด ${applied}` }
            : {}),
        };
      }
    }
    return new Response(JSON.stringify(out), {
      status,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    if (!coreReady()) {
      return json({ ready: false, note: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN ที่ Netlify" });
    }

    if (url.searchParams.get("init")) {
      return json({ ok: true, init: await coreInit() });
    }

    // ของเข้า-ของออกที่ไม่ได้มาจากออเดอร์ (รับของ · โอน · ของเสีย · ปรับจากการนับ)
    //   POST /api/core?move=1   body: {sku,qty,reason,ref} หรือ {moves:[...]}
    //   GET  /api/core?list=moves&sku=&limit=&offset=
    if (url.searchParams.get("movedel")) {
      if (req.method !== "DELETE") return json({ error: "ต้องเป็น DELETE" }, 405);
      const r = await deleteMove(url.searchParams.get("movedel"));
      return json(r.error ? { ok: false, ...r } : { ok: true, ...r }, r.error ? 400 : 200);
    }
    if (url.searchParams.get("move")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const moves = Array.isArray(body) ? body : body.moves ?? [body];
      const r = await applyMoves(moves);
      return json(r.error ? { ok: false, ...r } : { ok: true, ...r }, r.error ? 400 : 200);
    }
    // ขายหน้าร้าน (POS) เข้าคลังเงาตรง ๆ ไม่ผ่าน ZORT
    //   POST   /api/core?sale=1   body {items:[{sku,name,qty,price}], day?, number?, customer?}
    //   DELETE /api/core?salevoid=<เลขที่ใบ>   (เปลี่ยนสถานะเป็น Voided ไม่ลบ)
    //   GET    /api/core?list=sales&day=YYYY-MM-DD
    // ลบใบขายหน้าร้านที่ยกเลิกแล้วทิ้งถาวร (เก็บกวาดใบทดสอบ) — ห้ามลบใบที่ยังไม่ยกเลิก
    //   DELETE /api/core?saledel=<เลขที่ใบ>
    if (url.searchParams.get("saledel")) {
      if (req.method !== "DELETE") return json({ error: "ต้องเป็น DELETE" }, 405);
      const r = await deleteVoidedSale(url.searchParams.get("saledel"));
      return json(r.error ? { ok: false, ...r } : { ok: true, ...r }, r.error ? 400 : 200);
    }
    if (url.searchParams.get("salevoid")) {
      if (req.method !== "DELETE") return json({ error: "ต้องเป็น DELETE" }, 405);
      const r = await voidSale(url.searchParams.get("salevoid"));
      return json(r.error ? { ok: false, ...r } : { ok: true, ...r }, r.error ? 400 : 200);
    }
    if (url.searchParams.get("sale")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const r = await createSale(body);
      return json(r.error ? { ok: false, ...r } : { ok: true, ...r }, r.error ? 400 : 200);
    }
    // ── ระบบสำรองข้อมูล ────────────────────────────────────────────
    //   GET ?backupstatus=1                      ดูว่าสำเนามีอะไรบ้าง สำรองล่าสุดเมื่อไหร่
    //   GET ?backup=1                            สั่งสำรองเดี๋ยวนั้น (ปกติทำเองตี 3)
    //   GET ?restore=<ถัง>[&key=..]              **ซ้อมให้ดู** ไม่เขียนอะไร
    //   GET ?restore=<ถัง>&confirm=1[&overwrite=1]  เขียนจริง
    // ⚠️ restore ไม่มี confirm = ซ้อมเสมอ · และไม่ทับของที่ยังอยู่ นอกจากสั่ง overwrite
    // ⚠️ **คืนค่าแบบแบน ไม่ห่อในกล่องซ้อน** — ให้เหมือนทุก endpoint ในไฟล์นี้
    //    (list=stock · list=sales · recon ล้วนเป็น { ok:true, ...ผลลัพธ์ })
    //    เดิม arch กับ backup ห่อไว้อีกชั้น ⇒ ฝั่งจออ่านไม่เจอ ขึ้น "ไม่ทราบจำนวน" ทั้งหน้า
    //    ทั้งที่ API ตอบ 200 พร้อมข้อมูลครบ (เจอจริง 3 ก.ย. 2569 ตอนเปิดหน้าดู)
    //    บทเรียน: ความไม่สม่ำเสมอของรูปคำตอบ ทำให้อีกฝั่งเดาผิดโดยไม่มีอะไรฟ้อง
    if (url.searchParams.get("backupstatus")) {
      return json({ ok: true, ...(await backupStatus()) });
    }
    if (url.searchParams.get("backup")) {
      return json({ ok: true, ...(await runBackup()) });
    }
    if (url.searchParams.get("restore")) {
      const r = await restore({
        store: url.searchParams.get("restore"),
        key: url.searchParams.get("key") || "",
        confirm: url.searchParams.get("confirm") === "1",
        overwrite: url.searchParams.get("overwrite") === "1",
      });
      return json(r.error ? { ok: false, ...r } : { ok: true, ...r }, r.error ? 400 : 200);
    }
    // ผังสถาปัตยกรรม — โครงมาจากตัวสแกนตอน build (arch-data.mjs)
    // ส่วน "ตั้งคีย์แล้วหรือยัง" ต้องดูตอนรันเท่านั้น เพราะตัวแปรลับอยู่ที่ Netlify ไม่ได้อยู่ในโค้ด
    // ⚠️ ส่งกลับแค่ "ตั้งแล้ว/ยัง" ห้ามส่งค่าจริงของตัวแปรออกไปเด็ดขาด
    if (url.searchParams.get("arch")) {
      const { ARCH } = await import("../lib/arch-data.mjs");
      return json({
        ok: true,
        ...ARCH,
        integrations: ARCH.integrations.map((i) => ({
          ...i,
          envs: undefined, // ชื่อตัวแปรไม่ต้องส่งออกไปให้หน้าจอ
          live: i.envs.every((e) => !!process.env[e]),
          partial: i.envs.some((e) => !!process.env[e]) && !i.envs.every((e) => !!process.env[e]),
        })),
      });
    }
    // รายการสินค้าในชุด — เก็บจากหน้าเว็บ ZORT (API ไม่เปิดให้ดึง)
    //   POST ?bundleitems=1  body {items:[{bundleSku,sku,name,qty,line}]}
    //   GET  ?list=bundleitems[&sku=<ชุด>]      ชุดนี้มีอะไรบ้าง
    //   GET  ?list=bundleitems&member=<รหัส>   รหัสนี้อยู่ในชุดไหนบ้าง (ถามกลับทาง)
    // รหัสใช้ครั้งเดียวสำหรับอัปโหลดจากหน้าเว็บ ZORT
    // ⚠️ **มีไว้เพื่อไม่ต้องเอารหัสหลังร้านไปวางในหน้าเว็บของคนอื่น**
    //    รหัสหลังร้านเปิดได้ทุกอย่าง · รหัสนี้ทำได้อย่างเดียวคือส่งรายการสินค้าในชุด
    //    อายุ 10 นาที · ใช้ได้ครั้งเดียว · หมดแล้วต้องขอใหม่
    if (url.searchParams.get("uploadtoken")) {
      const { getStore } = await import("@netlify/blobs");
      const token = crypto.randomUUID();
      await getStore("gucut-admin").setJSON("upload/harvest", {
        token,
        until: Date.now() + 10 * 60 * 1000,
      });
      return json({ ok: true, token, expiresInMinutes: 10 });
    }
    // มูลค่าสินค้ารายหมวดที่คัดมาจากจอ ZORT (ไม่มี Category API — ต้องคัดจากเบราว์เซอร์)
    if (url.searchParams.get("categoryvalues")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { saveCategoryValues } = await import("../lib/core-products.mjs");
      const r = await saveCategoryValues(body.rows || body);
      return new Response(JSON.stringify(r.error ? { ok: false, ...r } : { ok: true, ...r }), {
        status: r.error ? 400 : 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "https://secure.zortout.com",
        },
      });
    }
    if (url.searchParams.get("bundleitems")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const r = await saveBundleItems(body);
      return new Response(JSON.stringify(r.error ? { ok: false, ...r } : { ok: true, ...r }), {
        status: r.error ? 400 : 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "https://secure.zortout.com",
        },
      });
    }
    if (url.searchParams.get("list") === "bundleitems") {
      return json({
        ok: true,
        ...(await listBundleItems(url.searchParams.get("sku"), url.searchParams.get("member"))),
      });
    }
    // สินค้าเป็นชุด (Bundle) — 360 ชุดที่ร้านใช้จริง
    if (url.searchParams.get("syncbundles")) {
      return json({ ok: true, bundles: await syncBundles() });
    }
    /* สินค้าที่ลูกค้าซื้อไม่ได้เพราะสต็อกติดลบ — เรียงตาม "นับตัวนี้แล้วปลดล็อกได้กี่รหัส"
         GET /api/core?blocked=1
       ⚠️ อ่านอย่างเดียว ไม่แก้สต็อกให้ — ติดลบแปลว่าของจริงกับในระบบไม่ตรง แก้ได้ด้วยการนับเท่านั้น
       ⚠️ ของหนึ่งม้วนติดลบทำให้รหัสความยาวหลายสิบรหัสหายจากหน้าร้านพร้อมกัน
          และ **ไม่มีอะไรฟ้องเลย** — สินค้าไม่ได้ขึ้นว่า "หมด" แต่หายไปทั้งตัว */
    if (url.searchParams.get("blocked")) {
      return json({ ok: true, ...(await blockedByNegative()) });
    }
    /* วางแผนสั่งม้วนใหม่ — "ของนี้พอขายอีกกี่วัน"
         GET /api/core?reorder=1[&days=90]
       ⚠️ หน่วยเป็น "ฟัน" ไม่ใช่ม้วน · ขายโซ่ 22 ฟันหนึ่งเส้น = ใช้ฟันไป 22
       ⚠️ เศษปลายม้วนต่อกับม้วนใหม่ได้ (เจ้าของร้านยืนยัน 5 ก.ย. 2569)
          ⇒ ม้วนเหลือน้อย = สัญญาณให้สั่งของ **ไม่ใช่เหตุให้ปิดขาย** */
    /* ข้อต่อจะหมดก่อนโซ่ไหม — ม้วนเต็มแต่ไม่มีข้อต่อ = ตัดขายไม่ได้เลย
         GET /api/core?links=1[&days=90]
       ⚠️ 3/8 ใช้กับ 3623 และ 3652 · 3/8p ใช้กับ 3636 เท่านั้น ใส่ข้ามไม่ได้
       ⚠️ ยังไม่รู้ว่าข้ามยี่ห้อได้ไหม ⇒ แยกกองไว้ก่อน · crossBrand ส่งมาให้ดูคู่กันเฉย ๆ */
    if (url.searchParams.get("links")) {
      return json({ ok: true, ...(await linkStatus({ days: url.searchParams.get("days") })) });
    }
    if (url.searchParams.get("reorder")) {
      return json({ ok: true, ...(await reorderPlan({ days: url.searchParams.get("days") })) });
    }
    if (url.searchParams.get("list") === "bundles") {
      return json({
        ok: true,
        ...(await listBundles({
          q: url.searchParams.get("q"),
          only: url.searchParams.get("only"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
          marketplaces: url.searchParams.get("marketplaces"),
        })),
      });
    }
    if (url.searchParams.get("syncproducts")) {
      return json({ ok: true, products: await syncProducts() });
    }
    // ── ใบสั่งซื้อ (PO) จาก ZORT — คนละชุดกับ "ระบบสั่งของโรงงาน" ที่หลังร้านมีอยู่ ──
    if (url.searchParams.get("syncpurchases")) {
      return json({ ok: true, purchases: await syncPurchases({ repairItems: url.searchParams.get("repairitems") }) });
    }
    if (url.searchParams.get("list") === "purchases") {
      return json({
        ok: true,
        ...(await listPurchases({
          q: url.searchParams.get("q"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
      });
    }
    // เครดิต Netlify — อะไรกินเยอะสุด (เจ้าของร้านสั่ง 3 ก.ย. 2569)
    if (url.searchParams.get("usage")) {
      const { netlifyUsage } = await import("../lib/netlify-usage.mjs");
      return json({ ok: true, ...(await netlifyUsage()) });
    }
    // บริการส่งสินค้า — อ่านจากกระจกออเดอร์ (ZORT ไม่มี API ขนส่งแยก)
    if (url.searchParams.get("list") === "logistics") {
      return json({
        ok: true,
        ...(await listLogistics({
          q: url.searchParams.get("q"),
          only: url.searchParams.get("only"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
      });
    }
    // รายการสินค้าในใบซื้อ — แยกรายสินค้าแบบรายงานยอดซื้อของ ZORT
    if (url.searchParams.get("list") === "purchaseitems") {
      return json({
        ok: true,
        ...(await listPurchaseItems({
          q: url.searchParams.get("q"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
      });
    }
    // ทะเบียนการเชื่อมต่อ — ยิงของจริงทุกเจ้า ไม่มีค่าเขียนตายตัว
    if (url.searchParams.get("connections")) {
      const { connectionsStatus } = await import("../lib/connections.mjs");
      /* ?budget=N (50–30000 มิลลิวินาที) มีไว้บังคับให้ทางเดิน timeout ทำงานเพื่อทดสอบ
         ⚠️ ไม่ใส่ = ใช้ค่าตั้งต้น 18 วิ · ทางเดินที่ไม่เคยถูกเรียกใช้ ไม่ต่างจากไม่มี */
      return json({
        ok: true,
        ...(await connectionsStatus({ budget: url.searchParams.get("budget") })),
      });
    }
    /* ลูกค้า/ผู้ติดต่อ — เจ้าของร้านสั่งดึง 3 ก.ย. 2569
       🔒 ข้อมูลส่วนบุคคลจริง 28,250 ราย · ผ่าน adminGate เหมือนทุกเส้นทางในไฟล์นี้
       ⚠️ **ห้ามเพิ่มโหมด "เอาทั้งหมด"** เพดาน 100 แถว/ครั้งเป็นของตั้งใจ */
    if (url.searchParams.get("synccontacts")) {
      return json({
        ok: true,
        contacts: await syncContacts({
          startPage: url.searchParams.get("startpage"),
          maxPages: url.searchParams.get("maxpages"),
        }),
      });
    }
    if (url.searchParams.get("list") === "contacts") {
      return json({
        ok: true,
        ...(await listContacts({
          q: url.searchParams.get("q"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
      });
    }
    // ใบเสนอราคา — ดึงสดจาก ZORT (ร้านมีแค่ 3 ใบ ไม่ต้องทำกระจก)
    if (url.searchParams.get("list") === "quotations") {
      return json({ ok: true, ...(await listQuotations(url.searchParams.get("limit"))) });
    }
    // สต็อกการ์ดรายสินค้า — ตารางการเคลื่อนไหวในหน้ารายละเอียดสินค้า
    if (url.searchParams.get("list") === "stockcard") {
      return json({
        ok: true,
        ...(await stockCard({
          sku: url.searchParams.get("sku"),
          kind: url.searchParams.get("kind"),
          limit: url.searchParams.get("limit"),
        })),
      });
    }
    // 🔔 สินค้าที่หายไปจากช่องทางขาย — จับเรื่องแบบเครื่อง 00073 ที่เงียบไป 3 เดือน
    if (url.searchParams.get("list") === "channel-gaps") {
      return json({
        ok: true,
        ...(await channelGaps({
          quietDays: url.searchParams.get("quietdays"),
          lookbackDays: url.searchParams.get("lookbackdays"),
          minSold: url.searchParams.get("minsold"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
      });
    }
    // สินค้าจม — จอ "รายงาน → สินค้า" ของ ZORT
    if (url.searchParams.get("list") === "deadstock") {
      return json({
        ok: true,
        ...(await listDeadStock({
          days: url.searchParams.get("days"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
      });
    }
    // รายการโอนสินค้า — ร้านใช้หนักที่สุดในกลุ่มสินค้า (12,196 ใบใน ZORT)
    if (url.searchParams.get("resettransfers")) {
      return json({ ok: true, reset: await resetTransfers() });
    }
    if (url.searchParams.get("synctransfers")) {
      return json({
        ok: true,
        transfers: await syncTransfers(url.searchParams.get("days"), {
          startPage: url.searchParams.get("startpage"),
          maxPages: url.searchParams.get("maxpages"),
        }),
      });
    }
    if (url.searchParams.get("list") === "transfers") {
      return json({
        ok: true,
        ...(await listTransfers({
          q: url.searchParams.get("q"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
      });
    }
    // คลังสินค้าทั้งหมด (รวมโกดัง) — คนละอย่างกับ list=branches ที่เป็นสาขาขายหน้าร้าน
    if (url.searchParams.get("list") === "warehouses") {
      return json({ ok: true, ...(await listWarehouses()) });
    }
    // จอหมวดหมู่แบบ ZORT — หมวดจริง 42 หมวดจากทะเบียนสินค้า
    if (url.searchParams.get("list") === "categories") {
      return json({ ok: true, ...(await listCategories()) });
    }
    if (url.searchParams.get("list") === "poscats") {
      return json({ ok: true, ...(await posCats()) });
    }
    if (url.searchParams.get("list") === "branches") {
      return json({ ok: true, branches: branches() });
    }
    if (url.searchParams.get("poslookup") !== null && url.searchParams.get("poslookup") !== undefined) {
      return json({
        ok: true,
        ...(await lookup(
          url.searchParams.get("poslookup"),
          url.searchParams.get("limit"),
          url.searchParams.get("cat"),
          url.searchParams.get("offset")
        )),
      });
    }
    if (url.searchParams.get("list") === "sales") {
      return json({
        ok: true,
        ...(await listSales({ day: url.searchParams.get("day"), limit: url.searchParams.get("limit") })),
      });
    }
    // SKU ที่ Shopee ขายอยู่แต่คลังเราไม่รู้จัก (พร้อมเดารหัสฐานให้) — ให้จอเตือนเอาไปโชว์
    if (url.searchParams.get("list") === "missing-sku") {
      return json({ ok: true, ...(await shopeeMissingSkus()) });
    }
    // สินค้าขายดีรวมยอดฝั่งเซิร์ฟเวอร์ — จอ /sales ใช้เติมช่อง "ยอดเงิน" (ขอโดยฝั่งจอ 2 ก.ย.)
    //   GET /api/core?list=topproducts&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=15
    //   ยอดเงินรวมจาก order_items จริง ไม่ใช่ qty×ราคาขาย (อันนั้นเป็นการเดา)
    if (url.searchParams.get("list") === "topproducts") {
      const day = (s, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : fallback);
      const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() + 7 * 3600 * 1000 - 30 * 86400 * 1000)
        .toISOString().slice(0, 10);
      const from = day(url.searchParams.get("from"), monthAgo);
      const to = day(url.searchParams.get("to"), today);
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "15", 10) || 15));
      /* ⚠️ **sku= ถามยอดขายของสินค้าตัวเดียว** — ฝั่งจอต้องใช้ในหน้ารายละเอียดสินค้า
          ก่อนหน้านี้ผมบอกฝั่งจอว่า "ใช้ sku= ได้" ทั้งที่ยังไม่ได้ทำ
          ⇒ ท่อเมินพารามิเตอร์ที่ไม่รู้จักเงียบ ๆ แล้วคืนสินค้าขายดีทั้งร้าน
             ถ้าจอเชื่อชื่อพารามิเตอร์แล้วหยิบแถวแรกมาแสดง = **โชว์ยอดขายของสินค้าตัวอื่น
             ในหน้าสินค้าตัวนี้ โดยดูสมเหตุสมผลทุกประการ** (ฝั่งจอจับได้ 3 ก.ย. 2569) */
      const sku = String(url.searchParams.get("sku") ?? "").trim().slice(0, 60);
      const params = [from, to];
      let filter = "";
      if (sku) { filter = "AND oi.sku = ?"; params.push(sku); }
      /* by=month — แบ่งเป็นรายเดือนในคำขอเดียว (ฝั่งจอขอ: กราฟยอดขายรายสินค้า)
         ⚠️ เดิมจอต้องยิง 12 ครั้ง เดือนละครั้ง ⇒ **12 การเรียกฟังก์ชันต่อการเปิดกราฟหนึ่งครั้ง**
            ซึ่งกินเครดิตโดยไม่จำเป็น และช้ากว่าด้วย
         ⚠️ `order_date` เก็บเป็นวันแบบไทยอยู่แล้ว ⇒ ตัด 7 ตัวแรกได้เลย ไม่ต้องบวกเวลาอีก
            (ถ้าเป็นคอลัมน์ที่เก็บ UTC ต้อง date(col,'+7 hours') ก่อนเสมอ — คนละกรณีกัน) */
      const byMonth = url.searchParams.get("by") === "month";
      const items = byMonth
        ? await coreQuery(
            `SELECT substr(o.order_date,1,7) AS month,
                    SUM(oi.qty) AS qty, ROUND(COALESCE(SUM(oi.amount),0),2) AS amount,
                    COUNT(DISTINCT o.id) AS orders
             FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.order_date >= ? AND o.order_date <= ?
               AND o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'
               ${filter}
             GROUP BY substr(o.order_date,1,7) ORDER BY month`,
            params
          )
        : await coreQuery(
            `SELECT oi.sku, MAX(oi.name) AS name,
                    SUM(oi.qty) AS qty, ROUND(COALESCE(SUM(oi.amount),0),2) AS amount
             FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.order_date >= ? AND o.order_date <= ?
               AND o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'
               ${filter}
             GROUP BY oi.sku ORDER BY qty DESC LIMIT ${limit}`,
            params
          );
      // ⚠️ **สะท้อนพารามิเตอร์ที่รับไปจริงกลับไปด้วยเสมอ** (ฝั่งจอเสนอ — ดีมาก)
      //    จอจะได้ตรวจเองได้ว่าเซิร์ฟเวอร์อ่านที่ส่งไปจริงไหม แทนที่จะรู้ตอนตัวเลขผิดบนจอ
      // ⚠️ **จอใช้ applied เป็นด่านจริง ไม่ใช่แค่ debug** (ฝั่งจอทำแล้ว: applied.sku ไม่ตรง = ทิ้งข้อมูล)
      //    ⇒ ห้ามถอดฟิลด์นี้ออก และห้ามส่งค่าที่ไม่ใช่ค่าที่ใช้จริง
      return json({
        ok: true,
        from,
        to,
        applied: { sku: sku || null, limit, by: byMonth ? "month" : null },
        items,
      });
    }
    // สะพานส่งเอกสารขายเข้า PEAK (แทนหน้าที่ ZORT)
    //   GET /api/core?peak=status            ต่อ PEAK ได้ไหม (ไม่สร้างเอกสารอะไร)
    //   GET /api/core?peak=dry&day=YYYY-MM-DD  ซ้อมแปลงออเดอร์วันนั้นเป็นใบแจ้งหนี้ ไม่ส่งจริง
    // ⚠️ ยังไม่มีทางส่งจริงผ่าน URL โดยตั้งใจ — ต้องตั้ง PEAK_LIVE แล้วเพิ่มตัวสั่งอีกชั้น
    //    เอกสารขายผูกกับบัญชีและภาษี ยิงผิดต้องตามยกเลิกทีละใบ
    /* ── ออเดอร์ที่ไม่มีบรรทัดสินค้า ── (5 ก.ย. 2569)
       ⚠️ **ตรวจก่อนเปิดสะพาน PEAK** — ใบกำกับภาษีต้องมีรายการสินค้า
          ถ้าใบไหนไม่มีบรรทัด แล้วเราส่งเข้า PEAK ⇒ ได้เอกสารภาษีที่มีแต่ยอดรวม ไม่มีรายการ
          ซึ่งผิดกฎหมายและแก้ย้อนหลังยาก
       ⚠️ **หัวใบซิงก์แยกจากบรรทัด** — ตัวซิงก์เขียนหัวใบก่อน แล้วค่อยเขียนบรรทัด
          ถ้าขาดกลางทาง (ชนเวลา 26 วิ · D1 เต็มโควตา) จะได้ใบที่มีหัวแต่ไม่มีบรรทัด
          **และไม่มีอะไรฟ้อง** เพราะจอรายการขายไม่ได้อ่านบรรทัด
       ⚠️ นับเฉพาะใบที่ไม่ถูกยกเลิก และแยกตามร้าน — ร้าน z2 ยังไม่เข้าภาษี */
    /* ดูบรรทัดสินค้าของใบเดียว — ไว้ไล่ใบที่ยอดผิดปกติ
       ⚠️ ใช้ `number` ไม่ใช่ `id` — กระจกเก็บ id เป็น `<ร้าน>/<เลขที่ใบ>` (เคยเทียบผิดคีย์มาแล้ว) */
    if (url.searchParams.get("orderitems")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      const numArg = String(url.searchParams.get("orderitems")).slice(0, 60);
      const head = await coreQuery(
        `SELECT id, source, number, channel, status, amount, order_date, pay_status,
                bill_discount, is_cod
         FROM orders WHERE number = ? LIMIT 5`,
        [numArg]
      );
      if (!head.length) return json({ ok: true, found: false, number: numArg });
      const lines = await coreQuery(
        `SELECT order_id, line, sku, name, qty, amount, discount
         FROM order_items WHERE order_id IN (${head.map(() => "?").join(",")})
         ORDER BY order_id, line`,
        head.map((h) => h.id)
      );
      const num3 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      return json({
        ok: true,
        found: true,
        orders: head.map((h) => ({
          ...h,
          lines: lines.filter((l) => l.order_id === h.id),
          linesTotal: lines
            .filter((l) => l.order_id === h.id)
            .reduce((a, l) => a + num3(l.amount), 0),
        })),
      });
    }

    if (url.searchParams.get("noitems")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      const days = Math.max(1, Math.min(400, parseInt(url.searchParams.get("days") ?? "90", 10) || 90));
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const from = new Date(Date.now() + 7 * 3600e3 - days * 864e5).toISOString().slice(0, 10);
      const CANCEL = `status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`;
      const rows = await coreQuery(
        `SELECT o.source AS src,
                COUNT(*) AS total,
                SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)
                         THEN 1 ELSE 0 END) AS noItems,
                SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)
                         THEN o.amount ELSE 0 END) AS noItemsAmount
         FROM orders o
         WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL}
         GROUP BY 1`,
        [from, today]
      );
      const sample = await coreQuery(
        `SELECT o.source AS src, o.number AS number, o.order_date AS day,
                o.channel AS channel, o.amount AS amount, o.status AS status
         FROM orders o
         WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL}
           AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)
         ORDER BY o.order_date DESC LIMIT 30`,
        [from, today]
      );
      /* ── บรรทัดรวมแล้วตรงกับหัวใบไหม ── ด่านที่สองของสะพาน PEAK
         ⚠️ **ยังไม่รู้สูตรที่ ZORT ใช้ประกอบยอดหัวใบ** (มีค่าส่ง · ส่วนลดท้ายบิล · ส่วนลดต่อชิ้น · VAT)
            ⇒ **ห้ามเดาสูตรแล้วรายงานว่า "ไม่ตรง"** เพราะจะได้ตัวเลขน่ากลัวที่ไม่มีความหมาย
               (บทเรียนจากตัวเทียบ Lazada เมื่อเช้า ที่รายงาน "ไม่ตรง 278" ทั้งที่เป็นผลของการเดา)
         ⇒ รอบนี้ **วัดอย่างเดียว ไม่ตัดสิน** — แจกแจงว่าผลต่างเป็นเท่าไหร่บ้าง
            ให้คนดูแล้วบอกได้ว่าสูตรคืออะไร ค่อยเขียนตัวตรวจจริงทีหลัง */
      const gaps = await coreQuery(
        `SELECT o.source AS src,
                COUNT(*) AS n,
                SUM(CASE WHEN ABS(o.amount - li.s) < 0.01 THEN 1 ELSE 0 END) AS exact,
                SUM(CASE WHEN o.amount > li.s THEN 1 ELSE 0 END) AS headerHigher,
                SUM(CASE WHEN o.amount < li.s THEN 1 ELSE 0 END) AS headerLower
         FROM orders o
         JOIN (SELECT order_id, SUM(amount) AS s FROM order_items GROUP BY order_id) li
           ON li.order_id = o.id
         WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL}
         GROUP BY 1`,
        [from, today]
      );
      const gapSample = await coreQuery(
        `SELECT o.source AS src, o.number AS number, o.order_date AS day,
                o.amount AS header, ROUND(li.s,2) AS lines,
                ROUND(o.amount - li.s, 2) AS gap
         FROM orders o
         JOIN (SELECT order_id, SUM(amount) AS s FROM order_items GROUP BY order_id) li
           ON li.order_id = o.id
         WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL}
           AND ABS(o.amount - li.s) >= 0.01
         ORDER BY ABS(o.amount - li.s) DESC LIMIT 20`,
        [from, today]
      );

      /* ── ส่วนต่างตกอยู่ใน 12 ค่าของค่าส่งไหม ── (ฝั่งจอเสนอ 5 ก.ย. 2569)
         ⚠️ **นี่คือการทดสอบที่แยกแยะได้จริง** — ค่าส่งของร้านเป็นขั้นบันได
            มีค่าที่เป็นไปได้แค่ 12 ค่า ถ้าสมมติฐาน "ส่วนต่าง = ค่าส่ง" ผิด
            ส่วนต่างจะกระจายเป็นเลขอะไรก็ได้ **ไม่ใช่ตกอยู่ใน 12 ค่านี้พอดี**
            ⇒ ต่างจากการเดาสูตรแล้วประกาศว่าไม่ตรง ซึ่งพิสูจน์อะไรไม่ได้เลย
         ⚠️ อ่านตารางจาก `shipping.mjs` ตัวจริง **ห้ามพิมพ์เลข 12 ตัวซ้ำที่นี่**
            (ร้านแก้ค่าส่งเมื่อไหร่ ตัวตรวจต้องขยับตาม ไม่ใช่ค้างอยู่กับเลขเก่า) */
      const { SHIPPING_TIERS } = await import("../lib/shipping.mjs");
      const FEES = [...new Set(SHIPPING_TIERS.map((t) => t.fee))];
      const feeList = FEES.join(",");
      const [ship] = await coreQuery(
        `SELECT COUNT(*) AS higher,
                SUM(CASE WHEN ROUND(o.amount - li.s, 2) IN (${feeList}) THEN 1 ELSE 0 END) AS isTier
         FROM orders o
         JOIN (SELECT order_id, SUM(amount) AS s FROM order_items GROUP BY order_id) li
           ON li.order_id = o.id
         WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL}
           AND o.amount > li.s`,
        [from, today]
      );
      /* ⚠️ **ส่วนต่างเดียวกันอาจมาจากคนละสาเหตุ ถ้าอยู่คนละช่องทาง**
          29 บนออเดอร์ Shopee = ค่าธรรมเนียมมาร์เก็ตเพลส
          29 บนออเดอร์เว็บ COD = ค่าธรรมเนียมปลายทาง — คนละเรื่องกันสิ้นเชิง
          ⇒ ต้องแยกตามช่องทางก่อน ไม่งั้นจะสรุปสาเหตุเดียวให้ของที่มีหลายสาเหตุ */
      const gapByChannel = await coreQuery(
        `SELECT ROUND(o.amount - li.s, 2) AS gap,
                COALESCE(NULLIF(o.channel,''),'(ไม่ระบุ)') AS ch,
                o.is_cod AS cod,
                COUNT(*) AS n
         FROM orders o
         JOIN (SELECT order_id, SUM(amount) AS s FROM order_items GROUP BY order_id) li
           ON li.order_id = o.id
         WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL}
           AND o.amount > li.s
         GROUP BY 1,2,3 ORDER BY n DESC LIMIT 40`,
        [from, today]
      );
      /* ── ทดสอบสมมติฐาน "ค่าส่งจริงของพัสดุเก็บเงินปลายทาง" ── (ฝั่งจอเสนอ 5 ก.ย. 2569)
          ถ้าใบที่ส่วนต่าง **ไม่ตรงขั้น** เป็น COD เกือบทั้งหมด
          และใบที่ส่วนต่าง **ตรงขั้น** เป็น COD น้อยกว่ามาก ⇒ ยืนยันสมมติฐาน
          ถ้าไม่แยกกันชัด ⇒ สมมติฐานยังไม่พอ ต้องถามเจ้าของร้านจริง ๆ
          ⚠️ **นี่คือการทดสอบที่แยกแยะได้** — ถ้าสมมติฐานผิด สัดส่วน COD จะใกล้เคียงกันทั้งสองกอง */
      const codSplit = await coreQuery(
        `SELECT COALESCE(NULLIF(o.channel,''),'(ไม่ระบุ)') AS ch,
                CASE WHEN ROUND(o.amount - li.s, 2) IN (${feeList}) THEN 1 ELSE 0 END AS tierMatch,
                SUM(CASE WHEN COALESCE(o.is_cod,0) = 1 THEN 1 ELSE 0 END) AS cod,
                SUM(CASE WHEN COALESCE(o.is_cod,0) = 0 THEN 1 ELSE 0 END) AS notCod,
                COUNT(*) AS n
         FROM orders o
         JOIN (SELECT order_id, SUM(amount) AS s FROM order_items GROUP BY order_id) li
           ON li.order_id = o.id
         WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL}
           AND o.amount > li.s
         GROUP BY 1,2 ORDER BY n DESC`,
        [from, today]
      );
      const gapTop = await coreQuery(
        `SELECT ROUND(o.amount - li.s, 2) AS gap, COUNT(*) AS n
         FROM orders o
         JOIN (SELECT order_id, SUM(amount) AS s FROM order_items GROUP BY order_id) li
           ON li.order_id = o.id
         WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL}
           AND o.amount > li.s
         GROUP BY 1 ORDER BY n DESC LIMIT 25`,
        [from, today]
      );

      /* ── บรรทัดที่ราคาเป็น 0 ── ด่านที่สามของสะพาน PEAK
         ⚠️ **ใบกำกับที่มีรายการราคา 0 ออกไม่ได้** และเป็นของที่ตัวตรวจอื่นมองไม่เห็น
            เพราะใบมีบรรทัดครบ (ด่าน 1 ผ่าน) และยอดหัวใบก็ปกติ
         ⚠️ ต้องแยก "ทั้งใบเป็น 0" ออกจาก "บางบรรทัดเป็น 0" — คนละอาการ
            ทั้งใบ 0 = ราคาหลุดตั้งแต่ตะกร้า · บางบรรทัด 0 = ของแถม/ของแลก ซึ่งอาจตั้งใจ */
      const zero = await coreQuery(
        `SELECT o.source AS src,
                COUNT(DISTINCT o.id) AS ordersWithZeroLine,
                SUM(CASE WHEN li.s = 0 THEN 1 ELSE 0 END) AS allZeroOrders
         FROM orders o
         JOIN (SELECT order_id, SUM(amount) AS s FROM order_items GROUP BY order_id) li
           ON li.order_id = o.id
         WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL} AND o.amount > 0
           AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND COALESCE(i.amount,0) = 0)
         GROUP BY 1`,
        [from, today]
      );
      const zeroSample = await coreQuery(
        `SELECT o.source AS src, o.number AS number, o.order_date AS day, o.channel AS channel,
                o.amount AS header, i.sku AS sku, i.name AS name, i.qty AS qty
         FROM orders o
         JOIN order_items i ON i.order_id = o.id
         WHERE o.order_date >= ? AND o.order_date <= ? AND ${CANCEL} AND o.amount > 0
           AND COALESCE(i.amount,0) = 0
         ORDER BY o.order_date DESC LIMIT 25`,
        [from, today]
      );

      const num2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      return json({
        ok: true,
        from,
        to: today,
        days,
        /* ⚠️ บรรทัดราคา 0 — ตัวตรวจอื่นมองไม่เห็น เพราะใบมีบรรทัดครบและยอดหัวใบปกติ */
        zeroPriceLines: zero.map((z) => ({
          store: z.src,
          ordersWithZeroLine: num2(z.ordersWithZeroLine),
          allLinesZero: num2(z.allZeroOrders), // ทั้งใบเป็น 0 — หนักกว่า
        })),
        zeroPriceSample: zeroSample,
        /* ค่าส่งอธิบายส่วนต่างได้กี่ใบ — ถ้าเกือบทั้งหมด ปิดกอง "หัวใบมากกว่า" ได้เลย */
        shippingExplains: {
          headerHigher: num2(ship?.higher),
          matchesShippingTier: num2(ship?.isTier),
          tiers: FEES,
          percent: num2(ship?.higher)
            ? Math.round((num2(ship?.isTier) * 1000) / num2(ship?.higher)) / 10
            : 0,
          note:
            "ส่วนต่างที่ตรงกับค่าส่งขั้นบันไดพอดี ⇒ อธิบายได้ ไม่ต้องดูต่อ · " +
            "ที่เหลือคือของที่ต้องไล่ทีละใบ · ตารางค่าส่งอ่านจาก shipping.mjs ตัวจริง",
        },
        gapTop,
        gapByChannel,
        codSplit,
        /* ⚠️ ตัวเลขชุดนี้ **ยังไม่ใช่ "ผิด"** — เป็นการวัดว่ายอดหัวใบกับผลรวมบรรทัดต่างกันแค่ไหน
            ค่าส่งกับส่วนลดยังไม่ถูกนำมาคิด ⇒ ต่างกันเป็นเรื่องปกติ ต้องหาสูตรก่อน */
        lineVsHeader: gaps.map((g) => ({
          store: g.src,
          orders: num2(g.n),
          exactMatch: num2(g.exact),
          headerHigher: num2(g.headerHigher), // หัวใบมากกว่า — น่าจะเป็นค่าส่ง
          headerLower: num2(g.headerLower), // หัวใบน้อยกว่า — น่าจะเป็นส่วนลด
        })),
        lineVsHeaderSample: gapSample,
        lineVsHeaderNote:
          "**ยังไม่ใช่ตัวตรวจ เป็นการวัด** — ยังไม่รู้สูตรที่ ZORT ใช้ประกอบยอดหัวใบ " +
          "(ค่าส่ง · ส่วนลดท้ายบิล · ส่วนลดต่อชิ้น · VAT) ⇒ ห้ามอ่านว่า 'ไม่ตรง = ผิด'",
        byStore: rows.map((r) => ({
          store: r.src,
          storeName: r.src === "z2" ? "ceojet (ยังไม่เข้าภาษี)" : "ศีตกาล เทรดดิ้ง (เข้าภาษี)",
          total: num2(r.total),
          noItems: num2(r.noItems),
          noItemsAmount: Math.round(num2(r.noItemsAmount)),
          percent: num2(r.total) ? Math.round((num2(r.noItems) * 1000) / num2(r.total)) / 10 : 0,
        })),
        sample,
        note:
          "ใบที่ไม่มีบรรทัดสินค้า ⇒ ส่งเข้า PEAK แล้วจะได้ใบกำกับที่มีแต่ยอดรวม ไม่มีรายการ · " +
          "ต้องเป็น 0 ของร้าน z1 ก่อนเปิดสะพานภาษี",
      });
    }

    if (url.searchParams.get("peak")) {
      const mode = url.searchParams.get("peak");
      if (mode === "status") return json({ ok: true, peak: await peakStatus() });
      if (mode === "dry") {
        const day = url.searchParams.get("day") ||
          new Date(Date.now() + 7 * 3600 * 1000 - 86400 * 1000).toISOString().slice(0, 10);
        /* 🔴 **ต้องส่งเข้า PEAK เฉพาะร้าน z1 (ศีตกาล · gucut@icloud.com) เท่านั้น**
            เจ้าของร้านยืนยัน 4 ก.ย. 2569: **ร้านที่สอง (ceojet) ยังไม่ได้เอามาคิดภาษี**
            ⚠️ เดิมตรงนี้ดึงออเดอร์ของวันนั้น **ทั้งสองร้าน** ⇒ ถ้าเปิดส่งจริงเมื่อไหร่
               ยอดของ ceojet จะไหลเข้าบัญชีภาษีไปด้วยโดยไม่มีใครสังเกต
               นี่ไม่ใช่บั๊กบนจอ — เป็นการยื่นภาษีด้วยตัวเลขที่เจ้าของร้านไม่ได้ตั้งใจให้ยื่น
            ⚠️ **ห้ามถอดตัวกรองนี้** จนกว่าเจ้าของร้านจะสั่งเองว่าให้รวมร้านที่สองด้วย
               (การตัดสินใจว่า z2 เข้าภาษีเมื่อไหร่ เป็นเรื่องของเขากับผู้ทำบัญชี ไม่ใช่ของระบบ) */
        const TAX_STORE = "z1";
        const orders = await coreQuery(
          `SELECT id, number, channel, customer, order_date, amount FROM orders
           WHERE order_date = ? AND source = ?
             AND status NOT LIKE '%cancel%' AND status NOT LIKE '%void%'
             AND status NOT LIKE '%ยกเลิก%' LIMIT 200`,
          [day, TAX_STORE]
        );
        const items = await coreQuery(
          `SELECT oi.order_id, oi.sku, oi.name, oi.qty, oi.amount
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.order_date = ? AND o.source = ?`,
          [day, TAX_STORE]
        );
        const byOrder = new Map();
        for (const it of items) {
          if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
          byOrder.get(it.order_id).push(it);
        }
        const invoices = orders.map((o) => toInvoice(o, byOrder.get(o.id) ?? []));
        return json({
          ok: true,
          day,
          taxStore: TAX_STORE, // ⚠️ บอกขอบเขตเสมอ — เลขนี้นับเฉพาะร้านที่เข้าภาษี
          scopeNote: "เฉพาะร้าน ศีตกาล เทรดดิ้ง (gucut@icloud.com) — ร้าน ceojet ยังไม่ได้เอามาคิดภาษี",
          orders: orders.length,
          peak: await sendInvoices(invoices),
        });
      }
      return json({ error: "peak รับได้เฉพาะ status หรือ dry" }, 400);
    }
    if (url.searchParams.get("list") === "moves") {
      return json({
        ok: true,
        ...(await listMoves({
          sku: url.searchParams.get("sku") ?? "",
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
      });
    }
    if (url.searchParams.get("sync")) {
      const days = Math.min(60, Math.max(1, parseInt(url.searchParams.get("days") ?? "3", 10) || 3));
      // from/to ใช้ตอนเติมประวัติย้อนหลัง — ต้องไล่ทีละเดือน ห้ามขอทีเดียวยาว ๆ
      return json({
        ok: true,
        sync: await syncOrders(days, {
          // ?items=all บังคับเขียนบรรทัดใหม่ทุกใบในช่วง — ใช้ตอนแก้ตรรกะการแปลงบรรทัด
          items: url.searchParams.get("items") === "all" ? "all" : undefined,
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        }),
      });
    }
    if (url.searchParams.get("recon")) {
      return json({ ok: true, recon: await reconYesterday() });
    }
    if (url.searchParams.get("shopeesync")) {
      const days = Math.min(15, Math.max(1, parseInt(url.searchParams.get("days") ?? "3", 10) || 3));
      return json({ ok: true, shopee: await syncShopeeOrders(days) });
    }
    // เทียบสต็อกบน Shopee กับคลังเรา — อ่านอย่างเดียว ไม่เขียนกลับ Shopee
    /* เทียบรายการที่ลงขายบนแพลตฟอร์ม กับของที่มีในคลัง
       ⚠️ ต่างจาก stockcompare (เทียบ "จำนวน" กับ Shopee) — อันนี้เทียบ "ลงขายหรือยัง"
       ⚠️ ต่างจาก channelGaps (ดูจากประวัติการขาย) — อันนี้ดูจากรายการที่ลงขายอยู่จริง */
    /* ดูว่า ZORT ส่งฟิลด์อะไรมาบ้างสำหรับใบที่ยัง Pending — ตอบคำถามว่ากระจกกลืนอะไรทิ้งไหม
       ⚠️ **คืนเฉพาะ "ชื่อฟิลด์" กับค่าของฟิลด์ที่เกี่ยวกับสถานะเท่านั้น**
          ห้ามคืนชื่อ/เบอร์/ที่อยู่ลูกค้าออกมาเด็ดขาด แม้จะอยู่หลังรหัสหลังร้านก็ตาม
          (กติกาเดียวกับ core-contacts: ไม่มีทางดึงข้อมูลลูกค้าออกทั้งก้อน) */
    /* แยกกอง pending จาก **กระจกใน D1** (เร็ว ไม่ต้องยิง ZORT ทีละหน้า)
       ⚠️ ยิง ZORT ย้อนทั้งปีแล้วตอบ 502 ที่ 40 วินาที — ไล่หน้าไม่ทัน 26 วิของ Netlify
          แต่คำถามนี้ตอบได้จากของที่กระจกเก็บไว้แล้ว (status + pay_status) โดยไม่ต้องยิงออกนอก
       ⇒ ถ้าเลขออกมาใกล้การ์ด ZORT (ค้างชำระเงิน 24 · ค้างโอนสินค้า 132)
          แปลว่า **pay_status อย่างเดียวก็แยกสองกองนี้ได้** ไม่ต้องเก็บ integrationStatus เพิ่ม */
    /* เทียบกระจกกับ ZORT **สองทาง** — งานที่ค้างจาก 4 ก.ย. 2569
       ⚠️ **ทางเดียวไม่พอ** (ฝั่งจอทักไว้) — ถ้าหยิบเฉพาะใบที่กระจกมีไปถาม ZORT
          จะจับได้แค่ "สถานะค้างเก่า" แต่ **ใบที่ ZORT มีแล้วกระจกไม่เคยดึงมาเลย
          จะไม่โผล่ในรายการที่หยิบมาเทียบตั้งแต่แรก** ⇒ มองไม่เห็นทั้งใบ
          (เคสจริง: ใบโอนสินค้าหาย 581 ใบ เมื่อ 3 ก.ย. เพราะใช้เลขที่ใบเป็นกุญแจ)
       ⚠️ **คืนเฉพาะเลขที่ใบกับสถานะ ห้ามคืนชื่อ/เบอร์/ที่อยู่ลูกค้า** */
    if (url.searchParams.get("ordercheck")) {
      /* ⚠️ **รหัส ZORT กับตัวกรอง source ต้องมาจากตัวแปรตัวเดียวกัน**
          เดิมเขียนแยกกัน (env ของร้าน 1 · WHERE source='z1' คนละที่)
          ถ้าวันไหนแก้ที่หนึ่งลืมอีกที่ = ยิงถาม ZORT ร้าน A แล้วเทียบกับกระจกร้าน B
          ⇒ "ไม่ตรงกันทั้งหมด" ทั้งที่ข้อมูลอาจถูกทุกใบ (เจอมาแล้วตอนเทียบผิดคีย์) */
      const store = url.searchParams.get("store") === "z2" ? "z2" : "z1";
      const st =
        store === "z2"
          ? {
              storename: process.env.ZORT_STORENAME_2,
              apikey: process.env.ZORT_APIKEY_2,
              apisecret: process.env.ZORT_APISECRET_2,
            }
          : {
              storename: process.env.ZORT_STORENAME,
              apikey: process.env.ZORT_APIKEY,
              apisecret: process.env.ZORT_APISECRET,
            };
      if (!st.storename)
        return json({ error: `ยังไม่ได้ตั้งรหัส ZORT ของร้าน ${store}` }, 503);
      /* รับ from/to ตรง ๆ ด้วย — ต้องตรวจช่วงเก่า ๆ ได้ ไม่ใช่แค่ "ย้อน N วันจากวันนี้"
         ⚠️ ขอทีเดียวยาว ๆ จะเกิน 26 วินาที ⇒ ไล่ทีละเดือนเอง (กติกาเดียวกับ sync) */
      const ymd = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
      const back = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") ?? "14", 10) || 14));
      const from =
        ymd(url.searchParams.get("from")) ||
        new Date(Date.now() + 7 * 3600e3 - back * 864e5).toISOString().slice(0, 10);
      const to =
        ymd(url.searchParams.get("to")) ||
        new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

      const zort = new Map();
      let truncated = false;
      for (let page = 1; page <= 10; page++) {
        const r = await fetch(
          `https://open-api.zortout.com/v4/Order/GetOrders?orderdateafter=${from}&orderdatebefore=${to}&limit=200&page=${page}`,
          { headers: st, signal: AbortSignal.timeout(15000) }
        );
        const d = await r.json().catch(() => ({}));
        const chunk = Array.isArray(d.list) ? d.list : [];
        /* ⚠️ **กุญแจต้องเป็น `number` ไม่ใช่ `id` ของ ZORT** — รอบแรกผมใช้ `o.id`
            แล้วได้ผลว่า "ไม่ตรงกันทั้ง 768 ใบ" ซึ่งดูเหมือนหายนะ แต่ความจริงคือ
            **กระจกเก็บกุญแจเป็น `<ร้าน>/<เลขที่ใบ>` ไม่เคยเก็บ id ของ ZORT เลย**
            ⇒ เทียบคนละกุญแจ = ไม่ตรงกัน 100% โดยที่ข้อมูลอาจตรงกันทุกใบ
            **ผลที่ผิดแบบสุดขั้ว (0% หรือ 100%) มักแปลว่าเทียบผิดคีย์ ไม่ใช่ข้อมูลพัง** */
        for (const o of chunk) {
          zort.set(String(o.number ?? ""), {
            number: String(o.number ?? ""),
            status: String(o.status ?? ""),
            pay: String(o.paymentstatus ?? ""),
            // ⚠️ คอลัมน์ที่เพิ่งเพิ่มต้องเข้ามาอยู่ในตัวเทียบด้วย ไม่งั้นกระจกเพี้ยนได้เงียบ ๆ
            //    ตลอดไป — ตัวเทียบที่ไม่ครอบคลุมคอลัมน์ใหม่ = ตาข่ายที่หยุดอัปเดต
            integ: String(o.integrationStatus ?? ""),
          });
        }
        if (chunk.length < 200) break;
        if (page === 10) truncated = true;
      }

      const { coreQuery } = await import("../lib/coredb.mjs");
      /* ⚠️ **ต้องกรองเฉพาะร้านที่ยิงถามด้วย** — กระจกเก็บสองร้าน (z1 ศีตกาล · z2 ceojet)
          ไม่กรอง = ใบของอีกร้านโผล่มาเป็น "กระจกมี แต่ ZORT ไม่มี" ทั้งกอง */
      const mine = await coreQuery(
        `SELECT number, status, COALESCE(pay_status,'') AS pay,
                COALESCE(integration_status,'') AS integ FROM orders
         WHERE source = ? AND order_date >= ? AND order_date <= ?`,
        [store, from, to]
      );
      const mirror = new Map(mine.map((r) => [String(r.number), r]));

      const missingInMirror = []; // ZORT มี · กระจกไม่มี  ← ทางที่ 2 จับได้ทางเดียว
      const staleStatus = []; // มีทั้งคู่ · สถานะไม่ตรง
      const stalePay = []; // มีทั้งคู่ · สถานะจ่ายเงินไม่ตรง
      const staleInteg = []; // มีทั้งคู่ · สถานะฝั่งมาร์เก็ตเพลสไม่ตรง
      for (const [key, z] of zort) {
        const m = mirror.get(key);
        if (!m) {
          missingInMirror.push({ number: z.number, zortStatus: z.status });
          continue;
        }
        if (String(m.status) !== z.status) {
          staleStatus.push({ number: z.number, mirror: String(m.status), zort: z.status });
        }
        if (String(m.pay) !== z.pay) {
          stalePay.push({ number: z.number, mirror: String(m.pay) || "(ว่าง)", zort: z.pay || "(ว่าง)" });
        }
        if (String(m.integ ?? "") !== z.integ) {
          staleInteg.push({
            number: z.number,
            mirror: String(m.integ ?? "") || "(ว่าง)",
            zort: z.integ || "(ว่าง)",
          });
        }
      }
      const extraInMirror = mine
        .filter((r) => !zort.has(String(r.number)))
        .map((r) => ({ number: String(r.number), mirrorStatus: String(r.status) }));

      return json({
        ok: true,
        // ⚠️ ต้องบอกว่าตรวจร้านไหน ไม่งั้นผลของสองร้านหน้าตาเหมือนกันเป๊ะ แยกไม่ออก
        store,
        storeName: store === "z2" ? "ceojet (หน้าร้าน POS)" : "ศีตกาล เทรดดิ้ง (ตัวที่คิดภาษี)",
        window: { from, to, days: back },
        truncated, // ⚠️ ชนเพดานหน้า = ตัวเลขไม่ครบ ห้ามเงียบ
        counts: {
          zortOrders: zort.size,
          mirrorOrders: mine.length,
          missingInMirror: missingInMirror.length,
          staleStatus: staleStatus.length,
          stalePay: stalePay.length,
          staleInteg: staleInteg.length,
          extraInMirror: extraInMirror.length,
        },
        sample: {
          missingInMirror: missingInMirror.slice(0, 15),
          staleStatus: staleStatus.slice(0, 15),
          stalePay: stalePay.slice(0, 15),
          staleInteg: staleInteg.slice(0, 15),
          extraInMirror: extraInMirror.slice(0, 15),
        },
        note:
          "เทียบสองทาง: ZORT→กระจก (missingInMirror = ใบหายทั้งใบ) และ " +
          "กระจก↔ZORT (staleStatus/stalePay = มีใบแต่ค่าเก่า) · " +
          "ไม่เจออะไรในช่วงนี้ ไม่ได้แปลว่ากระจกดี ต้องขยายช่วงวันและอธิบายส่วนต่างให้ได้",
      });
    }

    /* ไขว้ช่องทาง × integration_status ทั้งตาราง — ตอบว่าช่องว่างเป็น "ไม่มีวันมีค่า"
       หรือ "backfill หาย" (ฝั่งจอไขว้ 845 ใบล่าสุดแล้วพบว่าแถวมาร์เก็ตเพลสไม่ว่างเลย
       แต่ยิงได้ทีละ 200 ⇒ ต้องดูทั้ง 12,175 ใบถึงจะสรุปได้)
       ⚠️ **แถวมาร์เก็ตเพลสที่ว่าง = backfill หายจริง ต้องกวาด**
          แถว POS/แชท/เว็บเราที่ว่าง = ปกติ ไม่มีแพลตฟอร์มไหนเป็นคนบอกสถานะ */
    /* ── ใบที่ integration_status ว่าง อยู่ตรงไหนกันแน่ ── (4 ก.ย. 2569)
       ⚠️ **สร้างขึ้นเพราะการไล่ทีละเดือนให้คำตอบที่ไม่ลงตัว** — รวมทั้งปีได้ 617 ใบ
          แต่ไล่ทีละเดือนแล้วบวกกันได้ 560 ⇒ ขาดไป 57 ใบที่ไม่มีเดือนไหนรับ
          และเลขของเดือนเดียวกันยังพลิกฝั่งเองระหว่างสองรอบที่ห่างกันไม่ถึงชั่วโมง
          ⇒ **ห้ามตอบด้วยการไล่ถามทีละช่วงอีก** ต้องนับทั้งตารางในคำสั่งเดียว
             ไม่งั้นเศษที่ตกหล่นจะไม่มีใครเห็น (กติกา mirror-needs-outside-check)

       ⚠️ **ตัวนี้ไม่แตะ chanMap เลยโดยตั้งใจ** — เกณฑ์ ≥5 ใบ/≥1% คิดจากทั้งตาราง
          ทุกครั้งที่เรียก ช่องทางที่อยู่ริมเส้นจึงพลิกไปมาได้เอง
          ที่นี่คืน **ตัวเลขดิบ** (ว่างกี่ใบ · มีค่ากี่ใบ) ให้คนตัดสินเอง
          ป้ายที่พลิกได้เองแย่กว่าไม่มีป้าย */
    /* ── ไล่ว่าการ์ดหน้าแรกของ ZORT นับจากอะไร ── (4 ก.ย. 2569)
       การ์ดจริงบอก: ค้างชำระเงิน **24** · ค้างโอนสินค้า **132** (รวม 156)
       กระจกเราเคยนับ "ใบที่ยังไม่จบ" ได้ **193** ⇒ ต่างกัน 37 ใบ
       พิสูจน์แล้วว่า**ไม่ได้เกิดจากกระจกเพี้ยน** (ordercheck ตรงทุกช่อง 12 เดือน)
       ⇒ เหลือทางเดียว: **นิยามของการ์ดไม่ใช่ "status ยังไม่ success"**

       ⚠️ **ห้ามเดาแล้วเอาไปใช้** — ตัวนี้คำนวณ "นิยามที่เป็นไปได้" หลายแบบพร้อมกัน
          แล้วให้คนดูว่าอันไหนตรงกับ 24/132 · อันไหนไม่ตรงก็ตัดทิ้งได้ทันที
          ทดสอบแบบนี้ถึงจะแยกแยะได้ (test-must-discriminate)
       ⚠️ อ่านจากกระจกอย่างเดียว ไม่ยิง ZORT — เร็ว และไม่กินโควตา */
    /* ── งานค้างจริง vs ใบผี ── (4 ก.ย. 2569)
       ร้านศีตกาลมีใบ "ยังไม่จบ" 195 ใบ แต่ **171 ใบเป็นใบที่ลูกค้าไม่เคยจ่าย
       จากช่องทางที่ปิดไปแล้ว** (Shopify ปิดถาวร 28 ส.ค. 2569) ⇒ ไม่มีวันมีใครมาจ่าย
       ปล่อยรวมไว้ = ตัวเลข "งานค้าง" บวมเกินจริง 8 เท่า แล้วคนเลิกดู

       ⚠️ **ห้ามตัดสินจากชื่อช่องทาง** (no-substring-classification) — ชื่อคนตั้งเอง
          เปลี่ยนได้ สะกดได้หลายแบบ และร้านอื่นที่เอา repo นี้ไป clone ไม่มีคำว่า Shopify
          ⇒ ตัดสินจาก **ข้อมูล**: ช่องทางนั้นมีใบใหม่ล่าสุดเมื่อไหร่ (ช่องทางที่เงียบ = ปิดแล้ว)
             และใบนั้นเองอายุเท่าไหร่

       ⚠️ **ไม่ซ่อนอะไรทั้งนั้น** — คืนทุกกองพร้อมเหตุผล ให้จอเลือกเองว่าจะโชว์อะไร
          การเงียบ ๆ ตัดใบออกจากตัวนับ คือวิธีที่ทำให้ยอดขายหายโดยไม่มีใครรู้ */
    /* สั่งต่ออายุ token เดี๋ยวนั้น — ตัวจริงวิ่งวันละครั้งที่ token-refresh.mjs
       ⚠️ ต้องมีทางสั่งเอง ไม่งั้นทดสอบไม่ได้เลยจนกว่าจะถึงตี 3 ครึ่ง
          และงานตามเวลาที่ทดสอบไม่ได้ = งานที่ไม่มีใครรู้ว่าพังตั้งแต่เมื่อไหร่ */
    if (url.searchParams.get("tokens")) {
      const { refreshAllTokens } = await import("./token-refresh.mjs");
      return json({ ok: true, tokens: await refreshAllTokens() });
    }

    /* ── ยอดขายรายเดือน ── (5 ก.ย. 2569)
       ⚠️ **สร้างเพราะจอการเงินโหลดไม่จบสักที** — ยิงของจริงแล้วพบว่ามันดึงออเดอร์
          **ทั้ง 180 วันมาทีละ 200 ใบ เรียงกันไปเรื่อย ๆ** (~3,300 ใบ = 17 รอบ)
          เพื่อเอามาบวกเป็น "ยอดขายรายเดือน" ซึ่งเป็นงานที่ SQL ทำได้ในคำสั่งเดียว
          ผลคือหน้าค้างที่ "กำลังโหลด..." เกิน 30 วินาที และกิน D1 ฟรี ๆ 17 เท่า

       ⚠️ **นี่คือคลาสเดียวกับกฎที่ตกลงกันไว้แล้ว** — ค่าที่ต้องเห็นข้อมูลทั้งชุด
          ต้องคิดที่ท่อ ห้ามให้จอดึงแถวมานับเอง (computed-now-goes-stale ด้านกลับ)
          จอที่ดึงมานับเองไม่ได้แค่ช้า มันยัง **เงียบ ๆ ตกหล่น** เมื่อชนเพดานหน้าด้วย */
    /* ── สรุปรายวัน / รายลูกค้า ── (5 ก.ย. 2569)
       ⚠️ ทำเพราะฝั่งจอไล่ตามเบาะแส "จอไหนมี while คู่กับ offset ให้สงสัยไว้ก่อน"
          แล้วเจออีก 2 จอที่ดึงแถวมานับเองในเบราว์เซอร์ (รายงานลูกค้า · ยอดขาย)
          สองจอนี้โหลดจบ **แต่จะเริ่มตกหล่นเงียบ ๆ ตอนข้อมูลโตเกินเพดานหน้า**
          ⇒ แก้ตอนที่ยังไม่พัง ดีกว่ารอให้พังแล้วค่อยรู้

       ⚠️ ทั้งสองตัวใช้ตัวกรองชุดเดียวกับจอรายการขาย (ตัดใบยกเลิก) และบอกขอบเขตร้านกลับไป
          ไม่งั้นตัวเลขคนละจอไม่ตรงกัน แล้วจะเถียงกันไม่จบว่าใครถูก */
    if (url.searchParams.get("daily") || url.searchParams.get("bycustomer")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      const store = ["z1", "z2"].includes(url.searchParams.get("store"))
        ? url.searchParams.get("store")
        : null;
      const days = Math.max(1, Math.min(400, parseInt(url.searchParams.get("days") ?? "90", 10) || 90));
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const from = new Date(Date.now() + 7 * 3600e3 - days * 864e5).toISOString().slice(0, 10);
      const CANCEL = `status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`;
      const where = [`order_date >= ?`, `order_date <= ?`, CANCEL];
      const params = [from, today];
      if (store) {
        where.push("source = ?");
        params.push(store);
      }
      const w = where.join(" AND ");
      const num2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const scope = {
        store: store || "ทั้ง 2 ร้าน",
        from,
        to: today,
        days,
        excludes: "ตัดใบยกเลิกออกแล้ว (เงื่อนไขเดียวกับจอรายการขาย)",
      };

      if (url.searchParams.get("daily")) {
        const rows = await coreQuery(
          `SELECT order_date AS day, COUNT(*) AS orders, SUM(amount) AS sales
           FROM orders WHERE ${w} GROUP BY 1 ORDER BY 1 DESC`,
          params
        );
        return json({
          ok: true,
          ...scope,
          days: rows.map((r) => ({ day: r.day, orders: num2(r.orders), sales: num2(r.sales) })),
          totalOrders: rows.reduce((a, r) => a + num2(r.orders), 0),
          totalSales: rows.reduce((a, r) => a + num2(r.sales), 0),
          /* ⚠️ **วันที่ไม่มีออเดอร์จะไม่มีแถว** — กราฟต้องเติมวันว่างเอง
              ไม่งั้นเส้นจะลากข้ามวันที่ขายไม่ได้ แล้วดูเหมือนขายได้ทุกวัน */
          note: "วันที่ไม่มีออเดอร์จะไม่มีแถวคืนมา ⇒ ฝั่งกราฟต้องเติมวันว่างเป็น 0 เอง",
        });
      }

      /* รายลูกค้า — ⚠️ **ชื่อว่างต้องแยกออกมา ห้ามยุบรวมเป็นคนเดียว**
          ออเดอร์ POS ส่วนใหญ่ไม่มีชื่อลูกค้า ถ้าปล่อยให้ GROUP BY รวมกันหมด
          จะได้ "ลูกค้าอันดับ 1" ที่ซื้อ 800 ใบ ซึ่งไม่ใช่คน แต่เป็นกองของคนที่ไม่ได้ระบุชื่อ */
      const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100));
      const rows = await coreQuery(
        `SELECT COALESCE(NULLIF(TRIM(customer),''),'') AS name,
                COUNT(*) AS orders, SUM(amount) AS sales, MAX(order_date) AS lastDay
         FROM orders WHERE ${w} GROUP BY 1 ORDER BY sales DESC LIMIT ${limit + 1}`,
        params
      );
      const named = rows.filter((r) => String(r.name || "") !== "").slice(0, limit);
      const blank = rows.find((r) => String(r.name || "") === "");
      const [tot] = await coreQuery(
        `SELECT COUNT(*) AS orders, SUM(amount) AS sales,
                COUNT(DISTINCT COALESCE(NULLIF(TRIM(customer),''),'(ไม่ระบุ)')) AS names
         FROM orders WHERE ${w}`,
        params
      );
      /* ช่องทางที่ลูกค้าแต่ละคนซื้อ — ฝั่งจอขอ 5 ก.ย. 2569
          ⚠️ **ห้ามใช้ GROUP_CONCAT แล้วให้จอ split ด้วยลูกน้ำ** — ชื่อช่องทางคนตั้งเอง
             วันไหนมีลูกน้ำในชื่อ ("Drop-off: X, Delivery: Y" ก็เคยมีในคอลัมน์ขนส่ง)
             จอจะแตกชื่อเดียวเป็นสองช่องทางแบบเงียบ ๆ
             ⇒ จัดกลุ่ม (ลูกค้า × ช่องทาง) ที่ฐาน แล้วประกอบเป็นอาร์เรย์ฝั่งนี้ ไม่มีตัวคั่นให้พลาด
          ⚠️ ดึงเฉพาะชื่อที่จะส่งกลับจริง ไม่ใช่ทั้ง 1,036 ชื่อ */
      /* ⚠️ **ห้ามยัดรายชื่อเข้า IN (?,?,?…) ตามจำนวน limit** — พังจริงแล้ว 5 ก.ย. 2569
          limit=500 ⇒ ผูกตัวแปร 500 ตัว ⇒ D1 ตอบ
          `too many SQL variables at offset 530: SQLITE_ERROR` แล้วจอขึ้นแดงทั้งหน้า
          (ขึ้นจริงภายใน 4 นาทีหลัง deploy — เจอเพราะถ่ายจอทันที ไม่ได้เชื่อว่าผ่าน)
          **จำนวนตัวแปรที่ผูกได้มีเพดาน และเพดานนั้นไม่โผล่ตอนทดสอบด้วย limit น้อย ๆ**
          ⇒ จัดกลุ่มทั้งช่วงในคำสั่งเดียว (ไม่มี IN) แล้วค่อยกรองด้วยชื่อฝั่งนี้
             จำนวนแถวถูกจำกัดด้วย distinct(ลูกค้า × ช่องทาง) ในช่วงอยู่แล้ว */
      const wantNames = new Set(named.map((r) => String(r.name)));
      const chMap = new Map();
      if (wantNames.size) {
        const chRows = await coreQuery(
          `SELECT TRIM(customer) AS name,
                  COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
                  COUNT(*) AS c
           FROM orders WHERE ${w} AND TRIM(COALESCE(customer,'')) <> ''
           GROUP BY 1,2 ORDER BY c DESC`,
          params
        );
        for (const r of chRows) {
          const k = String(r.name);
          if (!wantNames.has(k)) continue;
          if (!chMap.has(k)) chMap.set(k, []);
          chMap.get(k).push({ channel: String(r.ch), orders: num2(r.c) });
        }
      }

      return json({
        ok: true,
        ...scope,
        customers: named.map((r) => ({
          name: r.name,
          orders: num2(r.orders),
          sales: num2(r.sales),
          lastDay: r.lastDay,
          // เรียงจากช่องทางที่ซื้อบ่อยสุด · คนเดียวซื้อหลายช่องทางได้ ⇒ เป็นอาร์เรย์เสมอ
          channels: chMap.get(String(r.name)) || [],
        })),
        // ⚠️ กองไม่ระบุชื่อแยกไว้ต่างหาก **ห้ามเอาไปวางปนในตารางอันดับ**
        unnamed: blank
          ? { orders: num2(blank.orders), sales: num2(blank.sales), lastDay: blank.lastDay }
          : null,
        totalOrders: num2(tot?.orders),
        totalSales: num2(tot?.sales),
        distinctNames: num2(tot?.names),
        truncated: named.length >= limit,
        note:
          "customers = เฉพาะใบที่มีชื่อลูกค้า เรียงตามยอด · " +
          "unnamed = ใบที่ไม่ได้ระบุชื่อ (ส่วนใหญ่คือ POS) **แยกไว้ ห้ามนับเป็นลูกค้าคนเดียว** · " +
          "truncated = ยังมีชื่ออื่นอีกนอกเหนือจาก limit " +
          "(**ยอดของแต่ละรายที่ส่งมาถูกต้องครบ** ไม่ใช่ตัวเลขไม่ครบ) · " +
          "channels = ช่องทางที่คนนั้นซื้อ เรียงตามจำนวนใบ · คนเดียวมีได้หลายช่องทาง",
      });
    }

    if (url.searchParams.get("monthly")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      const store = ["z1", "z2"].includes(url.searchParams.get("store"))
        ? url.searchParams.get("store")
        : null;
      const months = Math.max(1, Math.min(36, parseInt(url.searchParams.get("months") ?? "6", 10) || 6));
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const from = new Date(Date.now() + 7 * 3600e3 - months * 31 * 864e5)
        .toISOString()
        .slice(0, 10);
      // ⚠️ ต้องตัดใบยกเลิกออกให้ตรงกับจออื่น ไม่งั้นยอดรายเดือนไม่ตรงกับหน้ารายการขาย
      const CANCEL = `status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`;
      const where = [`order_date >= ?`, `order_date <= ?`, CANCEL];
      const params = [from, today];
      if (store) {
        where.push("source = ?");
        params.push(store);
      }
      const rows = await coreQuery(
        `SELECT substr(order_date,1,7) AS ym, COUNT(*) AS orders, SUM(amount) AS sales
         FROM orders WHERE ${where.join(" AND ")} GROUP BY 1 ORDER BY 1 DESC`,
        params
      );
      const num2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      return json({
        ok: true,
        store: store || "ทั้ง 2 ร้าน",
        from,
        to: today,
        months: rows.map((r) => ({ ym: r.ym, orders: num2(r.orders), sales: num2(r.sales) })),
        totalOrders: rows.reduce((a, r) => a + num2(r.orders), 0),
        totalSales: rows.reduce((a, r) => a + num2(r.sales), 0),
        note:
          "นับที่ฐานทั้งช่วง ไม่ตัดหน้า ⇒ ไม่มีทางตกหล่น · ตัดใบยกเลิกออกแล้ว " +
          "ให้ตรงกับจอรายการขาย · ไม่ระบุ store = รวมสองร้าน",
      });
    }

    if (url.searchParams.get("pending")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      const store = url.searchParams.get("store") === "z2" ? "z2" : "z1";
      const dormantDays = Math.max(
        7,
        Math.min(365, parseInt(url.searchParams.get("dormant") ?? "30", 10) || 30)
      );
      const NOTDONE = `status NOT LIKE '%Success%' AND status NOT LIKE '%สำเร็จ%'`;
      const NOTCANCEL = `status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`;
      const notPaid = `COALESCE(pay_status,'') NOT LIKE '%Paid%'`;
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const cut = new Date(Date.now() + 7 * 3600e3 - dormantDays * 864e5)
        .toISOString()
        .slice(0, 10);

      // ช่องทางไหน "ยังมีชีวิต" — ดูจากใบล่าสุดของช่องทางนั้น ไม่ใช่จากชื่อ
      const chans = await coreQuery(
        `SELECT COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
                MAX(order_date) AS lastOrder, COUNT(*) AS orders
         FROM orders WHERE source = ? GROUP BY 1`,
        [store]
      );
      const alive = new Map(chans.map((c) => [String(c.ch), String(c.lastOrder ?? "") >= cut]));

      const rows = await coreQuery(
        `SELECT number, COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch, order_date, amount,
                status, COALESCE(pay_status,'') AS pay, COALESCE(tracking_no,'') AS track
         FROM orders
         WHERE source = ? AND ${NOTDONE} AND ${NOTCANCEL}
         ORDER BY order_date DESC`,
        [store]
      );

      const buckets = { ต้องส่งของ: [], รอจ่ายอยู่: [], ใบผี: [] };
      for (const r of rows) {
        const unpaid = !/paid/i.test(String(r.pay));
        const chAlive = alive.get(String(r.ch)) !== false;
        const item = {
          number: r.number, channel: r.ch, day: r.order_date,
          amount: r.amount, status: r.status, pay: r.pay || "(ว่าง)",
          channelLastOrder: chans.find((c) => String(c.ch) === String(r.ch))?.lastOrder ?? null,
        };
        if (!unpaid) buckets["ต้องส่งของ"].push(item);
        else if (chAlive) buckets["รอจ่ายอยู่"].push(item);
        else buckets["ใบผี"].push(item);
      }

      const money = (a) => Math.round(a.reduce((s, x) => s + (Number(x.amount) || 0), 0));
      return json({
        ok: true,
        store,
        today,
        dormantDays,
        dormantCutoff: cut,
        เกณฑ์:
          `ช่องทางที่ไม่มีใบใหม่ตั้งแต่ ${cut} ถือว่า "เงียบ" (ปิดไปแล้ว) — ` +
          `ตัดสินจากวันที่ของใบล่าสุด ไม่ใช่จากชื่อช่องทาง`,
        counts: {
          ต้องส่งของ: buckets["ต้องส่งของ"].length,
          รอจ่ายอยู่: buckets["รอจ่ายอยู่"].length,
          ใบผี: buckets["ใบผี"].length,
          รวม: rows.length,
        },
        amounts: {
          ต้องส่งของ: money(buckets["ต้องส่งของ"]),
          รอจ่ายอยู่: money(buckets["รอจ่ายอยู่"]),
          ใบผี: money(buckets["ใบผี"]),
        },
        channels: chans
          .map((c) => ({ ...c, alive: alive.get(String(c.ch)) }))
          .sort((a, b) => String(b.lastOrder).localeCompare(String(a.lastOrder))),
        ต้องส่งของ: buckets["ต้องส่งของ"],
        รอจ่ายอยู่: buckets["รอจ่ายอยู่"].slice(0, 50),
        ใบผี: buckets["ใบผี"].slice(0, 50),
        note:
          "ต้องส่งของ = จ่ายแล้วแต่ใบยังไม่จบ ⇒ งานจริงของร้าน · " +
          "รอจ่ายอยู่ = ยังไม่จ่าย แต่ช่องทางยังขายอยู่ ⇒ ยังมีโอกาสได้เงิน · " +
          "ใบผี = ยังไม่จ่าย และช่องทางเงียบไปแล้ว ⇒ ไม่มีวันได้เงิน " +
          "**ยังไม่ได้ลบหรือยกเลิกอะไรทั้งนั้น แค่แยกกองให้เห็น**",
      });
    }

    if (url.searchParams.get("cardguess")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      const store = url.searchParams.get("store") === "z2" ? "z2" : "z1";
      const NOTDONE = `status NOT LIKE '%Success%' AND status NOT LIKE '%สำเร็จ%'`;
      const NOTCANCEL = `status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`;
      const noTrack = `COALESCE(tracking_no,'') = ''`;
      const noShipDate = `COALESCE(ship_date,'') = ''`;
      const notPaid = `COALESCE(pay_status,'') NOT LIKE '%Paid%'`;

      /* ⚠️ **การ์ดอาจไม่ได้นับทั้งประวัติ** — ZORT โชว์ "งานค้างที่ต้องทำ" ซึ่งมักตัดของเก่าทิ้ง
          ⇒ นับซ้ำหลายช่วงเวลาด้วย ถ้าเลขไปตรงที่ช่วงใดช่วงหนึ่ง = การ์ดมีขอบเขตเวลา
             ไม่ใช่นับทั้งตาราง (numbers-need-scope — แหล่งของเลขไม่ใช่ขอบเขตของเลข) */
      const [r] = await coreQuery(
        `SELECT
           COUNT(*) AS ordersAll,
           SUM(CASE WHEN ${NOTDONE} AND ${NOTCANCEL} THEN 1 ELSE 0 END) AS notDone,
           SUM(CASE WHEN ${NOTDONE} AND ${NOTCANCEL} AND ${notPaid} THEN 1 ELSE 0 END) AS notDoneUnpaid,
           SUM(CASE WHEN ${NOTDONE} AND ${NOTCANCEL} AND NOT (${notPaid}) THEN 1 ELSE 0 END) AS notDonePaid,
           SUM(CASE WHEN ${NOTCANCEL} AND ${noTrack} AND ${noShipDate} THEN 1 ELSE 0 END) AS noShipAtAll,
           SUM(CASE WHEN ${NOTCANCEL} AND ${noTrack} AND ${noShipDate} AND ${notPaid} THEN 1 ELSE 0 END) AS noShipUnpaid,
           SUM(CASE WHEN ${NOTCANCEL} AND ${noTrack} AND ${noShipDate} AND NOT (${notPaid}) THEN 1 ELSE 0 END) AS noShipPaid,
           SUM(CASE WHEN ${NOTDONE} AND ${NOTCANCEL} AND ${noTrack} THEN 1 ELSE 0 END) AS notDoneNoTrack,
           SUM(CASE WHEN ${NOTDONE} AND ${NOTCANCEL} AND ${noShipDate} THEN 1 ELSE 0 END) AS notDoneNoShipDate,
           SUM(CASE WHEN ${NOTDONE} AND ${NOTCANCEL} AND ${noTrack} AND ${noShipDate} THEN 1 ELSE 0 END) AS notDoneNoTrackNoShipDate
         FROM orders WHERE source = ?`,
        [store]
      );

      // แจกแจงสถานะดิบของใบที่ยังไม่จบ — เผื่อชื่อสถานะเองเป็นตัวแยก
      const byStatus = await coreQuery(
        `SELECT status, COALESCE(pay_status,'') AS pay, COUNT(*) AS c
         FROM orders WHERE source = ? AND ${NOTDONE} AND ${NOTCANCEL}
         GROUP BY 1,2 ORDER BY c DESC LIMIT 20`,
        [store]
      );

      /* นับ "ยังไม่จบ" แยกตามอายุใบ — การ์ดตัดของเก่าทิ้งหรือเปล่า */
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const since = (n) =>
        new Date(Date.now() + 7 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
      const windows = {};
      for (const days of [30, 60, 90, 180, 365]) {
        const [w] = await coreQuery(
          `SELECT
             SUM(CASE WHEN ${NOTDONE} AND ${NOTCANCEL} THEN 1 ELSE 0 END) AS notDone,
             SUM(CASE WHEN ${NOTDONE} AND ${NOTCANCEL} AND ${notPaid} THEN 1 ELSE 0 END) AS unpaid,
             SUM(CASE WHEN ${NOTDONE} AND ${NOTCANCEL} AND NOT (${notPaid}) THEN 1 ELSE 0 END) AS paid
           FROM orders WHERE source = ? AND order_date >= ? AND order_date <= ?`,
          [store, since(days), today]
        );
        windows[`ย้อน ${days} วัน`] = w;
      }

      // แยกตามช่องทางด้วย — การ์ดอาจนับเฉพาะบางช่องทาง (เช่น ไม่นับ POS)
      const byChannel = await coreQuery(
        `SELECT COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
                SUM(CASE WHEN ${notPaid} THEN 1 ELSE 0 END) AS unpaid,
                SUM(CASE WHEN NOT (${notPaid}) THEN 1 ELSE 0 END) AS paid,
                COUNT(*) AS c
         FROM orders WHERE source = ? AND ${NOTDONE} AND ${NOTCANCEL}
         GROUP BY 1 ORDER BY c DESC`,
        [store]
      );

      return json({
        ok: true,
        store,
        target: { ค้างชำระเงิน: 24, ค้างโอนสินค้า: 132, รวม: 156 },
        candidates: r,
        windows,
        byChannel,
        byStatus,
        note:
          "เทียบเลขในนี้กับ target · ตรงกับคู่ไหน = นิยามนั้นคือของการ์ด · " +
          "ไม่ตรงสักคู่ = การ์ดใช้ข้อมูลที่กระจกยังไม่มี (เช่น movementList / successDate) " +
          "⇒ ต้องไปดึงเพิ่ม ไม่ใช่เดาต่อ",
      });
    }

    if (url.searchParams.get("blankwhere")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      const blank = `COALESCE(integration_status,'') = ''`;

      // ① ยอดรวมทั้งตาราง — ตัวตั้งที่ทุกการแบ่งต้องบวกกลับมาได้เท่านี้
      const [tot] = await coreQuery(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN ${blank} THEN 1 ELSE 0 END) AS blanks
         FROM orders`
      );

      // ② แยกตาม ช่องทาง × ร้าน — ตอบว่า ZAMA/z2 หลุดจากการไล่รายเดือนหรือไม่
      const byChannelStore = await coreQuery(
        `SELECT COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch, source,
                COUNT(*) AS total,
                SUM(CASE WHEN ${blank} THEN 1 ELSE 0 END) AS blanks
         FROM orders GROUP BY 1,2 HAVING blanks > 0 ORDER BY blanks DESC`
      );

      /* ③ แยกตามเดือน — **ต้องเอาใบที่ order_date พังมารวมด้วย**
            ใบที่วันว่างหรือรูปแบบเพี้ยนจะไม่ตกเดือนไหนเลย = หายจากทุกการไล่รายเดือน
            ⇒ ยัดไว้ในถัง '(วันที่ใช้ไม่ได้)' ให้เห็น ห้ามปล่อยหาย */
      const byMonth = await coreQuery(
        `SELECT CASE WHEN order_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                     THEN substr(order_date,1,7) ELSE '(วันที่ใช้ไม่ได้)' END AS ym,
                COUNT(*) AS total,
                SUM(CASE WHEN ${blank} THEN 1 ELSE 0 END) AS blanks
         FROM orders GROUP BY 1 ORDER BY 1`
      );

      /* ④ updated_at ของใบที่ว่าง — ตัวแยกสมมติฐานที่เร็วที่สุด (ฝั่งจอเสนอมา)
            กระจุกอยู่เวลาเดียวกันเกือบทุกใบ = มาจากการเขียนก้อนเดียว (นำเข้าครั้งแรก)
            กระจายทั่ว = ผ่านซิงก์ปกติมาแล้วหลายรอบ แต่ยังว่าง ⇒ ต้นทางไม่มีค่าจริง
            ⚠️ updated_at เก็บเป็น UTC (datetime('now')) — บวก 7 ให้เป็นเวลาไทยก่อนโชว์ */
      const byWrite = await coreQuery(
        `SELECT substr(datetime(updated_at,'+7 hours'),1,13) AS hr, COUNT(*) AS c
         FROM orders WHERE ${blank} GROUP BY 1 ORDER BY c DESC LIMIT 15`
      );
      const byWriteAll = await coreQuery(
        `SELECT substr(datetime(updated_at,'+7 hours'),1,13) AS hr, COUNT(*) AS c
         FROM orders GROUP BY 1 ORDER BY c DESC LIMIT 15`
      );

      const num2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const sumCh = byChannelStore.reduce((a, r) => a + num2(r.blanks), 0);
      const sumMo = byMonth.reduce((a, r) => a + num2(r.blanks), 0);
      const totalBlanks = num2(tot?.blanks);

      return json({
        ok: true,
        ordersTotal: num2(tot?.total),
        blanksTotal: totalBlanks,
        // ⚠️ ทุกการแบ่งต้องบวกกลับได้เท่ากับ blanksTotal — ไม่เท่า = การแบ่งนั้นทำใบหาย
        crosscheck: {
          byChannelStoreSum: sumCh,
          byMonthSum: sumMo,
          channelOk: sumCh === totalBlanks,
          monthOk: sumMo === totalBlanks,
        },
        byChannelStore,
        byMonth: byMonth.filter((r) => num2(r.blanks) > 0),
        byMonthAll: byMonth,
        blankWriteTimesThai: byWrite,
        allWriteTimesThai: byWriteAll,
        note:
          "ตัวเลขดิบล้วน ไม่ผ่านเกณฑ์ none_expected/source_empty · " +
          "blankWriteTimesThai กระจุกชั่วโมงเดียว = เขียนก้อนเดียวตอนนำเข้าครั้งแรก · " +
          "เทียบกับ allWriteTimesThai เสมอ ถ้าทั้งตารางก็กระจุกเหมือนกัน แปลว่าไม่ได้บอกอะไรเลย",
      });
    }

    if (url.searchParams.get("statuscross")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      const rows = await coreQuery(
        `SELECT COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
                COALESCE(NULLIF(integration_status,''),'(ว่าง)') AS st,
                COUNT(*) AS c
         FROM orders GROUP BY 1,2 ORDER BY 1, c DESC`
      );
      /* ⚠️ **ต้องตัดสินจากข้อมูล ไม่ใช่จากชื่อช่องทาง** (ฝั่งจอกำชับ — กฎ no-substring-classification)
          เกณฑ์: ช่องทางนั้น **เคยมีค่าสักใบไหม**
            เคยมี  ⇒ แถวที่ว่างคือของผิดปกติ (ต้นทางไม่ส่งมา / ร้านปิดไปแล้ว)
            ไม่เคยมีเลย ⇒ ช่องทางนั้นไม่มีใครบอกสถานะ ว่างคือถูกต้อง
          ⇒ ไม่ต้องรู้จักชื่อ "Shopee"/"POS" เลยสักตัวอักษร */
      /* แยกตามร้าน × ช่องทาง — ไว้ตอบว่าร้านที่สอง (ceojet) ขายทางไหนบ้างจริง ๆ */
      const byStoreChannel = await coreQuery(
        `SELECT source, COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch, COUNT(*) AS c,
                ROUND(COALESCE(SUM(amount),0),2) AS amount
         FROM orders GROUP BY 1,2 ORDER BY source, c DESC`
      );
      const blankByChannel = await coreQuery(
        `SELECT COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
                COUNT(*) AS blank,
                (SELECT COUNT(*) FROM orders b
                  WHERE COALESCE(NULLIF(b.channel,''),'(ไม่ระบุ)')
                        = COALESCE(NULLIF(a.channel,''),'(ไม่ระบุ)')
                    AND COALESCE(b.integration_status,'') <> '') AS everHadValue,
                (SELECT COUNT(*) FROM orders t
                  WHERE COALESCE(NULLIF(t.channel,''),'(ไม่ระบุ)')
                        = COALESCE(NULLIF(a.channel,''),'(ไม่ระบุ)')) AS chanTotal
         FROM orders a WHERE COALESCE(a.integration_status,'') = ''
         GROUP BY 1 ORDER BY blank DESC`
      );
      /* ⚠️ **"ว่าง" มี 3 ความหมายที่ต่างกันจริง ๆ — จอแยกจากค่าว่างเปล่า ๆ ไม่ได้**
          none_expected  = ช่องทางนี้ไม่เคยมีใครบอกสถานะเลย ว่างถาวรและถูกต้อง
          source_empty   = ช่องทางนี้เคยมีค่า แต่ใบนี้ต้นทางไม่ส่งมา (ใบเก่า)
                           **พิสูจน์แล้ว 4 ก.ย. 2569: ซิงก์ซ้ำ 7 เดือน เขียน 0 ทุกเดือน**
                           ⇒ ไม่ใช่ "ยังไม่ได้กวาด" — กวาดแล้วก็ไม่มีให้
          ⇒ ส่ง blankReason มาให้เลย จอจะได้แค่เอามาแสดง ไม่ต้องเดาจากชื่อช่องทาง */
      const withReason = blankByChannel.map((r) => ({
        channel: r.ch,
        blank: Number(r.blank),
        /* ⚠️ **ห้ามใช้ "เคยมีสักใบ" เป็นเกณฑ์** (ฝั่งจอชี้ 4 ก.ย. 2569)
            ค่าหลุดมาใบเดียวจะพลิกทั้งกอง — POS 4,256 ใบกลายเป็น source_empty ทันที
            ทั้งที่ตัวใบไม่มีอะไรเปลี่ยนเลย ⇒ ต้องมีเกณฑ์ที่ทนต่อค่าหลุด
            ใช้ **อย่างน้อย 5 ใบ และอย่างน้อย 1% ของช่องทางนั้น** */
        blankReason:
          Number(r.everHadValue) >= 5 && Number(r.everHadValue) * 100 >= Number(r.chanTotal)
            ? "source_empty"
            : "none_expected",
        everHadValue: Number(r.everHadValue),
        channelTotal: Number(r.chanTotal),
      }));
      return json({
        ok: true,
        note:
          "ทั้งตาราง ไม่จำกัดช่วงวัน · blankReason คิดจากข้อมูล (ช่องทางนั้นเคยมีค่าไหม) " +
          "ไม่ได้เดาจากชื่อช่องทาง · none_expected = ว่างถูกต้อง · source_empty = ต้นทางไม่ส่งมา",
        byStoreChannel,
        cross: rows,
        blankByChannel: withReason,
      });
    }

    if (url.searchParams.get("pendingsplit")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      /* ⚠️ **ต้องแยกตามร้านด้วย** — กระจกเก็บสองร้าน (z1 ศีตกาล · z2 ceojet)
          แต่การ์ดหน้าแรก ZORT ที่เอามาเทียบ เป็นของร้านที่ล็อกอินอยู่ร้านเดียว
          รอบแรกผมนับรวมสองร้านแล้วเอาไปเทียบกับการ์ดร้านเดียว = เทียบผิดขอบเขต
          (กับดักเดียวกับ 1,926 vs 319 และ 187 vs 17 — ครั้งที่ 4 ของวัน) */
      const rows = await coreQuery(
        `SELECT source, COALESCE(NULLIF(pay_status,''),'(ว่าง)') AS pay, COUNT(*) AS c
         FROM orders
         WHERE status NOT LIKE '%success%' AND status NOT LIKE '%void%'
           AND status NOT LIKE '%cancel%' AND status NOT LIKE '%ยกเลิก%'
         GROUP BY source, 2 ORDER BY c DESC`
      );
      /* ⚠️ **ตาราง orders มีเอกสารหลายชนิดปนกัน ไม่ใช่ใบขายล้วน**
          เจอมาแล้วตอนทำจอขนส่ง: มีใบรับของ (RC-*) ปนอยู่ด้วย
          ⇒ การ์ด "รายการขาย ค้างชำระเงิน/ค้างโอนสินค้า" ของ ZORT นับเฉพาะ**ใบขาย**
             ถ้าเรานับทุกชนิดแล้วเอาไปเทียบ = เทียบผิดขอบเขต (กับดักเดิมของวันนี้)
          ⇒ แยกตามคำขึ้นต้นของเลขที่เอกสารให้เห็นก่อน แล้วค่อยเลือกว่าจะเทียบกองไหน */
      const byPrefix = await coreQuery(
        `SELECT CASE
                  WHEN number LIKE 'SO-%'  THEN 'SO- (ใบขาย)'
                  WHEN number LIKE 'RC-%'  THEN 'RC- (ใบรับของ)'
                  WHEN number LIKE 'RS-%'  THEN 'RS- (รับคืน)'
                  WHEN number GLOB '[0-9]*' THEN 'ตัวเลขล้วน (มาร์เก็ตเพลส)'
                  ELSE 'อื่น ๆ' END AS kind,
                COUNT(*) AS c
         FROM orders
         WHERE status NOT LIKE '%success%' AND status NOT LIKE '%void%'
           AND status NOT LIKE '%cancel%' AND status NOT LIKE '%ยกเลิก%'
         GROUP BY 1 ORDER BY c DESC`
      );
      /* แยกตาม integration_status — ตัวที่ ZORT ใช้แยกแท็บจริง (ยืนยันจากจอ 4 ก.ย. 2569)
         AWAITING_SHIPMENT = "รอโอนสินค้า" · ใบที่ชำระครบแล้วก็ยังอยู่กองนี้ได้
         ⇒ เทียบกองนี้กับการ์ด "ค้างโอนสินค้า 132" ได้ตรง ๆ */
      const byIntegration = await coreQuery(
        `SELECT COALESCE(NULLIF(integration_status,''),'(ว่าง — ยังไม่ได้กวาดย้อนหลัง)') AS st,
                COUNT(*) AS c
         FROM orders
         WHERE status NOT LIKE '%success%' AND status NOT LIKE '%void%'
           AND status NOT LIKE '%cancel%' AND status NOT LIKE '%ยกเลิก%'
         GROUP BY 1 ORDER BY c DESC`
      );
      /* ⚠️ **ต้องดูทั้งตาราง ไม่ใช่เฉพาะใบที่ยังไม่จบ** (ฝั่งจอถามมา 4 ก.ย. 2569)
          จะทำการ์ด "สถานะการจัดส่ง" ต้องรู้ก่อนว่า integration_status มีค่าอะไรบ้าง
          และ **ค้างว่างกี่เปอร์เซ็นต์** ไม่งั้นจะได้การ์ดที่นับจากช่องว่างแล้วดูเหมือนถูก */
      const integrationAll = await coreQuery(
        `SELECT COALESCE(NULLIF(integration_status,''),'(ว่าง)') AS st, COUNT(*) AS c
         FROM orders GROUP BY 1 ORDER BY c DESC`
      );
      const [allRows] = await coreQuery(`SELECT COUNT(*) AS c FROM orders`);
      const bySource = await coreQuery(
        `SELECT source, COUNT(*) AS c FROM orders
         WHERE status NOT LIKE '%success%' AND status NOT LIKE '%void%'
           AND status NOT LIKE '%cancel%' AND status NOT LIKE '%ยกเลิก%'
         GROUP BY source ORDER BY c DESC`
      );
      const [tot] = await coreQuery(
        `SELECT COUNT(*) AS c FROM orders
         WHERE status NOT LIKE '%success%' AND status NOT LIKE '%void%'
           AND status NOT LIKE '%cancel%' AND status NOT LIKE '%ยกเลิก%'`
      );
      const [span] = await coreQuery(`SELECT MIN(order_date) a, MAX(order_date) b FROM orders`);
      return json({
        ok: true,
        pendingTotal: Number(tot?.c || 0),
        byPayStatus: rows,
        integrationAll, // ทั้งตาราง — ใช้ตอบว่าค้างว่างกี่ % ก่อนเอาไปทำการ์ด
        ordersTotal: Number(allRows?.c || 0),
        byIntegration, // ← ตัวที่ ZORT ใช้แยกแท็บจริง
        byPrefix, // แยกตามชนิดเอกสาร — การ์ด ZORT นับเฉพาะใบขาย
        bySource, // ⚠️ การ์ด ZORT เป็นของร้านเดียว ⇒ เทียบกับแถว z1 เท่านั้น
        mirrorCovers: span,
        compareWith: { "การ์ด ZORT ค้างชำระเงิน": 24, "การ์ด ZORT ค้างโอนสินค้า": 132 },
        note: "นับจากกระจกใน D1 ทั้งหมด ไม่จำกัดช่วงวัน · ยังเป็นสมมติฐาน ต้องเทียบก่อนใช้",
      });
    }

    /* ยิงถาม ZORT **รายใบ** แล้วบอกว่า JSON ดิบมีช่อง integrationStatus ไหม
       ⚠️ มีไว้แยกสองคำอธิบายที่ผลลัพธ์ออกมาเหมือนกันเป๊ะ (ฝั่งจอชี้ 4 ก.ย. 2569):
          "ZORT ไม่มีค่าให้" กับ "ตัวเขียนข้ามแถวที่ไม่เปลี่ยน" — ทั้งคู่ให้ 'เขียน 0'
       ⇒ ดู JSON ดิบของใบเดียวก็ตัดสินได้ · ไม่คืนข้อมูลลูกค้าเด็ดขาด */
    if (url.searchParams.get("zortone")) {
      const st = {
        storename: process.env.ZORT_STORENAME,
        apikey: process.env.ZORT_APIKEY,
        apisecret: process.env.ZORT_APISECRET,
      };
      const want = String(url.searchParams.get("zortone")).slice(0, 60);
      const day = String(url.searchParams.get("day") ?? "").slice(0, 10);
      if (!st.storename || !day) return json({ error: "ต้องระบุ zortone=<เลขที่ใบ> และ day=YYYY-MM-DD" }, 400);
      const r = await fetch(
        `https://open-api.zortout.com/v4/Order/GetOrders?orderdateafter=${day}&orderdatebefore=${day}&limit=200&page=1`,
        { headers: st, signal: AbortSignal.timeout(20000) }
      );
      const d = await r.json().catch(() => ({}));
      const hit = (Array.isArray(d.list) ? d.list : []).find((o) => String(o.number) === want);
      if (!hit) return json({ ok: true, found: false, note: "ไม่เจอใบนี้ในวันนั้น" });
      /* ⚠️ **ห้ามถามหาแค่ชื่อคีย์ที่เราเดาไว้** — เดิมเช็คแต่ `integrationStatus`
          ซึ่งเป็นชื่อเดียวกับที่ตัวเขียนใช้ ⇒ ถ้าเราสะกดผิดตั้งแต่แรก
          ตัวตรวจจะตอบว่า "ZORT ไม่มีค่า" ทุกใบ **ยืนยันความผิดของตัวเอง**
          (ฟิลด์อื่นของ ZORT เป็นตัวพิมพ์เล็กล้วนหมด: saleschannel · customername ·
           trackingno · paymentstatus ⇒ มีเหตุให้สงสัยว่าตัวจริงคือ integrationstatus)
          ⇒ กวาดคีย์ทุกตัวที่มีคำว่า integration/status แล้วเอาของจริงมาโชว์
          กติกาเดียวกับ test-must-discriminate */
      const keys = Object.keys(hit);
      const related = Object.fromEntries(
        keys.filter((k) => /integration/i.test(k)).map((k) => [k, hit[k] ?? null])
      );
      const anyStatusKeys = keys.filter((k) => /status/i.test(k));
      /* ⚠️ **ต้องเทียบกับชื่อที่เราใช้ ไม่ใช่ "คีย์แรกที่มีค่า"** — เขียนครั้งแรกใช้ find()
          เอาคีย์แรกที่ไม่ว่าง แล้วมันไปเจอ integrationName ("Lazada") ก่อน
          ⇒ ตัดสินว่า "เราอ่านผิดชื่อ" ทั้งที่ integrationStatus ถูกต้องและมีค่าอยู่
          ตัวตรวจตอบผิดในทิศที่ทำให้เราไปแก้ของที่ไม่ได้เสีย ซึ่งอันตรายพอกัน */
      const ourVal = String(hit.integrationStatus ?? "");
      const otherWithVal = Object.keys(related).filter(
        (k) => k !== "integrationStatus" && String(related[k] ?? "") !== ""
      );
      return json({
        ok: true,
        found: true,
        number: want,
        // คีย์ที่เกี่ยวกับ integration ทั้งหมดที่ ZORT ส่งมาจริง พร้อมค่า
        integrationKeys: related,
        // เผื่อชื่อไม่มีคำว่า integration เลย — จะได้เห็นว่ามีคีย์สถานะอะไรบ้าง
        statusKeys: anyStatusKeys,
        weRead: "integrationStatus", // ชื่อที่ตัวเขียนของเราใช้อยู่
        status: hit.status ?? null,
        paymentstatus: hit.paymentstatus ?? null,
        saleschannel: hit.saleschannel ?? null,
        // ⚠️ ZORT มีสถานะ "การจัดส่งฝั่งมาร์เก็ตเพลส" แยกอีกตัว — คนละเรื่องกับ integrationStatus
        marketplaceshippingstatus: hit.marketplaceshippingstatus ?? null,
        /* ช่องส่วนลด/ค่าส่งระดับใบ — ไว้หาว่าส่วนต่างที่เหลือมาจากช่องไหน
           ⚠️ รายชื่อตรงตัวเท่านั้น ห้าม regex (บทเรียน 4 ก.ย. ที่ /ship/ ทำข้อมูลลูกค้าหลุด) */
        billFields: {
          discount: hit.discount ?? null,
          discountamount: hit.discountamount ?? null,
          buyerDiscountAmount: hit.buyerDiscountAmount ?? null,
          platformdiscount: hit.platformdiscount ?? null,
          sellerdiscount: hit.sellerdiscount ?? null,
          voucheramount: hit.voucheramount ?? null,
          shippingamount: hit.shippingamount ?? null,
          shippingVoucher: hit.shippingVoucher ?? null,
          roundingAmount: hit.roundingAmount ?? null,
          amount: hit.amount ?? null,
        },
        /* ── บรรทัดสินค้าดิบจาก ZORT ── (5 ก.ย. 2569)
           ⚠️ **ต้องมีเพื่อแยกสองสมมติฐาน** ว่าบรรทัดราคา 0 เกิดที่ต้นทางหรือที่ตัวอ่านของเรา
              ถ้า pricepernumber ที่ ZORT เป็น 0 → ราคาถูกทับก่อนถึง ZORT
              ถ้า pricepernumber ไม่เป็น 0 แต่ totalprice เป็น 0 → **เราอ่านผิดช่อง**
           ⚠️ **รายชื่อฟิลด์ตรงตัวเท่านั้น ห้าม regex** — บทเรียน 4 ก.ย. ที่ /ship/ ไปจับ
              shippingname · shippingaddress · shippingphone แล้วข้อมูลลูกค้าหลุดออก API
           ⚠️ บรรทัดสินค้าไม่มีข้อมูลลูกค้าก็จริง แต่กติกาเดียวกันต้องใช้ทุกที่ ไม่ใช่เลือกใช้ */
        lines: (Array.isArray(hit.list) ? hit.list : []).map((it) => ({
          sku: it?.sku ?? null,
          name: String(it?.name ?? it?.productname ?? "").slice(0, 120),
          number: it?.number ?? null, // ZORT เรียกจำนวนว่า number
          quantity: it?.quantity ?? null,
          pricepernumber: it?.pricepernumber ?? null,
          totalprice: it?.totalprice ?? null,
          discount: it?.discount ?? null,
        })),
        verdict: ourVal
          ? "integrationStatus มีค่าจริง ⇒ ชื่อคีย์ถูกแล้ว ปัญหาไม่ได้อยู่ตรงนี้"
          : Object.prototype.hasOwnProperty.call(hit, "integrationStatus")
            ? `integrationStatus มีคีย์แต่ค่าว่าง${
                otherWithVal.length ? ` (คีย์ที่มีค่า: ${otherWithVal.join(", ")})` : ""
              } ⇒ ต้นทางไม่มีค่าให้ใบนี้จริง`
            : "ZORT ไม่ส่งคีย์ integrationStatus มาเลยสำหรับใบนี้",
      });
    }

    if (url.searchParams.get("zortfields")) {
      const st = {
        storename: process.env.ZORT_STORENAME,
        apikey: process.env.ZORT_APIKEY,
        apisecret: process.env.ZORT_APISECRET,
      };
      if (!st.storename) return json({ error: "ยังไม่ได้ตั้งรหัส ZORT" }, 503);
      const back = Math.max(1, Math.min(400, parseInt(url.searchParams.get("days") ?? "30", 10) || 30));
      const day = new Date(Date.now() + 7 * 3600e3 - back * 864e5).toISOString().slice(0, 10);
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      /* ⚠️ ต้องไล่หน้าให้ครบ ไม่งั้นนับได้ไม่ครบแล้วเทียบกับการ์ดของ ZORT ไม่ได้
          และต้องบอกด้วยถ้าชนเพดานหน้า — ตัวเลขที่ไม่ครบห้ามเงียบ */
      const list = [];
      let truncated = false;
      for (let page = 1; page <= 14; page++) {
        const r = await fetch(
          `https://open-api.zortout.com/v4/Order/GetOrders?orderdateafter=${day}&orderdatebefore=${today}&limit=200&page=${page}`,
          { headers: st, signal: AbortSignal.timeout(15000) }
        );
        const d = await r.json().catch(() => ({}));
        const chunk = Array.isArray(d.list) ? d.list : [];
        list.push(...chunk);
        if (chunk.length < 200) break;
        if (page === 14) truncated = true;
      }
      /* ⚠️ **ตัวกรองรอบแรกรั่ว — คืนชื่อ/ที่อยู่/เบอร์ลูกค้าจริงออกมา** (4 ก.ย. 2569)
          เขียน /ship/ ไว้เพื่อจับ shippingstatus แต่มันไปจับ shippingname ·
          shippingaddress · shippingphone ด้วย ⇒ ข้อมูลลูกค้าหลุดออกมาทาง API
          **เขียนรายชื่อฟิลด์ตรงตัวเท่านั้น ห้ามใช้ regex จับชื่อฟิลด์**
          (โรคเดียวกับ no-substring-classification — ชื่อที่คนตั้งเองมีคำของอย่างอื่นปนเสมอ) */
      const SAFE = new Set([
        "status",
        "paymentstatus",
        "integrationStatus",
        "marketplaceshippingstatus",
        "shippingstatus",
        "ordertype",
        "vattype",
        "saleschannel",
        "shippingchannel",
        "warehousecode",
        "isCOD",
      ]);
      const rows = list.filter((o) => !/success|void|cancel/i.test(String(o.status || "")));
      const seen = {};
      for (const o of rows) {
        for (const [k, v] of Object.entries(o)) {
          if (!SAFE.has(k)) continue;
          const key = `${k}`;
          (seen[key] ||= new Set()).add(typeof v === "object" ? "(object)" : String(v).slice(0, 40));
        }
      }
      /* นับสองกองที่ ZORT โชว์บนหน้าแรก — 'ค้างชำระเงิน' กับ 'ค้างโอนสินค้า'
         สมมติฐาน: integrationStatus=READY_TO_SHIP คือ 'ค้างโอนสินค้า' (จ่ายแล้ว รอส่ง)
         ⚠️ ยังเป็นสมมติฐาน — ต้องเทียบตัวเลขกับการ์ดจริงก่อนถึงจะเอาไปใช้ */
      const cnt = { waitPay: 0, readyToShip: 0, otherPending: 0 };
      for (const o of rows) {
        const isPaid = /paid/i.test(String(o.paymentstatus || ""));
        const ig = String(o.integrationStatus || "");
        if (/READY_TO_SHIP/i.test(ig)) cnt.readyToShip += 1;
        else if (!isPaid) cnt.waitPay += 1;
        else cnt.otherPending += 1;
      }
      return json({
        ok: true,
        note: `เฉพาะใบที่ยังไม่ success/void ย้อน ${back} วัน · คืนแค่ฟิลด์ที่เกี่ยวกับสถานะ`,
        daysBack: back,
        ordersScanned: list.length,
        truncated,
        guess: cnt, // เทียบกับการ์ดหน้าแรก ZORT: ค้างชำระเงิน 24 · ค้างโอนสินค้า 132
        pendingRows: rows.length,
        allFieldNames: Object.keys(list[0] || {}),
        statusFields: Object.fromEntries(
          Object.entries(seen).map(([k, v]) => [k, [...v].slice(0, 12)])
        ),
      });
    }

    if (url.searchParams.get("channelcompare")) {
      const { channelCompare } = await import("../lib/channel-compare.mjs");
      return json({
        ok: true,
        ...(await channelCompare(url.searchParams.get("channelcompare"), {
          limit: Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") ?? "200", 10) || 200)),
        })),
      });
    }
    if (url.searchParams.get("stockcompare")) {
      return json({ ok: true, stock: await shopeeStockCompare() });
    }
    if (url.searchParams.get("snapshot")) {
      return json({ ok: true, snapshot: await snapshotStock() });
    }
    if (url.searchParams.get("stock")) {
      const days = parseInt(url.searchParams.get("days") ?? "1", 10) || 1;
      return json({ ok: true, stock: await stockRecon(days, 60) });
    }

    // ── จอ "รายการขาย" ที่ยืนได้เองโดยไม่มี ZORT ──
    const p = url.searchParams;
    if (p.get("order")) {
      return json({ ok: true, ...(await getOrder(p.get("order"))) });
    }
    if (p.get("list") === "stock") {
      return json({
        ok: true,
        ...(await listStock({
          q: p.get("q"),
          only: p.get("only"),
          kind: p.get("kind"), // goods = ตัดบริการออก · service = เอาเฉพาะบริการ
          sort: p.get("sort"),
          limit: p.get("limit"),
          offset: p.get("offset"),
          soldDays: p.get("soldDays"),
          marketplaces: url.searchParams.get("marketplaces"),
        })),
      });
    }
    if (p.get("list") === "orders") {
      return json({
        ok: true,
        ...(await listOrders({
          from: p.get("from"),
          to: p.get("to"),
          channel: p.get("channel"),
          // ชื่อช่องทางซ้ำกันข้ามร้านได้ (เช่น TIKTOK มีทั้ง z1 และ z2) ⇒ ต้องกรองร้านได้ด้วย
          source: p.get("store"),
          status: p.get("status"),
          q: p.get("q"),
          limit: p.get("limit"),
          offset: p.get("offset"),
          includeCancelled: p.get("cancelled") === "1",
        })),
        // รายชื่อช่องทางต้องมาจากขอบเขตเดียวกับผลลัพธ์ ไม่งั้นเลือกได้แต่ได้ 0 ใบ
        channels: await listChannels(p.get("store")),
      });
    }

    // สถานะรวม
    const [counts] = await coreQuery(
      `SELECT (SELECT COUNT(*) FROM orders) AS orders,
              (SELECT COUNT(*) FROM order_items) AS items,
              (SELECT COUNT(*) FROM stock_snapshots) AS snapshots`
    );
    const recon = await coreQuery(`SELECT * FROM recon_log ORDER BY day DESC LIMIT 7`);
    const channels = await coreQuery(
      `SELECT channel, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
       FROM orders GROUP BY channel ORDER BY amount DESC LIMIT 20`
    );
    // เทียบ 3 ทางฝั่ง Shopee (แผนลับขั้น 3 — ระยะรันคู่) · ตารางยังไม่มี = ส่ง [] เฉย ๆ
    const shopee = await shopeeRecon(7).catch(() => []);
    // สมุดเทียบสต็อก (แผนลับขั้น 1) — ตารางยังไม่ได้สร้าง = ส่ง [] ไม่ล้มทั้งหน้า
    const stock = await stockReconLog(14).catch(() => []);
    return json({ ready: true, counts, recon, channels, shopee, stock });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

export const config = { path: "/api/core" };
