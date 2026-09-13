// ตัวดันสต็อกจริงกลับมาร์เก็ตเพลส — ไฟล์ใหม่แยกจากตัวซ้อม **ตามกติกาที่ออกแบบไว้**
// (stock-push.mjs เขียนไว้ชัด: "วันที่จะดันจริง ให้เขียนไฟล์ใหม่แยกต่างหาก ห้ามเติม POST ลงไฟล์นี้")
//
// เจ้าของร้านอนุมัติ 8 ก.ย. 2569 — งาน "อนุมัติดันสต็อกจริงรอบแรก" บนกระดาน + สั่ง "ทำเลย"
//
// 🔴 **กติกาความปลอดภัยของตัวยิงจริง — ทุกข้อกันเงินจริง**
// ① **คิดแผนใหม่สดทุกครั้งก่อนยิง** — ห้ามยิงตามเลขที่คนเห็นเมื่อห้านาทีก่อน
//    (ระหว่างนั้นอาจมีคนซื้อ) แผนจริง = stockPushDryRun() ณ วินาทียิง
// ② **ยิงเฉพาะ SKU ที่ถูกส่งมาในคำสั่งเท่านั้น** — ตัดกับแผนสดอีกชั้น
//    SKU ที่ขอมาแต่ไม่อยู่ในแผนสดแล้ว = รายงานว่า "แผนเปลี่ยน ไม่ยิง" ไม่ใช่ยิงมั่ว
// ③ **ทิศลง (close/down) ต้องสั่งแยกด้วย allowClose:true** — ทิศขึ้นผิดอย่างมากขายช้า
//    ทิศลงผิด = ปิดขายของที่มี เสียยอดทันที
// ④ **ผลรายตัวต้องรายงานครบสามสถานะ**: ยิงแล้วสำเร็จ · ยิงแล้วแพลตฟอร์มปฏิเสธ (พร้อมรหัส)
//    · ไม่ได้ยิง (พร้อมเหตุผล) — ห้ามยุบเป็น "สำเร็จ n รายการ" เฉย ๆ
// ⑤ **จดทุกรอบลง Blobs** (`stockpush/log`) — ใครยิง เมื่อไหร่ อะไรบ้าง ผลอะไร
//    วันที่เลขบนแพลตฟอร์มเพี้ยน ต้องตอบได้ว่าเราเป็นคนเปลี่ยนหรือเปล่า
//
// 🔴 **ด่านของบนชั้น — กติกาถาวรของตัวยิงทุกแพลตฟอร์ม (CEO สั่ง 12 ก.ย. 2569)**
//    ที่มา: สำรวจแผนซ้อมของ shopee/tiktok เช้านั้นแล้วพบว่า 14 จาก 16 แถว (shopee)
//    และ 13 จาก 14 แถว (tiktok) เป็นชนิด **reopen** (0 → หลายร้อย)
//    และรหัส `00313` หัวเทียน โผล่ในแผนของทั้งสองเจ้าเป็น "ขึ้น 698 → 700"
//    ซึ่งเป็นรหัสเดียวกับที่พนักงานแพ็กของส่งไม่ได้มา 6 วัน (ของหมดจริงบนชั้น)
//    ⇒ ถ้ามีตัวยิงพร้อมวันนั้น เราจะประกาศขายของที่ไม่มีบนชั้นพร้อมกันสามแพลตฟอร์ม
//
// ⑥ **แถว `reopen` (จาก 0 ขึ้นเป็นมากกว่า 0) ต้องมีคนยืนยันว่าเห็นของจริงก่อนเสมอ
//    ห้ามยิงอัตโนมัติ** — ของที่ปิดขายไปแล้ว **มักปิดเพราะมันหมดจริง** การเปิดคืน
//    คือการอ้างตัวเลขในฐานข้อมูล ซึ่งเป็นตัวเลขที่ไม่เคยเห็นชั้นวางสักครั้ง
// ⑦ **แถว `up`/`down` ยิงได้โดยไม่ต้องยืนยันรายตัว** — เป็นการปรับจำนวนของที่ขายอยู่แล้ว
//    ความเสียหายเมื่อผิดต่ำกว่ากันมาก
//    ⚠️ ⑥ กับ ⑦ ต้องแยกกันแบบนี้ **ห้ามตั้งด่านเหมารวมทุกแถว** — ด่านที่ขวางทุกอย่าง
//       คือด่านที่สุดท้ายไม่มีใครใช้ แล้วคนจะกลับไปแก้มือบนแพลตฟอร์มแทน
//
// ⏳ **ของค้างที่ต้องมีก่อนตัวยิงเจ้าถัดไปจะถือว่าเสร็จ (CEO เพิ่ม 12 ก.ย. 2569)**
//    ข้อ ⑧ **รหัสที่ปรากฏในใบค้างส่ง ห้ามอยู่ในกองที่ยิงอัตโนมัติ ไม่ว่าชนิดไหน**
//    (รวมถึง up/down ที่ข้อ ⑦ ปล่อยผ่าน — ข้อนี้ทับ ⑦ เฉพาะรหัสกลุ่มนี้)
//    ทำไมจำเป็น: ใบที่จ่ายเงินแล้วแต่ส่งไม่ออกหลายวัน คือหลักฐานที่ **มาจากมือคนที่จับของจริง**
//    ว่าของชนิดนั้นหยิบไม่ได้ — เป็นขาเดียวที่อยู่นอกฐานข้อมูลของเราเอง
//    (ตัวเลขอื่นทั้งหมดมาจากฐานเดียวกัน ⇒ ตรงกันได้โดยผิดพร้อมกัน)
//    สิ่งที่ต้องสร้าง: ทางให้ตัวยิงถามได้ว่า "รหัสนี้อยู่ในใบค้างส่งไหม"
//    (ข้อมูลมีอยู่แล้วที่ท่อ `?pending=1` กอง "ต้องส่งของ" — ยังไม่มีใครดึงมาใช้ฝั่งตัวยิง)
//    🚫 **ห้ามสร้างตัวยิงของ shopee/tiktok ก่อนข้อนี้มีรูปร่าง** — สร้างตัวยิงก่อนแล้ว
//       ค่อยเติมด่าน คือลำดับที่เปิดช่องให้เกิดอุบัติเหตุระหว่างทาง
//
// ⚠️ **เฟสนี้มีแค่ Lazada** — เจ้าเดียวที่ (ก) token เชื่อมแล้วใช้งานจริงอยู่
//    (ข) API อ้างสินค้าด้วย SellerSku ตรง ๆ ไม่ต้องทำตารางแปลง id
//    Shopee ติดแอปยังไม่ Go-Live · TikTok ต้องแปลง product_id/sku_id ก่อน — เฟสถัดไป
//    เจ้าที่ยังไม่ทำ ตอบ `skip` ตรง ๆ (สามสถานะ ไม่แกล้งเงียบ)
import { getStore } from "@netlify/blobs";

