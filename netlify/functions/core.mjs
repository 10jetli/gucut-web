// GUCUT Core — ประตูสั่งงาน/ดูสถานะคลังเงา (หลังร้านเท่านั้น)
//
//   GET /api/core                 สถานะ: จำนวนแถว · เทียบยอดล่าสุด · ช่องทางที่เห็น
//   GET /api/core?sync=1&days=30  กระจกย้อนหลัง N วัน (backfill · สูงสุด 60)
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
  syncProducts, syncBundles, listBundles, saveBundleItems, listBundleItems,
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
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

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
      return json({ ok: true, ...(await connectionsStatus()) });
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
    if (url.searchParams.get("peak")) {
      const mode = url.searchParams.get("peak");
      if (mode === "status") return json({ ok: true, peak: await peakStatus() });
      if (mode === "dry") {
        const day = url.searchParams.get("day") ||
          new Date(Date.now() + 7 * 3600 * 1000 - 86400 * 1000).toISOString().slice(0, 10);
        const orders = await coreQuery(
          `SELECT id, number, channel, customer, order_date, amount FROM orders
           WHERE order_date = ? AND status NOT LIKE '%cancel%' AND status NOT LIKE '%void%'
             AND status NOT LIKE '%ยกเลิก%' LIMIT 200`,
          [day]
        );
        const items = await coreQuery(
          `SELECT oi.order_id, oi.sku, oi.name, oi.qty, oi.amount
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.order_date = ?`,
          [day]
        );
        const byOrder = new Map();
        for (const it of items) {
          if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
          byOrder.get(it.order_id).push(it);
        }
        const invoices = orders.map((o) => toInvoice(o, byOrder.get(o.id) ?? []));
        return json({ ok: true, day, orders: orders.length, peak: await sendInvoices(invoices) });
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
    if (url.searchParams.get("zortfields")) {
      const st = {
        storename: process.env.ZORT_STORENAME,
        apikey: process.env.ZORT_APIKEY,
        apisecret: process.env.ZORT_APISECRET,
      };
      if (!st.storename) return json({ error: "ยังไม่ได้ตั้งรหัส ZORT" }, 503);
      const day = new Date(Date.now() + 7 * 3600e3 - 30 * 864e5).toISOString().slice(0, 10);
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const r = await fetch(
        `https://open-api.zortout.com/v4/Order/GetOrders?orderdateafter=${day}&orderdatebefore=${today}&limit=200&page=1`,
        { headers: st, signal: AbortSignal.timeout(20000) }
      );
      const d = await r.json().catch(() => ({}));
      const list = Array.isArray(d.list) ? d.list : [];
      const SAFE = /status|type|channel|flag|express|urgent|paid|transfer|ship|deliver|cod/i;
      const rows = list.filter((o) => !/success|void|cancel/i.test(String(o.status || "")));
      const seen = {};
      for (const o of rows) {
        for (const [k, v] of Object.entries(o)) {
          if (!SAFE.test(k)) continue;
          const key = `${k}`;
          (seen[key] ||= new Set()).add(typeof v === "object" ? "(object)" : String(v).slice(0, 40));
        }
      }
      return json({
        ok: true,
        note: "เฉพาะใบที่ยังไม่ success/void ใน 30 วันล่าสุด · คืนแค่ฟิลด์ที่เกี่ยวกับสถานะ",
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
          status: p.get("status"),
          q: p.get("q"),
          limit: p.get("limit"),
          offset: p.get("offset"),
          includeCancelled: p.get("cancelled") === "1",
        })),
        channels: await listChannels(),
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
