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
import { withPagingHint } from "../lib/paging-hint.mjs";
import { coreQuery, coreReady, coreInit, withD1Meter, d1Stats, d1Info } from "../lib/coredb.mjs";
import { syncContacts, listContacts } from "../lib/core-contacts.mjs";
import { syncOrders, reconYesterday, snapshotStock } from "../lib/core-sync.mjs";
import { syncShopeeOrders, shopeeRecon } from "../lib/shopee-orders.mjs";
import { syncTiktokOrders, tiktokRecon, tiktokOrderShape } from "../lib/tiktok-orders.mjs";
import { shopeeStockCompare, shopeeMissingSkus } from "../lib/shopee-stock.mjs";
import { applyMoves, listMoves, deleteMove } from "../lib/stock-moves.mjs";
import { peakStatus, toInvoice, sendInvoices } from "../lib/peak.mjs";
import {
  deleteVoidedSale, createSale, voidSale, listSales, branches, lookup, posCats, listCategories,
} from "../lib/pos.mjs";
import {
  syncProducts, syncBundles, listBundles, saveBundleItems, listBundleItems, blockedByNegative,
  reorderPlan, linkStatus, zortWarehouseProbe,
} from "../lib/core-products.mjs";
import { stockRecon, stockReconLog, listStock, listDeadStock, stockCard, channelGaps,
} from "../lib/core-stock.mjs";
import { listOrders, listOrderFacets, getOrder, listChannels, listLogistics,
} from "../lib/core-orders.mjs";
import { runBackup, backupStatus, restore } from "../lib/backup.mjs";
import {
  syncPurchases, listPurchases, listWarehouses, syncTransfers, listTransfers, resetTransfers, listQuotations, listPurchaseItems,
} from "../lib/core-purchases.mjs";

/* ⚠️ **ตัวจัดการจริงต้องถูกครอบด้วย withD1Meter เสมอ** ไม่งั้น d1Stats() คืน null
    แล้วหัวข้อมูล x-d1-* จะหายไปเงียบ ๆ โดยที่ทุกอย่างยังทำงานปกติ — ไม่มีอะไรฟ้อง
    (ถ้าวันหนึ่งเปิด DevTools แล้วไม่เห็น x-d1-count ให้มาดูบรรทัดนี้ก่อน) */
/* build stamp ของท่อ — มาจากไฟล์ที่ scripts/gen-arch.mjs สร้างใหม่ทุกครั้งที่ build
   ⚠️ อ่านแบบ static import ไม่ได้ (ไฟล์ใหญ่) ⇒ อ่านครั้งเดียวตอนโหลดโมดูล */
/* รหัสสุ่มประจำอินสแตนซ์ — สุ่มครั้งเดียวตอนโหลดโมดูล ⇒ คำขอที่ตกเครื่องเดียวกันจะได้รหัสเดียวกัน
   ใช้ตอบว่า "ยิงปลุกแล้วคำขอจริงไปตกเครื่องเดิมไหม" (ดูเหตุผลเต็มที่เส้น ?ping=1)
   ⚠️ ต้องอยู่นอกฟังก์ชัน — ไว้ในฟังก์ชันจะสุ่มใหม่ทุกคำขอแล้ววัดอะไรไม่ได้เลย */
const INSTANCE_ID = Math.random().toString(36).slice(2, 10);

let CORE_BUILD = "";
try {
  const m = await import("../lib/arch-data.mjs");
  CORE_BUILD = String(m?.ARCH?.generatedAt ?? "");
} catch {
  CORE_BUILD = ""; // อ่านไม่ได้ = ปล่อยว่าง ห้ามทำให้ทั้งท่อพังเพราะ stamp
}

export default async function handler(req, context) {
  return withD1Meter(() => route(req, context));
}