const API = "https://api.lazada.co.th/rest";

/* ยิง API เขียนของ Lazada — ตัวเซ็นลายเซ็นแบบเดียวกับ lazada.mjs
   ⚠️ ใช้ **POST แบบฟอร์ม** เพราะ payload ยาวเกินจะฝากใน query ได้อย่างปลอดภัย
   (Lazada รับ POST x-www-form-urlencoded โดยเซ็นพารามิเตอร์ชุดเดียวกับ query) */
async function lazadaWrite(path, extra) {
  const { sign, validToken } = await import("./lazada.mjs");
  const t = await validToken();
  if (!t?.accessToken) return { error: "ยังไม่ได้เชื่อมร้าน Lazada (/api/lazada/auth)" };
  const appKey = process.env.LAZADA_APP_KEY;
  const params = {
    app_key: appKey,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    access_token: t.accessToken,
    ...extra,
  };
  params.sign = sign(path, params);
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => null);
  return { http: res.status, data };
}

/** ดันสต็อก Lazada ตาม SellerSku — คืนผลรายตัว
 *  ใช้เส้น /product/stock/sellable/update (payload JSON)
 *  ⚠️ ยังไม่เคยยิงจริงจนกว่า canary ตัวแรกจะผ่าน — คำตอบดิบของแพลตฟอร์ม
 *     ติดกลับไปในผลเสมอ เพื่อให้เห็นความจริง ไม่ใช่การตีความของเรา */
