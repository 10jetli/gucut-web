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
  const payload = JSON.stringify({
    Request: {
      Product: {
        Skus: {
          Sku: rows.map((r) => ({ SellerSku: r.sku, SellableQuantity: String(r.to) })),
        },
      },
    },
  });
  const r = await lazadaWrite("/product/stock/sellable/update", { payload });
  if (r.error) return rows.map((x) => ({ ...x, result: "not_sent", why: r.error }));
  const ok = r.data && String(r.data.code) === "0";
  /* Lazada ตอบรวมทั้งชุด — สำเร็จ = ทุกตัวในชุดสำเร็จ · ปฏิเสธ = แนบคำตอบดิบทั้งก้อน
     detail รายตัว (ถ้ามี) อยู่ใน r.data.detail */
  return rows.map((x) => ({
    ...x,
    result: ok ? "pushed" : "rejected",
    ...(ok ? {} : { why: `${r.data?.code}: ${r.data?.message || ""}`.trim(), raw: r.data }),
  }));
}

/** พิสูจน์ว่าการเขียนติดจริง — **รันเทียบสดซ้ำ** แล้วดูว่ารหัสที่ยิงหายจากแผนหรือยัง
 *  เลขตรงกันแล้ว = ไม่โผล่ใน diff อีก = การเขียน "ไปถึงหน้าร้านจริง" ไม่ใช่แค่ API ตอบ ok
 *  (แน่นกว่าอ่านเลขดิบ เพราะใช้ตัวเทียบชุดเดียวกับที่ใช้วางแผน — ไม่มีสองมาตรฐาน) */
export async function lazadaReadBack(skus) {
  const { stockPushDryRun } = await import("./stock-push.mjs");
  const plan = await stockPushDryRun({ platform: "lazada" });
  const p = plan?.lazada;
  if (!p || p.skip) return { error: `เทียบซ้ำไม่ได้: ${p?.skip || "ไม่มีข้อมูล"}` };
  const still = new Map((p.push || p.pushSample || []).map((r) => [String(r.sku), r]));
  const landed = [];
  const notLanded = [];
  for (const sku of skus.map(String)) {
    const r = still.get(sku);
    if (r) notLanded.push({ sku, ยังต้องดัน: `${r.from}→${r.to}` });
    else landed.push(sku);
  }
  return { landed, notLanded, note: "landed = เลขบนแพลตฟอร์มตรงกับคลังเราแล้ว" };
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
  const plan = await stockPushDryRun({ platform: "lazada" });
  const p = plan?.lazada;
  if (!p || p.skip) return { error: `คิดแผนสดไม่ได้: ${p?.skip || "ไม่มีข้อมูล lazada"}` };
  const planRows = p.push || p.pushSample || [];
  /* ⚠️ pushSample ของตัวซ้อมตัดที่ 25 แถว — วันนี้ Lazada มี 16 ยังไม่ชน แต่วันที่ชนเพดาน
     SKU ที่ถูกตัดจะกลายเป็น "ไม่อยู่ในแผนสด" แบบผิด ๆ ⇒ เจอเพดานเมื่อไหร่หยุดก่อน ห้ามเดินต่อ */
  if (planRows.length >= 25 && (p.wouldPush ?? 0) > planRows.length) {
    return { error: `แผนสดถูกตัดที่ ${planRows.length}/${p.wouldPush} แถว — ต้องขยาย pushSample ในตัวซ้อมก่อนยิง` };
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
  log.unshift({ at: out.at, platform: out.platform, fired: out.fired, pushed: out.pushed, rejected: out.rejected, rows: fire });
  await s.setJSON("stockpush/log", log.slice(0, 50));

  return out;
}
