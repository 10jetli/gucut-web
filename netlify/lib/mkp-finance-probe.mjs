// ตรวจสิทธิ์ API การเงินของ 3 มาร์เก็ตเพลส — อ่านอย่างเดียว คืนแค่ "ได้/ไม่ได้ + ชื่อช่อง" ห้ามคืนค่า (ใบ t_mu2wjrcf · 16 ก.ย. 2569)
//
// ทำไม: หน้า Marketplace ของ ZORT (/Dashboard/MKPReport) = กระทบยอดเงินโอน (รอบบัญชี · หมายเลขธุรกรรม · ค่าส่ง · คอมมิชชั่น ·
//   ค่าธรรมเนียมการชำระเงิน · รายได้จาก Platform — สเปกคุณส้ม 16 ก.ย.) ⇒ ข้อมูลต้องมาจาก API การเงินของแต่ละเจ้า ไม่ใช่จาก ZORT
//   ก่อนออกแบบต้องรู้ว่าแอปของเรา "มีสิทธิ์" เรียกเส้นการเงินไหม — Lazada แอปเปิดสิทธิ์ไว้ 3 กลุ่ม (ไม่มี Finance) · TikTok ขอ finance ไว้แล้ว
// 🔒 คืนเฉพาะชื่อช่อง (4 ชั้น) + จำนวนแถว + ข้อความ error ที่ตัดแล้ว — ยอดเงิน/เลขธุรกรรม/ชื่อผู้ซื้อ ห้ามหลุด (repo public · log)
// ⚠️ ทุกเส้นเป็น GET อ่านอย่างเดียว · ขอหน้าเล็กที่สุด · เจ้าหนึ่งล้มไม่ลากอีกเจ้า (สามสถานะ: ok · error · skip)

/** ชื่อช่อง 4 ชั้น — object ⇒ ชื่อคีย์ · array ⇒ ชื่อคีย์ของแถวแรก · ค่าจริงไม่ออก
 *  ⚠️ เดิม 2 ชั้น ไม่พอ: TikTok ซ้อน data.statements[0].revenue_amount ⇒ ชื่อช่องการเงินที่ต้องการที่สุดหายไป (เทสต์จับได้ก่อน commit) */
export function shapeOf(x, depth = 4) {
  if (Array.isArray(x)) return { type: "array", length: x.length, item: x.length && depth > 0 ? shapeOf(x[0], depth - 1) : null };
  if (x && typeof x === "object") {
    if (depth <= 0) return { type: "object", keys: Object.keys(x).sort() };
    return { type: "object", keys: Object.fromEntries(Object.keys(x).sort().map((k) => [k, shapeOf(x[k], depth - 1)])) };
  }
  return { type: x === null ? "null" : typeof x };
}

const cleanErr = (e) => String(e?.message ?? e).replace(/access_token=[^&\s]+/gi, "access_token=<ซ่อน>").slice(0, 200);
const ymd = (d) => d.toISOString().slice(0, 10);

async function one(platform, fn) {
  try {
    const data = await fn();
    return { platform, ok: true, shape: shapeOf(data) };
  } catch (e) {
    const msg = cleanErr(e);
    if (/ยังไม่ได้เชื่อมร้าน/.test(msg)) return { platform, skip: msg };
    return { platform, ok: false, error: msg };
  }
}

export async function probeMarketplaceFinance(deps = {}) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 864e5);
  const shopee = deps.shopee ?? (await import("./shopee.mjs")).shopCall;
  const lazada = deps.lazada ?? (await import("./lazada.mjs")).shopCall;
  const tiktok = deps.tiktok ?? (await import("./tiktok.mjs")).shopCall;
  const results = await Promise.all([
    one("shopee", () => shopee("/api/v2/payment/get_wallet_transaction_list", {
      page_no: "0", page_size: "1",
      create_time_from: String(Math.floor(weekAgo.getTime() / 1000)), create_time_to: String(Math.floor(now.getTime() / 1000)),
    })),
    one("lazada", () => lazada("/finance/transaction/details/get", {
      start_time: ymd(weekAgo), end_time: ymd(now), limit: "1", offset: "0",
    })),
    one("tiktok", () => tiktok("/finance/202309/statements", {
      method: "GET", query: { page_size: "1", sort_field: "statement_time" },
    })),
  ]);
  return {
    checkedAt: now.toISOString(),
    note: "ตรวจสิทธิ์เส้นการเงิน (GET หน้าเล็กสุด) — คืนแค่ชื่อช่อง ไม่มีค่า · error = ยังไม่มีสิทธิ์/พารามิเตอร์ผิด ต้องอ่านข้อความ ไม่ใช่แปลว่าไม่มีข้อมูล",
    results,
  };
}