async function lazadaPush(rows) {
  /* Lazada ฝั่งเขียนเลิกรับ SellerSku แล้ว (E0501 — เจอจาก canary ตัวแรก 8 ก.ย. 2569)
     ⇒ แปลงเป็น SkuId+ItemId ก่อนเสมอ · แปลงไม่ได้ = ไม่ยิงตัวนั้น พร้อมบอกเหตุผล */
  const { skuIdMap } = await import("./lazada.mjs");
  const ids = await skuIdMap();
  const ready = [];
  const noId = [];
  for (const r of rows) {
    const m = ids.get(r.sku);
    if (m?.skuId) ready.push({ ...r, skuId: m.skuId, itemId: m.itemId });
    else noId.push({ ...r, result: "not_sent", why: "หา SkuId บน Lazada ไม่เจอ (สินค้าอาจถูกถอด)" });
  }
  if (!ready.length) return noId;
  const payload = JSON.stringify({
    Request: {
      Product: {
        Skus: {
          Sku: ready.map((r) => ({
            ItemId: String(r.itemId ?? ""),
            SkuId: String(r.skuId),
            SellableQuantity: String(r.to),
          })),
        },
      },
    },
  });
  const r = await lazadaWrite("/product/stock/sellable/update", { payload });
  if (r.error) return [...ready.map((x) => ({ ...x, result: "not_sent", why: r.error })), ...noId];
  const ok = r.data && String(r.data.code) === "0";
  /* Lazada ตอบรวมทั้งชุด — สำเร็จ = ทุกตัวในชุดสำเร็จ · ปฏิเสธ = แนบคำตอบดิบทั้งก้อน */
  return [
    ...ready.map((x) => ({
      ...x,
      result: ok ? "pushed" : "rejected",
      ...(ok ? {} : { why: `${r.data?.code}: ${r.data?.message || ""}`.trim(), raw: r.data }),
    })),
    ...noId,
  ];
}

/** พิสูจน์ว่าการเขียนติดจริง — **รันเทียบสดซ้ำ** แล้วดูว่ารหัสที่ยิงหายจากแผนหรือยัง
 *  เลขตรงกันแล้ว = ไม่โผล่ใน diff อีก = การเขียน "ไปถึงหน้าร้านจริง" ไม่ใช่แค่ API ตอบ ok
 *  (แน่นกว่าอ่านเลขดิบ เพราะใช้ตัวเทียบชุดเดียวกับที่ใช้วางแผน — ไม่มีสองมาตรฐาน) */
/* 🔴 **บั๊กที่แก้ตรงนี้ 12 ก.ย. 2569 — ตัวที่มีหน้าที่พิสูจน์ความจริง กลับโกหกได้เองแบบเงียบที่สุด**
   ของเดิม: `new Map((p.push || p.pushSample || []).map(...))` แล้วถือว่า "ไม่อยู่ในแผน = landed"
   ⇒ แต่ **คีย์ `push` ไม่มีอยู่จริง** เพราะไม่ได้ขอ `full` ⇒ ตกไปใช้ `pushSample` (25 แถว) **ทุกครั้ง**
   ⇒ รหัสที่อยู่เกินแถวที่ 25 จะถูกตอบว่า **landed โดยไม่เคยถูกตรวจเลย**
   วัดจริง 12 ก.ย. ~11:40 (CEO ยิง): lazada wouldPush 21 (พอดี) · **shopee 34 · tiktok 33**
   ⇒ สองเจ้านั้นเกินเพดานตัวอย่างอยู่แล้ววันนี้
   ⚠️ และมันเงียบเป็นพิเศษเพราะ **ยิ่งของเยอะยิ่งผิดบ่อย** ⇒ พังตอนที่เราต้องการมันที่สุดพอดี

   กติกาใหม่ (CEO สั่ง):
   ① ใช้ **รายการเต็ม** เท่านั้น · ไม่มีรายการเต็ม ⇒ **ปฏิเสธที่จะตอบ** 🚫 ห้ามตกไปใช้ตัวอย่าง
   ② สามสถานะต่อรหัส: `landed` · `notLanded` · **`unknown` พร้อมเหตุผลว่าทำไมตรวจไม่ได้**
   ③ ใช้ตัวเทียบชุดเดียวกับตอนวางแผน (stockPushDryRun) เหมือนเดิม — ไม่มีมาตรฐานที่สอง

   ⚠️ และ "ไม่อยู่ในแผน" **ไม่ได้แปลว่า landed เสมอ** — รหัสอาจถูกข้ามเพราะคลังเราติดลบ
      หรือคลังไม่รู้จักรหัสนั้น ⇒ ของเดิมตอบ landed ให้ทั้งสองเคสนั้นด้วย
      ⇒ ตอนนี้ดูจาก `skipNegativeFull`/`skipUnknownFull` (ท่อส่งมาตอนขอ full) แล้วตอบ unknown
   @param deps.dryRun ฉีดแผนได้เพื่อทดสอบ — แทนที่แค่ขอบที่ต้องยิงออกนอก */