async function route(req, context) {
  /* ⚠️ ตัวส่งงานเบื้องหลังให้ Netlify ถือไว้ — ใช้กับ "คืนของเก่าก่อนแล้วรีเฟรช"
     ไม่มี `context.waitUntil` (รันในเครื่อง/รุ่นเก่า) ⇒ คืน undefined
     แล้วตัวที่รับไปจะ **ทำแบบเดิมคือรอ** ไม่ใช่ปล่อยงานลอย
     🔴 ห้ามเปลี่ยนเป็น `(p) => p` เด็ดขาด — นั่นคือปล่อยลอยเต็มตัว
     🔴 **ต้องประกาศในฟังก์ชันเดียวกับจุดที่ใช้** — ตอน deploy แรกประกาศไว้ใน
        `handler` แต่จุดเรียกอยู่ใน `route()` ⇒ ReferenceError ทุกคำขอที่ขอ
        marketplaces=1 · จอสินค้า+สินค้าชุด**พังบนเว็บจริง** เจ้าของร้านเปิดเจอเอง
        (7 ก.ย. 2569 · พังอยู่ ~4 นาที) · `node --check` กับ build ผ่านฉลุยทั้งคู่
        เพราะมันเป็นแค่ชื่อที่ยังไม่ถูก resolve จนกว่าจะรันถึง */
  const waitUntil =
    typeof context?.waitUntil === "function" ? context.waitUntil.bind(context) : undefined;
  /* ⚡ **`?ping=1` — เส้นเบาที่สุด มีไว้ "ปลุกเครื่อง" ล่วงหน้าเท่านั้น** (ฝั่งจอขอมา 6 ก.ย. 2569)
      ไม่แตะฐานข้อมูล · ไม่แตะที่เก็บข้อมูล · ไม่โหลดโมดูลเพิ่ม · ตอบทันที

      **ทำไมถึงช่วย** (วัดจริงจากไทย ยิงติดกัน 16 ครั้ง):
        4 ครั้งแรก **927 ms** → 12 ครั้งหลัง **426 ms** ⇒ ค่าปลุกเครื่อง **~501 ms**
      Netlify ปิดเครื่องเมื่อไม่มีคนใช้ ⇒ หลังร้านที่ใช้เป็นพัก ๆ เจอเครื่องเย็นแทบทุกครั้ง
      ⇒ ยิงเส้นนี้ **ก่อน** คนกดเมนู แล้วคำขอจริงจะเจอเครื่องที่อุ่นแล้ว

   ⚠️ **ต้องยิงก่อนคนกด ไม่ใช่พร้อมกับคนกด** — ยิงพร้อมกันคือเจอเครื่องเย็นรอบเดียวกันทั้งคู่
      ไม่ได้อะไรเลยนอกจากจ่ายค่าเรียกเพิ่ม (ฝั่งจอชี้ข้อนี้เอง ถูกต้องแล้ว)
   ⚠️ **ปลุกได้ทีละเครื่อง ไม่ใช่ทั้งกอง** — เห็น 1,330 ms โผล่กลางชุดที่อุ่นแล้ว
      เพราะคำขอนั้นไปตกเครื่องใหม่ ⇒ อย่าคาดหวังว่าจะหาย 501 ms ครบทุกครั้ง
   ⚠️ **เพดานตอนอุ่นคือ ~400 ms** ปลุกล่วงหน้าไม่ทำให้ต่ำกว่านั้น (นั่นคือค่าเดินทางไปเครื่องที่อเมริกา)
   🚫 **เส้นนี้ไม่มีด่านรหัส — ห้ามเติมฟิลด์ใด ๆ ลงในคำตอบเด็ดขาด**
      คืนแค่ `{ok, ping, build}` เท่านั้น และเท่านี้พอแล้ว
      ที่ไม่บังคับรหัสเป็นความตั้งใจ (ต้องปลุกจากเบราว์เซอร์ได้ และมันไม่ทำงานอะไรเลย)
      **แต่นั่นแปลว่าทุกอย่างที่ใส่ลงไป คนนอกอ่านได้หมด**
      วันหนึ่งจะมีคนอยากเติม "สถานะระบบ" · "รุ่นฐานข้อมูล" · "จำนวนออเดอร์วันนี้"
      ลงไปเพราะมันสะดวก ⇒ **นั่นคือวันที่มันกลายเป็นช่องส่องข้อมูลฟรีให้คนนอก**
      อยากได้ข้อมูลอะไรเพิ่ม ให้ไปสร้างเส้นใหม่ที่ผ่าน adminGate **ห้ามเกาะเส้นนี้**
      (ฝั่งจอทักเรื่องนี้เอง 6 ก.ย. 2569 — `build` ที่มีอยู่ไม่ใช่ของใหม่ มันติดอยู่ในหัว
       `x-core-build` ของทุกคำตอบอยู่แล้ว จึงไม่ได้เปิดอะไรเพิ่ม) */
  if (new URL(req.url).searchParams.get("ping")) {
    /* 🔬 `inst` = รหัสสุ่มประจำ "เครื่อง" (สุ่มครั้งเดียวตอนโหลดโมดูล คงที่ตลอดอายุอินสแตนซ์)
        มีไว้ตอบคำถามเดียวที่ตัดสินทั้งเรื่องปลุกเครื่อง (ฝั่งจอเสนอ 6 ก.ย. 2569):
          ยิงปลุก → ยิงจริงตามติด → **รหัสตรงกันไหม**
          ไม่ตรงเป็นส่วนใหญ่ ⇒ ปลุกล่วงหน้า **ใช้ไม่ได้เชิงหลักการ** (คำขอจริงไปตกคนละเครื่อง)
          ตรงกันแต่ไม่เร็วขึ้น    ⇒ ความอุ่นหายเร็วกว่าที่คิด
        ⇒ ทั้งสองทางแปลว่า **ถอดตัวปลุกทิ้ง เลิกจ่ายค่าเรียกฟรี**

     ⚠️ **ตัวนี้ไม่ขัดกับข้อห้าม "ห้ามเติมฟิลด์"** — มันเป็นเลขสุ่มที่ไม่มีความหมายนอกกระบวนการนี้
        ไม่ได้บอกอะไรเกี่ยวกับร้าน ข้อมูล หรือสถานะระบบเลยสักอย่าง
        **ข้อห้ามยังอยู่ครบ**: ห้ามใส่สถานะระบบ · รุ่นฐานข้อมูล · ตัวเลขธุรกิจ ลงในเส้นนี้
     ⚠️ ถอดออกได้เมื่อตอบคำถามข้างบนจบแล้ว — ไม่ใช่ของถาวร */
    return new Response(JSON.stringify({ ok: true, ping: true, build: CORE_BUILD, inst: INSTANCE_ID }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

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
  /* 🔴 **ตั๋วเปิดได้เฉพาะสองเส้นที่มันถูกออกให้ — ห้ามให้เดินต่อเข้า route อื่น**
      (ปิดช่อง 6 ก.ย. 2569) เดิมพอ `ticket = true` แล้ว คำขอ **เดินต่อเข้าทั้งไฟล์**
      ⇒ `POST /api/core?bundleitems=1&addproduct=1` พร้อมตั๋ว = **สร้างสินค้าใน ZORT ตัวจริง
        โดยไม่ต้องมี x-admin-key** เพราะตัวจัดการ addproduct/addpo/addquotation/move
        อยู่ **ก่อน** ตัวจัดการ bundleitems ในไฟล์นี้ ⇒ ชนก่อนทุกครั้ง
      ⚠️ ที่ทำให้หนักคือปลายทาง: ZORT **ไม่เปิด API ให้ลบใบสั่งซื้อ** ⇒ ยิงพลาดแล้วแก้คืนไม่ได้
      ⇒ ตั๋วต้องมาพร้อมพารามิเตอร์ของเส้นตัวเองเท่านั้น มีอย่างอื่นปนมา = ปฏิเสธ
      **ห้ามถอด และเพิ่มเส้นอัปโหลดใหม่ต้องเติมชื่อใน UPLOAD_PATHS เท่านั้น
        ห้ามเติมชื่ออื่นลง allowlist นี้** (ทางลัดวันนั้น = ช่องโหว่วันหน้า) */
  if (ticket) {
    const extra = [...new URL(req.url).searchParams.keys()].filter(
      (k) => !UPLOAD_PATHS.includes(k)
    );
    if (extra.length) {
      return new Response(
        JSON.stringify({
          error: "ตั๋วอัปโหลดใช้ได้เฉพาะเส้นของตัวเอง",
          extra,
          hint: "เอาพารามิเตอร์อื่นออก หรือใช้ x-admin-key แทนตั๋ว",
        }),
        { status: 400, headers: { "content-type": "application/json; charset=utf-8" } }
      );
    }
  }
  if (!gate.ok && !ticket) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  /* 🛡️ ด่านค่าพารามิเตอร์ (15 ก.ย. 2569) — ค่าผิดตอบ 400 ก่อนถึงเส้นใด ๆ ห้ามปัดเงียบเป็นผลว่าง · รายละเอียดใน param-guard.mjs */
  {
    const { badParamError } = await import("../lib/param-guard.mjs");
    const bad = badParamError(url.searchParams);
    if (bad)
      return new Response(JSON.stringify({ ok: false, error: bad }), {
        status: 400,
        headers: { "content-type": "application/json", "x-core-build": CORE_BUILD },
      });
  }
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
  /* 🔴 **ตัวห่อ `ok:true` ที่ไม่โกหก** (เพิ่ม 6 ก.ย. 2569)
      ก่อนหน้านี้มี 18 จุดเขียนว่า `json({ ok:true, ...(await fn()) })` (เขียนติดกันแบบนั้นตรง ๆ)
      แต่ฟังก์ชันข้างในคืน `{error:"..."}` หรือ `{inconclusive:true}` ได้ **โดยไม่มี `ok:false`**
      ⇒ ผลที่ล้มเหลวออกไปเป็น `{ok:true, error:"ดึงจาก ZORT ไม่ได้"}` พร้อม HTTP 200
        จอที่เช็ค `d.ok` จะวาดตารางเปล่า = **"ใบนี้ไม่มีของ" ตอนคนยืนรับของอยู่หน้าคลัง**
        และ `zortclaims` ตอนตัวควบคุมไม่ผ่านจะออกเป็น `{ok:true, inconclusive:true}` = เขียวหลอก
        ทั้งที่ zort-claim-check เขียนห้ามไว้เองว่าต้องตอบ inconclusive ไม่ใช่ "ยังจริงอยู่"

      ⚠️ แก้ที่ **ตัวห่อตัวเดียว** ไม่ไล่แก้ 18 จุด — ไล่ทีละจุดคือของที่ตกหล่นแน่นอน
         เมื่อมี endpoint ใหม่ (บทเรียนเดียวกับ limitClamped ข้างบน)
      ⚠️ **`inconclusive` ต้องไม่มีคีย์ `ok` เลย** ไม่ใช่ `ok:false` — ตามสัญญาที่ตกลงกับฝั่งจอ
         "ผลแปลไม่ได้" ไม่ใช่ "ผลว่าไม่ผ่าน" · มีคีย์ ok เมื่อไหร่ จะมีคนอ่านเป็นคำตัดสิน
      ⚠️ ยังตอบ **HTTP 200** โดยตั้งใจ — ตอบ 5xx แล้วตัวดักพลาดรวมของจอจะกลบข้อความไทย
         ที่อธิบายสาเหตุจริง เหลือแต่ "เกิดข้อผิดพลาด" ซึ่งแย่กว่าเดิม */
  /* ⏳ **คลาสนี้ยังเหลืออีกครึ่ง — ตั้งใจยังไม่แก้วันนี้ (ตกลงกับฝั่งจอ 6 ก.ย. 2569)**
     ตัวห่อข้างล่างครอบเฉพาะเคส **spread** (`okJson({...ผลลัพธ์})`)
     ยังมีอีกแบบที่ครอบไม่ถึง: เคสที่ **ยัดผลไว้ใต้คีย์** เช่น
        `json({ ok: true, tiktok: await tiktokStockCompare() })`
     ⇒ ข้างในเป็น `{skip:"…"}` แต่ข้างนอกยังเขียน `ok:true`

     จุดที่เป็นแบบนี้ (นับ 6 ก.ย. 2569 — **นับใหม่ทุกครั้งก่อนใช้เลขนี้**):
       init · bundles · products · purchases · reset · branches · peak · recon ·
       shopee(sync) · tiktok(sync) · tiktok(stockcompare) · tokens ·
       stock(shopeecompare) · snapshot · stock(recon)
     ⚠️ **ไม่ใช่ทุกจุดที่เป็นปัญหา** — บางตัวคืนข้อมูลนิ่งที่ล้มเหลวไม่ได้
        ⇒ ต้องดูทีละจุดว่าฟังก์ชันข้างในคืน `error`/`skip` ได้ไหม **ห้ามไล่แก้ตามรูปแบบ**

     **ทางที่ตกลงกันแล้วว่าจะทำ (พรุ่งนี้ 7 ก.ย. 2569)**: เติมธงบนสุดแบบ**เพิ่มอย่างเดียว**
        `partial: true` + `failedParts: ["tiktok"]`  ⇒ จอเก่าไม่พัง จอใหม่มีของให้เช็ค
     🚫 **ไม่พลิก `ok` เป็น false** — เหตุผลของฝั่งจอ: `ok` แปลว่า "เส้นทำงานและตอบตามสัญญา"
        ไม่ใช่ "ทุกส่วนข้างในได้ข้อมูลครบ" · พลิกเพราะ TikTok ส่วนเดียวล้ม =
        **จอทิ้งข้อมูล Shopee+Lazada ที่ใช้ได้ปกติไปทั้งจอ** ⇒ เสียของที่ใช้ได้
        เพื่อบอกว่ามีของที่ใช้ไม่ได้ · และ `ok:false` อ่านแล้วเข้าใจว่าทั้งเส้นพัง ซึ่งไม่จริง
     **ทำไมเลื่อน**: เป็นสัญญาใหม่กลางวันของวันที่จะ push ของค้างเกือบร้อยคอมมิตตอน 21:00
        ของใหม่ที่ยังไม่มีใครยิงของจริง ไม่ควรเพิ่มเข้ากองนั้น */
  const okJson = (payload, status = 200) => {
    const p = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    if (p.inconclusive === true) return json(p, status);          // ห้ามเติม ok
    if (typeof p.error === "string" && p.error) return json({ ok: false, ...p }, status);
    return json({ ok: true, ...p }, status);
  };
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
    /* 📖 บอกจุดเริ่มของหน้าถัดไปให้เสร็จ — ผู้เรียกไม่ต้องคำนวณเอง
       🔴 ปิดคลาสบั๊กที่เจอจริง 18 ก.ย. 2569: ฝั่งจอขอ limit=300 แล้วเดินหน้าทีละ 300
          ทั้งที่เส้นให้ได้ 200 ⇒ ข้ามแถวรอบละ 100 ⇒ อ่านได้ 1,800 จาก 2,673 **แล้วรายงานว่าครบ**
          ท่อบอกด้วย limitClamped/limitNote อยู่แล้ว แต่ธงที่ต้องให้คนอ่านแล้วคำนวณเองจะถูกข้าม
       ⇒ เติม nextOffset/nextPage + pagingDone (เพิ่มอย่างเดียว ไม่ทับค่าที่ payload ส่งมาเอง) */
    {
      const applied = Number(out?.limitApplied ?? out?.limit ?? out?.applied?.limit);
      out = withPagingHint(out, applied, {
        offset: url.searchParams.get("offset"),
        page: url.searchParams.get("page"),
      });
    }
    /* ── ติดมาตรวัดไปกับทุกคำตอบ ── (5 ก.ย. 2569)
       เจ้าของร้านสั่ง "ไม่ย้าย แต่หาทางทำให้เร็วสุด ๆ" ⇒ ต้องเลิกเดาว่าเวลาหายไปไหน
       เปิด DevTools แท็บ Network ดูหัวข้อมูลได้ทันทีทุกคำขอ **ไม่ต้องรอ deploy รอบใหม่เพื่อวัด**
       x-d1-count = คุยกับฐานกี่รอบ · x-d1-ms = ผลบวกเวลาทุกรอบ · x-d1-max = รอบที่ช้าสุด
       ⚠️ ยิงพร้อมกันแล้ว x-d1-ms จะมากกว่าเวลาจริง ⇒ **อ่านคู่กับ x-d1-max เสมอ**
          count สูงแต่ max ต่ำ = ยิงพร้อมกันอยู่แล้ว (ดี) · count สูงและ ms ≈ เวลาจริง = ยังเรียงกันอยู่
       ⚠️ ไม่ใส่ค่าพวกนี้ลงใน body — จอบางตัวเอา body ไปเทียบตรง ๆ */
    const d1 = d1Stats();
    return new Response(JSON.stringify(out), {
      status,
      headers: {
        "content-type": "application/json",
        /* ⚠️ **ตัวบอกว่า "ท่อที่ตอบอยู่คือ build ไหน"** (ฝั่งจอขอ 6 ก.ย. 2569)
            ปัญหาที่แก้: จอแยกไม่ออกระหว่าง "เส้นยังไม่ deploy" กับ "เส้นขึ้นแล้วแต่ไม่มีข้อมูล"
            เดิมต้องเดาจาก **รูปของ body** ซึ่งพังทันทีที่เราเปลี่ยนรูป (ฝั่งจอเจอเอง 2 จุด)
            ⇒ ให้ท่อบอกเองว่าเป็น build เวลาไหน · **ไม่มีหัวนี้ = ท่อรุ่นเก่ากว่า 6 ก.ย. 2569**
            ⚠️ อยู่ใน **หัวข้อมูล ไม่ใช่ body** — จอหลายตัวเอา body ไปเทียบรูปตรง ๆ */
        "x-core-build": CORE_BUILD,
        ...(d1
          ? {
              "x-d1-count": String(d1.count),
              "x-d1-ms": String(d1.ms),
              "x-d1-max": String(d1.max),
              /* ⚠️ **หัวนี้คือตัวตัดสินว่าจอจะล้างแคชหรือไม่** (ฝั่งจอขอ 5 ก.ย. 2569)
                  ฝั่งเบราว์เซอร์แยกเองไม่ได้ เพราะ API ฝั่งนี้มี 10 ตัวที่เขียนข้อมูล
                  แต่เรียกด้วย GET (`?sync=1` `?recon=1` `?snapshot=1` `?init=1` …)
                  หน้าตาเหมือน GET ที่อ่านอย่างเดียวทุกประการ
                  ⇒ ให้จอจดรายชื่อเอง = วันที่มีคนเพิ่มตัวที่ 11 จอจะโชว์เลขผิดเงียบ ๆ
                  ⚠️ ส่งมาเฉพาะตอนเขียนจริง ไม่ส่ง "0" — จอเช็คแค่ว่ามีหัวนี้ไหม */
              ...(d1.wrote ? { "x-wrote": "1" } : {}),
            }
          : {}),
      },
    });
  };

  try {
    if (!coreReady()) {
      return json({ ready: false, note: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN ที่ Netlify" });
    }

    /* สัญญาคลังเงาระบุ method ของเส้นอ่านไว้ชัดเจน — อย่าปล่อย POST/DELETE
       ให้ไหลไปทำงานเดียวกับ GET เพราะ caller จะเข้าใจผิดว่าเขียนหรือแก้ข้อมูลสำเร็จ
       (โดยเฉพาะ sync/recon/snapshot เป็น GET ที่อาจอัปเดตกระจกระหว่างอ่าน) */
    const contractRead =
      !url.search ||
      ["sync", "shopeesync", "recon", "snapshot", "stock", "stockcompare"].some((key) =>
        url.searchParams.has(key)
      ) ||
      ["missing-sku", "orders", "stock", "moves"].includes(url.searchParams.get("list"));
    if (contractRead && req.method !== "GET") {
      return json({ error: "ต้องเป็น GET" }, 405);
    }

    /* ── ย้ายฐานไปโซนใกล้ฟังก์ชัน ── (5 ก.ย. 2569 เจ้าของร้านสั่งทำคืนนี้)
       ?d1move=plan|create|schema|copy|verify — **ห้ามข้ามขั้น** ดูลำดับใน lib/d1move.mjs
       ⚠️ ไม่มีคำสั่งไหนแตะฐานเดิมเลย · สับสวิตช์ทำด้วยการเปลี่ยน env เท่านั้น ไม่ได้อยู่ในโค้ด
       ⚠️ copy เรียกซ้ำได้ `done:false` = ยังไม่ครบ **ไม่ใช่ล้มเหลว** */
    if (url.searchParams.get("d1move")) {
      const step = String(url.searchParams.get("d1move"));
      const m = await import("../lib/d1move.mjs");
      const fn = { plan: m.movePlan, create: m.moveCreate, schema: m.moveSchema, copy: m.moveCopy, verify: m.moveVerify, ping: m.movePing }[step];
      if (!fn) return json({ error: `ไม่รู้จัก d1move=${step}`, accepts: ["plan", "create", "schema", "copy", "verify", "ping"] }, 400);
      return json({
        ok: true,
        step,
        ...(await fn({ table: url.searchParams.get("table"), chunk: url.searchParams.get("chunk") })),
      });
    }

    /* ฐานข้อมูลอยู่โซนไหน และไกลจากฟังก์ชันแค่ไหน — อ่านอย่างเดียว
       ⚠️ **ถามของจริง ไม่ใช่เชื่อคอมเมนต์** หัวไฟล์ coredb.mjs เขียนว่า APAC มาตลอด
          แต่ไม่เคยมีใครยิงถามสักครั้ง (stale-state-comments) */
    /* ซ้อมดันสต็อกกลับมาร์เก็ตเพลส — **อ่านอย่างเดียว ไม่เขียนกลับแพลตฟอร์มเลยสักบรรทัด**
       ⚠️ ตัวไลบรารีตั้งใจไม่มีคำสั่งเขียนอยู่จริง ๆ (ไม่ใช่ "มีแต่ปิดไว้")
          วันที่จะดันจริงต้องเขียนไฟล์ใหม่แยก **ห้ามเติม POST ลงไฟล์นั้น**
       ⚠️ ยิง Shopee + Lazada สด ⇒ ช้าราว 10 วินาที **เป็นเส้นกดเอง ห้ามให้จอเรียกตอนเปิดหน้า** */
    /* 🔴 ดันสต็อกจริง — เจ้าของร้านอนุมัติ 8 ก.ย. 2569 ("ทำเลย")
       POST เท่านั้น · body {platform:"lazada", skus:[...], allowClose?} · ระบุ SKU ชัดทุกครั้ง
       GET  ?stockpushlog=1 อ่านประวัติการยิง */
    if (url.searchParams.get("stockpushlive")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST — ตัวนี้เขียนของจริงขึ้นแพลตฟอร์ม" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      /* ตัวยิงแยกไฟล์ต่อเจ้า (17 ก.ย. 2569) — Lazada เส้นเดิมไม่แตะ · ทุกตัวรับ body อย่างเดียว (ยัดแผนจากข้างนอกไม่ได้) */
      const pf = String(body?.platform ?? "");
      let r;
      if (pf === "shopee") {
        const { shopeePushLive } = await import("../lib/stock-push-shopee.mjs");
        r = await shopeePushLive(body);
      } else if (pf === "tiktok") {
        const { tiktokPushLive } = await import("../lib/stock-push-tiktok.mjs");
        r = await tiktokPushLive(body);
      } else {
        const { stockPushLive } = await import("../lib/stock-push-live.mjs");
        r = await stockPushLive(body);
      }
      /* ✍️ ยิงมือต้องลงสมุด push_state ด้วย (ท่านประธานสั่ง 17 ก.ย. 2569) — ตัวกวาดเรียกตัวยิงตรง ไม่ผ่านเส้นนี้ ⇒ ไม่จดซ้ำ
         ⚠️ จดสมุดพลาด **ห้ามทำให้คำตอบการยิงหาย** — ยิงออกไปแล้ว ต้องบอกผลยิงเสมอ แล้วแนบว่าสมุดไม่ได้จด */
      if (r && !r.error && !r.dryCheck && Array.isArray(r.results)) {
        try {
          const { จดยิงมือลงสมุด } = await import("../lib/stock-push-sweep.mjs");
          r = { ...r, ledger: await จดยิงมือลงสมุด(pf || "lazada", r.results, r.at) };
        } catch (e) {
          r = { ...r, ledgerError: `ยิงแล้ว แต่จดลงสมุด push_state ไม่ได้: ${String(e?.message || e).slice(0, 160)}` };
        }
      }
      return okJson(r, r?.error ? 400 : 200);
    }
    /* 🔄 ตัวกวาดดันสต็อกอัตโนมัติ — ท่านประธานสั่ง 17 ก.ย. 2569 "อยากให้ออโต้ อัปเดตเอง"
       POST ?pushsweep=1   สั่งกวาดเดี๋ยวนั้น (ตัวตามเวลาไม่มี URL จึงต้องมีเส้นนี้เสมอ)
                           body {force:true} = ยิงจริงแม้ env `STOCK_PUSH_AUTO` ยังไม่เปิด
       GET  ?pushstate=1   สรุปให้จอสถานะ — **อ่านฐานอย่างเดียว ไม่ยิงแพลตฟอร์ม จึงเร็ว**
                           (ต่างจาก ?stockpush=1 ที่ยิงสดช้า ~10 วิ ⇒ เส้นนี้จอเรียกตอนเปิดหน้าได้) */
    if (url.searchParams.get("pushsweep")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST — ตัวนี้อาจเขียนของจริงขึ้นแพลตฟอร์ม" }, 405);
      const body = await req.json().catch(() => ({}));
      const { กวาดดันสต็อก } = await import("../lib/stock-push-sweep.mjs");
      const r = await กวาดดันสต็อก({
        platform: String(body?.platform || "lazada"),
        force: body?.force === true,
      });
      return okJson(r, r?.error ? 400 : 200);
    }
    /* 🧾 เติมสมุด push_state จากประวัติการยิง — POST · ค่าเริ่มต้นดูอย่างเดียว · body {apply:true, platforms?, since?} */
    if (url.searchParams.get("pushledgerbackfill")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST — ตัวนี้เขียนสมุดได้" }, 405);
      const body = await req.json().catch(() => ({}));
      const { เติมสมุดจากประวัติ } = await import("../lib/stock-push-sweep.mjs");
      const r = await เติมสมุดจากประวัติ({
        platforms: Array.isArray(body?.platforms) && body.platforms.length ? body.platforms : undefined,
        since: typeof body?.since === "string" ? body.since : null,
        apply: body?.apply === true,
      });
      return okJson(r, r?.error ? 400 : 200);
    }
    /* ---------- ?skuaudit=1 · รหัสตรงกันทุกแพลตฟอร์มไหม (ท่านประธานสั่ง 18 ก.ย. 2569) ----------
       **อ่านอย่างเดียว ไม่แก้อะไร** — การแก้รหัสบนแพลตฟอร์มกระทบของที่ขายอยู่จริง
       ต้องให้ท่านประธานตัดสินเป็นราย ๆ · เหตุผลเต็มอยู่หัวไฟล์ lib/sku-audit.mjs */
    if (url.searchParams.get("skuaudit")) {
      const { marketplaceListings } = await import("../lib/marketplace-listings.mjs");
      const { ourSkuSet } = await import("../lib/sku-match.mjs");
      const { auditSkus } = await import("../lib/sku-audit.mjs");
      const ml = await marketplaceListings({ fresh: url.searchParams.get("fresh") === "1" });
      /* ⚠️ ดึงรายชื่อจากแพลตฟอร์มไม่ได้เลย = **ห้ามตอบเป็นรายงานที่ดูสมบูรณ์**
         ต้องตอบว่าแปลผลไม่ได้ ไม่ใช่ตอบว่า "ไม่มีรหัสไหนผิด" (กฎ three-states-not-two) */
      if (!ml?.listings || !Object.keys(ml.listings).length) {
        return okJson({
          ok: false, inconclusive: true,
          why: "ดึงรายชื่อที่ลงขายจากแพลตฟอร์มไม่ได้รอบนี้ — ยังสรุปเรื่องรหัสไม่ได้",
          checked: ml?.checked ?? [], notConnected: ml?.notConnected ?? [],
        });
      }
      const r = auditSkus({
        listings: ml.listings,
        ourSkus: await ourSkuSet(coreQuery),
        checked: ml.checked || [],
      });
      return okJson({
        ...r,
        ดึงรายชื่อเมื่อ: ml.at ? new Date(ml.at).toISOString() : null,
        ช่องทางที่ยังไม่ได้ต่อ: ml.notConnected || [],
      });
    }
    if (url.searchParams.get("pushstate")) {
      const { สถานะดันสต็อก } = await import("../lib/stock-push-sweep.mjs");
      return okJson(await สถานะดันสต็อก());
    }
    /* GET ?pushstuck=1[&channel=&reason=&limit=&offset=] ⇒ รายรหัสที่ถูกข้าม/มี error ตรงจาก push_state
       ฝั่งจอขอ 18 ก.ย. 2569 เพราะ ?pushstate=1 ส่ง stuck มาแค่ 20 แถวและ last_error เป็น null ทุกแถว
       ⇒ เขาต้องอนุมานเหตุจาก ?stockpushlog=1 ซึ่งเป็นคนละแหล่ง (สมุดรอบกวาด ไม่ใช่คอลัมน์ในตาราง)
       ⚠️ คำตอบมี "⚠️ ขอบเขต" กำกับว่าไม่รวมรหัสที่ไม่ถูกส่งเพราะทิศลง (ยังไม่ถูกบันทึกลงตาราง) */
    /* 🕰️ ตารางงานตามเวลา — ฝั่งจอขอ 18 ก.ย. 2569 เพื่อเลิกพิมพ์ cron ซ้ำสองที่
       🔴 วันนี้ตารางเปลี่ยนสองรอบ (ลดเหลือวันละครั้ง แล้วกลับเป็นทุก 15 นาที)
          จอค้างค่าของรอบกลางอยู่ครึ่งวัน เพราะเลขถูกพิมพ์ไว้ทั้งฝั่งท่อและฝั่งจอ
          🔑 เกณฑ์เดียวกันต้องมีแหล่งเดียว — สองจอบอกคนละเลขเรื่องเดียวกัน แย่กว่าไม่มีเกณฑ์
       ⚠️ **ค่า cron ไม่ได้พิมพ์ไว้ที่นี่** มาจาก `netlify/lib/cron-table.mjs`
          ที่ `scripts/gen-cron-table.mjs` สร้างตอน build โดยอ่าน `export const config`
          ของไฟล์ฟังก์ชันจริง ⇒ แก้ตารางที่ไฟล์ฟังก์ชัน เส้นนี้เปลี่ยนเองรอบ build ถัดไป
       ⚠️ อ่านไฟล์ไม่ได้ ⇒ `jobs: null` + `readError` **ห้ามคืน [] ** เพราะ [] อ่านได้ว่า
          "ร้านไม่มีงานตามเวลา" ซึ่งดูเหมือนคำตอบสมบูรณ์ทั้งที่เป็นความพัง
       ⚠️ `generatedAt` คือเวลาที่ **build** ไม่ใช่เวลาที่ยิงคำขอ ⇒ จอใช้บอกได้ว่าตารางนี้เก่าแค่ไหน
          ไม่มี lastRunAt ให้ในรอบนี้โดยตั้งใจ — แหล่งเวลารันกระจายอยู่หลายตาราง
          ถ้าเดารวมมาให้ จอจะได้ค่าที่ดูเหมือนจริงแต่เชื่อไม่ได้ ⇒ ขอทำเป็นงานแยก */
    /* 📇 GET ?endpoints=1 — รายชื่อเส้น list ทั้งหมดที่ท่อรับ ให้ด่านฝั่งจอเทียบว่า "จอใช้หรือยัง"
       🔴 ที่มา: ฝั่งจอเจอ `list=channel-gaps` ที่ไม่มีจอไหนใช้เลย **ด้วยการยิงชื่อมั่วโดยบังเอิญ**
          (และเป็นเรื่องเงิน — 91 รหัสที่เคยขายได้แล้วเงียบ ทั้งที่มีของในคลังเกือบแสนชิ้น)
          ⇒ ท่อมีของที่ไม่มีใครรู้ว่ามี และวิธีค้นพบคือความบังเอิญ ⇒ เปิดเส้นให้ตรวจได้แทน
       ⚠️ `lists: null` = อ่านรายชื่อไม่ได้ **ไม่ใช่ "ท่อไม่มีเส้นไหนเลย"** (สามสถานะ ห้ามยุบ)
       ⚠️ รายชื่อนี้บอกแค่ว่า **ท่อรับชื่อนี้** ไม่ได้บอกว่าเส้นนั้นคืนข้อมูลได้จริง
          ⇒ ด่านฝั่งจอใช้เทียบ "มี/ไม่มีคนเรียก" ได้ · **ห้ามใช้สรุปว่าเส้นนั้นใช้งานได้** */
    /* 🔍 GET ?dupsku=1 — หาแถวที่ sku ถูกตัดสั้น แล้วมีอีกแถวที่ sku เต็มขึ้นต้นเหมือนกัน
       🔴 ที่มา 18 ก.ย. 2569: `syncProducts` เคยตัด sku ที่ **60 ตัวอักษร** (แก้แล้ว)
          ⇒ สินค้าที่ sku ยาวกว่านั้นถูกเขียนด้วยคีย์สั้น ⇒ JOIN กับ stock_snapshots ไม่ติด
          ⇒ **หลัง deploy ตัวซิงก์จะเขียนแถวใหม่ด้วย sku เต็ม ⇒ มีทั้งแถวสั้นและแถวเต็มพร้อมกัน**
             ⇒ จอสินค้าจะนับสองแถว ตัวเลขบนหัวจอขยับขึ้นโดยไม่มีใครรู้ว่าทำไม (ฝั่งจอชี้เอง)
       ⚠️ **ตัวนี้อ่านอย่างเดียว — ยังไม่มีตัวลบ โดยตั้งใจ**
          ต้องรู้ก่อนว่ามีกี่แถวและหน้าตาอย่างไร แล้วค่อยเขียนตัวลบ
          (กฎ: อย่าเขียนตัวแก้ก่อนรู้ขอบเขต · ตัวแก้ที่กว้างเกินจะลบของถูกไปด้วย)
       ⚠️ **ต้องลบหลัง deploy เท่านั้น** — ลบก่อน deploy ตัวซิงก์รอบถัดไปจะเขียนแถวสั้นกลับมาอีก
       ⚠️ เกณฑ์ `LENGTH(sku) = 60` เจาะจงมาก (ความยาวที่เคยตัด) ⇒ ไม่แตะ sku ปกติที่สั้นกว่า
          สินค้าที่ sku ยาว 60 พอดีโดยธรรมชาติจะถูกรายงานด้วย ⇒ จึงต้องมีคู่ที่ขึ้นต้นเหมือนกันด้วย */
    if (url.searchParams.get("dupsku")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      const rows = await coreQuery(
        `SELECT a.sku AS skuสั้น, LENGTH(a.sku) AS ยาว, a.name AS ชื่อ,
                (SELECT COUNT(*) FROM products b
                  WHERE LENGTH(b.sku) > 60 AND SUBSTR(b.sku,1,60) = a.sku) AS มีคู่ยาวกว่า
         FROM products a
         WHERE LENGTH(a.sku) = 60
         ORDER BY มีคู่ยาวกว่า DESC, a.sku
         LIMIT 50`
      ).catch(() => null);
      if (!Array.isArray(rows)) return okJson({ inconclusive: true, why: "อ่านตาราง products ไม่ได้รอบนี้" }, 503);
      const ซ้ำจริง = rows.filter((r) => Number(r["มีคู่ยาวกว่า"]) > 0);
      return okJson({
        แถวที่ยาว60พอดี: rows.length,
        ที่มีคู่ยาวกว่าขึ้นต้นเหมือนกัน: ซ้ำจริง.length,
        รายการ: ซ้ำจริง.slice(0, 10),
        ตัวอย่างที่ยาว60แต่ไม่มีคู่: rows.filter((r) => !Number(r["มีคู่ยาวกว่า"])).slice(0, 5),
        "⚠️ ขอบเขต":
          "อ่านอย่างเดียว ไม่ลบอะไร · เกณฑ์คือ sku ยาว 60 พอดี (ความยาวที่ syncProducts เคยตัด) " +
          "และมีอีกแถวที่ sku ยาวกว่า 60 ขึ้นต้นด้วย 60 ตัวเดียวกัน · " +
          "ที่มีคู่ยาวกว่า > 0 คือแถวที่ควรลบ · ที่ไม่มีคู่ อาจเป็น sku ที่ยาว 60 พอดีจริง ๆ **ห้ามลบ** · " +
          "ต้องยิงหลัง deploy เท่านั้น ก่อน deploy จะยังไม่มีแถวยาวให้จับคู่",
      });
    }
    if (url.searchParams.get("endpoints")) {
      let t = null, readError = null;
      try {
        t = await import("../lib/endpoints.mjs");
      } catch (e) {
        readError = String(e?.message || e).slice(0, 200);
      }
      const lists = Array.isArray(t?.lists) ? t.lists : null;
      /* 🔴 **กองที่สองสำคัญ** — `list=` ไม่ใช่รูปเดียวของเส้นในท่อ
         อีกสายเพิ่ม `?skuaudit=1` ในชั่วโมงเดียวกับที่ผมสร้างเส้นนี้ ⇒ `lists` ไม่ขยับเลย
         ⇒ ถ้าส่งแค่ `lists` ด่านฝั่งจอจะเชื่อว่าครอบทุกเส้น แล้วพลาดเส้นทั้งกองนี้ */
      const paramRoutes = Array.isArray(t?.paramRoutes) ? t.paramRoutes : null;
      return okJson({
        generatedAt: t?.generatedAt ?? null,
        source: t?.source ?? null,
        lists,
        ทั้งหมด: lists ? lists.length : null,
        paramRoutes,
        paramRoutesนับได้: paramRoutes ? paramRoutes.length : null,
        readError,
        "⚠️ ขอบเขต":
          "รายชื่อสร้างตอน build โดยอ่านซอร์ส core.mjs — ไม่ใช่รายชื่อที่คนพิมพ์ · " +
          "บอกว่าท่อ 'รับชื่อนี้' เท่านั้น ไม่ได้บอกว่าเส้นนั้นคืนข้อมูลได้จริง · " +
          "null = อ่านไม่ได้ ไม่ใช่ไม่มีเส้น · generatedAt คือเวลา build ไม่ใช่เวลายิงคำขอ",
        "⚠️ ขอบเขตของ paramRoutes":
          "กองนี้ **หยาบกว่า lists** มาจาก if (searchParams.get(\"xxx\")) ซึ่งปนกับตัวกรองได้ " +
          "(ตัดชื่อที่รู้ว่าเป็นตัวกรองออกแล้ว แต่ไม่รับประกันว่าสะอาด) " +
          "⇒ ใช้เป็น 'รายการที่ต้องดูด้วยตา' **ห้ามนับเป็นจำนวนเส้นที่แน่นอน** และห้ามเอาไปทำตัวเลขบนจอ",
      });
    }
    if (url.searchParams.get("crontable")) {
      let t = null, readError = null;
      try {
        t = await import("../lib/cron-table.mjs");
      } catch (e) {
        readError = String(e?.message || e).slice(0, 200);
      }
      const jobs = Array.isArray(t?.jobs) ? t.jobs : null;
      return okJson({
        ok: !!jobs,
        generatedAt: t?.generatedAt ?? null,
        source: t?.source ?? null,
        jobs,
        ทั้งหมด: jobs ? jobs.length : null,
        readError,
        "⚠️ ขอบเขต":
          "cron อ่านจาก export const config ของไฟล์ฟังก์ชันตอน build — ไม่ใช่ค่าที่พิมพ์ไว้ในเส้นนี้ · " +
          "generatedAt คือเวลาที่ build ไม่ใช่เวลาที่ยิงคำขอ · " +
          "ยังไม่มี lastRunAt/lastRunOk ในรอบนี้ (แหล่งเวลารันกระจายหลายตาราง จะเดารวมให้ไม่ได้) · " +
          "jobs เป็น null = อ่านตารางไม่ได้ ไม่ใช่ไม่มีงานตามเวลา",
      });
    }
    if (url.searchParams.get("pushstuck")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { รายรหัสที่ค้าง } = await import("../lib/stock-push-sweep.mjs");
      const r = await รายรหัสที่ค้าง({
        channel: url.searchParams.get("channel"),
        reason: url.searchParams.get("reason"),
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
      });
      return okJson(r, r?.error ? 400 : 200);
    }
    if (url.searchParams.get("stockpushlog")) {
      const { getStore } = await import("@netlify/blobs");
      const log = await getStore({ name: "gucut-coupon", consistency: "strong" })
        .get("stockpush/log", { type: "json" }).catch(() => null);
      return json({ ok: true, log: Array.isArray(log) ? log : [] });
    }
    /* 🔐 ตรวจสิทธิ์เขียนสต็อก Shopee/TikTok ด้วยรหัสปลอม — GET · ไม่เปลี่ยนสต็อก (ดูหัวไฟล์ stock-write-probe.mjs) */
    /* 🧱 ด่านใบค้างส่ง (⑧) — GET อ่านอย่างเดียว · คืนแค่จำนวน + ตัวอย่างรหัส ไว้ตรวจกับของจริงก่อนต่อตัวยิง */
    if (url.searchParams.get("stockpushguards")) {
      const { รหัสในใบค้างส่ง } = await import("../lib/stock-push-guards.mjs");
      const r = await รหัสในใบค้างส่ง();
      if (r.error) return okJson({ ok: false, error: r.error });
      return okJson({ ok: true, ใบค้างส่ง: r.orders, บรรทัด: r.lines, รหัสที่ถูกกัน: r.skus.size,
        ตัวอย่าง: [...r.skus].slice(0, 20), note: "รวมชุด↔ชิ้นส่วนสองทิศแล้ว · ทั้งสองร้าน" });
    }
    if (url.searchParams.get("stockwriteprobe")) {
      if (req.method !== "GET") return json({ error: "เส้นนี้ GET เท่านั้น" }, 405);
      const { ตรวจสิทธิ์เขียนสต็อก } = await import("../lib/stock-write-probe.mjs");
      return okJson(await ตรวจสิทธิ์เขียนสต็อก({ ขนาด: url.searchParams.get("size") }));
    }
    if (url.searchParams.get("stockpushverify")) {
      const skus = String(url.searchParams.get("stockpushverify")).split(",").filter(Boolean);
      const { lazadaReadBack } = await import("../lib/stock-push-live.mjs");
      return okJson(await lazadaReadBack(skus));
    }
    /* GET ?stockpush=1[&platform=shopee|lazada|tiktok][&full=1]
       full=1 ต้องระบุเจ้าเดียว (สัญญากับฝั่งจอ 14 ก.ย. 2569) · ทุกคำตอบมี pushScope/pushShown/pushCapped/pushComplete */
    if (url.searchParams.get("stockpush")) {
      const { stockPushView } = await import("../lib/stock-push.mjs");
      const r = await stockPushView({
        platform: url.searchParams.get("platform"),
        full: url.searchParams.get("full"),
      });
      if (r.error) return json({ ok: false, ...r }, 400);
      return json({ ok: true, ...r });
    }

    /* POST ?imgmirror=1 body {sku, source, files:{128,256,384,640: base64 webp}} ⇒ เก็บรูปย่อเข้า R2 + products.image_file
       ใบ t_mu2utot5 (ท่านประธานสั่ง "รูปต้องขึ้นทุกรหัส") · ตัวย่ออยู่บน g1 (Netlify ไม่มี sharp) · ต้องมี x-admin-key
       🔒 source ต้องตรง products.image_path ของ sku นั้น · ต้องเป็น webp จริงครบ 4 ขั้น ⇒ ยัดไฟล์อื่นเข้าถังไม่ได้ */
    if (url.searchParams.get("imgmirror")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { saveMirroredImage } = await import("../lib/product-image-mirror.mjs");
      const r = await saveMirroredImage(body);
      return json(r, r.ok ? 200 : r.unknown ? 502 : 400);
    }
    /* GET ?mkpfinanceprobe=1 — สิทธิ์ API การเงิน Shopee/Lazada/TikTok (ชื่อช่องเท่านั้น ไม่มีค่า) · ใบ t_mu2wjrcf */
    if (url.searchParams.get("mkpfinanceprobe")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { probeMarketplaceFinance } = await import("../lib/mkp-finance-probe.mjs");
      return okJson({ ...(await probeMarketplaceFinance()) });
    }
    /* GET ?mkpfinance=1[&days=7&limit=20] — รายการเงินจริงของ 3 มาร์เก็ตเพลส ทำให้เป็นรูปเดียวกัน · ใบ t_mu2xtzr2
       🔒 คืนเฉพาะช่องที่จับคู่ไว้ (allowlist) — ชื่อผู้ซื้อ/ข้อความอิสระไม่ออกมาด้วย ดู mkp-finance.mjs
       ⚠️ ยังไม่เขียนลงฐาน โดยตั้งใจ: ขั้นนี้ให้ยืนยันการจับคู่คอลัมน์กับจอ Marketplace ของ ZORT ก่อน
       ⚠️ ยอดสามเจ้าคนละระดับ (grain) ⇒ จอห้ามบวกรวมกัน ทุกเจ้ามีป้าย scope ติดมาแล้ว */
    if (url.searchParams.get("mkpfinance")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { readMarketplaceFinance } = await import("../lib/mkp-finance.mjs");
      return okJson({ ...(await readMarketplaceFinance({
        days: url.searchParams.get("days"), limit: url.searchParams.get("limit"),
        page: url.searchParams.get("page"), pageToken: url.searchParams.get("pagetoken"),
        to: url.searchParams.get("to"),
      })) });
    }
    /* GET ?mkpfees=1&platform=shopee&id=<order_sn> | &platform=tiktok&id=<statement id>
       ⇒ ค่าธรรมเนียม **รายเอกสาร** (ของที่จะเติมคอลัมน์ 13 ช่องของ ZORT ได้) · ใบ t_mu2xtzr2
       🔒 allowlist เข้ม: escrow ของ Shopee มีชื่อผู้ซื้อ/ที่อยู่ ⇒ คืนเฉพาะช่องเงินที่ระบุไว้
       ⚠️ Lazada ไม่มีในเส้นนี้ เพราะงบของเขาเป็นรายบรรทัดอยู่แล้ว (ดู ?mkpfinance=1) */
    if (url.searchParams.get("mkpfees")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const plat = String(url.searchParams.get("platform") ?? "").trim().toLowerCase();
      const id = url.searchParams.get("id");
      const m = await import("../lib/mkp-finance.mjs");
      if (plat === "shopee") return okJson(await m.readShopeeOrderFees(id));
      if (plat === "tiktok") return okJson(await m.readTiktokStatementLines(id, { limit: url.searchParams.get("limit") }));
      return json({ error: "platform ต้องเป็น shopee หรือ tiktok (Lazada ใช้ ?mkpfinance=1 ซึ่งเป็นรายบรรทัดอยู่แล้ว)" }, 400);
    }
    /* POST ?mkpfeesync=1[&days=14&limit=20&refresh=1] ⇒ เติมกระจกค่าธรรมเนียม Shopee ทีละรอบ
       GET  ?mkpfeesum=1[&days=30]                   ⇒ สรุปจากกระจก (ไม่ยิง Shopee เลย)
       🔴 **Shopee เท่านั้น** — เป็นเจ้าเดียวที่สูตรถูกวัดกับของจริงแล้ว (ต่าง 1 บาทใน 6/8 ใบ)
          Lazada/TikTok ห้ามลอกไปใช้โดยไม่วัดใหม่ · เขียนเหตุผลเต็มไว้ในหัว mkp-finance-mirror.mjs
       ⚠️ เป็น POST เพราะมัน **เขียนฐาน** — ผิด method ต้องได้ 405 ไม่ใช่ทำงานเงียบ ๆ */
    if (url.searchParams.get("mkpfeesync")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST (เส้นนี้เขียนฐาน)" }, 405);
      const { mirrorShopeeFees } = await import("../lib/mkp-finance-mirror.mjs");
      return okJson(await mirrorShopeeFees({
        days: url.searchParams.get("days"),
        limit: url.searchParams.get("limit"),
        refresh: url.searchParams.get("refresh") === "1",
      }));
    }
    if (url.searchParams.get("mkpfeesum")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { shopeeFeesSummary } = await import("../lib/mkp-finance-mirror.mjs");
      return okJson(await shopeeFeesSummary({ days: url.searchParams.get("days") }));
    }
    if (url.searchParams.get("dbinfo")) {
      return okJson(await d1Info());
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
    /* ── เขียนกลับ ZORT (จอหลังร้านตัวใหม่เรียกผ่านท่อกลาง) ──
       POST /api/core?addproduct=1  body {ref, sku, name, price?, cost?, unit?, barcode?, category?}
       POST /api/core?addpo=1       body {ref, vendor?, note?, items:[{sku,name?,qty,price?}]}
       ⚠️ **เขียนเข้า ZORT ไม่ใช่เขียนลง D1** — คลังเงายังเป็นกระจกที่ซิงก์ทับทุกครึ่งชั่วโมง
          เขียนลง D1 เอง = รอบซิงก์ถัดไปทับหาย · ให้ ZORT เป็นตัวจริงไปก่อน แล้วกระจกดูดกลับเอง
       ⚠️ **ต้องมี ref เสมอ** กันยิงซ้ำ · คืน added กับ duplicate แยกกัน จอต้องบอกคนใช้ตรง ๆ
       ⚠️ ผิด method = 405 (เคยพลาดมาแล้ว 2 ก.ย. 2569 ปุ่มลบเขียนเป็น POST แล้วเงียบไป) */
    if (url.searchParams.get("addproduct")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { zortAddProduct } = await import("../lib/zort-write.mjs");
      const r = await zortAddProduct(body);
      return json(r, r.ok ? 200 : 400);
    }
    /* POST   ?updateproduct=1 body {ref, id, sku, name?, description?, price?, cost?, unit?, barcode?, category?,
                                    weight?, height?, length?, width?, vat?}  ⇒ ZORT Product/UpdateProduct?id=
       DELETE ?deleteproduct=<id ของ ZORT>&sku=<sku ที่คาดไว้>&ref=<ref>[&confirm=1]  ⇒ ZORT Product/DeleteProduct?id=
       🔴 id คือ **id ของ ZORT ไม่ใช่ sku** · ตอนยืนยันท่อถาม ZORT ก่อนว่า id ตรง sku · ลบต้องสต็อก 0 ด้วย
       ⚠️ โหมดซ้อมเป็นค่าเริ่มต้น · ยังไม่เคยยิงจริงทั้งคู่ · ผิด method = 405 · งานกระดาน t_mu0m97e5 ขั้น ③ */
    if (url.searchParams.get("updateproduct")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { zortUpdateProduct } = await import("../lib/zort-write.mjs");
      const r = await zortUpdateProduct(body);
      return json(r, r.ok ? 200 : 400);
    }
    if (url.searchParams.has("deleteproduct")) {
      if (req.method !== "DELETE") return json({ error: "ต้องเป็น DELETE" }, 405);
      const q = url.searchParams;
      const { zortDeleteProduct } = await import("../lib/zort-write.mjs");
      const r = await zortDeleteProduct({ id: q.get("deleteproduct"), sku: q.get("sku"), ref: q.get("ref"),
        confirm: q.get("confirm") === "1" });
      return json(r, r.ok ? 200 : 400);
    }
    /* GET  ?zortproduct=<sku>       ⇒ {found, product:{id, sku, name, barcode, sellprice, purchaseprice, stock, ...}}
            หา id ของ ZORT ก่อนแก้/ลบ/เปลี่ยนรูป (กระจก D1 ไม่มี id) · ต้นทุน = purchaseprice **ไม่ใช่ต้นทุนเฉลี่ย**
       GET  ?productlabels=<sku,sku> ⇒ ข้อมูลฉลากบาร์โค้ด ≤20 รหัส · ZORT ไม่มี API พิมพ์ จอพิมพ์เอง
       POST ?productimage=1 body {ref, id, sku, image (base64|data URL ≤4MB), confirm?} ⇒ ZORT Product/UpdateProductImage?id=
       ⚠️ งานกระดาน t_mu0m98gq · รูป: โหมดซ้อมเป็นค่าเริ่มต้น · ยังไม่เคยยิงจริง · ผิด method = 405
       ⚠️ ถาม ZORT ไม่สำเร็จ = 502 (ไม่รู้) แยกจาก 400 (ข้อมูลที่ส่งมาผิด) */
    if (url.searchParams.has("zortproduct")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { zortFindProduct } = await import("../lib/zort-write.mjs");
      const r = await zortFindProduct(url.searchParams.get("zortproduct"));
      return json(r, r.ok ? 200 : r.unknown ? 502 : 400);
    }
    /* GET ?zortpo=<เลขที่ใบสั่งซื้อ> ⇒ {found, purchaseOrder:{id, number, status, warehousecode, amount, paymentstatus, lines}}
       หา id ของ ZORT ก่อนรับของ/ตรวจนับ (?poreceive ต้องใช้ id · กระจก D1 ไม่มี id) · งานกระดาน t_mu0tx40g
       🔴 เลขที่ใบซ้ำกันได้ ⇒ เจอหลายใบ = 400 + ids ไม่เดา · ถาม ZORT ไม่สำเร็จ = 502 (ไม่รู้) · อ่านอย่างเดียว */
    /* 🔒 ด่านร้าน (15 ก.ย. 2569 · ใบ t_mu2pekwt) — zort-write ใช้รหัส ZORT ร้าน z1 อย่างเดียว
       จอใบซื้อรายใบเปิดใบร้าน z2 ได้แล้ว แต่กล่องรับของยิงเส้นนี้ ⇒ เลขที่ใบซ้ำข้ามร้านได้ = อาจได้ใบ z1 คนละใบ
       ⇒ ส่ง store ที่ไม่ใช่ z1 มา = 400 ชัด · ไม่ส่ง = z1 เหมือนเดิม (จอเดิมไม่พัง) */
    if (url.searchParams.has("zortpo")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      if (url.searchParams.get("store") && url.searchParams.get("store") !== "z1")
        return json({ ok: false, error: "ร้าน z2 ยังไม่รองรับ — เส้นนี้อ่าน/เขียน ZORT ด้วยรหัสร้าน z1 เท่านั้น (zort-write creds) · ไม่ถอยไปใช้ z1 เงียบ ๆ" }, 400);
      const { zortFindPurchaseOrder } = await import("../lib/zort-write.mjs");
      const r = await zortFindPurchaseOrder(url.searchParams.get("zortpo"));
      return json(r, r.ok ? 200 : r.unknown ? 502 : 400);
    }
    /* GET ?zortpoid=<id ของ ZORT> ⇒ {found, purchaseOrder:{id, number, status, amount, paymentstatus}}
       อ่านใบสั่งซื้อด้วย id (หลังสร้างใบ ZORT คืนแค่ detail.id) · ใช้ยืนยันก่อน/หลังยกเลิก · งานกระดาน t_mu1bh3s7
       ถามไม่สำเร็จ = 502 (ไม่รู้) · ไม่พบ = 200 found:false */
    if (url.searchParams.has("zortpoid")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      if (url.searchParams.get("store") && url.searchParams.get("store") !== "z1")
        return json({ ok: false, error: "ร้าน z2 ยังไม่รองรับ — เส้นนี้อ่าน/เขียน ZORT ด้วยรหัสร้าน z1 เท่านั้น (zort-write creds) · ไม่ถอยไปใช้ z1 เงียบ ๆ" }, 400);
      const { zortGetPurchaseOrderById } = await import("../lib/zort-write.mjs");
      const r = await zortGetPurchaseOrderById(url.searchParams.get("zortpoid"));
      return json(r, r.ok ? 200 : r.unknown ? 502 : 400);
    }
    /* GET ?zortlist=<incomes|expenses|moneytransfers|variations|transfers|returnpurchaseorders>[&from=yyyy-MM-dd&to=yyyy-MM-dd&keyword=&page=&limit=&type=]
       type= ใช้กับ transfers เท่านั้น (Transfer · Initial · Adjust · Assembly · Disassembly · Reserve)
       ขาเข้าจากจอ: พารามิเตอร์ใน URL ตามนี้ · ขาออกไป ZORT: Finance/GetIncomes · GetExpenses · GetMoneyTransfers · Product/GetVariations
       ⇒ {ok, kind, label, applied, count, rowKeys, rows (แถวดิบของ ZORT)} · อ่านอย่างเดียว ส่งตรงไม่เก็บลงคลังเงา
       ถาม ZORT ไม่สำเร็จ = 502 unknown (ห้ามแปลว่าว่าง) · พารามิเตอร์ผิด = 400 · ใบ t_mu1bkrdw ของ gucut2 */
    if (url.searchParams.has("zortlist")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { zortReadList } = await import("../lib/zort-finance.mjs");
      const q = url.searchParams;
      const r = await zortReadList({
        kind: q.get("zortlist"), from: q.get("from") ?? undefined, to: q.get("to") ?? undefined,
        keyword: q.get("keyword") ?? undefined, page: q.get("page") ?? undefined, limit: q.get("limit") ?? undefined,
        type: q.get("type") ?? undefined,
      });
      return json(r, r.ok || r.skip ? 200 : r.unknown ? 502 : 400);
    }
    /* POST ?archiveslips=1  body {docnos:[เลขที่ออเดอร์ ≤8]} ⇒ ดึงสลิปของออเดอร์จาก ZORT เก็บลง Blobs ถังปิด gucut-zort-slips
            ⇒ {ok, orders:[{docno, zortFiles, stored, already, bad, errors}], notStarted, totals, complete}
       GET  ?slipsarchive=1[&expected=<จำนวนท้ายจอ ZORT>] ⇒ {files, orders, byOrder, complete} — นับอย่างเดียว
       ขาเข้า: ตัวขับ (สคริปต์ CEO) ส่งเลขที่ออเดอร์จากจอ /FileUpload/list · ขาออกไป ZORT: Order/GetOrderFiles · GetOrderFileDetail (GET)
       🔒 ไม่มีเส้นไหนคืนตัวไฟล์ · ถังแยกจาก gucut-zort-archive โดยตั้งใจ · เก็บแล้วไม่ดึงซ้ำ · html/ว่าง = ไม่เก็บ นับไม่ครบ
       ⚠️ สรุปอ่านรายการที่เก็บไม่ได้ = 502 unknown (ห้ามแปลว่ายังไม่มีไฟล์) · งานกระดาน t_mu1y49yb */
    if (url.searchParams.has("archiveslips")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { archiveSlips } = await import("../lib/slip-archive.mjs");
      const r = await archiveSlips({ docnos: body.docnos });
      return json(r, r.ok ? 200 : 400);
    }
    /* GET ?slipscan=1 — สั่งตัวไล่ดึงสลิปใหม่หนึ่งรอบเดี๋ยวนั้น (งานตามเวลา slips-sync :50) · ใบ t_mu2sow9d
       ขาออก: {ok, since, wrapped, scanned, skippedBad, notStarted, stored, errors, bad, cursor} · เขียนแค่ถังปิดของเรา ไม่เขียน ZORT */
    if (url.searchParams.has("slipscan")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { slipScanStep } = await import("../lib/slip-scan.mjs");
      const r = await slipScanStep();
      return json(r, r.ok ? 200 : 502);
    }
    if (url.searchParams.has("slipsarchive")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { slipArchiveSummary } = await import("../lib/slip-archive.mjs");
      const r = await slipArchiveSummary({ expectedFiles: url.searchParams.get("expected") ?? undefined });
      return json(r, r.ok ? 200 : 502);
    }
    /* GET ?slips=<เลขที่ใบ> — รายการสลิปที่เก็บไว้ของใบเดียว (15 ก.ย. 2569 · จอรายละเอียดใบขาย)
       ขาเข้าจากจอ: ?slips=SO-… · ขาออก: {ok, docno, count, files:[{fileid, kind, bytes, archivedAt}], note}
       GET ?slip=<เลขที่ใบ>&fileid=<ตัวเลข> — ตัวไฟล์หนึ่งไฟล์ (ไบต์จริง ไม่ใช่ JSON)
       🔒 ต้องผ่าน adminGate (ตั๋วอัปโหลดเข้าไม่ถึง — ตั๋วถูกกันไว้เฉพาะ UPLOAD_PATHS) · ไม่มีเส้นรายชื่อทั้งถัง
       ⚠️ ท่อกลาง /api/web ของจอส่งต่อแค่ content-type กับหัว x- ⇒ cache-control ข้างล่างไม่ถึงเบราว์เซอร์ถ้าไม่แก้ฝั่งนั้น */
    if (url.searchParams.has("slips")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { listOrderSlips } = await import("../lib/slip-archive.mjs");
      const r = await listOrderSlips({ docno: url.searchParams.get("slips") });
      return json(r, r.ok ? 200 : r.unknown ? 502 : 400);
    }
    if (url.searchParams.has("slip")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { readOrderSlip } = await import("../lib/slip-archive.mjs");
      const r = await readOrderSlip({ docno: url.searchParams.get("slip"), fileid: url.searchParams.get("fileid") });
      if (!r.ok) return json(r, r.status || 400);
      return new Response(r.buf, {
        status: 200,
        headers: {
          "content-type": r.contentType,
          "x-core-build": CORE_BUILD,
          "x-slip-archived-at": String(r.archivedAt ?? ""),
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
          // ชื่อไฟล์ตั้งจาก fileid เอง ไม่ใช้ชื่อเดิมที่ ZORT ส่งมา (อาจมีชื่อลูกค้า)
          "content-disposition": `inline; filename="slip-${r.fileid}.${r.kind === "jpeg" ? "jpg" : r.kind}"`,
        },
      });
    }
    /* GET ?zortfiles=<order|purchaseorder|quotation|returnorder|returnpurchaseorder>&docid=<id ของ ZORT> | &docno=<เลขที่เอกสาร> [&fileid=<id ไฟล์>]
       ขาเข้าจากจอ/ตัวตรวจ: พารามิเตอร์ใน URL ตามนี้ (ตั้งชื่อ docid/docno ไม่ใช้ id/number กันชนเส้นอื่น)
       ขาออกไป ZORT: <โมดูล>/Get<โมดูล>Files · <โมดูล>/Get<โมดูล>FileDetail (GET อย่างเดียว)
       ⇒ ไม่มี fileid: {ok, applied, count, rowKeys, topKeys, files:[{id, fileName, type}]}
       ⇒ มี fileid:   {ok, applied, fileKeys, file:{id, fileName, type, hasContent, base64Chars, bytes, kind}}
       🔒 **ไม่ส่งตัวไฟล์ออก** (สลิปมีข้อมูลลูกค้า) · kind ดูจากไบต์จริง — "html" = ได้หน้าเว็บ ไม่ใช่ไฟล์
       ถาม ZORT ไม่สำเร็จ/รูปคำตอบไม่รู้จัก = 502 unknown (ห้ามแปลว่าไม่มีไฟล์) · ZORT ปฏิเสธ = 400 + zortCode · งานกระดาน t_mu1xao7r */
    if (url.searchParams.has("zortfiles")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { zortDocFiles } = await import("../lib/zort-files.mjs");
      const q = url.searchParams;
      const r = await zortDocFiles({ doc: q.get("zortfiles"), docid: q.get("docid") ?? undefined,
        docno: q.get("docno") ?? undefined, fileid: q.get("fileid") ?? undefined });
      return json(r, r.ok || r.skip ? 200 : r.unknown ? 502 : 400);
    }
    /* GET ?zortbundle=<sku ของชุด> ⇒ ตัวตรวจอ่านอย่างเดียว: GetBundles หา id → GetBundleDetail?id= คืนรูปคำตอบดิบ
       ใช้ตัดสินว่า "สินค้าในชุด" ซิงก์ผ่าน API ได้ไหม · งานกระดาน t_mu1bh4vh
       ถาม ZORT ไม่สำเร็จ = 502 (ไม่รู้) · ไม่พบชุด = 200 found:false */
    if (url.searchParams.has("zortbundle")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { probeBundleDetail } = await import("../lib/core-products.mjs");
      const r = await probeBundleDetail(url.searchParams.get("zortbundle"), url.searchParams.get("wh") ?? undefined);
      return json(r, r.ok ? 200 : r.unknown ? 502 : 400);
    }
    if (url.searchParams.has("productlabels")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { zortProductLabels } = await import("../lib/zort-write.mjs");
      const r = await zortProductLabels(url.searchParams.get("productlabels"));
      return json(r, r.ok ? 200 : r.failed?.length ? 502 : 400);
    }
    if (url.searchParams.get("productimage")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { zortUpdateProductImage } = await import("../lib/zort-write.mjs");
      const r = await zortUpdateProductImage(body);
      return json(r, r.ok ? 200 : 400);
    }
    if (url.searchParams.get("addpo")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { zortAddPurchaseOrder } = await import("../lib/zort-write.mjs");
      const r = await zortAddPurchaseOrder(body);
      return json(r, r.ok ? 200 : 400);
    }
    /* ── งานกระดาน t_mu0p3521 · ท่อ 4 ฟีเจอร์ที่ยังไม่มีเส้นเขียน (เอกสาร ZORT V4 · ยังไม่เคยยิงจริง · โหมดซ้อมเป็นค่าเริ่มต้น) ──
       POST ?addpo=1 เพิ่มช่อง status ("Pending"|"Success") · paid + paymentMethod  ⇒ "สร้างรายการซื้อแบบเร็ว" (buy-create-quick)
       POST ?addquotations=1   body {rows:[<body ของ ?addquotation=1>…] ≤20, confirm?}      ⇒ นำเข้าใบเสนอราคาหลายใบ (ทีละใบ)
       POST ?ordershipping=1   body {ref, id, trackingNo?, shippingChannel?, shippingDate?, confirm?}  ⇒ Order/EditOrderInfo?id=
       POST ?ordershippingbatch=1 body {rows:[…] ≤20, confirm?}                           ⇒ นำเข้าเลขพัสดุจาก Excel
       POST ?poreceive=1       body {ref, id, warehouse?, date?, items?:[{sku, qty}], confirm?}
                               ⇒ มี items = UpdatePartialPurchaseOrder · ไม่มี = UpdatePurchaseOrderStatus status=1 (รับครบ)
       🔴 ออเดอร์/ใบซื้อ **ต้องใช้ id ของ ZORT** ไม่รับเลขที่ใบ (เลขที่เอกสารซ้ำกันได้) · ชุดหยุดกลางทาง = complete:false + nextRow
       ⚠️ "ตั้งค่ากระจายสินค้า" ไม่พบ API (ZORT_NO_API) · "จองขนส่ง" มีเส้นแต่ไม่ทำจนกว่าท่านประธานอนุมัติ (ZORT_CAN_BUT_NOT_BUILT) */
    for (const [key, fnName] of [["addquotations", "zortAddQuotations"], ["ordershipping", "zortOrderShipping"],
      ["ordershippingbatch", "zortOrderShippingBatch"], ["poreceive", "zortReceivePurchaseOrder"],
      /* POST ?addpurchasereturn=1 — คืนสินค้าให้ผู้ขาย (soon: buy-return) → ReturnPurchaseOrder/AddReturnPurchaseOrder
         ขาเข้าจากจอ: {ref, number?, vendor?, vendorCode?, poId?, warehouse?, day?, status?("Pending"|"Success"),
                       items:[{sku, name, qty, price}], discount?, shipping?, paid?, paymentMethod?, note?, confirm?}
         ⚠️ คนละตัวกับ ?addreturn (ลูกค้าคืนของ) · ท่อคิดเงินเอง · ค่าเริ่มต้น Pending · ยังไม่เคยยิงจริง */
      ["addpurchasereturn", "zortAddReturnPurchaseOrder"],
      /* POST ?voidpo=1 — ยกเลิกใบสั่งซื้อ (ใบทดสอบตอนเปิดปุ่มส่งจริง) → PurchaseOrder/VoidPurchaseOrder?id= · งานกระดาน t_mu1bh3s7
         ขาเข้าจากจอ: {ref, id (ของ ZORT), number (เลขที่ใบที่คาดไว้), confirm?}
         ⚠️ อ่านใบก่อน (เลขที่ใบต้องตรง · ไม่ยกเลิกใบที่รับของแล้ว) และอ่านกลับว่า Voided จริงก่อนตอบสำเร็จ */
      ["voidpo", "zortVoidPurchaseOrder"]]) {
      if (!url.searchParams.get(key)) continue;
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON object)" }, 400);
      // 🔒 ด่านร้านของเส้นเขียนทั้งชุดนี้ (poreceive · voidpo · ordershipping · addpurchasereturn …) — เขียนเข้า ZORT ร้าน z1 เท่านั้น
      if (body.store !== undefined && body.store !== null && body.store !== "" && body.store !== "z1")
        return json({ ok: false, error: "ร้าน z2 ยังไม่รองรับ — เส้นนี้อ่าน/เขียน ZORT ด้วยรหัสร้าน z1 เท่านั้น (zort-write creds) · ไม่ถอยไปใช้ z1 เงียบ ๆ" }, 400);
      const mod = await import("../lib/zort-write.mjs");
      const r = await mod[fnName](body);
      return json(r, r.ok || r.complete === false ? 200 : 400);
    }
    /* POST ?batch=<sale|po|product|contact|quotation>  — นำเข้า Excel หลายแถว · งานกระดาน t_mu0qikag
       ขาเข้าจากจอ: body {rows:[body ของ ?addsale=1 / ?addpo=1 / ?addproduct=1 / ?addcontact=1 / ?addquotation=1] ≤20, confirm?}
       ⇒ ยิงทีละแถวผ่านตัวเขียนเดิมของชนิดนั้น (ZORT ไม่มีเส้นรับหลายใบ) · ขาออกไป ZORT ดู willSend ของแต่ละแถว
       ⚠️ ทุกแถวต้องมี ref ของตัวเอง · หยุดกลางทาง = complete:false + nextRow · confirm ใช้ของทั้งชุด · ชนิดไม่รู้จัก = 400 + accepts */
    if (url.searchParams.has("batch")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON object)" }, 400);
      const { zortBatch } = await import("../lib/zort-write.mjs");
      const r = await zortBatch(url.searchParams.get("batch"), body);
      return json(r, r.ok || r.complete === false ? 200 : 400);
    }
    /* POST ?addbundle=1    body {ref, sku, name, price, vat?, items:[{sku, qty}]}   ⇒ ZORT Bundle/AddBundle
       POST ?addwarehouse=1 body {ref, code, name, address?}                        ⇒ ZORT Warehouse/AddWarehouse
       ⚠️ โหมดซ้อมเป็นค่าเริ่มต้น (ต้อง confirm:true) · ต้องมี ref · **ยังไม่เคยยิงจริงทั้งคู่** · ผิด method = 405
       ⚠️ "เพิ่มหมวดหมู่" ไม่มีเส้น — ZORT ไม่เปิด API (ดู ZORT_NO_API) · งานกระดาน t_mu0m99go */
    /* POST ?addsale=1  body {ref, number?, day?, status?, customer?, phone?, address?, channel?, warehouse?,
                            items:[{sku, name, qty, price}], discount?, shipping?, paid?, paymentMethod?, cod?, note?}
       ⇒ ZORT Order/AddOrder "ขายจริง" · ⚠️ ต่างจาก ?sale=1 (createSale) ที่บันทึกลงคลังเงาอย่างเดียว ไม่ถึง ZORT
       ⚠️ ท่อคิดเงินเอง (totalprice · amount) ไม่เชื่อตัวเลขจากจอ · โหมดซ้อมเป็นค่าเริ่มต้น · ยังไม่เคยยิงจริง */
    if (url.searchParams.get("addsale")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { zortAddSale } = await import("../lib/zort-write.mjs");
      const r = await zortAddSale(body);
      return json(r, r.ok ? 200 : 400);
    }
    /* POST ?addcontact=1 body {ref, code, name, taxId?, phone?, email?, address?, branchname?, branchno?,
                              facebook?, line?, instagram?}  ⇒ ZORT Contact/AddContact
       ⚠️ โหมดซ้อมเป็นค่าเริ่มต้น (ต้อง confirm:true) · ต้องมี ref · ยังไม่เคยยิงจริง · ไม่มีกลุ่มลูกค้า (ZORT ไม่เปิด API) */
    if (url.searchParams.get("addcontact")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { zortAddContact } = await import("../lib/zort-write.mjs");
      const r = await zortAddContact(body);
      return json(r, r.ok ? 200 : 400);
    }
    if (url.searchParams.get("addbundle") || url.searchParams.get("addwarehouse")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { zortAddBundle, zortAddWarehouse } = await import("../lib/zort-write.mjs");
      const r = url.searchParams.get("addbundle") ? await zortAddBundle(body) : await zortAddWarehouse(body);
      return json(r, r.ok ? 200 : 400);
    }
    /* รายการที่ ZORT **ไม่เปิด API ให้** — จอเอาไปโชว์เหตุผลได้ตรง ๆ
       ⚠️ ต่างจาก "เรายังไม่ได้ทำ" คนละเรื่อง ห้ามให้จอเขียนรวมกัน */
    /* ข้อมูลนิติบุคคล + ใบอนุญาต — **แหล่งความจริงเดียว** สำหรับจอหลังร้านทุกตัว
       ⚠️ คุณส้มขอเส้นนี้แทนการคัดลอกข้อมูลไปไว้ฝั่งจอ (6 ก.ย. 2569)
          คัดลอกเมื่อไหร่ = ต่ออายุใบอนุญาตแล้วต้องแก้สองที่ แล้วตกหล่นแน่นอน
       ⚠️ **ไม่มีที่อยู่ในคำตอบนี้** ทั้งของผู้ขายและผู้ผลิต — ไม่มีจอไหนต้องใช้
          ส่งออกไป = ไปโผล่ในไฟล์ของ repo อื่นแทน (ย้ายปัญหา ไม่ใช่แก้)
       ⚠️ **สองนิติบุคคล ห้ามยุบรวม** — seller คือคนขาย · licensee คือผู้ถือใบอนุญาต */
    if (url.searchParams.get("shopinfo")) {
      const { SHOP_DATA } = await import("../lib/shop-data.mjs");
      return json({ ok: true, ...SHOP_DATA });
    }
    /* ⚠️ คืนสองกองแยกกันเสมอ — "ZORT ไม่เปิดให้" (รอไปก็ไม่มา) กับ
        "เรายังไม่ได้ทำ" (สั่งได้ทุกเมื่อ) · ยุบรวมเมื่อไหร่ คนอ่านจะรอของที่ไม่มีวันมา */
    if (url.searchParams.get("addquotation")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { zortAddQuotation } = await import("../lib/zort-write.mjs");
      const r = await zortAddQuotation(body);
      return json(r, r.ok ? 200 : 400);
    }
    /* ใบรับคืนสินค้า — ฝั่งจอขอมา 6 ก.ย. 2569 (รูปแบบเดียวกับ addpo เป๊ะ)
       ⚠️ **ใบนี้คือรับคืนจาก "ลูกค้า" (ใบลดหนี้ CN-) ไม่ใช่คืนของให้ "ผู้ขาย"**
          ฝั่งจอขอมาในชื่อ "คืนสินค้าซื้อ" — ตรวจของจริง 682 ใบแล้วทุกใบมีช่องลูกค้า
          ป้ายบนจอต้องเขียนให้ตรง ไม่งั้นออกใบลดหนี้ให้ลูกค้าโดยนึกว่าคืนของให้โรงงาน
       ⚠️ โหมดซ้อมเป็นค่าเริ่มต้น · ต้อง confirm:true ถึงเขียนจริง · ยังไม่เคยยิงจริงสักใบ */
    if (url.searchParams.get("addreturn")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { zortAddReturnOrder } = await import("../lib/zort-write.mjs");
      const r = await zortAddReturnOrder(body);
      return json(r, r.ok ? 200 : 400);
    }
    /* 🛑 **แก้ / ยกเลิกใบเสนอราคา — เครื่องมือตรวจสอบ ยังไม่ใช่ของให้จอเรียก**
        สร้าง 6 ก.ย. 2569 เพื่อพิสูจน์ว่าการส่ง totalprice แก้ปัญหาใบราคา ฿0 ได้จริง
        โดยไม่ต้องสร้างเอกสารทดสอบใบใหม่ในระบบบัญชีร้าน (เจ้าของร้านเลือกทางนี้)
     ⚠️ ทั้งสองตัวต้องส่ง confirm:true ถึงจะเขียนจริง — ไม่ส่ง = คืนสิ่งที่จะส่งให้ดูเฉย ๆ
     ⚠️ **รับ id ไม่ใช่เลขที่ใบ** (QT-…) — คนละตัวกัน ส่งผิดจะไม่เจอใบหรือไปโดนใบอื่น
     ⚠️ **ห้ามต่อเข้าปุ่มบนจอจนกว่าจะทดสอบกับใบหลายบรรทัดก่อน** — ยังไม่รู้ว่า
        การส่ง list ไปทับ จะทำให้บรรทัดที่ไม่ได้ส่งหายไหม (ดูคำเตือนเต็มใน zort-write.mjs) */
    if (url.searchParams.get("quotedit") || url.searchParams.get("quotvoid")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const w = await import("../lib/zort-write.mjs");
      const r = url.searchParams.get("quotvoid")
        ? await w.zortVoidQuotation(body)
        : await w.zortEditQuotation(body);
      return json(r, r.ok ? 200 : 400);
    }
    /* ชั้นที่สาม: ตรวจว่า "คำกล่าวอ้างเรื่องความสามารถของ ZORT" ในโค้ด **ยังจริงอยู่ไหม**
       ⚠️ ต่างจาก ?zortnoapi=1 ซึ่งแค่ **อ่านสิ่งที่เราเขียนไว้** — ตัวนี้ **ยิงของจริงไปเทียบ**
       ⚠️ ห้ามเอาไปใส่ prebuild (ของนอกบ้านห้ามทำให้ build ตก) · ให้รันหลัง deploy ทุกครั้ง
       ⚠️ ตัวควบคุมไม่ผ่าน = ตอบ inconclusive **ห้ามตอบว่าทุกอย่างยังจริง** */
    if (url.searchParams.get("zortclaims")) {
      const { zortClaimCheck } = await import("../lib/zort-claim-check.mjs");
      return okJson(await zortClaimCheck());
    }
    if (url.searchParams.get("zortnoapi")) {
      const { ZORT_NO_API, ZORT_CAN_BUT_NOT_BUILT, ZORT_PROBE_METHOD, ZORT_WEBHOOK } =
        await import("../lib/zort-write.mjs");
      return json({ ok: true, noApi: ZORT_NO_API, canButNotBuilt: ZORT_CAN_BUT_NOT_BUILT,
        method: ZORT_PROBE_METHOD, webhook: ZORT_WEBHOOK, items: ZORT_NO_API });
    }
    /* อ่านค่า webhook ที่ ZORT ตั้งไว้อยู่ตอนนี้ — **อ่านอย่างเดียว ไม่มีทางเขียนทับ**
       ⚠️ ตั้งใจไม่ทำเส้นเขียน: ถ้า ZORT Social Commerce หรือตัวเชื่อมมาร์เก็ตเพลส
          ตั้ง URL ไว้อยู่ ทับเมื่อไหร่ของที่ร้านใช้ทุกวันพังเงียบ ๆ
          จะตั้งจริงต้องเห็นค่าปัจจุบันก่อน แล้วให้เจ้าของร้านตัดสินใจ */
    if (url.searchParams.get("zortwebhook")) {
      const { zortWebhookRead } = await import("../lib/zort-write.mjs");
      return json(await zortWebhookRead());
    }
    /* 🆕 โมดูล `Document` — เจอ 6 ก.ย. 2569 ตอนกวาดชื่อโมดูลตาม URL ของจอ ZORT
       มีเส้นเดียว `Document/GetDocuments` (อ่านอย่างเดียว · Add/Edit/Delete = 404 ทั้งหมด)
       ✅ **ตอบแล้ว 18 ก.ย. 2569 (ยิงด้วยรหัสจริง)**: คือ **"เอกสารบัญชี"** (ทางเลือก ① เดิม)
          `?zortdocrows=1` ได้ 694 แถว · header เป็น "ใบเสร็จรับเงิน (ต้นฉบับ)" / "ใบกำกับภาษี (ต้นฉบับ)"
          · มี referencetype + referencenumber โยงกลับใบขาย-ใบซื้อ (SO-202409043 · PO-202502002)
          ⇒ **ไม่ใช่รายการไฟล์แนบ/สลิป** (ทางเลือก ② ตกไป — สลิปมาจาก Order/GetOrderFiles ต่างหาก
             และเก็บครบแล้ว 381 ไฟล์ / 373 ใบ ดู slip-archive.mjs)
       ⚠️ ข้อความเดิมที่ว่าเอกสารบัญชีของร้าน "ว่างเปล่าอยู่แล้ว" **เป็นเท็จ** — มี 694 ใบ
          ที่จอ ZORT ขึ้น 0 เพราะช่วงวันเริ่มต้นของเขาเป็น 3 เดือนล่าสุด
          (ตั้งช่วงวันเป็นปี 2565 แล้วเขาขึ้น 689 ใบ = ตรงกับจำนวนใบปี 2565 ของเราพอดี)
       ⇒ ต่อเส้นอ่านไว้ให้ยิงตรวจได้ · **ส่งของดิบ + ชื่อช่องที่ได้จริงกลับไป ไม่แกะตามชื่อที่เดาเอง**
          (เดารูปแล้วอ่านไม่เจอ จะกลายเป็น "ไม่มีข้อมูล" ซึ่งชวนให้สรุปผิดว่ายังต้องคัดมือ) */
    /* อ่านรายละเอียดใบเสนอราคารายใบ — ใช้ตรวจว่าข้อมูลเข้าถูกช่องจริงไหมหลังยิงสร้าง
       ⚠️ "ยิงผ่าน" ≠ "ข้อมูลเข้าถูกช่อง" — ใบแรกที่สร้างจริงได้ยอดเงิน ฿0 ทั้งที่ส่งราคาไป */
    /* วินิจฉัย: ของที่ลูกค้าคืนแยกรายรหัส — ใช้ตอบว่าแผนสั่งซื้อสั่งเกินรหัสไหน
       (แผนคิดจากใบขายโดยไม่หักของคืน · ยอดรวมเล็กแต่รายรหัสอาจไม่เล็ก) */
    /* พิสูจน์: เอกสาร 694 ใบสร้างใหม่จากกระจกได้ไหม — เทียบสารบัญกับ D1 รายใบ */
    if (url.searchParams.get("doccoverage")) {
      const { zortDocCoverage } = await import("../lib/zort-write.mjs");
      return okJson(await zortDocCoverage());
    }
    if (url.searchParams.get("returnskus")) {
      const { returnsBySku } = await import("../lib/core-purchases.mjs");
      return okJson(await returnsBySku(url.searchParams.get("days")));
    }
    if (url.searchParams.get("quotation")) {
      const { getQuotationDetail } = await import("../lib/core-purchases.mjs");
      return okJson(await getQuotationDetail(url.searchParams.get("quotation"),
        url.searchParams.get("raw") === "1"));
    }
    /* GET ?zortdocrows=1[&page=1&limit=100&type=1..5] ⇒ สารบัญเอกสารบัญชีรายแถว
       type ส่งต่อเป็น documenttype ของ ZORT (1 ใบเสร็จ · 2 ใบกำกับภาษี · 3 ใบแจ้งหนี้
       · 4 ใบเสนอราคา · 5 ใบหัก ณ ที่จ่าย) · ไม่ส่ง = ทุกชนิด · อ่านอย่างเดียว
       แยกพารามิเตอร์จาก ?zortdocs=1 เพราะตัวเดิมมีสัญญาเป็นผลสรุปทั้งกอง */
    if (url.searchParams.has("zortdocrows")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { zortDocumentRows } = await import("../lib/zort-document-rows.mjs");
      const r = await zortDocumentRows({
        page: url.searchParams.get("page") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        type: url.searchParams.get("type") ?? undefined,
      });
      return json(r, r.ok || r.skip ? 200 : r.unknown ? 502 : 400);
    }
    if (url.searchParams.get("zortdocs")) {
      const { zortDocumentsRead } = await import("../lib/zort-write.mjs");
      return json(await zortDocumentsRead(url.searchParams.get("limit")));
    }

    /* 🧹 POST ?clearpolicyerrors=1 — กวาดคำเท็จเก่าใน last_error ครั้งเดียว
       ทำไมเป็น POST: **เขียนข้อมูล** · เป็น GET ไม่ได้ ตัวกวาดลิงก์/บอตจะเรียกเองโดยไม่มีใครสั่ง
       ทำไมต้องมี: แก้ที่ต้นทางแล้ว (notSentKind) แต่แถวที่ **หลุดจากแผน** ไม่มีอะไรเขียนทับ
       ⇒ ข้อความ "ทิศลง … ต้องสั่งแยก" ค้างเป็นคำเท็จถาวร (ทิศลงถูกเปิดไปแล้ว)
       รันซ้ำได้ · รอบสองได้ 0 · เหตุผลเต็มอยู่หัวฟังก์ชันใน stock-push-sweep.mjs */
    /* 🔁 POST ?sweepnow=1&platform=lazada[&full=1] — สั่งรอบกวาดเดี๋ยวนี้หนึ่งครั้ง
       🔴 ที่มา 18 ก.ย. 2569: ฝั่งจอขอให้ "สั่งรอบเต็มเดี๋ยวนี้" แล้วพบว่า **ไม่มีเส้นให้สั่งเลย**
          ทางเดียวคือรอ cron ⇒ เวลาต้องยืนยันอะไรสักอย่าง ต้องรอ 15 นาที
          และถ้า lazada เข้าโหมด fast-skip ต้องรอถึงรอบบังคับคิดเต็ม (~2 ชม.)
       ⚠️ `full=1` ส่ง force ⇒ **ข้ามทางออกเร็ว บังคับคิดแผนใหม่** (กินเวลาจริง ~12 วิ)
          ไม่ส่ง = เดินกติกาปกติ ซึ่งอาจตกลง fast-skip แล้วไม่เขียน push_state
       ⚠️ POST เท่านั้น — เป็นการสั่งงานที่ยิงออกนอกระบบได้จริงเมื่อสวิตช์ยิงเปิดอยู่
       ⚠️ **ไม่ได้เปิดสวิตช์ยิงให้** ช่องทางที่ปิดอยู่ยังเดินโหมดซ้อม (dry) เหมือนเดิม */
    if (url.searchParams.get("sweepnow")) {
      const { กวาดดันสต็อก, ช่องทางทั้งหมด } = await import("../lib/stock-push-sweep.mjs");
      const ch = String(url.searchParams.get("platform") || "lazada").toLowerCase();
      if (!ช่องทางทั้งหมด.includes(ch)) {
        return okJson({ ok: false, error: `ไม่รู้จักช่องทาง "${ch}"`, ช่องทางที่รับ: ช่องทางทั้งหมด }, 400);
      }
      const full = url.searchParams.get("full") === "1";
      const r = await กวาดดันสต็อก({ platform: ch, force: full });
      return okJson({ ...r, สั่งด้วยมือ: true, บังคับคิดเต็ม: full });
    }
    if (url.searchParams.get("clearpolicyerrors")) {
      const { ล้างคำเท็จในlast_error } = await import("../lib/stock-push-sweep.mjs");
      const r = await ล้างคำเท็จในlast_error();
      return okJson(r, r?.inconclusive ? 503 : 200);
    }
    if (url.searchParams.get("move")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const moves = Array.isArray(body) ? body : body.moves ?? [body];
      const r = await applyMoves(moves);
      return json(r.error ? { ok: false, ...r } : { ok: true, ...r }, r.error ? 400 : 200);
    }
    /* ── จอรับคืนสินค้าหน้าร้าน (7 ก.ย. 2569) ────────────────────────────────
       สัญญาอยู่ที่ ~/gucut-next/lib/returns-api.ts **ที่เดียว** — เปลี่ยนรูปคำตอบต้องแก้คู่กัน
         GET  ?list=returns-inbox[&q=]      กล่องใบคืน (จอแอดมิน)
         GET  ?return=<returnId>            ใบเดียว (resume หลังเน็ตหลุด)
         GET  ?returnphoto=<returnId>&i=<n> รูปยืนยัน (ผ่านรหัสหลังร้าน)
         POST ?return-receive=1             ขั้นรับ — เซิร์ฟเวอร์ออก returnId + ล็อกใบขาย
         POST ?return-grade=1               ประเมิน **และยิงเข้าสต็อกในคำขอเดียว**
         POST ?return-photo=1               อัปรูปทีละใบ
         POST ?return-takeover=1            ขอรับช่วงใบที่คนก่อนถือค้าง
       ⚠️ **ตัวตนพนักงานมาจาก header `x-staff-pin` เท่านั้น ห้ามอ่านชื่อจาก body** */
    if (
      url.searchParams.get("return") ||
      url.searchParams.get("returnphoto") ||
      url.searchParams.get("list") === "returns-inbox" ||
      [...url.searchParams.keys()].some((k) => k.startsWith("return-"))
    ) {
      const R = await import("../lib/core-returns.mjs");
      const out = (r) => json(r?.error || r?.skip ? { ok: false, ...r } : { ok: true, ...r },
        r?.error || r?.skip ? 400 : 200);

      if (url.searchParams.get("list") === "returns-inbox") {
        return out(await R.listReturnsInbox({
          q: url.searchParams.get("q"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        }));
      }
      if (url.searchParams.get("returnphoto")) {
        const img = await R.getReturnPhoto(
          url.searchParams.get("returnphoto"), url.searchParams.get("i")
        );
        /* ⚠️ ส่ง data URL เป็น JSON ไม่ใช่ไฟล์รูป — จอต้องดึงผ่าน adminFetch
           เพราะรหัสหลังร้านอยู่ในหัวข้อความ ไม่ได้อยู่ในคุกกี้ เปิด URL ตรง ๆ ในแท็บใหม่ไม่ได้
           (กติกาเดียวกับรูปลงเวลาและใบ ลซ.๒) */
        return img ? json({ ok: true, dataUrl: img }) : json({ ok: false, error: "ไม่พบรูป" }, 404);
      }
      if (url.searchParams.get("return")) {
        return out(await R.getReturn(url.searchParams.get("return")));
      }

      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      /* อ่านรายชื่อพนักงานไม่ได้ (Blobs สะดุด) ⇒ findByPin โยน status 503 ตั้งแต่ใบ t_mu20nia9
         ⇒ ตอบ 503 "ลองใหม่" ตรงนี้ ไม่ปล่อยไปตกตัวครอบนอกสุดที่ตอบ 500 · และห้ามรับคืนต่อโดยไม่รู้ว่าใครรับ */
      let staff;
      try {
        staff = await R.staffFromReq(req);
      } catch (e) {
        return json({ error: String(e?.message || e) }, e?.status === 503 ? 503 : 500);
      }

      if (url.searchParams.get("return-receive")) return out(await R.receiveReturn(body, staff));
      if (url.searchParams.get("return-grade")) return out(await R.gradeReturn(body, staff));
      if (url.searchParams.get("return-photo")) return out(await R.saveReturnPhoto(body, staff));
      if (url.searchParams.get("return-takeover")) return out(await R.takeoverReturn(body, staff));
      if (url.searchParams.get("return-cancel")) return out(await R.cancelReturn(body, staff));
      return json({ error: "ไม่รู้จักเส้นนี้ของจอรับคืน" }, 400);
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
      return okJson(await backupStatus());
    }
    if (url.searchParams.get("backup")) {
      return okJson(await runBackup());
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
    /* ขาเข้าจากตัวคัดบน g1: POST ?warehousevalues=1 body {rows:[{code, value:"16,305,522.84", lastMovement:"15 ก.ย. 2569 11:48"}]}
       มูลค่าคงเหลือ + เคลื่อนไหวล่าสุดต่อคลังจากจอ ZORT /Warehouse/list (API ไม่มี) · แถวเสียแถวเดียว = ไม่เขียนเลย */
    if (url.searchParams.get("warehousevalues")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { saveWarehouseValues } = await import("../lib/warehouse-values.mjs");
      // ⚠️ ปฏิเสธต้องเป็น 400 ไม่ใช่ 200+ok:false — ยิงของจริงหลัง deploy 84b8108 ได้ 200 (คนดูแค่รหัสสถานะจะนึกว่าบันทึกแล้ว)
      const r = await saveWarehouseValues(body.rows);
      return okJson(r, r?.error ? 400 : 200);
    }
    // มูลค่าสินค้ารายหมวดที่คัดมาจากจอ ZORT (ไม่มี Category API — ต้องคัดจากเบราว์เซอร์)
    if (url.searchParams.get("categoryvalues")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const { saveCategoryValues } = await import("../lib/core-products.mjs");
      const r = await saveCategoryValues(body.rows || body, { complete: body.complete === true, expectedCount: body.expectedCount });
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
      return okJson({
        ...(await listBundleItems(url.searchParams.get("sku"), url.searchParams.get("member"))),
      });
    }
    // สินค้าเป็นชุด (Bundle) — 360 ชุดที่ร้านใช้จริง
    if (url.searchParams.get("syncbundles")) {
      // ล้ม = 502 (เดิมตอบ ok:true เสมอ แม้ซิงก์ไม่สำเร็จ) · ปกติรันเองทุกครึ่งชั่วโมงใน bundle-recipe-sync
      const b = await syncBundles();
      return json({ ok: !b.error, bundles: b }, b.error ? 502 : 200);
    }
    /* GET ?syncbundlerecipes=1[&limit=N] ⇒ ซิงก์สูตรชุดจาก ZORT รอบเดียวเดี๋ยวนั้น (ปกติรันเองทุกชั่วโมง :27)
       ⇒ {ok, zortBundles, asked, same, changed, notWritten, problems} · ล้ม = 502 · งานกระดาน t_mu1bh4vh */
    if (url.searchParams.get("syncbundlerecipes")) {
      const { syncBundleRecipes } = await import("../lib/core-products.mjs");
      const r = await syncBundleRecipes({ limit: url.searchParams.get("limit") ?? undefined });
      return json(r, r.ok || r.skip ? 200 : 502);
    }
    /* สินค้าที่ลูกค้าซื้อไม่ได้เพราะสต็อกติดลบ — เรียงตาม "นับตัวนี้แล้วปลดล็อกได้กี่รหัส"
         GET /api/core?blocked=1
       ⚠️ อ่านอย่างเดียว ไม่แก้สต็อกให้ — ติดลบแปลว่าของจริงกับในระบบไม่ตรง แก้ได้ด้วยการนับเท่านั้น
       ⚠️ ของหนึ่งม้วนติดลบทำให้รหัสความยาวหลายสิบรหัสหายจากหน้าร้านพร้อมกัน
          และ **ไม่มีอะไรฟ้องเลย** — สินค้าไม่ได้ขึ้นว่า "หมด" แต่หายไปทั้งตัว */
    if (url.searchParams.get("blocked")) {
      return okJson(await blockedByNegative());
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
    /* ยิงถาม ZORT ว่าให้สต็อกแยกรายคลังได้ไหม — อ่านอย่างเดียว
         GET /api/core?zortwarehouse=1[&sku=00894]
       ⚠️ ตัวตัดสินคือ "เปลี่ยนคลังแล้วเลขเปลี่ยนไหม" ไม่ใช่ "ตอบ 200 ไหม" */
    /* GET ?zortarchived=1 ⇒ ยิงถาม ZORT ว่าขอ "ของที่ถูกลบ (archive)" ได้ไหม — อ่านอย่างเดียว
       ฝั่งจอขอเป็นลำดับแรกทั้งจอสินค้า (ถูกลบ ~11,185) และจอผู้ติดต่อ (ถูกลบ 3,170)
       ⚠️ ตัวชี้ขาดคือ count เทียบฐานเปล่า + มีตัวควบคุมชื่อมั่ว (ZORT เมินชื่อที่ไม่รู้จักแล้วตอบ 200) */
    if (url.searchParams.get("zortarchived")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { zortArchivedProbe } = await import("../lib/zort-archived-probe.mjs");
      return okJson(await zortArchivedProbe());
    }
    /* GET ?zortcostfields=1[&sku=XXX] ⇒ ZORT ส่งช่องต้นทุน (ถัวเฉลี่ย/มูลค่าสต็อก) มาไหม — อ่านอย่างเดียว
       ฝั่งจอถามมา 18 ก.ย. 2569: ZORT คิดกำไรจากต้นทุนถัวเฉลี่ยเคลื่อนที่ แต่กระจกเรามีแค่ราคาซื้อในทะเบียน
       ⚠️ ต้องดู **ก้อนดิบ** — ตัวอ่านของเรา (zortFindProduct) คัดเหลือ 10 ช่อง
          ยิงตัวนั้นแล้วไม่เห็นช่องต้นทุน ไม่ได้แปลว่า ZORT ไม่ส่ง (กฎ probe-shares-the-bug) */
    /* GET ?zortdocfilter=1 ⇒ ZORT ยอมกรองเอกสารด้วยช่วงวัน/คำค้นที่ต้นทางไหม — อ่านอย่างเดียว
       ฝั่งจอต้องโหลดครบทุกหน้า (694 ใบ = 4 คำขอ) ทุกครั้งที่กรอง เพราะท่อรับแค่ page/limit/type
       🔑 ตัวชี้ขาดคือคำตอบที่วัดไว้คนละครั้ง: ปี 2567 ต้องได้ 3 ใบ (ไม่ใช่แค่ดูว่า count ขยับ) */
    /* GET ?zortmissing=1[&screen=2900] ⇒ ทำไม GetProducts ส่งสินค้าน้อยกว่าที่จอ ZORT บอก — อ่านอย่างเดียว
       ของจริง 18 ก.ย. 2569: จอบอก 2,900 (ไม่ติ๊กแสดงของที่ถูกลบ) · API ให้ 2,674 · กระจก 2,673
       ⇒ ขาด 226 รายการ และสินค้าที่สร้างใหม่ก็ตกอยู่ในกองนี้ (ไม่ใช่ความล่าช้า — ยิงซ้ำ 4 รอบใน 26 นาที เท่าเดิม)
       ⚠️ `screen=` คือเลขที่คนไปอ่านจากจอ ZORT มาให้ ไม่ใช่ค่าที่ท่อวัดเองได้ ⇒ ต้องประกาศว่ามาจากไหน */
    if (url.searchParams.get("zortmissing")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { zortMissingProductsProbe } = await import("../lib/zort-missing-products-probe.mjs");
      return okJson(await zortMissingProductsProbe(url.searchParams.get("screen")));
    }
    if (url.searchParams.get("zortdocfilter")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { zortDocFilterProbe } = await import("../lib/zort-docfilter-probe.mjs");
      return okJson(await zortDocFilterProbe());
    }
    if (url.searchParams.get("zortcostfields")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { zortProductFieldsProbe } = await import("../lib/zort-product-fields-probe.mjs");
      return okJson(await zortProductFieldsProbe(url.searchParams.get("sku")));
    }
    if (url.searchParams.get("zortwarehouse")) {
      return okJson(await zortWarehouseProbe({ sku: url.searchParams.get("sku") }));
    }
    if (url.searchParams.get("links")) {
      return okJson(await linkStatus({ days: url.searchParams.get("days") }));
    }
    if (url.searchParams.get("reorder")) {
      /* ⚠️ **ต้องส่ง `scope` ต่อด้วย** (แก้ 7 ก.ย. 2569)
          เดิมส่งแต่ `days` ⇒ `scope=all` ที่เขียนไว้ในไลบรารี **ไม่มีทางถูกเรียกใช้เลย**
          ยิงจริงเทียบแล้ว: ใส่ scope=all กับไม่ใส่ ได้ 92 รหัสเท่ากันเป๊ะ
          ⇒ ฟีเจอร์ที่ตั้งใจให้ครอบทั้งคลัง (แทนที่จะครอบแค่ม้วนแม่ 92 จาก 2,672)
            มีโค้ดครบแต่ **ไม่มีอะไรจุดชนวน** [[nothing-triggers-it]]
          🔑 คลาสเดียวกับใบโอนสินค้าที่เพิ่งแก้ไปเมื่อกี้ — เขียนเสร็จแล้วแต่ไม่มีทางเข้าถึง */
      return okJson(
        await reorderPlan({
          days: url.searchParams.get("days"),
          scope: url.searchParams.get("scope"),
        })
      );
    }
    if (url.searchParams.get("list") === "bundles") {
      return okJson({
        ...(await listBundles({
          q: url.searchParams.get("q"),
          only: url.searchParams.get("only"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
          marketplaces: url.searchParams.get("marketplaces"),
          waitUntil,
        })),
      });
    }
    if (url.searchParams.get("syncproducts")) {
      return json({ ok: true, products: await syncProducts() });
    }
    // ── ใบสั่งซื้อ (PO) จาก ZORT — คนละชุดกับ "ระบบสั่งของโรงงาน" ที่หลังร้านมีอยู่ ──
    if (url.searchParams.get("syncpurchases")) {
      const { parseSingleStore } = await import("../lib/core-orders.mjs");
      const st = parseSingleStore(url.searchParams.get("store"));
      if (st.error) return json({ error: st.error }, 400);
      return json({ ok: true, purchases: await syncPurchases({ repairItems: url.searchParams.get("repairitems"), store: st.source }) });
    }
    /* 🏷️ ใบซื้อ · รายการสินค้าในใบซื้อ · ใบเสนอราคา แยกร้านได้แล้ว (15 ก.ย. 2569 · ใบ t_mu2pfve9)
       เดิมมีด่าน "เส้นที่มีแค่ร้าน z1" ตอบ 400 ถ้าขอ z2 — ถอดแล้วเพราะทุกชนิดแยกร้านได้ครบ (ใบโอน 7351c3c · ใบคืน e546240 · ชิ้นนี้)
       ขาเข้าจากจอ: store= ว่าง ⇒ z1 (จอเดิมเลขเท่าเดิม) · z1 | z2 · all/ค่าอื่น ⇒ 400 · source= เฉย ๆ ⇒ 400
       ขาออก: store · storeDefaulted · storeScope */
    const STORE_LISTS = ["purchases", "purchaseitems", "quotations"];
    let listStore = null;
    if (STORE_LISTS.includes(url.searchParams.get("list"))) {
      if (url.searchParams.has("source") && !url.searchParams.has("store"))
        return json({ error: "ตัวกรองร้านชื่อ store= — source เป็นชื่อช่องในคำตอบ" }, 400);
      const { parseSingleStore } = await import("../lib/core-orders.mjs");
      const st = parseSingleStore(url.searchParams.get("store"));
      if (st.error) return json({ error: st.error }, 400);
      listStore = { store: st.source, storeDefaulted: st.defaulted, storeScope: `เฉพาะร้าน ${st.source}${st.defaulted ? " (ไม่ได้ระบุร้าน ⇒ z1)" : ""}` };
    }
    if (url.searchParams.get("list") === "purchases") {
      // okJson ไม่ใช่ json({ok:true,…}) — ตัวอ่านตอบ error ได้ (ยังไม่ซิงก์ตารางใหม่) ต้องไม่ติด ok:true
      return okJson({
        ...(await listPurchases({
          q: url.searchParams.get("q"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
          store: listStore.store,
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        })),
        ...listStore,
      });
    }
    // เครดิต Netlify — อะไรกินเยอะสุด (เจ้าของร้านสั่ง 3 ก.ย. 2569)
    if (url.searchParams.get("usage")) {
      const { netlifyUsage } = await import("../lib/netlify-usage.mjs");
      return okJson(await netlifyUsage());
    }
    // บริการส่งสินค้า — อ่านจากกระจกออเดอร์ (ZORT ไม่มี API ขนส่งแยก)
    if (url.searchParams.get("list") === "logistics") {
      return okJson({
        ...(await listLogistics({
          q: url.searchParams.get("q"),
          only: url.searchParams.get("only"),
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          carrier: url.searchParams.get("carrier"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
      });
    }
    // รายการสินค้าในใบซื้อ — แยกรายสินค้าแบบรายงานยอดซื้อของ ZORT
    /* ใบสั่งซื้อรายใบ (ZORT /Buy/Details) — งานเทียบกดได้ 8 ก.ย. 2569
       ⚠️ คนละอันกับ list=purchaseitems ซึ่งเป็นการรวมยอดรายสินค้าทั้งคลัง */
    if (url.searchParams.get("purchase")) {
      const { getPurchaseDetail } = await import("../lib/core-purchases.mjs");
      const { parseSingleStore } = await import("../lib/core-orders.mjs");
      const st = parseSingleStore(url.searchParams.get("store"));
      if (st.error) return json({ error: st.error }, 400);
      return okJson(await getPurchaseDetail(url.searchParams.get("purchase"), st.source));
    }
    if (url.searchParams.get("list") === "purchaseitems") {
      return okJson({
        ...(await listPurchaseItems({
          q: url.searchParams.get("q"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
          store: listStore.store,
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          by: url.searchParams.get("by"),
        })),
        ...listStore,
      });
    }
    // ทะเบียนการเชื่อมต่อ — ยิงของจริงทุกเจ้า ไม่มีค่าเขียนตายตัว
    if (url.searchParams.get("connections")) {
      const { connectionsStatus } = await import("../lib/connections.mjs");
      /* ?budget=N (50–30000 มิลลิวินาที) มีไว้บังคับให้ทางเดิน timeout ทำงานเพื่อทดสอบ
         ⚠️ ไม่ใส่ = ใช้ค่าตั้งต้น 18 วิ · ทางเดินที่ไม่เคยถูกเรียกใช้ ไม่ต่างจากไม่มี */
      return okJson({
        ...(await connectionsStatus({ budget: url.searchParams.get("budget") })),
      });
    }
    /* ลูกค้า/ผู้ติดต่อ — เจ้าของร้านสั่งดึง 3 ก.ย. 2569
       🔒 ข้อมูลส่วนบุคคลจริง 28,250 ราย · ผ่าน adminGate เหมือนทุกเส้นทางในไฟล์นี้
       ⚠️ **ห้ามเพิ่มโหมด "เอาทั้งหมด"** เพดาน 100 แถว/ครั้งเป็นของตั้งใจ */
    /* ภาพรวมลูกค้ารายคน — ตาม ContactDetail ของ ZORT (งานเทียบกดได้ 8 ก.ย. 2569)
       🔴 **ต้องไม่มี `list=`** (แก้ 17 ก.ย. 2569 · gucut2) — เดิมจับ `customer` อย่างเดียว
          ⇒ `list=orders&customer=…` / `list=orderfacets&customer=…` ถูกเส้นนี้กลืนก่อนถึงตัวกรอง
          ได้ก้อนคนละรูป (ไม่มี total/rows) ⇒ จอขึ้น "ไม่มีข้อมูล" เงียบ ๆ ทั้งที่มีของ
          ตัวกรองชื่อลูกค้าของจอขายจึงต่อไม่ได้มาตลอด ทั้งที่ buildWhere รับ customer ไว้แล้ว */
    if (url.searchParams.get("customer") && !url.searchParams.get("list")) {
      const { getCustomerDetail } = await import("../lib/core-contacts.mjs");
      return okJson(await getCustomerDetail(url.searchParams.get("customer")));
    }
    /* GET ?synccontactsnow=1 ⇒ สั่งงานตามเวลาซิงก์ผู้ติดต่อเดี๋ยวนั้น (หน้าแรก ๆ + กวาดต่อจาก cursor)
       ⇒ {ok, recent, sweep:{from, nextCursor, sweepComplete}, errors} · งานตามเวลาอยู่ที่ functions/contacts-sync.mjs · งานกระดาน t_mu2045bl */
    if (url.searchParams.get("synccontactsnow")) {
      const { syncContactsScheduled } = await import("../lib/core-contacts.mjs");
      return json(await syncContactsScheduled());
    }
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
      return okJson({
        ...(await listContacts({
          q: url.searchParams.get("q"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
          // ตัวกรอง 15 ก.ย. 2569 — ไม่นับเป็นคำค้น (ด่านกันกวาดทั้งฐานยังบังคับ)
          withPhone: url.searchParams.get("withphone") ?? undefined,
          withEmail: url.searchParams.get("withemail") ?? undefined,
        })),
      });
    }
    // ใบเสนอราคา — ดึงสดจาก ZORT (ร้านมีแค่ 3 ใบ ไม่ต้องทำกระจก)
    if (url.searchParams.get("list") === "quotations") {
      /* ⚠️ ส่ง type ต่อไปด้วย **ไม่ใช่เพื่อกรอง** แต่เพื่อให้ท่อสะท้อนกลับว่าเมินค่านั้น (ดูคอมเมนต์ที่ listQuotations) */
      return okJson({ ...(await listQuotations(url.searchParams.get("limit"), url.searchParams.get("page"), listStore.store,
        /* ส่ง q ต่อไปด้วย **เพื่อให้ท่อประกาศว่าเมิน** ไม่ใช่เพื่อกรอง (เส้นนี้ยังกรอง q ไม่ได้)
           ไม่ส่งต่อ = ผู้เรียกส่ง q มาแล้วเงียบหาย ไม่มีทางรู้ว่าถูกเมิน */
        { type: url.searchParams.get("type"), q: url.searchParams.get("q") })), ...listStore });
    }
    /* ใบคืนของ (CN-) — ดึงสดจาก ZORT · จอ "รายการขาย → รับคืนสินค้า"
       ⚠️ **คนละฐานกับจอ /returns เดิมของหลังร้าน** ซึ่งคำนวณของคืนจากออเดอร์
          ⇒ เลขสองจอนี้เทียบกันไม่ได้ ห้ามเอามาลบกัน (ฝั่งจอชี้เอง 6 ก.ย. 2569)
       ⚠️ ชื่อลูกค้าถูกปิดบางส่วนมาจากท่อแล้ว — ZORT เองก็ปิดในจอนี้ */
    /* รายละเอียดใบโอนรายใบ — จอ "รับสินค้า" ใช้ตอนคนยืนรับของอยู่หน้าคลัง
       ⚠️ ดึงสดเสมอ ไม่อ่านจากกระจก · และคืน `fields` มาด้วยว่า ZORT ส่งช่องอะไรมาจริง
          จอจะได้รู้ว่ามีเลขพัสดุ/บรรทัดสินค้าให้ใช้ไหม แทนการเดา */
    if (url.searchParams.get("transfer")) {
      const { getTransferDetail } = await import("../lib/core-purchases.mjs");
      return okJson(await getTransferDetail(url.searchParams.get("transfer")));
    }
    /* ดึงใบคืนจาก ZORT ลงกระจก — ปิดเอกสาร 6 ใบใน doccoverage + เป็นขานอกระบบของจอรับคืน */
    if (url.searchParams.get("syncreturns")) {
      const { syncReturnOrders } = await import("../lib/core-purchases.mjs");
      const { parseSingleStore } = await import("../lib/core-orders.mjs");
      const st = parseSingleStore(url.searchParams.get("store"));
      if (st.error) return json({ error: st.error }, 400);
      return okJson(await syncReturnOrders({ pages: url.searchParams.get("pages"), store: st.source }));
    }
    if (url.searchParams.get("list") === "returnorders") {
      const { listReturnOrders } = await import("../lib/core-purchases.mjs");
      /* q= (15 ก.ย. 2569) มีคำค้น ⇒ ค้นจากกระจก return_orders_v2 · ไม่มี ⇒ ดึงสด ZORT เหมือนเดิม
         ขาออกมี applied {q, source} — จอเช็คตัวนี้ก่อนเขียนว่าไฟล์กรองแล้ว */
      /* 🏷️ แยกร้านได้แล้ว (15 ก.ย. 2569 · ใบ t_mu2pfve9) — ออกจากด่านเส้นที่มีแค่ร้าน z1 · store ว่าง ⇒ z1 · all/ค่าอื่น 400 */
      if (url.searchParams.has("source") && !url.searchParams.has("store"))
        return json({ error: "ตัวกรองร้านชื่อ store= — source เป็นชื่อช่องในคำตอบ" }, 400);
      const { parseSingleStore } = await import("../lib/core-orders.mjs");
      const st = parseSingleStore(url.searchParams.get("store"));
      if (st.error) return json({ error: st.error }, 400);
      return okJson({
        /* ช่วงวัน (18 ก.ย. 2569) — from/to แบบ YYYY-MM-DD หรือ days=N (ใช้ร่วมกันไม่ได้ ⇒ 400)
           ⚠️ ZORT ไม่รับช่วงวัน ⇒ ขอช่วงวันเมื่อไหร่ ท่อสลับไปอ่านกระจกและบอกผ่าน applied.source */
        ...(await listReturnOrders(url.searchParams.get("limit"), url.searchParams.get("page"), url.searchParams.get("q"), st.source, {
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
          days: url.searchParams.get("days") ?? undefined,
        })),
        supportedFilters: ["q", "store", "from", "to", "days", "limit", "page"],
        store: st.source,
        storeDefaulted: st.defaulted,
        storeScope: `เฉพาะร้าน ${st.source}${st.defaulted ? " (ไม่ได้ระบุร้าน ⇒ z1)" : ""}`,
      });
    }
    // สต็อกการ์ดรายสินค้า — ตารางการเคลื่อนไหวในหน้ารายละเอียดสินค้า
    if (url.searchParams.get("list") === "stockcard") {
      return okJson({
        ...(await stockCard({
          sku: url.searchParams.get("sku"),
          kind: url.searchParams.get("kind"),
          limit: url.searchParams.get("limit"),
          // ช่วงวันไทย yyyy-MM-dd + แบ่งหน้า (15 ก.ย. 2569 · ส่งออกบัตรสต็อก) — ไม่ส่ง = เหมือนเดิม
          offset: url.searchParams.get("offset"),
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
        })),
      });
    }
    // 🔔 สินค้าที่หายไปจากช่องทางขาย — จับเรื่องแบบเครื่อง 00073 ที่เงียบไป 3 เดือน
    if (url.searchParams.get("list") === "channel-gaps") {
      return okJson({
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
      /* ⚠️ **ไม่รับ q** — ฝั่งจอยิง q=ZZQXNOMATCH9 แล้วแถวเท่าเดิม 50 ⇒ ตัวกรองไม่มีผล
         ⇒ ประกาศว่าเมิน ไม่งั้นจอที่ส่ง q ไปจะเชื่อว่ากรองแล้ว (ปุ่มหลอก) */
      const qd = url.searchParams.get("q");
      return okJson({
        ...(await listDeadStock({
          days: url.searchParams.get("days"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
        ...(qd ? { ignored: { q: qd } } : {}),
        supportedFilters: ["days", "limit", "offset"],
      });
    }
    // รายการโอนสินค้า — ร้านใช้หนักที่สุดในกลุ่มสินค้า (12,196 ใบใน ZORT)
    if (url.searchParams.get("resettransfers")) {
      return json({ ok: true, reset: await resetTransfers() });
    }
    /* 🏷️ ใบโอนแยกร้านได้แล้ว (15 ก.ย. 2569 · ใบ t_mu2pfve9) — ออกจากด่านเส้นที่มีแค่ร้าน z1
       ขาเข้าจากจอ: store= ว่าง ⇒ z1 (จอเดิมได้เลขเท่าเดิม) · z1 | z2 · all/ค่าอื่น ⇒ 400 (ตอบทีละร้าน) · source= เฉย ๆ ⇒ 400
       ขาออก: store · storeDefaulted · storeScope (StoreScopeLine ของจออ่านช่องนี้) */
    if (url.searchParams.get("synctransfers")) {
      const { parseSingleStore } = await import("../lib/core-orders.mjs");
      const st = parseSingleStore(url.searchParams.get("store"));
      if (st.error) return json({ error: st.error }, 400);
      return json({
        ok: true,
        transfers: await syncTransfers(url.searchParams.get("days"), {
          startPage: url.searchParams.get("startpage"),
          maxPages: url.searchParams.get("maxpages"),
          store: st.source,
        }),
      });
    }
    if (url.searchParams.get("list") === "transfers") {
      if (url.searchParams.has("source") && !url.searchParams.has("store"))
        return json({ error: "ตัวกรองร้านชื่อ store= — source เป็นชื่อช่องในคำตอบ" }, 400);
      const { parseSingleStore } = await import("../lib/core-orders.mjs");
      const st = parseSingleStore(url.searchParams.get("store"));
      if (st.error) return json({ error: st.error }, 400);
      /* 🔴 **ห้ามครอบ ok:true ทับคำตอบ** (แก้ 18 ก.ย. 2569 ตอนเพิ่มตัวกรอง)
         ของเดิมเขียน `{ ok: true, ...(await listTransfers(...)) }` ⇒ วันที่ listTransfers
         เริ่มคืน `{ error }` (ค่าตัวกรองผิด) จอจะได้ **HTTP 200 + ok:true + error** พร้อมกัน
         ⇒ จอที่เช็ค ok ก่อนจะอ่านว่าสำเร็จ แล้วโชว์ตารางว่างเปล่าเหมือน "ไม่มีข้อมูล"
         🔑 คลาสเดียวกับที่ไล่กันทั้งวัน: **ความพังต้องถูกตัดสินก่อนการอนุมาน** */
      const ผล = await listTransfers({
          q: url.searchParams.get("q"),
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
          /* 🔎 ฝั่งจอขอ 18 ก.ย. 2569 — ของเดิมส่งมาแล้วถูกเมินเงียบ
             ค่าที่รับคือค่าในตาราง (Success/Voided/Pending) ไม่ใช่คำไทยบนจอ ZORT
             ⚠️ `days` กับ `page` ยัง**ไม่รองรับ** และจะถูกประกาศใน `ignored` ไม่ใช่หายเงียบ */
          status: url.searchParams.get("status"),
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          days: url.searchParams.get("days"),
          page: url.searchParams.get("page"),
          store: st.source,
      });
      if (typeof ผล?.error === "string" && ผล.error) return json({ ok: false, ...ผล }, 400);
      return json({
        ok: true,
        ...ผล,
        storeDefaulted: st.defaulted,
        storeScope: `เฉพาะร้าน ${st.source}${st.defaulted ? " (ไม่ได้ระบุร้าน ⇒ z1)" : ""}`,
      });
    }
    // คลังสินค้าทั้งหมด (รวมโกดัง) — คนละอย่างกับ list=branches ที่เป็นสาขาขายหน้าร้าน
    if (url.searchParams.get("list") === "warehouses") {
      return okJson(await listWarehouses());
    }
    // จอหมวดหมู่แบบ ZORT — หมวดจริง 42 หมวดจากทะเบียนสินค้า
    /* 🔴 **เส้นนี้ไม่รับ q และ `total` ตอบคนละคำถามกับ rows** (ฝั่งจอจับได้ 18 ก.ย. 2569
       ด้วยการยิง q=ZZQXNOMATCH9 แล้วดูว่า total ลดไหม)
       · ยิง q มา → แถวเท่าเดิม 43 หมวด ⇒ **q ไม่มีผลเลย** ต้องประกาศว่าเมิน ไม่ใช่เงียบ
       · `total` = **จำนวนสินค้า 2,674 ตัว** ไม่ใช่จำนวนหมวด (43) ⇒ จอที่เขียน
         "ทั้งหมด {total} หมวด" จะโกหกทันที ⇒ ใส่ป้ายขอบเขตกำกับไว้ [[numbers-need-scope]] */
    if (url.searchParams.get("list") === "categories") {
      const r = await listCategories();
      const qc = url.searchParams.get("q");
      return okJson({
        ...r,
        ...(qc ? { ignored: { q: qc } } : {}),
        "⚠️ ขอบเขต":
          "total = จำนวน**สินค้า**ทั้งคลัง ไม่ใช่จำนวนหมวด (จำนวนหมวดคือ categories.length) · " +
          "เส้นนี้ไม่รับตัวกรอง q — ส่งมาจะถูกประกาศใน ignored และไม่มีผลกับผลลัพธ์",
      });
    }
    if (url.searchParams.get("list") === "poscats") {
      return okJson(await posCats());
    }
    if (url.searchParams.get("list") === "branches") {
      return json({ ok: true, branches: branches() });
    }
    if (url.searchParams.get("poslookup") !== null && url.searchParams.get("poslookup") !== undefined) {
      return okJson({
        ...(await lookup(
          url.searchParams.get("poslookup"),
          url.searchParams.get("limit"),
          url.searchParams.get("cat"),
          url.searchParams.get("offset")
        )),
      });
    }
    if (url.searchParams.get("list") === "sales") {
      return okJson({
        ...(await listSales({ day: url.searchParams.get("day"), limit: url.searchParams.get("limit") })),
      });
    }
    // SKU ที่ Shopee ขายอยู่แต่คลังเราไม่รู้จัก (พร้อมเดารหัสฐานให้) — ให้จอเตือนเอาไปโชว์
    if (url.searchParams.get("list") === "missing-sku") {
      return okJson(await shopeeMissingSkus());
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
      /* เพดาน 5,000 (เดิม 100 · 16 ก.ย. 2569) — ปุ่ม Export ยอดขายตามสินค้าต้องได้ทุกรหัสในช่วง
         🔴 จอเคยทำไฟล์ "ยอดขายตามสินค้า" จากรายการที่ขอมาแสดง limit=10 ⇒ ไฟล์มีแค่ 10 ตัวแต่ชื่อบอกว่าทั้งหมด
         ⇒ ส่ง totalSkus (จำนวนรหัสทั้งหมดในเงื่อนไขเดียวกัน) ให้จอเช็คว่าได้ครบก่อนเขียนไฟล์ (display-limits-cant-decide) */
      const limit = Math.min(5000, Math.max(1, parseInt(url.searchParams.get("limit") ?? "15", 10) || 15));
      /* ⚠️ **sku= ถามยอดขายของสินค้าตัวเดียว** — ฝั่งจอต้องใช้ในหน้ารายละเอียดสินค้า
          ก่อนหน้านี้ผมบอกฝั่งจอว่า "ใช้ sku= ได้" ทั้งที่ยังไม่ได้ทำ
          ⇒ ท่อเมินพารามิเตอร์ที่ไม่รู้จักเงียบ ๆ แล้วคืนสินค้าขายดีทั้งร้าน
             ถ้าจอเชื่อชื่อพารามิเตอร์แล้วหยิบแถวแรกมาแสดง = **โชว์ยอดขายของสินค้าตัวอื่น
             ในหน้าสินค้าตัวนี้ โดยดูสมเหตุสมผลทุกประการ** (ฝั่งจอจับได้ 3 ก.ย. 2569) */
      const sku = String(url.searchParams.get("sku") ?? "").trim().slice(0, 60);
      /* warehouse= — ยอดขายรายสินค้าของคลังเดียว (dropdown เลือกคลังในแท็บ ตามคลัง/สาขา แบบ ZORT · ขอ 15 ก.ย. 2569)
         ⚠️ คลังของใบเก็บตั้งแต่ 1 ก.ย. 2569 · ใบเก่าที่ยังไม่กวาดย้อนหลังไม่เข้าคลังไหน ⇒ ช่วงก่อนนั้นยอดต่ำกว่าจริง
         ⚠️ ค่าผิดรูปตอบ 400 ห้ามเมินเงียบ (เมิน = ได้ยอดทั้งร้านที่หน้าตาเหมือนยอดคลัง) */
      const warehouse = String(url.searchParams.get("warehouse") ?? "").trim();
      if (warehouse && !/^[A-Za-z0-9_-]{1,20}$/.test(warehouse)) {
        return json({ error: `warehouse ต้องเป็นรหัสคลัง ตัวอักษร/ตัวเลข 1–20 ตัว (ได้มา "${warehouse.slice(0, 20)}")` }, 400);
      }
      const params = [from, to];
      let filter = "";
      if (sku) { filter = "AND oi.sku = ?"; params.push(sku); }
      if (warehouse) { filter += " AND o.warehouse_code = ?"; params.push(warehouse); }
      /* store= (16 ก.ย. 2569 · ใบ t_mu2wjql1) — เทียบกับ ZORT ต้องแยกร้าน (บัญชี ZORT บน Chrome = z1)
         ⚠️ ไม่ส่ง = รวมทุกร้านเหมือนเดิม (จอเดิมเลขไม่เปลี่ยน) · ค่าอื่นนอกจาก z1/z2/all/ว่าง = 400 */
      const storeRaw = String(url.searchParams.get("store") ?? "").trim();
      if (storeRaw && !["z1", "z2", "all"].includes(storeRaw)) {
        return json({ error: `store ต้องเป็น z1 · z2 · all (ได้มา "${storeRaw.slice(0, 20)}")` }, 400);
      }
      const store = storeRaw === "z1" || storeRaw === "z2" ? storeRaw : null;
      if (store) { filter += " AND o.source = ?"; params.push(store); }
      /* by=month — แบ่งเป็นรายเดือนในคำขอเดียว (ฝั่งจอขอ: กราฟยอดขายรายสินค้า)
         ⚠️ เดิมจอต้องยิง 12 ครั้ง เดือนละครั้ง ⇒ **12 การเรียกฟังก์ชันต่อการเปิดกราฟหนึ่งครั้ง**
            ซึ่งกินเครดิตโดยไม่จำเป็น และช้ากว่าด้วย
         ⚠️ `order_date` เก็บเป็นวันแบบไทยอยู่แล้ว ⇒ ตัด 7 ตัวแรกได้เลย ไม่ต้องบวกเวลาอีก
            (ถ้าเป็นคอลัมน์ที่เก็บ UTC ต้อง date(col,'+7 hours') ก่อนเสมอ — คนละกรณีกัน) */
      /* by=category — รวมยอดตามหมวดสินค้าฝั่งเซิร์ฟเวอร์ (การ์ด "หมวดหมู่ขายดีปีนี้" เมนู 1 · ข้อ 7 เมนู 2)
         ⚠️ จอห้ามรวมหมวดเองจากรายการ limit ≤100 — ตัดหางแล้วอันดับหมวดเพี้ยน (display-limits-cant-decide)
         ⚠️ by ค่าอื่นตอบ 400 — เดิมค่าที่ไม่รู้จักตกไปเป็นรายสินค้าเงียบ ๆ (filter-looks-applied-but-is-not) */
      const byRaw = String(url.searchParams.get("by") ?? "");
      if (byRaw && byRaw !== "month" && byRaw !== "category") {
        return json({ error: `by รับแค่ month หรือ category (ได้มา "${byRaw.slice(0, 20)}")` }, 400);
      }
      const byMonth = byRaw === "month";
      const byCategory = byRaw === "category";
      const items = byMonth
        ? await coreQuery(
            /* 🔴 **แยก "ที่ได้เงินแล้ว" ออกจาก "ยังไม่จ่าย" ในคิวรีเดียว** (6 ก.ย. 2569)
                กราฟนี้ตัดใบยกเลิกออกแล้วก็จริง **แต่ยังรวมใบที่ยังไม่จ่าย**
                วัดจริง 1 ม.ค.–6 ก.ย. 2569: กราฟรวม ฿5,624,334 · ในนั้นเป็นใบยังไม่จ่ายราว ฿564,000
                เกือบทั้งหมดคือซากออเดอร์ค้างจ่ายจากร้าน Shopify ที่ปิดไปแล้ว **ไม่มีวันได้เงิน**
                ⇒ กราฟรายได้รายเดือนที่เจ้าของร้านดู **สูงเกินจริงมาตลอด**
                ⚠️ **ไม่หักออกจาก `amount` เอง** — จอที่เทียบกับเลขเดิมจะเพี้ยนทันที
                   ให้ตัวเลขแยกไป แล้วให้จอเลือกใช้ (กติกาเดียวกับ totalPaidAmount)
                ⚠️ ทำในคิวรีเดิมด้วย CASE **ไม่ยิงคิวรีที่สอง** — โควตา D1 มีจำกัด
                   และเลขสองชุดที่มาจากคนละคิวรี มีโอกาสไม่ตรงกันเองโดยไม่มีใครรู้
                ⚠️ ใช้ `LIKE 'pending%'` (ขึ้นต้นด้วย) **ห้ามใช้ `%ending%`**
                   ผมเขียน `%ending%` ไปรอบแรกแล้วจับได้ตอนอ่านซ้ำ — นั่นคือการ
                   **จัดประเภทด้วยสตริงย่อย** ซึ่งเป็นข้อห้ามของโปรเจกต์นี้
                   (สถานะที่ลงท้ายด้วย ending คำอื่นจะถูกนับเป็น "ยังไม่จ่าย" เงียบ ๆ)
                   ค่าจริงที่พบในฐานตอนนี้: Success · Voided · Pending */
            `SELECT substr(o.order_date,1,7) AS month,
                    SUM(oi.qty) AS qty, ROUND(COALESCE(SUM(oi.amount),0),2) AS amount,
                    ROUND(COALESCE(SUM(CASE WHEN o.status LIKE 'pending%' THEN oi.amount ELSE 0 END),0),2) AS unpaidAmount,
                    COUNT(DISTINCT o.id) AS orders,
                    COUNT(DISTINCT CASE WHEN o.status LIKE 'pending%' THEN o.id END) AS unpaidOrders
             FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.order_date >= ? AND o.order_date <= ?
               AND o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'
               ${filter}
             GROUP BY substr(o.order_date,1,7) ORDER BY month`,
            params
          )
        : byCategory
        ? await coreQuery(
            `SELECT COALESCE(NULLIF(p.category,''),'(ยังไม่ได้จัดหมวดใน ZORT)') AS category,
                    SUM(oi.qty) AS qty, ROUND(COALESCE(SUM(oi.amount),0),2) AS amount,
                    COUNT(DISTINCT oi.sku) AS skus, COUNT(DISTINCT o.id) AS orders
             FROM order_items oi JOIN orders o ON o.id = oi.order_id
             LEFT JOIN products p ON p.sku = oi.sku
             WHERE o.order_date >= ? AND o.order_date <= ?
               AND o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'
               ${filter}
             GROUP BY 1 ORDER BY amount DESC LIMIT ${limit}`,
            params
          )
        : await coreQuery(
            `SELECT oi.sku, MAX(oi.name) AS name,
                    SUM(oi.qty) AS qty, ROUND(COALESCE(SUM(oi.amount),0),2) AS amount,
                    MAX(COALESCE(p.category,'')) AS category
             FROM order_items oi JOIN orders o ON o.id = oi.order_id
             LEFT JOIN products p ON p.sku = oi.sku
             WHERE o.order_date >= ? AND o.order_date <= ?
               AND o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'
               ${filter}
             GROUP BY oi.sku ORDER BY qty DESC LIMIT ${limit}`,
            params
          );
      // จำนวนรหัสทั้งหมดในเงื่อนไขเดียวกับรายสินค้า — มีเฉพาะโหมดรายสินค้า (รายเดือน/หมวดไม่ใช่รายรหัส)
      const totalSkus = byMonth || byCategory ? null : Number((await coreQuery(
        `SELECT COUNT(DISTINCT oi.sku) AS c
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.order_date >= ? AND o.order_date <= ?
           AND o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'
           ${filter}`,
        params
      ))[0]?.c ?? 0);
      // ⚠️ **สะท้อนพารามิเตอร์ที่รับไปจริงกลับไปด้วยเสมอ** (ฝั่งจอเสนอ — ดีมาก)
      //    จอจะได้ตรวจเองได้ว่าเซิร์ฟเวอร์อ่านที่ส่งไปจริงไหม แทนที่จะรู้ตอนตัวเลขผิดบนจอ
      // ⚠️ **จอใช้ applied เป็นด่านจริง ไม่ใช่แค่ debug** (ฝั่งจอทำแล้ว: applied.sku ไม่ตรง = ทิ้งข้อมูล)
      //    ⇒ ห้ามถอดฟิลด์นี้ออก และห้ามส่งค่าที่ไม่ใช่ค่าที่ใช้จริง
      return json({
        ok: true,
        from,
        to,
        applied: { sku: sku || null, limit, by: byRaw || null, warehouse: warehouse || null, store },
        storeScope: store ? `เฉพาะร้าน ${store}` : "ทุกร้านรวมกัน",
        ...(totalSkus === null ? {} : { totalSkus, complete: items.length >= totalSkus }),
        /* 🔑 **ตัวเลขเงินต้องมีป้ายบอกขอบเขตเสมอ** — บทเรียน 6 ก.ย. 2569
            คำตอบชุดอื่นในไฟล์นี้ประกาศขอบเขตครบ (storeScope · shipStatusScope · freshnessNote)
            แต่ **ตัวเลขเงินซึ่งสำคัญที่สุดกลับไม่มีอะไรกำกับ** เพราะมันดู "ชัดอยู่แล้ว"
            ⇒ ความชัดที่ไม่ได้เขียนไว้ คือที่ที่คนสองคนเข้าใจต่างกันโดยไม่รู้ตัว */
        amountScope: byMonth
          ? "amount = ตัดใบยกเลิกออกแล้ว **แต่ยังรวมใบที่ยังไม่จ่าย** · " +
            "อยากได้เฉพาะเงินที่ได้รับจริง ให้ใช้ amount − unpaidAmount ของเดือนนั้น"
          : "amount = ตัดใบยกเลิกออกแล้ว **แต่ยังรวมใบที่ยังไม่จ่าย** (รายตัวยังไม่ได้แยกยอดค้างจ่าย)",
        ...(byMonth ? {} : {
          categoryScope: "หมวด = หมวดสินค้าในคลัง ZORT (ตาราง products ผูกด้วย sku · ไม่แยกร้าน) · " +
            "sku ที่คลังไม่รู้จักหรือยังไม่จัดหมวด = " + (byCategory ? "(ยังไม่ได้จัดหมวดใน ZORT)" : "ค่าว่าง"),
        }),
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
        /* 🔴 day ต้องเป็นวันจริงตามปฏิทิน (15 ก.ย. 2569) — เดิมไม่ตรวจ ⇒ day=2026-13-45 ได้ 0 ใบ + 200
            หน้าตาเหมือน "วันนั้นไม่มีขาย" ทั้งที่ถามวันที่ไม่มีอยู่จริง · ตัวนี้คือซ้อมเอกสารภาษี ห้ามเงียบ */
        const { isRealDay } = await import("../lib/param-guard.mjs");
        if (!isRealDay(day)) return json({ error: `day ต้องเป็นวันที่จริง YYYY-MM-DD (ได้มา "${String(day).slice(0, 20)}")` }, 400);
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
          // ⚠️ คิวรีตัดที่ 200 ใบ — ชนเพดาน = ใบของวันนั้นไม่ครบ ห้ามถือว่าซ้อมครบทั้งวัน
          truncated: orders.length >= 200,
          peak: await sendInvoices(invoices),
        });
      }
      return json({ error: "peak รับได้เฉพาะ status หรือ dry" }, 400);
    }
    if (url.searchParams.get("list") === "moves") {
      return okJson({
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
          items: ["all", "none"].includes(url.searchParams.get("items")) ? url.searchParams.get("items") : undefined,
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
    if (url.searchParams.get("tiktoksync")) {
      const days = Math.min(60, Math.max(1, parseInt(url.searchParams.get("days") ?? "3", 10) || 3));
      return json({ ok: true, tiktok: await syncTiktokOrders(days) });
    }
    /* ส่องว่าคำตอบจริงของ TikTok มีฟิลด์ชื่ออะไรบ้าง — **คืนเฉพาะชื่อ ไม่คืนค่า**
       ⚠️ มีไว้ปิดช่อง "เดาชื่อฟิลด์" ของ tiktok-orders.mjs เท่านั้น
          ห้ามแก้ให้คืนค่าจริง — คำตอบของ TikTok มีชื่อ/ที่อยู่/เบอร์ผู้รับอยู่ในนั้น
          (กติกาเดียวกับ pendingfields ด้านล่าง) */
    if (url.searchParams.get("tiktokshape")) {
      const { tiktokProductShape } = await import("../lib/tiktok-stock.mjs");
      const [order, product] = await Promise.all([
        tiktokOrderShape().catch((e) => ({ error: String(e?.message || e).slice(0, 200) })),
        tiktokProductShape().catch((e) => ({ error: String(e?.message || e).slice(0, 200) })),
      ]);
      return json({ ok: true, order, product });
    }
    // เทียบสต็อกที่ลงขายบน TikTok กับภาพถ่ายคลังเรา — อ่านอย่างเดียว ไม่เขียนกลับ TikTok
    if (url.searchParams.get("tiktokstock")) {
      const { tiktokStockCompare } = await import("../lib/tiktok-stock.mjs");
      return json({ ok: true, tiktok: await tiktokStockCompare() });
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
    /* GET ?zortdoccounts=1 — จำนวนใบซื้อ·ใบเสนอราคา·ใบคืน·ใบโอน ของร้าน z1 และ z2 (ใบ t_mu28iq46 · 15 ก.ย. 2569)
       ขาเข้าจากจอ/ตัวตรวจ: ไม่มีพารามิเตอร์ · ขาออกไป ZORT: 4 เส้น × 2 ร้าน limit=1 (GET อย่างเดียว)
       ขาออก: {ok, at, stores:{z1:{purchases:{count}|{unknown,error},…}, z2:{…}}, controlOk, z2Known}
       🔒 คืนจำนวนอย่างเดียว ไม่มีแถว */
    if (url.searchParams.has("zortdoccounts")) {
      if (req.method !== "GET") return json({ error: "ต้องเป็น GET" }, 405);
      const { zortStoreDocCounts } = await import("../lib/zort-store-doc-counts.mjs");
      return json(await zortStoreDocCounts());
    }
    if (url.searchParams.get("ordercheck")) {
      /* ⚠️ **รหัส ZORT กับตัวกรอง source ต้องมาจากตัวแปรตัวเดียวกัน**
          เดิมเขียนแยกกัน (env ของร้าน 1 · WHERE source='z1' คนละที่)
          ถ้าวันไหนแก้ที่หนึ่งลืมอีกที่ = ยิงถาม ZORT ร้าน A แล้วเทียบกับกระจกร้าน B
          ⇒ "ไม่ตรงกันทั้งหมด" ทั้งที่ข้อมูลอาจถูกทุกใบ (เจอมาแล้วตอนเทียบผิดคีย์) */
      const { shippingFieldsChanged, ordercheckCoverage, validateOrdercheckWindow, readOrdercheckPage } =
        await import("../lib/ordercheck-shipping.mjs");
      const startedAt = new Date().toISOString();
      /* ร้านเดียวต่อคำขอ — all/ค่าแปลก ⇒ 400 ห้ามตกเป็น z1 เงียบ ๆ (ดู parseSingleStore) */
      const storeParsed = (await import("../lib/core-orders.mjs")).parseSingleStore(url.searchParams.get("store"));
      if (storeParsed.error) return json({ error: storeParsed.error }, 400);
      const store = storeParsed.source;
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
      let window;
      try {
        window = validateOrdercheckWindow(url.searchParams);
      } catch (error) {
        return json({ error: error.message }, 400);
      }
      const { from, to } = window;

      const zort = new Map();
      let truncated = false;
      let declaredTotal = null;
      let rowsFetched = 0;
      let pagesRead = 0;
      let countStable = true;
      let allCountsPresent = true;
      for (let page = 1; page <= 10; page++) {
        const r = await fetch(
          `https://open-api.zortout.com/v4/Order/GetOrders?orderdateafter=${from}&orderdatebefore=${to}&limit=200&page=${page}`,
          { headers: st, signal: AbortSignal.timeout(15000) }
        );
        /* 🔴 **หน้าที่ยิงไม่สำเร็จ ห้ามตีความว่า "หมดแล้ว"** (แก้ 6 ก.ย. 2569)
            เดิมไม่เช็ค `r.ok` เลย ⇒ ZORT ตอบ 429/500 ที่หน้ากลาง ⇒ `chunk = []`
            ⇒ `chunk.length < 200` ⇒ **break แล้วรายงานว่าครบ** โดย `truncated` ยังเป็น false
            ⇒ กวาดได้ 200 จาก 800 ใบ แล้วบอกว่า "กระจกมีใบเกินมา 600 ใบที่ ZORT ไม่มี"
              ⇒ คนไปไล่แก้กระจกที่ถูกอยู่แล้ว · เครื่องมือนี้มีไว้จับ "581 ใบหายเงียบ" โดยเฉพาะ
            ⇒ ยิงไม่สำเร็จ = **โยนออกไป** ให้ผู้เรียกเห็นว่าเทียบไม่ได้
              ห้ามคืนผลบางส่วนที่หน้าตาเหมือนผลเต็ม */
        if (!r.ok) throw new Error(`ZORT ตอบ ${r.status} ที่หน้า ${page} — เทียบไม่ได้ ห้ามใช้ผลรอบนี้`);
        const { chunk, total } = readOrdercheckPage(await r.json());
        pagesRead++;
        rowsFetched += chunk.length;
        if (total === null) allCountsPresent = false;
        if (page === 1) declaredTotal = total;
        else if (total !== declaredTotal) countStable = false;
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
            shipping: o,
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
                COALESCE(integration_status,'') AS integ,
                ship_channel, ship_name, ship_date, is_cod FROM orders
         WHERE source = ? AND order_date >= ? AND order_date <= ?`,
        [store, from, to]
      );
      const mirror = new Map(mine.map((r) => [String(r.number), r]));

      const coverage = ordercheckCoverage({ declaredTotal, uniqueOrders: zort.size, rowsFetched, truncated });
      coverage.pagesRead = pagesRead;
      coverage.countStable = countStable;
      if (!countStable || rowsFetched !== zort.size) coverage.zortReadComplete = false;
      else if (!allCountsPresent) coverage.zortReadComplete = null;
      const complete = coverage.zortReadComplete === true;
      const shippingCounts = { shipChannel: 0, shipName: 0, shipDate: 0, isCod: 0 };
      const staleShipping = [];
      let matchedOrders = 0;
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
        matchedOrders++;
        const changed = shippingFieldsChanged(z.shipping, m);
        if (changed.length) {
          staleShipping.push({ number: z.number, fields: changed });
          for (const field of changed) shippingCounts[field]++;
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
        ok: complete,
        partial: !complete,
        coverage: { ...coverage, matchedOrders, startedAt, finishedAt: new Date().toISOString() },
        // ⚠️ ต้องบอกว่าตรวจร้านไหน ไม่งั้นผลของสองร้านหน้าตาเหมือนกันเป๊ะ แยกไม่ออก
        store,
        storeName: store === "z2" ? "ceojet (หน้าร้าน POS)" : "ศีตกาล เทรดดิ้ง (ตัวที่คิดภาษี)",
        window,
        truncated, // ⚠️ ชนเพดานหน้า = ตัวเลขไม่ครบ ห้ามเงียบ
        counts: {
          zortOrders: zort.size,
          mirrorOrders: mine.length,
          missingInMirror: missingInMirror.length,
          staleStatus: staleStatus.length,
          stalePay: stalePay.length,
          staleInteg: staleInteg.length,
          extraInMirror: complete ? extraInMirror.length : null,
          staleShipping: staleShipping.length,
          shippingFields: shippingCounts,
        },
        sample: {
          missingInMirror: missingInMirror.slice(0, 15),
          staleStatus: staleStatus.slice(0, 15),
          stalePay: stalePay.slice(0, 15),
          staleInteg: staleInteg.slice(0, 15),
          extraInMirror: complete ? extraInMirror.slice(0, 15) : [],
          // ชื่อผู้รับอาจเป็นข้อมูลส่วนตัว: ส่งเฉพาะเลขใบและชื่อฟิลด์ที่ต่าง
          staleShipping: staleShipping.slice(0, 15),
        },
        note:
          "เทียบสองทาง: ZORT→กระจก (missingInMirror = ใบหายทั้งใบ) และ " +
          "กระจก↔ZORT (staleStatus/stalePay = มีใบแต่ค่าเก่า) · " +
          "staleShipping นับใบไม่ซ้ำ เฉพาะใบที่พบทั้งสองฝั่ง · " +
          "partial=true คือยังยืนยันอ่านครบไม่ได้ ตัวเลขต่างเป็นของส่วนที่อ่านได้เท่านั้น · " +
          "สองระบบอ่านต่างเวลา ไม่ใช่ snapshot เดียวกัน ไม่เจอความต่างไม่ได้รับรองทุกช่วงวัน",
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
      /* ว่าง/all = ทุกร้าน · ค่าแปลก ⇒ 400 ห้ามเหมาเป็นทุกร้านเงียบ ๆ (ดู parseStore · 15 ก.ย. 2569) */
      const storeParsed = (await import("../lib/core-orders.mjs")).parseStore(url.searchParams.get("store"));
      if (storeParsed.error) return json({ error: storeParsed.error }, 400);
      const store = storeParsed.source;
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

      /* ⚡ **แก้ 9 ก.ย. 2569 — ยุบสองคำสั่งเหลือคำสั่งเดียว**
         ของเดิมยิงสองครั้งกวาดช่วงเดียวกันซ้ำ: ครั้งแรกจัดกลุ่มรายลูกค้า (LIMIT n+1)
         ครั้งที่สองหายอดรวม + `COUNT(DISTINCT <นิพจน์>)` ซึ่งแพงเป็นพิเศษ
         ⇒ **ยอดรวมทั้งหมดคำนวณจากกลุ่มที่ได้มาแล้วได้ ไม่ต้องกวาดซ้ำ**
            (จำนวนใบ = ผลรวมของกลุ่ม · จำนวนชื่อ = จำนวนกลุ่ม)
         ⇒ ตัดการกวาดช่วงทิ้งไปหนึ่งรอบเต็ม ๆ

         ฝั่งจอวัดมาว่า `limit` แทบไม่มีผลต่อเวลาเลย (17.6 vs 17.7 วิ) เพราะมันตัดตอนท้าย
         **งานหนักอยู่ที่จำนวนแถวที่ต้องอ่าน ไม่ใช่จำนวนที่ส่งกลับ** ⇒ ต้องลดรอบการอ่าน
         ⚠️ ไม่ LIMIT แล้ว = ได้กลุ่มทุกชื่อในช่วง (เคยวัดได้ ~1,036 ชื่อ) รับไหว
            แต่ถ้าวันหนึ่งชื่อโตเป็นหลักแสน ต้องกลับมาคิดใหม่ — เขียนกำกับไว้ตรงนี้ */
      /* ⚡⚡ **ยุบอีกชั้น 9 ก.ย. 2569 — กวาดช่วงรอบเดียวจบ**
         ของเดิมกวาดช่วงเดียวกัน **สองรอบ**: รอบนี้จัดกลุ่มรายลูกค้า และอีกรอบข้างล่าง
         จัดกลุ่ม (ลูกค้า × ช่องทาง) ⇒ ทั้งที่กลุ่มละเอียดกว่า **คำนวณกลุ่มหยาบกว่าได้อยู่แล้ว**
         ⇒ จัดกลุ่ม (ชื่อ × ช่องทาง) ครั้งเดียว แล้วรวบเป็นรายลูกค้าฝั่งนี้

         รวมกับสองคอมมิตก่อนหน้า: จาก **กวาดช่วง 3 รอบ + สแกนทั้งตาราง 1 รอบ**
         เหลือกวาดช่วงรอบเดียวสำหรับยอด/ช่องทาง (การค้นประวัติแก้ต่อ 11 ก.ย. ด้านล่าง)

         ⚠️ เกณฑ์ตัดสินว่าแก้สำเร็จ (ฝั่งจอตั้งให้ หลังพบว่ารายงานเดิมของตัวเองมาจากการยิงรอบเดียว):
            **สำเร็จครบ 3/3 รอบ และต่ำกว่า ~15 วิ** — ไม่ใช่ "ยิงครั้งเดียวแล้วผ่าน"
            ของเดิม days=30 ล้ม 1 ใน 3 รอบ (40.2 / 22.1 / 15.9 วิ) ⇒ ไม่เคย "ผ่าน" จริง */
      const gRows = await coreQuery(
        `SELECT COALESCE(NULLIF(TRIM(customer),''),'') AS name,
                COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
                COUNT(*) AS orders, SUM(amount) AS sales, MAX(order_date) AS lastDay
         FROM orders WHERE ${w} GROUP BY 1,2`,
        params
      );
      /* รวบ (ชื่อ × ช่องทาง) → รายลูกค้า · เก็บช่องทางไว้ในตัวเดียวกันเลย ไม่ต้องยิงซ้ำ */
      const byName = new Map();
      for (const g of gRows) {
        const k = String(g.name ?? "");
        let cur = byName.get(k);
        if (!cur) { cur = { name: k, orders: 0, sales: 0, lastDay: null, chans: [] }; byName.set(k, cur); }
        cur.orders += num2(g.orders);
        cur.sales += num2(g.sales);
        if (!cur.lastDay || String(g.lastDay) > cur.lastDay) cur.lastDay = g.lastDay;
        if (k !== "") cur.chans.push({ channel: String(g.ch), orders: num2(g.orders) });
      }
      for (const c of byName.values()) c.chans.sort((a, b) => b.orders - a.orders);
      const rows = [...byName.values()].sort((a, b) => b.sales - a.sales);
      const named = rows.filter((r) => String(r.name || "") !== "").slice(0, limit);
      const blank = rows.find((r) => String(r.name || "") === "");
      const tot = {
        orders: rows.reduce((a, r) => a + num2(r.orders), 0),
        sales: rows.reduce((a, r) => a + num2(r.sales), 0),
        /* จำนวนชื่อ = จำนวนกลุ่ม · กองไม่ระบุชื่อนับเป็นหนึ่งชื่อเหมือนเดิม
           (ของเดิมใช้ COUNT(DISTINCT COALESCE(...,'(ไม่ระบุ)')) ซึ่งให้ผลเดียวกัน) */
        names: rows.length,
      };
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

      /* ── ซื้อครั้งแรกเมื่อไหร่ (ทั้งประวัติ) ── (ฝั่งจอขอ 6 ก.ย. 2569 — จอรายงานลูกค้า)
         ⚠️ **ต้อง MIN ทั้งตาราง ไม่ใช่แค่ในช่วง** — นี่คือทั้งประเด็นของช่องนี้
            จอใช้แยก "ลูกค้าใหม่" (ซื้อครั้งแรกอยู่ในช่วงที่เลือก) ออกจาก "ลูกค้าเก่าซื้อซ้ำ"
            ตามนิยามของ ZORT · ถ้า MIN เฉพาะในช่วง ทุกคนจะกลายเป็นลูกค้าใหม่หมด
         ⚠️ ตัวกรองร้านยังต้องใช้ (ลูกค้า z1 กับ z2 คนละบริบท) แต่**ไม่ใส่กรอบวัน**
         ⚠️ ไม่ผูกตัวแปรทีละชื่อ — เพดาน D1 เคยพังตอน limit=500 */
      /* ⚡ แก้ 11 ก.ย. 2569: EXPLAIN ใน SQLite จำลองพบว่า TRIM(customer) IN (...)
         ใช้ดัชนี (customer, order_date) seek ไม่ได้ ⇒ แบ่ง 50 ชื่อ = สแกนทั้งตารางซ้ำถึง 10 รอบ
         ส่งรายชื่อเป็น JSON bind เดียวให้ json_each (D1 รองรับ) ⇒ สแกนประวัติครั้งเดียว
         ยัง GROUP เฉพาะชื่อที่จะส่งกลับ, ยัง TRIM แบบ SQLite, ไม่เพิ่มคอลัมน์/ดัชนีหรือ backfill
         ผล D1 จริงต้องให้ผู้รีวิววัด 3 รอบ ไม่ใช้เวลา SQLite ในเครื่องแทน */
      const firstMap = new Map();
      if (wantNames.size) {
        const fw = ["TRIM(customer) IN (SELECT value FROM json_each(?))", CANCEL];
        const fp = [JSON.stringify([...wantNames])];
        if (store) { fw.push("source = ?"); fp.push(store); }
        const fRows = await coreQuery(
          `SELECT TRIM(customer) AS name, MIN(order_date) AS firstDay
           FROM orders WHERE ${fw.join(" AND ")} GROUP BY 1`,
          fp
        );
        for (const r of fRows) firstMap.set(String(r.name), r.firstDay);
      }

      /* ⚡ **คำสั่งช่องทางถูกยุบเข้ากับคำสั่งหลักแล้ว (9 ก.ย. 2569)** — ไม่ยิงซ้ำอีก
         ช่องทางของแต่ละคนถูกเก็บไว้ตั้งแต่ตอนรวบ (ชื่อ × ช่องทาง) ข้างบน
         ⚠️ กติกาเดิมยังอยู่ครบ: **ห้ามใช้ GROUP_CONCAT แล้วให้จอ split ด้วยลูกน้ำ**
            ชื่อช่องทางคนตั้งเอง วันไหนมีลูกน้ำในชื่อ จอจะแตกชื่อเดียวเป็นสองช่องทางเงียบ ๆ
            ⇒ ยังส่งเป็นอาร์เรย์เหมือนเดิม ไม่มีตัวคั่นให้พลาด */
      const chMap = new Map();
      for (const c of byName.values()) {
        if (wantNames.has(c.name)) chMap.set(c.name, c.chans);
      }

      return json({
        ok: true,
        ...scope,
        customers: named.map((r) => ({
          name: r.name,
          orders: num2(r.orders),
          sales: num2(r.sales),
          lastDay: r.lastDay,
          /* ซื้อครั้งแรกทั้งประวัติ (ไม่ใช่แค่ในช่วง) — ใช้แยกลูกค้าใหม่/เก่าตามนิยาม ZORT
             ⚠️ ประวัติของกระจกเริ่ม ~มิ.ย. 2569 — ลูกค้าที่ซื้อก่อนหน้านั้นจะดูเป็น "ใหม่" เกินจริง
                จอควรบอกขอบเขตนี้ (ดู historyFrom ระดับบนสุด) */
          firstDay: firstMap.get(String(r.name)) ?? null,
          /* ⚠️ สามสถานะ: true = ใหม่ในช่วง · false = เก่าซื้อซ้ำ · null = **ไม่รู้** (หา firstDay ไม่ได้)
              เดิมเขียน (x ?? "") >= from ⇒ ข้อมูลหาย = false = "เก่าซื้อซ้ำ" อย่างมั่นใจ
              ซึ่งคือคำยืนยันที่ผิด ไม่ใช่การบอกว่าไม่รู้ (คลาสเดียวกับที่แก้กัน 5 จุดเมื่อวาน) */
          newInRange: firstMap.has(String(r.name)) ? firstMap.get(String(r.name)) >= from : null,
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
        /* ── กราฟแนวโน้มรายเดือน: ลูกค้าใหม่ / ซื้อซ้ำ / ไม่ระบุชื่อ ── (ฝั่งจอขอ 6 ก.ย. 2569)
           "ใหม่" = เดือนนั้นเป็นเดือนที่ซื้อครั้งแรกทั้งประวัติ (นิยาม ZORT) · นับเป็น "คน" ไม่ใช่ "ใบ"
           ⚠️ ใบไม่ระบุชื่อแยกกองต่างหาก (นับเป็นใบ เพราะไม่รู้ว่าเป็นกี่คน) **ห้ามเอาไปบวกกับสองกองแรก**
           ⚠️ กลุ่ม MIN ข้างในไม่ใส่กรอบวันโดยตั้งใจ — เหตุผลเดียวกับ firstDay ข้างบน */
        monthly: await (async () => {
          const mw = ["o.order_date >= ?", "o.order_date <= ?", CANCEL.replace(/status/g, "o.status")];
          if (store) mw.push("o.source = ?");
          const storeCond = store ? "AND source = ?" : "";
          /* ⚡ EXPLAIN เดิมพบ correlated MIN สองตัวค้นประวัติซ้ำต่อใบโดย seek ชื่อไม่ได้
             จัดกลุ่มวันแรกครั้งเดียวแล้ว LEFT JOIN ด้วยชื่อ ⇒ ไม่ค้นประวัติใหม่รายออเดอร์
             ห้ามใช้ firstMap ข้างบนแทน: monthly ต้องนับทุกชื่อ ไม่ใช่แค่ top limit
             ⚠️ bind ร้านใน derived table มาก่อนวัน/ร้านใน WHERE ของ o */
          const mp = store ? [store, from, today, store] : [from, today];
          const rows = await coreQuery(
            `SELECT substr(o.order_date,1,7) AS month,
                    COUNT(DISTINCT CASE WHEN TRIM(COALESCE(o.customer,'')) <> ''
                      AND substr(f.firstDay,1,7) = substr(o.order_date,1,7)
                      THEN TRIM(o.customer) END) AS newCustomers,
                    COUNT(DISTINCT CASE WHEN TRIM(COALESCE(o.customer,'')) <> ''
                      AND substr(f.firstDay,1,7) < substr(o.order_date,1,7)
                      THEN TRIM(o.customer) END) AS repeatCustomers,
                    SUM(CASE WHEN TRIM(COALESCE(o.customer,'')) = '' THEN 1 ELSE 0 END) AS unnamedOrders
             FROM orders o
             LEFT JOIN (
               SELECT TRIM(customer) AS name, MIN(order_date) AS firstDay
               FROM orders WHERE ${CANCEL} ${storeCond} AND TRIM(COALESCE(customer,'')) <> ''
               GROUP BY 1
             ) f ON f.name = TRIM(o.customer)
             WHERE ${mw.join(" AND ")}
             GROUP BY 1 ORDER BY 1`,
            mp
          ).catch((e) => ({ error: String(e?.message || e).slice(0, 160) }));
          if (!Array.isArray(rows)) return rows; // ล้ม = ส่ง error ไปตรง ๆ อย่าแกล้งเป็นอาร์เรย์ว่าง
          return rows.map((r) => ({
            month: r.month,
            newCustomers: num2(r.newCustomers),
            repeatCustomers: num2(r.repeatCustomers),
            unnamedOrders: num2(r.unnamedOrders),
          }));
        })(),
        /* ขอบเขตประวัติ — จอต้องบอกว่า "ใหม่" นับจากข้อมูลที่เริ่มเมื่อไหร่ ไม่ใช่ตั้งแต่เปิดร้านจริง */
        historyFrom: (await coreQuery(`SELECT MIN(order_date) AS d FROM orders`).catch(() => [{}]))[0]?.d ?? null,
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
      /* ว่าง/all = ทุกร้าน · ค่าแปลก ⇒ 400 ห้ามเหมาเป็นทุกร้านเงียบ ๆ (ดู parseStore · 15 ก.ย. 2569) */
      const storeParsed = (await import("../lib/core-orders.mjs")).parseStore(url.searchParams.get("store"));
      if (storeParsed.error) return json({ error: storeParsed.error }, 400);
      const store = storeParsed.source;
      /* ⚠️ **เพดานขยายจาก 36 → 120 เดือน** (9 ก.ย. 2569 · ฝั่งจอทักมา)
          ข้อมูลเริ่ม ส.ค. 2566 ⇒ เพดาน 36 เดือนกำลังจะเริ่มบังของจริง **โดยไม่มีอะไรเตือน**
          จอ /core/coverage ต้องย้อนถึงเดือนแรกสุดเสมอ ไม่งั้นเดือนที่ถูกเพดานตัด
          จะดูเหมือน "ไม่มีข้อมูล" ทั้งที่จริงคือ "ไม่ได้ถาม" — คนละความหมายกันคนละโลก
          ⚠️ ของที่โตตามเวลาแบบนี้ ห้ามตั้งเพดานให้พอดีกับปัจจุบัน */
      const months = Math.max(1, Math.min(120, parseInt(url.searchParams.get("months") ?? "6", 10) || 6));
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      /* ⚠️ **นับถอยด้วยเดือนจริง ไม่ใช่ months × 31 วัน** (แก้ 9 ก.ย. 2569)
          31 วันต่อเดือนทำให้ย้อนไป**ไกลเกินจริง** เดือนละ ~0-3 วันสะสม
          (12 เดือน = เกินไป ~5 วัน · 36 เดือน = เกินไป ~2 สัปดาห์)
          ⇒ ขอบซ้ายไม่ตรงกับต้นเดือนที่คนเข้าใจ และจอ coverage ที่เติมเดือนตามปฏิทิน
             จะเห็นเดือนโผล่มาเกินหนึ่งเดือนโดยไม่มีใครสั่ง */
      const _t = new Date(Date.now() + 7 * 3600e3);
      const from = new Date(Date.UTC(_t.getUTCFullYear(), _t.getUTCMonth() - months + 1, 1))
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

    /* ── ขาที่สองของจอ "กระจกครบไหม": **นับใบจาก ZORT โดยตรง** ──
       GET /api/core?zortmonthly=1&ym=YYYY-MM   (ปี ค.ศ. · **รับทีละเดือนเท่านั้น**)
       🔴 แก้ข้อความ 18 ก.ย. 2569: บรรทัดนี้เคยเขียนว่ารับ `from=YYYY-MM&to=YYYY-MM` ด้วย — **ไม่จริง**
          โค้ดข้างล่างตอบ 400 ถ้าไม่ใช่ `ym` เดียว · คนอ่านคอมเมนต์แล้วยิงช่วงจะได้ 400 โดยไม่รู้ว่าทำไม
          (และการรับทีละเดือนเป็นของตั้งใจ — เหตุผลอยู่ย่อหน้าล่าง)

       🔴 **ทำไมต้องมี** (ฝั่งจอขอ 9 ก.ย. 2569)
          จอ /core/coverage รู้แค่ "กระจกเรามีใบไหม" ⇒ แยกไม่ออกระหว่าง
          **"ZORT ไม่มีใบเดือนนั้นจริง"** กับ **"เรายังไม่เคยกวาดเดือนนั้น"**
          สองอย่างนี้ให้หน้าตาเหมือนกันเป๊ะ (แถวหาย) แต่ต้องทำคนละอย่าง
          ⇒ ต้องมีตัวนับที่ **ไม่ผ่านกระจก** ถึงจะตัดสินได้ (ดู [[metrics-need-outside-leg]])

       ⚠️ ยิง ZORT สด ทีละเดือน — ไม่เก็บลงกระจกโดยตั้งใจ
          (ตัวนี้มีไว้ **ตรวจกระจก** ถ้าเก็บลงกระจกก็จะกลายเป็นตรวจตัวเอง
           ดู [[probe-shares-the-bug]])
       ⚠️ ขอทีละเดือนเท่านั้น **ห้ามวนทั้งช่วงในคำขอเดียว** — Netlify ให้รอผลได้ ~26 วิ
          จอเป็นคนวนทีละเดือนเอง จะได้เห็นความคืบหน้าและไม่ชนเพดาน
       ⚠️ ZORT ตอบไม่ได้ = คืน `error` **ห้ามคืน 0** (0 แปลว่า "ไม่มีใบจริง") */
    /* ใบคืนสินค้ารายใบ — ฝั่งจอขอ 9 ก.ย. 2569 (จอ /core/return-orders กดเข้าใบไม่ได้)
       GET /api/core?returnorder=<id>  ⚠️ ใช้ `id` ไม่ใช่เลขที่ใบ (เลขที่ใบซ้ำกันได้) */
    if (url.searchParams.get("returnorder")) {
      const { getReturnOrderDetail } = await import("../lib/core-purchases.mjs");
      return okJson(await getReturnOrderDetail(url.searchParams.get("returnorder")));
    }

    if (url.searchParams.get("zortmonthly")) {
      const ym = String(url.searchParams.get("ym") ?? "").trim();
      if (!/^\d{4}-\d{2}$/.test(ym))
        return json({ error: "ต้องระบุ ym=YYYY-MM (ปี ค.ศ.)" }, 400);
      /* 🔴 **ห้ามกลับไปใช้ค่าเริ่มต้นเงียบ ๆ** (ของเดิม: อะไรที่ไม่ใช่ "z2" ตกเป็น z1)
         ฝั่งจอส่ง store ที่ไม่รู้จักหรือไม่ส่งเลย แล้วได้เลขร้านเดียวกลับไป
         เอาไปเทียบกับกระจกที่รวมสองร้าน ⇒ ขึ้น "ต่างกันมาก" ทุกเดือนทั้งที่ไม่มีอะไรผิด
         (เจอของจริง 9 ก.ย. 2569 · วัดแล้ว z1 367 + z2 761 = 1,128 เทียบกระจก 1,103)
         ⇒ ตอนนี้ค่าที่ไม่รู้จัก **ตอบ 400 ไปเลย** และมี store=all ให้ใช้เมื่อจอเลือกทั้งสองร้าน */
      const raw = (url.searchParams.get("store") ?? "z1").trim();
      if (!["z1", "z2", "all"].includes(raw))
        return json({ error: `store ต้องเป็น z1 · z2 · all (ได้มา "${raw}")` }, 400);
      const { zortOrderCountForMonth, zortOrderCountForMonthAll } =
        await import("../lib/core-sync.mjs");
      /* &detail=1 ⇒ ไล่รายใบแล้วแยก "ไม่รวมใบยกเลิก" ออกจาก "เฉพาะใบยกเลิก"
         🔴 มีเพราะฝั่งจอวัดได้ว่าจำนวนใบต่างจากกระจก 3.5% แต่ยอดเงินต่าง 19% ⇒ ไม่ได้สัดส่วน
            และตอบด้วยเลขหัวคำตอบไม่ได้ เพราะ ZORT ให้ count/totalAmount **รวมใบยกเลิก** เท่านั้น
         ⚠️ store=all ยังไม่รองรับ detail (ต้องไล่รายใบสองร้าน = เสี่ยงชนเพดานเวลา 26 วิ)
            ⇒ ตอบ 400 ตรง ๆ **ห้ามเมินพารามิเตอร์เงียบ ๆ แล้วคืนผลที่ไม่มี detail** */
      const detail = url.searchParams.get("detail") === "1";
      if (detail && raw === "all")
        return json({ error: "detail=1 ใช้กับร้านเดียวเท่านั้น (store=z1 หรือ z2) — ยิงสองรอบแล้วบวกเอง" }, 400);
      return okJson(raw === "all"
        ? await zortOrderCountForMonthAll(ym)
        : await zortOrderCountForMonth(ym, raw, { detail }));
    }

    if (url.searchParams.get("pending")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      /* ร้านเดียวต่อคำขอ — all/ค่าแปลก ⇒ 400 ห้ามตกเป็น z1 เงียบ ๆ (ดู parseSingleStore) */
      const storeParsed = (await import("../lib/core-orders.mjs")).parseSingleStore(url.searchParams.get("store"));
      if (storeParsed.error) return json({ error: storeParsed.error }, 400);
      const store = storeParsed.source;
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

      /* 🔴 **ต้องดึง `id` มาด้วยเสมอ ห้ามส่งแต่ `number`** (เพิ่ม 9 ก.ย. 2569)
          `number` (เลขที่ใบ) **ซ้ำกันได้จริง** และไม่ใช่กุญแจของตาราง — กุญแจคือ `id`
          ซึ่งมี prefix ร้านนำหน้า (`z1/<number>`) ⇒ จอที่เอา number ไปเปิดใบรายใบ
          จะได้หน้า "ไม่พบใบนี้" **ทุกใบ** (ฝั่งจอเจอของจริงที่จอแพ็คสินค้า 9 ก.ย. 2569
          เสีย 100% ของใบ และไม่มีอะไรฟ้องเลยเพราะหน้าปลายทางตอบ 200 ตามปกติ)
          ส่ง `source` ไปด้วย จอจะได้ไม่ต้องเดา prefix เวลาร้านที่สองเข้ามา */
      const rows = await coreQuery(
        `SELECT id, source, number, COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch, order_date, amount,
                status, COALESCE(pay_status,'') AS pay, COALESCE(tracking_no,'') AS track,
                SUM(CASE WHEN COALESCE(pay_status,'') LIKE '%paid%' THEN 1 ELSE 0 END)
                  OVER () AS must_ship_total
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
          /* 🗑️ ฝั่งจอมีตัวหา id เองชั่วคราวอยู่ (lib/open-order.ts) — พอช่องนี้ขึ้นจริงแล้ว
              ให้ถอดตัวนั้นออก จะได้กลับไปเป็นลิงก์ตรง ๆ ที่เร็วกว่าและไม่ต้องยิงเพิ่ม */
          id: r.id, source: r.source,
          number: r.number, channel: r.ch, day: r.order_date,
          amount: r.amount, status: r.status, pay: r.pay || "(ว่าง)",
          channelLastOrder: chans.find((c) => String(c.ch) === String(r.ch))?.lastOrder ?? null,
        };
        if (!unpaid) buckets["ต้องส่งของ"].push(item);
        else if (chAlive) buckets["รอจ่ายอยู่"].push(item);
        else buckets["ใบผี"].push(item);
      }

      const money = (a) => Math.round(a.reduce((s, x) => s + (Number(x.amount) || 0), 0));
      /* 🔴 **แยกตามช่องทางต้องคิดจาก "ทั้งกอง" ไม่ใช่จากรายการที่ส่งไป** (เพิ่ม 6 ก.ย. 2569)
          รายการใบผี/รอจ่ายถูกตัดที่ 50 ใบเพื่อการแสดงผล ⇒ ใครนับช่องทางจากรายการที่ได้ไป
          จะได้ภาพของ 50 ใบแรก แล้วสรุปแทนทั้ง 170 ใบ
          เจอของจริงตอนนั้น (6 ก.ย.): 50 ใบแรกเป็น Shopify ทั้งหมด (฿184,660) แต่ยอดทั้งกอง ฿721,438
          ⇒ คลาส "หน้าแรกไม่ใช่ตัวแทน"
          ✅ **วัดซ้ำ 18 ก.ย. 2569 (มี byChannel จากทั้งกองแล้ว)** — ตอบได้ว่ายอดมาจากไหน:
             ใบผี 246 ใบ ฿910,663 = **Shopify ทั้งกอง** (ช่องทางเดียว ไม่ได้กระจายหลายเจ้า)
             ต้องส่งของ 35 ใบ ฿209,994 = Lazada ฿156,675 · Shopee ฿27,410 · Shopify ฿18,400 · TIKTOK ฿4,909 · Woo ฿2,600
             รอจ่ายอยู่ 1 ใบ ฿268 = Facebook
          ⚠️ เลขพวกนี้เป็นภาพ ณ วันนั้น กองเปลี่ยนทุกวัน **ห้ามเอาเลขในคอมเมนต์ไปรายงาน ให้ยิง ?pending=1 เอง**
          ⇒ คิดที่เซิร์ฟเวอร์จากทั้งกองแล้วส่งไปด้วย จอจะได้ไม่ต้องนับเอง */
      const byChannel = (a) => {
        const m = new Map();
        for (const x of a) {
          const k = String(x.channel);
          const cur = m.get(k) || { channel: k, orders: 0, amount: 0 };
          cur.orders += 1;
          cur.amount += Number(x.amount) || 0;
          m.set(k, cur);
        }
        return [...m.values()]
          .map((v) => ({ ...v, amount: Math.round(v.amount) }))
          .sort((x, y) => y.amount - x.amount);
      };
      /* ⚠️ **ตัดรายการแล้วต้องบอกทุกครั้ง** — เดิมตัดที่ 50 โดยไม่มีอะไรบอกเลย
          ฝั่งจอรู้ได้เพราะบังเอิญเอา counts มาเทียบความยาวรายการ ซึ่งไม่ควรต้องบังเอิญ
          (ถ้าวันหลังมีจอไล่เคลียร์ใบผี คนจะเคลียร์ 50 ใบแล้วนึกว่าจบ) */
      const SHOW = 50;
      /* ตัวหารของ `ต้องส่งของ` ต้องมาจากนอกกอง JS จริง ๆ — ใช้ window count ที่ฐานคำนวณ
         ก่อน ORDER/LIMIT จึงยังฟ้องได้ ถ้าวันหลัง SQL ถูกตัดแต่รายการฝั่งนี้ไม่รู้ตัว
         ไม่เพิ่ม D1 round-trip และใช้ LIKE '%paid%' ให้ตรงกับ /paid/i ที่แบ่งกองด้านบน
         (รวมคำอย่าง Unpaid เหมือนพฤติกรรมเดิม แม้ชื่อสถานะจะชวนสับสน) */
      const mustShipTotal = Number(rows[0]?.must_ship_total || 0);
      const cut50 = (a) => ({
        shown: Math.min(a.length, SHOW),
        total: a.length,
        truncated: a.length > SHOW,
        rows: a.slice(0, SHOW),
      });
      /* 🔑 **ที่มาของ byChannel/cut50 ข้างบน — เก็บบทเรียนไว้ อย่าลบ**
          ผมเห็นตัวอย่างใบผี 50 ใบเป็น Shopify ทั้งหมด แล้วเกือบไปบอกเจ้าของร้านว่า
          "ใบผีเกือบทั้งกอง 170 ใบเป็นซาก Shopify" ⇒ **หลักฐานไม่พอ** (ฝั่งจอทักไว้ทัน)
          50 ใบนั้นคิดเป็นเงินแค่ ฿184,660 จากทั้งกอง ฿721,438 = หนึ่งในสี่
          และในรายชื่อช่องทางมีผู้ต้องสงสัยอีกราย (`Line OA @gucut1` ตัวพิมพ์เล็ก เงียบตั้งแต่ เม.ย.)
          ⚠️ ถ้าส่งคำว่า "เป็นซากของเก่า" ไปพร้อมตัวเลข เจ้าของร้านจะสรุปว่า "ไม่ต้องห่วง"
             แล้ว **อีกสามในสี่จะไม่มีใครดูอีกเลย** ⇒ เรื่องเงินระดับเจ็ดแสน ต้องนับจากทั้งกองเท่านั้น */
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
        /* ⏳ **อายุใบ** — เกณฑ์ที่ถูกของยอดค้างคืออายุ ไม่ใช่จำนวนใบ (ฝั่งจอขอไว้ 18 ก.ย. 2569)
           ใบค้าง 200 ใบที่เพิ่งเข้าวันนี้ = ปกติ · ใบค้าง 3 ใบที่ค้างมา 40 วัน = ต้องรีบดู
           ⇒ ส่งอายุมาให้จอตั้งเกณฑ์เอง (ท่อไม่ตัดสินว่ากี่วันคือแย่ — เกณฑ์เปลี่ยนที่จอถูกกว่า)
           ⚠️ `order_date` เก็บเป็น **วันไทย** อยู่แล้ว (ดูคอมเมนต์บรรทัด ~1490) ⇒ ลบกันตรง ๆ ได้
           ⚠️ ไม่มีวันที่ = นับเป็น null ไม่ใช่ 0 วัน (ใบไม่มีวันที่คือของต้องสงสัย ไม่ใช่ของใหม่) */
        ages: (() => {
          const วันนี้ = Date.parse(`${today}T00:00:00Z`);
          /* 🔴 **ชื่อช่องในแถวคือ `day` ไม่ใช่ `order_date`** — แถวถูกแม็ปเป็น { day: r.order_date } ข้างบน
              ผมอ่านผิดชื่อรอบแรก ⇒ ทุกใบตกไปกอง "ไม่มีวันที่" (37/37 และ 246/246) ตอนยิงจริงหลัง deploy
              🔑 ที่จับได้เพราะ **แยก "ไม่มีวันที่" ออกจาก "อายุ 0 วัน"** ไว้ ⇒ ความว่างจึงส่งเสียง
                 ถ้ายุบสองอันนี้เข้าด้วยกัน จอจะขึ้นว่า "ทุกใบเพิ่งเข้าวันนี้" อย่างมั่นใจ และไม่มีใครรู้
              ⇒ รับทั้งสองชื่อ เพราะวันหนึ่งใครเปลี่ยนชื่อช่องในแถว ของนี้จะไม่เงียบอีก */
          const อายุ = (x) => {
            const d = String(x.day ?? x.order_date ?? "").slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
            return Math.round((วันนี้ - Date.parse(`${d}T00:00:00Z`)) / 864e5);
          };
          const สรุป = (a) => {
            const ds = a.map(อายุ).filter((v) => v !== null);
            return {
              ใบ: a.length,
              ไม่มีวันที่: a.length - ds.length,
              แก่สุดกี่วัน: ds.length ? Math.max(...ds) : null,
              เกิน3วัน: ds.filter((v) => v > 3).length,
              เกิน7วัน: ds.filter((v) => v > 7).length,
              เกิน30วัน: ds.filter((v) => v > 30).length,
            };
          };
          return {
            ต้องส่งของ: สรุป(buckets["ต้องส่งของ"]),
            รอจ่ายอยู่: สรุป(buckets["รอจ่ายอยู่"]),
            ใบผี: สรุป(buckets["ใบผี"]),
            หมายเหตุ: "อายุ = วันนี้ − วันที่ใบ (วันไทย) · ท่อไม่ตั้งเกณฑ์ให้ จอตั้งเอง · ไม่มีวันที่ = null ไม่ใช่ 0",
            /* 🚨 ตาข่ายจับ "อ่านชื่อช่องผิด" — ถ้าทุกใบไม่มีวันที่ทั้งกอง แปลว่าน่าจะอ่านผิดชื่อ ไม่ใช่ข้อมูลเสียจริง
               (ข้อมูลจริงที่ไม่มีวันที่ทั้ง 100% แทบเป็นไปไม่ได้) ⇒ ส่งธงให้จอเขียนบอกคนอ่าน ไม่ใช่โชว์ "ไม่รู้" เฉย ๆ */
            น่าสงสัยว่าอ่านชื่อช่องผิด: (() => {
              const all = [...buckets["ต้องส่งของ"], ...buckets["รอจ่ายอยู่"], ...buckets["ใบผี"]];
              return all.length > 0 && all.every((x) => อายุ(x) === null);
            })(),
          };
        })(),
        amounts: {
          ต้องส่งของ: money(buckets["ต้องส่งของ"]),
          รอจ่ายอยู่: money(buckets["รอจ่ายอยู่"]),
          ใบผี: money(buckets["ใบผี"]),
        },
        channels: chans
          .map((c) => ({ ...c, alive: alive.get(String(c.ch)) }))
          .sort((a, b) => String(b.lastOrder).localeCompare(String(a.lastOrder))),
        /* ⚠️ นับแยกช่องทางจาก **ทั้งกอง** ไม่ใช่จากรายการข้างล่างที่ถูกตัดที่ 50 */
        byChannel: {
          ต้องส่งของ: byChannel(buckets["ต้องส่งของ"]),
          รอจ่ายอยู่: byChannel(buckets["รอจ่ายอยู่"]),
          ใบผี: byChannel(buckets["ใบผี"]),
        },
        /* ⚠️ สามคีย์นี้เป็น **รายการเพื่อแสดงผล** — `รอจ่ายอยู่` กับ `ใบผี` ถูกตัดที่ 50
            ดูจำนวนจริงที่ `counts` และ `listMeta` · ห้ามเอาไปนับหรือสรุปแทนทั้งกอง */
        listMeta: {
          ต้องส่งของ: {
            shown: buckets["ต้องส่งของ"].length,
            total: mustShipTotal,
            truncated: buckets["ต้องส่งของ"].length < mustShipTotal,
          },
          รอจ่ายอยู่: (({ rows, ...m }) => m)(cut50(buckets["รอจ่ายอยู่"])),
          ใบผี: (({ rows, ...m }) => m)(cut50(buckets["ใบผี"])),
        },
        ต้องส่งของ: buckets["ต้องส่งของ"],
        รอจ่ายอยู่: cut50(buckets["รอจ่ายอยู่"]).rows,
        ใบผี: cut50(buckets["ใบผี"]).rows,
        note:
          "ต้องส่งของ = จ่ายแล้วแต่ใบยังไม่จบ ⇒ งานจริงของร้าน · " +
          "รอจ่ายอยู่ = ยังไม่จ่าย แต่ช่องทางยังขายอยู่ ⇒ ยังมีโอกาสได้เงิน · " +
          "ใบผี = ยังไม่จ่าย และช่องทางเงียบไปแล้ว ⇒ ไม่มีวันได้เงิน " +
          "**ยังไม่ได้ลบหรือยกเลิกอะไรทั้งนั้น แค่แยกกองให้เห็น**",
      });
    }

    if (url.searchParams.get("cardguess")) {
      const { coreQuery } = await import("../lib/coredb.mjs");
      /* ร้านเดียวต่อคำขอ — all/ค่าแปลก ⇒ 400 ห้ามตกเป็น z1 เงียบ ๆ (ดู parseSingleStore) */
      const storeParsed = (await import("../lib/core-orders.mjs")).parseSingleStore(url.searchParams.get("store"));
      if (storeParsed.error) return json({ error: storeParsed.error }, 400);
      const store = storeParsed.source;
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
      /* 🔴 **ถามไม่สำเร็จ ห้ามตอบว่า "ไม่เจอใบนี้"** (แก้ 6 ก.ย. 2569)
          เดิมไม่เช็ค `r.ok` ⇒ คำขอล้ม ⇒ `d = {}` ⇒ หาไม่เจอ ⇒ ตอบยืนยันหนักแน่นว่า
          "ไม่เจอใบนี้ในวันนั้น" พร้อม `ok:true` · เครื่องมือนี้มีไว้ตัดสินว่า
          **"ใบนี้หายจาก ZORT จริงไหม"** ⇒ คำตอบผิดพาไปสรุปว่าออเดอร์หาย
          "ถามไม่ได้" ≠ "ไม่มี" (three-states-not-two) */
      if (!r.ok) {
        return json(
          { ok: false, error: `ZORT ตอบ ${r.status} — ยังตอบไม่ได้ว่ามีใบนี้ไหม`, found: null },
          200
        );
      }
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
        /* 🔴 **หน้าที่ยิงไม่สำเร็จ ห้ามตีความว่า "หมดแล้ว"** (แก้ 6 ก.ย. 2569)
            เดิมไม่เช็ค `r.ok` เลย ⇒ ZORT ตอบ 429/500 ที่หน้ากลาง ⇒ `chunk = []`
            ⇒ `chunk.length < 200` ⇒ **break แล้วรายงานว่าครบ** โดย `truncated` ยังเป็น false
            ⇒ กวาดได้ 200 จาก 800 ใบ แล้วบอกว่า "กระจกมีใบเกินมา 600 ใบที่ ZORT ไม่มี"
              ⇒ คนไปไล่แก้กระจกที่ถูกอยู่แล้ว · เครื่องมือนี้มีไว้จับ "581 ใบหายเงียบ" โดยเฉพาะ
            ⇒ ยิงไม่สำเร็จ = **โยนออกไป** ให้ผู้เรียกเห็นว่าเทียบไม่ได้
              ห้ามคืนผลบางส่วนที่หน้าตาเหมือนผลเต็ม */
        if (!r.ok) throw new Error(`ZORT ตอบ ${r.status} ที่หน้า ${page} — เทียบไม่ได้ ห้ามใช้ผลรอบนี้`);
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
      const HEADER_PROBE = new Set(["tag", "agent", "createdby", "createusername", "createuserid", "paymentdate", "reference", "reference2", "warehousecode"]);
      const hasValue = (v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
      const filledCounts = (objs) => {
        const out = {};
        for (const x of objs) {
          if (!x || typeof x !== "object") continue;
          for (const [k, v] of Object.entries(x)) out[k] = (out[k] ?? 0) + (hasValue(v) ? 1 : 0);
        }
        return out;
      };
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
        /* ชื่อช่องของ "รายการสินค้าในใบ" (o.list[]) + จำนวนบรรทัดที่ช่องนั้นมีค่า — **คืนแค่ชื่อกับจำนวน ห้ามคืนค่า**
            ใช้ตอบว่า ZORT ส่ง Serial ต่อบรรทัดมาไหม (ใบ t_mu2tm88b) โดยไม่ดึงข้อมูลลูกค้า/ราคาออกมา */
        itemFieldsFilled: filledCounts(list.flatMap((o) => (Array.isArray(o.list) ? o.list : []))),
        /* ช่องหัวใบที่จอค้นหาขั้นสูงของ ZORT ใช้ แต่กระจกยังไม่เก็บ — นับว่ากี่ใบมีค่า (รายชื่อตรงตัว ห้าม regex) */
        headerFieldsFilled: Object.fromEntries(
          Object.entries(filledCounts(list)).filter(([k]) => HEADER_PROBE.has(k))
        ),
        statusFields: Object.fromEntries(
          Object.entries(seen).map(([k, v]) => [k, [...v].slice(0, 12)])
        ),
      });
    }

    if (url.searchParams.get("channelcompare")) {
      const { channelCompare } = await import("../lib/channel-compare.mjs");
      return okJson({
        ...(await channelCompare(url.searchParams.get("channelcompare"), {
          limit: Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") ?? "200", 10) || 200)),
        })),
      });
    }
    if (url.searchParams.get("stockcompare")) {
      return json({ ok: true, stock: await shopeeStockCompare() });
    }
    /* GET ?shopeeunlisted=1 — สินค้าที่ถอดจากหน้าร้าน Shopee (UNLIST) คลังเรามีของกี่รายการ
       อ่านอย่างเดียว · หน่วยหลักคือ "สินค้า" (ตรงกับเลข UNLIST ที่ Shopee โชว์) พร้อมแยกรหัสให้ด้วย */
    if (url.searchParams.get("shopeeunlisted")) {
      const { shopeeUnlistedStock } = await import("../lib/shopee-stock.mjs");
      return json({ ok: true, unlisted: await shopeeUnlistedStock() });
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
      return okJson(await getOrder(p.get("order")));
    }
    if (p.get("list") === "stock") {
      const r = await listStock({
          q: p.get("q"),
          category: p.get("category"), // กดจากชื่อหมวดในจอหมวดหมู่ (เหมือน ZORT)
          channel: p.get("channel"),
          only: p.get("only"),
          kind: p.get("kind"), // goods = ตัดบริการออก · service = เอาเฉพาะบริการ
          sort: p.get("sort"),
          limit: p.get("limit"),
          offset: p.get("offset"),
          soldDays: p.get("soldDays"),
          marketplaces: url.searchParams.get("marketplaces"),
          waitUntil,
        });
      return okJson(r, r?.error ? 400 : 200);
    }
    /* ── เบา: เอาแค่ป้ายชื่อร้าน + ยอดแยกช่องทาง ──
       ยิง D1 2 รอบ แทนที่จะเป็น 11 รอบของ list=orders
       ⚠️ ตัวนี้ **ไม่มี rows** โดยตั้งใจ — จอที่ต้องการรายการออเดอร์ต้องใช้ list=orders */
    if (p.get("list") === "orderfacets" || p.get("list") === "orders") {
      /* 🔴 ค่าร้านที่ไม่รู้จักต้อง 400 — ห้ามปล่อยให้ "ไม่กรอง" หรือ "กรองได้ 0" เงียบ ๆ (15 ก.ย. 2569)
         ชื่อพารามิเตอร์คือ `store` แต่ช่องในคำตอบชื่อ `source` ⇒ คนลอกชื่อจากคำตอบไปใส่คำขอ
         ⇒ ส่ง `source=` มาเฉย ๆ ก็ตอบ 400 ด้วย จะได้รู้ตัวตั้งแต่ครั้งแรก */
      if (p.has("source") && !p.has("store"))
        return json({ error: "ตัวกรองร้านชื่อ store= (z1 · z2 · all) — source เป็นชื่อช่องในคำตอบ" }, 400);
      const { parseStore } = await import("../lib/core-orders.mjs");
      const st = parseStore(p.get("store"));
      if (st.error) return json({ error: st.error }, 400);
    }
    if (p.get("list") === "orderfacets") {
      return okJson({
        ...(await listOrderFacets({
          from: p.get("from"),
          to: p.get("to"),
          channel: p.get("channel"),
          source: p.get("store"),
          // ⚠️ ต้องรับครบเท่า list=orders ไม่งั้นตัวเลขตอบคนละคำถามเมื่อจอกรองอยู่
          status: p.get("status"),
          q: p.get("q"),
          payStatus: p.get("paystatus"),
          cod: p.get("cod"),
          product: p.get("product"),
          shipChannel: p.get("shipchannel"),
          shipFrom: p.get("shipfrom"),
          shipTo: p.get("shipto"),
          amountMin: p.get("amountmin"),
          amountMax: p.get("amountmax"),
          number: p.get("number"),
          customer: p.get("customer"),
          tag: p.get("tag"),
          createUser: p.get("createuser"),
          warehouse: p.get("warehouse"),
          includeCancelled: p.get("cancelled") === "1",
          warehouses: p.get("warehouses"),
        })),
      });
    }

    if (p.get("list") === "orders") {
      /* ⚠️ **listChannels ต้องยิงพร้อมกับ listOrders ห้ามต่อท้าย** (แก้ 5 ก.ย. 2569)
          ของเดิมเขียน `channels: await listChannels(...)` ในก้อน object
          ซึ่งวิ่ง **หลัง** listOrders เสร็จ ⇒ เสียเวลาเดินทางเพิ่มอีกรอบฟรี ๆ
          มันไม่ต้องรอผลของ listOrders เลยสักช่อง */
      const [orders, channels] = await Promise.all([
        listOrders({
          from: p.get("from"),
          to: p.get("to"),
          channel: p.get("channel"),
          // ชื่อช่องทางซ้ำกันข้ามร้านได้ (เช่น TIKTOK มีทั้ง z1 และ z2) ⇒ ต้องกรองร้านได้ด้วย
          source: p.get("store"),
          status: p.get("status"),
          q: p.get("q"),
          payStatus: p.get("paystatus"),
          cod: p.get("cod"),
          product: p.get("product"),
          shipChannel: p.get("shipchannel"),
          shipFrom: p.get("shipfrom"),
          shipTo: p.get("shipto"),
          amountMin: p.get("amountmin"),
          amountMax: p.get("amountmax"),
          number: p.get("number"),
          customer: p.get("customer"),
          tag: p.get("tag"),
          createUser: p.get("createuser"),
          warehouse: p.get("warehouse"),
          limit: p.get("limit"),
          offset: p.get("offset"),
          includeCancelled: p.get("cancelled") === "1",
        }),
        // รายชื่อช่องทางต้องมาจากขอบเขตเดียวกับผลลัพธ์ ไม่งั้นเลือกได้แต่ได้ 0 ใบ
        listChannels(p.get("store")),
      ]);
      return json({ ok: true, ...orders, channels });
    }

    /* ── ⛔ `list=` ที่ไม่รู้จัก ต้องตอบ 400 ห้ามตกมาถึงตัวสรุปหน้าแรก ──
       (ฝั่งจอจับได้ 5 ก.ย. 2569 — และมันจับได้เพราะ **แกะ body ดูจริง** ไม่ใช่ดูแค่ 200)
       ของเดิม `list=` ที่สะกดผิดหรือยังไม่ deploy จะร่วงมาถึงบรรทัดล่างนี้เงียบ ๆ
       แล้วได้ **200 พร้อมข้อมูลคนละชุด** (ready/counts/recon/channels/shopee/stock)
       ⇒ จอเห็น `stores` เป็น undefined · จอที่กัน `Array.isArray` ไว้ (คือทุกจอ)
          จะวาด "ยังไม่มียอด" อย่างสงบ **ไม่มี error ไม่มีอะไรฟ้อง**
       ⇒ คนไล่บั๊กจะไปนั่งหาที่ฝั่งข้อมูล ทั้งที่ความจริงคือพิมพ์ชื่อเส้นผิดตัวเดียว

       ⚠️ **การตัดสินใจอยู่ที่ "มาถึงบรรทัดนี้ = ไม่รู้จัก" ไม่ได้อยู่ที่รายชื่อข้างล่าง**
          รายชื่อมีไว้ **เขียนข้อความบอกทางเท่านั้น** ⇒ ต่อให้ลืมอัปเดตรายชื่อ
          เส้นที่มีอยู่จริงก็ยังทำงานปกติ (มันคืนค่าไปก่อนถึงตรงนี้แล้ว)
          ถ้าเอาไปเช็คหัวฟังก์ชันแทน ลืมเติมชื่อครั้งเดียว = ปิดเส้นที่ใช้งานอยู่ทันที */
    const listArg = p.get("list");
    if (listArg) {
      /* 🔴 **เลิกเขียนรายชื่อด้วยมือแล้ว** (18 ก.ย. 2569) — รายชื่อเดิมล้าสมัยจริง
         พิสูจน์แล้ว: เทียบกับซอร์สพบ `returns-inbox` มีอยู่จริงแต่ไม่อยู่ในรายชื่อ
         ⇒ ฝั่งจอกำลังจะทำด่าน "จอใช้ทุกเส้นหรือยัง" โดยเชื่อ `accepts` นี้ ⇒ จะพลาดเส้นนั้นเงียบ ๆ
         ตอนนี้มาจาก `scripts/gen-endpoints.mjs` ที่อ่าน `get("list") === "…"` จากไฟล์นี้เองตอน build
         ⚠️ คอมเมนต์ข้างบนยังใช้อยู่: **การตัดสินใจไม่ได้อยู่ที่รายชื่อ** แค่ย้ายแหล่งของ "ข้อความบอกทาง"
            ⇒ ห้ามเอา `lists` ไปเช็คหัวฟังก์ชันแทน ไม่งั้นวันที่ตัวสร้างอ่านพลาดหนึ่งชื่อ
              = ปิดเส้นที่ใช้งานอยู่ทันที · อ่านไม่ได้ ⇒ ถอยไปใช้ข้อความที่ไม่มีรายชื่อ ไม่ใช่ล้ม */
      let known = null;
      try {
        known = (await import("../lib/endpoints.mjs")).lists;
      } catch {
        known = null;
      }
      return json(
        {
          error: `ไม่รู้จัก list=${listArg}`,
          hint: "สะกดผิด หรือเป็นเส้นที่ยังไม่ได้ deploy ขึ้นเว็บ",
          /* null = อ่านรายชื่อไม่ได้ **ไม่ใช่ "ไม่มีเส้นไหนเลย"** ⇒ จออ่านว่ายังไม่รู้ ห้ามอ่านว่าว่าง */
          accepts: known,
          acceptsSource: known ? "gen-endpoints (อ่านจากซอร์ส core.mjs ตอน build)" : null,
        },
        400
      );
    }

    const FAILED = [];
    /* เหตุผลที่แต่ละส่วนล้ม — คู่กับ FAILED ข้างบน · ว่าง = ไม่มีส่วนไหนล้ม */
    const why = {};
    const msg = (e) => String(e?.message || e).slice(0, 200);
    /* ── สถานะรวม (หน้าแรกหลังร้าน) ──
       ⚠️ **ยิงพร้อมกัน ห้ามเรียงกัน** (แก้ 5 ก.ย. 2569 — วัดจริง 3.1 วิ ทั้งที่ตอบ 3.3 KB)
          ห้าตัวนี้ไม่มีตัวไหนต้องรอผลของอีกตัวเลย
       ⚠️ สองตัวท้ายมี .catch เป็น [] เพราะตารางอาจยังไม่ถูกสร้าง — **ห้ามถอด**
          ล้มตัวเดียวจะลากทั้งหน้าแรกตาย */
    const [countsRows, recon, channels, shopee, stock, tiktok] = await Promise.all([
      coreQuery(
        `SELECT (SELECT COUNT(*) FROM orders) AS orders,
                (SELECT COUNT(*) FROM order_items) AS items,
                (SELECT COUNT(*) FROM stock_snapshots) AS snapshots`
      ),
      coreQuery(`SELECT * FROM recon_log ORDER BY day DESC LIMIT 7`),
      coreQuery(
        `SELECT channel, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
         FROM orders GROUP BY channel ORDER BY amount DESC LIMIT 20`
      ),
      /* ⚠️ **แยก "ดึงไม่สำเร็จ" ออกจาก "ไม่มีข้อมูล"** (5 ก.ย. 2569 — ฝั่งจอเจอโรคเดียวกัน 3 จุด)
          ของเดิมล้มแล้วส่ง [] ⇒ จอเขียน "ยังไม่มีบันทึกเทียบยอด" ซึ่งเป็น**คำยืนยันที่ผิด**
          คนอ่านจะสรุปว่าระบบเทียบยอดไม่เคยทำงาน ทั้งที่แค่อ่านตารางไม่ได้รอบนี้
          ⇒ ใช้อาร์เรย์ตัวตนเดียวเป็นเครื่องหมายว่าล้ม แล้วเทียบด้วย === (ตัวตน ไม่ใช่ค่า)
             อาร์เรย์ว่างธรรมดา = "ไม่มีจริง" · ตัวนี้ = "ยังไม่รู้" */
      /* ⚠️ **เก็บเหตุผลไว้ด้วย ห้ามทิ้ง** (ฝั่งจอขอ 6 ก.ย. 2569)
          เดิมรู้แค่ "ชื่อที่ล้ม" ⇒ จอเขียนได้แค่ "ยังดูไม่ได้" แล้วคนไม่รู้จะทำอะไรต่อ
          ⇒ จดเหตุผลลง `why` แล้วส่งออกไปเป็น `failedWhy`
          ⚠️ **เพิ่มคีย์ใหม่ ไม่แตะ `failed` ของเดิม** — จอที่อ่าน `failed` อยู่ต้องไม่พัง
             (สัญญาข้างล่างเขียนไว้ว่าห้ามลบห้ามเปลี่ยนชื่อ ⇒ เติมได้อย่างเดียว) */
      shopeeRecon(7).catch((e) => { why.shopee = msg(e); return FAILED; }),
      stockReconLog(14).catch((e) => { why.stock = msg(e); return FAILED; }),
      tiktokRecon(7).catch((e) => { why.tiktok = msg(e); return FAILED; }),
    ]);
    const counts = countsRows?.[0];
    const failed = [];
    if (shopee === FAILED) failed.push("shopee");
    if (stock === FAILED) failed.push("stock");
    if (tiktok === FAILED) failed.push("tiktok");
    return json({
      /* 🔑 **สัญญากับฝั่งจอ — ห้ามลบ ห้ามเปลี่ยนชื่อ** (ตกลงกัน 6 ก.ย. 2569)
         คำตอบก้อนนี้คือ "คำตอบหน้าแรก" ที่ทุกคำขอ**ตกมาถึงเมื่อไม่รู้จักพารามิเตอร์**
         และมันตอบ **HTTP 200** ⇒ เส้นที่ยังไม่ deploy จึงหน้าตาเหมือนสำเร็จทุกประการ
         (กัดทั้งสองฝั่งวันเดียวกัน: ตัวตรวจฝั่งท่อขึ้นเขียวปลอม · จอฝั่งโน้น 4 จุด)

         ⚠️ เดิมทั้งสองฝั่งจับก้อนนี้ด้วยการ **เดาจากรูป** (มี counts+recon ไหม · ไม่มี ok ไหม)
            = พึ่งความบังเอิญ · วันที่เราเติมคีย์ใหม่เข้าก้อนนี้ ตัวจับทุกตัวจะเชื่อผิดพร้อมกัน
            **โดยไม่มีอะไรฟ้องเลย** เพราะไม่มีใครเขียนโค้ดผิด — แค่ข้อสมมติเงียบ ๆ หมดอายุ
         ⇒ ประกาศตัวเองตรง ๆ แทน · ฝั่งจอเช็ค `fallthrough === true` ได้อย่างเดียวพอ
            **ห้ามใส่ `fallthrough` ในคำตอบของเส้นอื่นเด็ดขาด — ไม่ใช่แม้แต่ `fallthrough:false`**
            (ฝั่งจอกำชับ) เพราะวันที่มีคนแก้ `false` เป็นสตริง `"false"` จอจะอ่านเป็นจริงทันที
            **ไม่มีคีย์เลย = ไม่มีทางอ่านผิด** · ตรวจได้ด้วย: grep -c 'fallthrough' ต้องเจอที่นี่ที่เดียว */
      fallthrough: true,
      endpoint: "default",
      ready: true,
      counts,
      recon,
      channels,
      shopee: shopee === FAILED ? [] : shopee,
      stock: stock === FAILED ? [] : stock,
      tiktok: tiktok === FAILED ? [] : tiktok,
      /* ⚠️ มีชื่ออยู่ในนี้ = ส่วนนั้นดึงไม่สำเร็จ **ไม่ใช่ว่าไม่มีข้อมูล**
          จอต้องเขียนว่า "ยังดูไม่ได้" ห้ามเขียนว่า "ยังไม่มี"
          ⚠️ `failedWhy` (คีย์ใหม่ 6 ก.ย. 2569) บอก **เหตุผล**ของแต่ละชื่อใน `failed`
             จอจะได้เขียน "TikTok ยังดูไม่ได้ — <เหตุผล>" แทนตารางว่างเปล่า
             ไม่มีคีย์นี้ = ท่อรุ่นเก่ากว่า 6 ก.ย. 2569 (ดูหัว x-core-build ประกอบ) */
      failed,
      failedWhy: why,
    });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

export const config = {
  path: "/api/core",
  /* 🚫 **ห้ามตั้ง `region: "sin"` — ลองมาแล้ว 6 ก.ย. 2569 แล้ว "ช้าลง 3 เท่า"**
      เหตุผลที่ลอง: คนใช้อยู่ไทย · ฟังก์ชันรันที่สหรัฐฯ (ค่าเริ่มต้น Ohio) · **นึกว่าฐาน D1 อยู่เอเชีย**
      ⇒ คิดว่าย้ายมาสิงคโปร์แล้วจะอยู่ทวีปเดียวกันหมด

      **ผลจริงกลับด้าน** — วัดหลัง deploy ด้วยเกณฑ์ที่ตั้งไว้ล่วงหน้า (เวลาคุยฐาน):
      | | สหรัฐฯ | สิงคโปร์ |
      |---|---|---|
      | สินค้า | 344 มิลลิวินาที | **1,097** |
      | สินค้าชุด | 162 | **913** |

      ⇒ เราคุยกับ D1 ผ่าน **REST API ของ Cloudflare** ไม่ได้ต่อฐานตรง ๆ
        ปลายทางนั้นตอบเร็วจากสหรัฐฯ ไม่ว่าตัวฐานจะถูกจัดเก็บที่ไหนก็ตาม
        ⇒ **"ฐานอยู่โซนไหน" ไม่ได้กำหนดว่า "ยิงจากที่ไหนแล้วเร็ว"** — คนละคำถามกัน

   ⚠️ ตรงกับความจำ [[d1-in-apac-functions-in-us]] ที่เขียนไว้ก่อนแล้วว่า **"ย้ายโฮสต์ไม่ช่วย"**
      ครั้งนี้ลองเพราะไม่ได้อ่านให้ครบก่อนลงมือ — เสีย deploy ไป 2 รอบ
      ที่ช่วยจริงคือ **ลดจำนวนรอบที่คุยกับฐาน** (ทำไปแล้วในใบก่อนหน้า) ไม่ใช่ย้ายที่ */
};