export async function lazadaReadBack(skus, deps = {}) {
  const dryRun = deps.dryRun || (await import("./stock-push.mjs")).stockPushDryRun;
  const plan = await dryRun({ platform: "lazada", full: true });
  const p = plan?.lazada;
  if (!p || p.skip) return { error: `เทียบซ้ำไม่ได้: ${p?.skip || "ไม่มีข้อมูล"}` };

  const asked = skus.map(String);
  /* 🔑 **ทุก unknown ต้องมีรหัสเหตุผลที่เครื่องอ่านได้ ไม่ใช่มีแต่ข้อความ** (CEO สั่ง 12 ก.ย. 2569)
     เหตุผลสามแบบต้องแยกจากกันในผลลัพธ์: ถูกข้ามเพราะติดลบ · คลังไม่รู้จักรหัส · รายการไม่ครบ
     ไม่งั้นคนอ่านแยกไม่ออกว่าตัวไหนหายเพราะอะไร แล้วต้องยิงใหม่ทั้งชุด
     ⚠️ และมีรหัสแล้ว **ห้ามให้ใครไปจัดประเภทจากข้อความ `why` ด้วย includes()**
        (กฎ no-substring-classification — ข้อความเปลี่ยนได้ รหัสเปลี่ยนไม่ได้โดยไม่มีใครรู้) */
  /* 🔴 **ตอบไม่ได้ทั้งกระดาน ⇒ ต้องติดธง `inconclusive` มาด้วย** (13 ก.ย. 2569)
     ตัวห่อ okJson ใน core.mjs มีกติกาอยู่แล้วว่า inconclusive ⇒ **ไม่เติมคีย์ ok เลย**
     แต่ของเดิมที่นี่ไม่เคยติดธงนั้น ⇒ คำตอบจึงออกไปเป็น `{ok:true, …, note:"ตรวจไม่ได้"}`
     ซึ่งอ่านได้ว่า "สำเร็จ" ทั้งที่แปลว่า "ไม่รู้" — เจอของจริงตอนตรวจหลัง deploy 13 ก.ย.
     ⚠️ ไม่ใช่ `ok:false` — "ผลแปลไม่ได้" ไม่ใช่ "ผลว่าไม่ผ่าน" (สัญญากับฝั่งจอ) */
  const unknownAll = (reason, why) => ({
    inconclusive: true,
    landed: [], notLanded: [],
    unknown: asked.map((sku) => ({ sku, reason, why })),
    note: "ตรวจไม่ได้ — ห้ามอ่านว่าผ่าน",
  });
  /* ① ไม่มีรายการเต็ม = ตรวจไม่ได้ทั้งก้อน (ท่อรุ่นเก่า หรือมีคนถอด full ออก) */
  if (!Array.isArray(p.push)) {
    return unknownAll("no_full_plan", "ท่อไม่ได้ส่งรายการเต็ม (คีย์ push) มา — ตัวอย่าง 25 แถวใช้ยืนยันไม่ได้");
  }
  /* ② ด่านเดียวกับตัวยิงจริง: แผนที่ถือไว้ต้องครบตามจำนวนที่ควรมี */
  if ((p.wouldPush ?? 0) > p.push.length) {
    return unknownAll("plan_incomplete", `แผนสดไม่ครบ: ถือไว้ ${p.push.length} แถว จากที่ควรมี ${p.wouldPush}`);
  }
  /* ③ กองที่ถูกข้ามต้องมีรายการเต็มด้วย ไม่งั้นแยก "ตรงกันแล้ว" จาก "ถูกข้าม" ไม่ออก */
  if (!Array.isArray(p.skipNegativeFull) || !Array.isArray(p.skipUnknownFull)) {
    return unknownAll("no_skip_lists", "ท่อไม่ได้ส่งรายการเต็มของกองที่ถูกข้าม — แยก 'ตรงกันแล้ว' จาก 'ถูกข้าม' ไม่ได้");
  }

  const still = new Map(p.push.map((r) => [String(r.sku), r]));
  const skippedNeg = new Set(p.skipNegativeFull.map((r) => String(r.sku)));
  const skippedUnk = new Set(p.skipUnknownFull.map((r) => String(r.sku)));
  /* 🔴 **รายการกองที่ถูกข้าม อาจไม่ครบจริง — และมันทำให้คำตอบ landed เชื่อไม่ได้**
     (ไล่ตามข้อ 3 ที่ CEO สั่งให้หาว่ามีที่อื่นใช้ตัวอย่างตัดสินใจอีกไหม — เจอของจริง)
     ต้นทาง: `shopeePlan`/`lazadaPlan` ประกอบแถวกอง "คลังไม่รู้จัก" จาก `c.missingSample`
     ซึ่งตัวเทียบตัดไว้ 20 แถว · ตัวนับ `skipUnknown` ถูกแก้ให้ใช้เลขจริงแล้ว (ถูกต้อง)
     **แต่ตัวรายการยังเป็นตัวอย่าง** ⇒ รหัสที่ถูกข้ามเกินแถวที่ 20 จะไม่อยู่ใน skipUnknownFull
     ⇒ ถ้าไม่ดักไว้ มันจะหลุดไปกอง landed = ตอบว่าผ่านให้รหัสที่ไม่เคยถูกเทียบ (บั๊กเดิมคนละหน้าตา)
     ⇒ เทียบความยาวรายการกับตัวนับจริง · ไม่ครบ = **ตอบ landed ไม่ได้** (รหัสที่เจอในรายการยังตอบได้ปกติ) */
  const skipListsComplete =
    p.skipNegativeFull.length >= (p.skipNegative ?? 0) && p.skipUnknownFull.length >= (p.skipUnknown ?? 0);
  const landed = [];
  const notLanded = [];
  const unknown = [];
  for (const sku of asked) {
    const r = still.get(sku);
    if (r) { notLanded.push({ sku, ยังต้องดัน: `${r.from}→${r.to}` }); continue; }
    if (skippedNeg.has(sku)) { unknown.push({ sku, reason: "skipped_negative", why: "ถูกข้ามเพราะคลังเราติดลบ ⇒ ไม่เคยถูกเทียบ" }); continue; }
    if (skippedUnk.has(sku)) { unknown.push({ sku, reason: "skipped_unknown", why: "ถูกข้ามเพราะคลังเราไม่รู้จักรหัสนี้ ⇒ ไม่เคยถูกเทียบ" }); continue; }
    if (!skipListsComplete) {
      unknown.push({
        sku,
        reason: "skip_lists_incomplete",
        why:
          `รายการกองที่ถูกข้ามไม่ครบ (ข้ามติดลบ ${p.skipNegativeFull.length}/${p.skipNegative ?? 0} · ` +
          `ไม่รู้จัก ${p.skipUnknownFull.length}/${p.skipUnknown ?? 0}) ⇒ แยก "ตรงกันแล้ว" จาก "ถูกข้าม" ไม่ได้`,
      });
      continue;
    }
    landed.push(sku);
  }
  return {
    /* ธงนี้ติดเฉพาะตอน **ไม่มีรหัสไหนได้คำตัดสินเลย** — มีบางตัวตัดสินได้ = ไม่ใช่ inconclusive
       (ผลบางส่วนยังใช้ได้ ห้ามทิ้งทั้งกระดานเพราะบางตัวตอบไม่ได้) */
    ...(landed.length + notLanded.length === 0 && unknown.length ? { inconclusive: true } : {}),
    landed, notLanded, ...(unknown.length ? { unknown } : {}),
    /* สรุปจำนวนแยกตามรหัสเหตุผล — ผู้อ่านไม่ต้องวนนับเอง และไม่ต้องแกะจากข้อความ */
    ...(unknown.length
      ? { unknownByReason: unknown.reduce((a, u) => ({ ...a, [u.reason]: (a[u.reason] ?? 0) + 1 }), {}) }
      : {}),
    checkedAgainst: { wouldPush: p.wouldPush, planRows: p.push.length, skipNegative: p.skipNegative, skipUnknown: p.skipUnknown },
    note: "landed = ไม่อยู่ในแผนสดและไม่ได้ถูกข้าม ⇒ เลขบนแพลตฟอร์มตรงกับคลังเราแล้ว · unknown = ตรวจไม่ได้ ห้ามอ่านว่าผ่าน",
  };
}

/**
 * ยิงจริง — POST /api/core?stockpushlive=1
 * body: { platform:"lazada", skus:[...], allowClose?:false }
 */
export async function stockPushLive(body) {
  const platform = String(body?.platform ?? "").trim();
  const wantSkus = Array.isArray(body?.skus) ? body.skus.map((s) => String(s).trim()).filter(Boolean) : [];
  if (!wantSkus.length) return { error: "ต้องระบุ skus เป็นรายการชัดเจน — ไม่มีโหมดยิงทั้งหมด" };
  if (wantSkus.length > 100) return { error: "ครั้งละไม่เกิน 100 รหัส" };

  if (platform !== "lazada") {
    return {
      skip: `ตัวยิงจริงของ ${platform || "(ไม่ระบุ)"} ยังไม่ได้สร้าง — เฟสนี้มีแค่ lazada`,
      มีจริง: ["lazada"],
      เหตุผล: { shopee: "แอปยังไม่ Go-Live (งานบนกระดานเจ้าของร้าน)", tiktok: "ต้องทำตารางแปลง product_id/sku_id ก่อน" },
    };
  }

  // ① คิดแผนใหม่สด ณ วินาทีนี้ — ไม่เชื่อเลขที่ใครเห็นก่อนหน้า
  const { stockPushDryRun } = await import("./stock-push.mjs");
  // ขอเจ้าเดียว — เร็วกว่า และไม่เผางบ 26 วิไปกับเจ้าที่ไม่ได้ยิง (time-budget-is-shared)
  /* ✅ ขอ **รายการเต็ม** (full) ไม่ใช่ตัวอย่าง 25 แถว — แก้ 11 ก.ย. 2569
     คำทำนายในคอมเมนต์เดิมเป็นจริงแล้ว: วันที่ wouldPush=76 ด่านข้างล่างปฏิเสธทั้งรอบ
     ยิงไม่ออกเลยแม้ของพร้อมทุกอย่าง (token ก็ยังดี) ⇒ ต้นเหตุคือ **เอาเลขของการแสดงผล
     (pushSample 25) มาเป็นฐานของการตัดสินใจยิง** · เส้นสาธารณะยังไม่ได้ full เหมือนเดิม */
  const plan = await stockPushDryRun({ platform: "lazada", full: true });
  const p = plan?.lazada;
  if (!p || p.skip) return { error: `คิดแผนสดไม่ได้: ${p?.skip || "ไม่มีข้อมูล lazada"}` };
  /* ⚠️ ยังเผื่อ pushSample ไว้เป็นทางถอย **เฉพาะกรณีท่อรุ่นเก่ายังไม่มี full**
     (ท่อกับตัวยิงถูก deploy พร้อมกัน แต่เขียนเผื่อไว้ไม่ได้ทำให้เสียอะไร)
     🔴 ทางถอยนี้จะไปชนด่านข้างล่างเองถ้าของเกิน 25 — ซึ่งถูกต้องแล้ว ดีกว่ายิงไม่ครบเงียบ ๆ */
  const planRows = p.push || p.pushSample || [];
  /* 🔴 **ด่านชั้นสุดท้าย ห้ามถอด** (CEO สั่งย้ำ 11 ก.ย. 2569) — แปลว่า "แผนสดที่เราถืออยู่
     ไม่ครบ" ไม่ว่าจะเพราะเหตุใดก็ตาม · ตอนนี้มันจะไม่ถูกกระตุ้นเพราะเราขอ full มาแล้ว
     แต่ถ้าวันหนึ่งมีใครเผลอตัดรายการอีก ด่านนี้จะจับได้ก่อนจะยิงของไม่ครบขึ้นหน้าร้าน
     ⚠️ เทียบกับ **จำนวนที่ควรมี (wouldPush)** ไม่ใช่เทียบกับเลขคงที่ 25 — เลขคงที่
        ผูกกับค่าตัดของตัวแสดงผล ซึ่งเปลี่ยนได้โดยไม่มีใครมาบอกไฟล์นี้ */
  if ((p.wouldPush ?? 0) > planRows.length) {
    return { error: `แผนสดไม่ครบ: ถือไว้ ${planRows.length} แถว จากที่ควรมี ${p.wouldPush} — ไม่ยิงทั้งรอบ` };
  }

  // ② ตัดกับรายการที่สั่ง + ③ กันทิศลง
  const byPlan = new Map(planRows.map((r) => [String(r.sku), r]));
  const fire = [];
  const skipped = [];
  for (const sku of wantSkus) {
    const r = byPlan.get(sku);
    if (!r) { skipped.push({ sku, result: "not_sent", why: "ไม่อยู่ในแผนสดแล้ว (เลขตรงกันอยู่/ของเปลี่ยนระหว่างทาง)" }); continue; }
    if ((r.kind === "close" || r.kind === "down") && !body?.allowClose) {
      skipped.push({ sku, result: "not_sent", why: `ทิศลง (${r.kind} ${r.from}→${r.to}) ต้องสั่งแยกด้วย allowClose:true` });
      continue;
    }
    fire.push({ sku, from: r.from, to: r.to, kind: r.kind });
  }

  /* ── 🔎 โหมดตรวจ: `dryCheck: true` — ตอบว่า "จะยิงกี่แถว/แถวไหน" แล้วหยุด ไม่แตะ Lazada ──
     ทำไมต้องมี (CEO สั่ง 11 ก.ย. 2569): ต้องมีหลักฐานว่าตัวยิง **เห็นแผนครบ** ก่อนวันที่
     ท่านประธานอนุมัติ — ถ้าพิสูจน์ได้แค่ตอนยิงจริง เท่ากับต้องเสี่ยงเขียนของจริงเพื่อรู้ว่าพร้อม
     ⚠️ ออกก่อนถึง lazadaPush และ **ก่อนเขียน log** — รอบที่ไม่ได้ยิงห้ามโผล่ในประวัติการยิง
        (ประวัติที่มีแถวซึ่งไม่เคยเกิดขึ้น ทำให้วันหลังตอบไม่ได้ว่าใครเปลี่ยนเลขบนแพลตฟอร์ม)
     ⚠️ ติดธง `dryCheck: true` กลับไปด้วยเสมอ — คำตอบที่หน้าตาเหมือนผลยิงแต่ไม่ได้ยิง
        คือของที่หลอกคนอ่านได้ง่ายที่สุด (ต้องประกาศตัว) */
  if (body?.dryCheck === true) {
    return {
      dryCheck: true,
      platform: "lazada",
      mode: "โหมดตรวจ — ไม่ได้ยิงอะไรขึ้น Lazada และไม่ได้จดประวัติ",
      requested: wantSkus.length,
      planRowsHeld: planRows.length,     // แผนสดที่ถืออยู่จริง (ต้องเท่ากับ wouldPush)
      wouldPush: p.wouldPush ?? null,
      wouldFire: fire.length,            // จำนวนที่จะยิงถ้าสั่งจริงด้วย body ชุดนี้
      wouldSkip: skipped.length,
      fireSample: fire.slice(0, 10),
      skipSample: skipped.slice(0, 10),
    };
  }

  const results = fire.length ? await lazadaPush(fire) : [];
  const out = {
    platform: "lazada",
    requested: wantSkus.length,
    fired: fire.length,
    pushed: results.filter((r) => r.result === "pushed").length,
    rejected: results.filter((r) => r.result === "rejected").length,
    notSent: skipped.length,
    results: [...results, ...skipped],
    at: new Date().toISOString(),
  };

  // ⑤ จดประวัติทุกรอบ — append รายการล่าสุดไว้หัวแถว เก็บ 50 รอบ
  const s = getStore({ name: "gucut-coupon", consistency: "strong" });
  const log = (await s.get("stockpush/log", { type: "json" }).catch(() => null)) || [];
  /* จด **ผลรายตัวครบทุกสถานะ** ไม่ใช่แค่แถวที่ยิง (ฝั่งจอขอ 8 ก.ย. 2569 —
     "จอจะได้เลิกบอกว่าไปดูที่อื่น") · ตัด raw ออกจาก log กันก้อนบวม เก็บแค่ why */
  log.unshift({
    at: out.at, platform: out.platform,
    fired: out.fired, pushed: out.pushed, rejected: out.rejected, notSent: out.notSent,
    rows: out.results.map(({ raw, ...r }) => r),
  });
  await s.setJSON("stockpush/log", log.slice(0, 50));

  return out;
}
