// เทียบ "รหัสที่ลงขายอยู่บนแพลตฟอร์ม" กับ "ของที่มีอยู่ในคลังเรา"
//
// ตอบคำถามเดียวที่ร้านอยากรู้: **ของที่มีอยู่ในมือ แต่ไม่ได้ลงขายที่ช่องทางนั้น มีอะไรบ้าง**
// (คำถามนี้เจอ 135 รายการที่ถูกซ่อนไว้ใน Shopee มาแล้ว 3 ก.ย. 2569)
//
// ⚠️ **ต่างจาก channelGaps** — อันนั้นดูจาก "ประวัติการขาย" ว่าช่องทางไหนเงียบไป
//    อันนี้ดูจาก "รายการที่ลงขายอยู่จริงตอนนี้" คนละคำถาม ห้ามเอามาแทนกัน
//
// ⚠️ **เช็คไม่ได้ ≠ ไม่ได้ลงขาย** — ถ้าแพลตฟอร์มนั้นยังไม่ได้เชื่อมหรือดึงไม่สำเร็จ
//    ต้องคืน `checked:false` แล้วไม่สรุปอะไรเลย ห้ามคืนตัวเลข 0 ที่ดูเหมือนคำตอบ
import { coreQuery, coreReady } from "./coredb.mjs";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ต้องตรงกับที่ใช้ในจออื่นเสมอ ไม่งั้นตัวเลขคนละจอไม่ตรงกันโดยไม่มีใครรู้
const CANCEL = `o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'`;

/** รหัสฐาน: `00369-54T` → `00369-54T` · `00369` · (ไล่ตัดท้ายทีละขีด)
 *  ⚠️ รหัสบนแพลตฟอร์มเป็นระดับ "ตัวเลือก" แต่คลังเราเก็บรหัสฐาน
 *     ไม่ตัดท้าย = จับคู่ไม่ติดสักตัว แล้วผลลัพธ์จะดูเหมือน "ไม่ได้ลงขายอะไรเลย" */
function expand(code) {
  const out = [code];
  let b = code;
  while (b.includes("-")) {
    b = b.slice(0, b.lastIndexOf("-"));
    if (b) out.push(b);
  }
  return out;
}

export async function channelCompare(channel = "lazada", { limit = 200 } = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const ch = String(channel).toLowerCase();

  const { marketplaceListings } = await import("./marketplace-listings.mjs");
  const ml = await marketplaceListings();
  if (!ml.checked.includes(ch)) {
    return {
      channel: ch,
      checked: false,
      // บอกให้ชัดว่า "ยังไม่รู้" ไม่ใช่ "ไม่มี"
      why:
        ml.notConnected?.[ch] ||
        ml.failed?.[ch] ||
        `ยังไม่ได้เช็ค ${ch} ในรอบนี้ — ถามได้เฉพาะ: ${ml.checked.join(", ") || "(ไม่มีเลย)"}`,
    };
  }

  // รหัสที่ลงขายอยู่บนช่องทางนี้ (กางเป็นรหัสฐานด้วย)
  const listedRaw = new Set(
    Object.entries(ml.listings)
      .filter(([, tags]) => tags.includes(ch))
      .map(([code]) => code)
  );
  const listedKeys = new Set();
  for (const c of listedRaw) for (const k of expand(c)) listedKeys.add(k);

  /* สต็อกปัจจุบัน = ภาพถ่ายวันล่าสุด (แหล่งเดียวกับจอสต็อก ห้ามคิดเอง)
     ⚠️ ตัด "บริการ" ออก (product_type=1 · ค่าส่ง ค่าซ่อม ค่าน้ำมัน)
        ของพวกนี้ไม่มีสต็อกจริงและไม่มีวันลงขาย จะไปโป่งอยู่ในกอง hidden เปล่า ๆ */
  const [latest] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = latest?.d;
  if (!day) return { channel: ch, checked: false, why: "ยังไม่มีภาพถ่ายสต็อกสักวัน" };
  /* ⚠️ **ตัวเลข "มีของแต่ไม่ได้ลงขาย" เฉย ๆ ใช้ตัดสินใจไม่ได้** — เจอ 4 ก.ย. 2569
      กองบนสุดของ Lazada คือ สกรูหัวจม · กล่องไดคัท · ใบรับประกัน
      ของพวกนี้เป็นวัสดุใช้ในร้าน ไม่มีวันลงขายอยู่แล้ว การนับรวมเข้าไปทำให้เลขบวม
      แล้วอ่านเหมือน "เสียโอกาสขาย 476 รายการ" ซึ่งไม่จริง
      ⇒ ติด "เคยขายได้กี่ชิ้นในรอบปี" ไปกับทุกแถว **จอต้องแยกกองที่เคยขายออกมาเสมอ** */
  const since = new Date(new Date(`${day}T00:00:00Z`).getTime() - 365 * 864e5)
    .toISOString()
    .slice(0, 10);
  const rows = await coreQuery(
    `SELECT c.sku AS sku, COALESCE(p.name,'') AS name, c.qty AS qty,
            COALESCE((SELECT SUM(oi.qty) FROM order_items oi
                      JOIN orders o ON o.id = oi.order_id
                      WHERE oi.sku = c.sku AND o.order_date >= ? AND ${CANCEL}),0) AS soldYear
     FROM stock_snapshots c LEFT JOIN products p ON p.sku = c.sku
     WHERE c.day = ? AND COALESCE(c.sku,'') <> '' AND COALESCE(p.product_type,0) = 0`,
    [since, day]
  );

  const hidden = []; // มีของในคลัง แต่ไม่ได้ลงขายที่ช่องทางนี้
  const listedInStock = []; // ลงขายอยู่ และมีของ
  const listedNoStock = []; // ลงขายอยู่ แต่ของหมด
  const noStockNotListed = []; // ไม่มีของ และไม่ได้ลงขาย (ปกติ ไม่ต้องทำอะไร)

  for (const r of rows) {
    const sku = String(r.sku).trim();
    const qty = num(r.qty);
    const isListed = listedKeys.has(sku);
    const item = { sku, name: r.name || "", qty, soldYear: num(r.soldYear) };
    if (isListed && qty > 0) listedInStock.push(item);
    else if (isListed) listedNoStock.push(item);
    else if (qty > 0) hidden.push(item);
    else noStockNotListed.push(item);
  }

  // รหัสบนแพลตฟอร์มที่คลังเราไม่รู้จักเลย (สะกดผิด / ของเลิกขาย / ยังไม่ได้สร้างในคลัง)
  const known = new Set(rows.map((r) => String(r.sku).trim()));
  const unknownOnChannel = [...listedRaw].filter((c) => !expand(c).some((k) => known.has(k)));

  /* เรียงตาม "เคยขายได้" ก่อน ไม่ใช่ตามจำนวนที่ค้าง
     ของค้าง 3,039 ตัวที่ไม่เคยขายเลย ไม่ใช่โอกาส แต่ของค้าง 5 ตัวที่ขายได้ 200 ชิ้น/ปี คือโอกาส */
  hidden.sort((a, b) => b.soldYear - a.soldYear || b.qty - a.qty);
  const hiddenSold = hidden.filter((x) => x.soldYear > 0);

  return {
    channel: ch,
    checked: true,
    checkedAt: new Date(ml.at).toISOString(),
    stockDay: day,
    listedOnChannel: listedRaw.size,
    skusInWarehouse: rows.length,
    counts: {
      hidden: hidden.length,
      hiddenEverSold: hiddenSold.length, // ← ตัวนี้คือ "โอกาสจริง" ไม่ใช่ hidden เฉย ๆ
      listedInStock: listedInStock.length,
      listedNoStock: listedNoStock.length,
      noStockNotListed: noStockNotListed.length,
      unknownOnChannel: unknownOnChannel.length,
    },
    // ⚠️ ตัดให้สั้นเพื่อไม่ให้คำตอบบวม — ต้องบอกด้วยว่าตัดไป ห้ามเงียบ
    hidden: hidden.slice(0, limit),
    hiddenTruncated: Math.max(0, hidden.length - limit),
    listedNoStock: listedNoStock.slice(0, limit),
    listedNoStockTruncated: Math.max(0, listedNoStock.length - limit),
    unknownOnChannel: unknownOnChannel.slice(0, limit),
    unknownOnChannelTruncated: Math.max(0, unknownOnChannel.length - limit),
    note:
      "hidden = มีของในคลังแต่ไม่ได้ลงขายที่ช่องทางนี้ (อาจตั้งใจซ่อนไว้ก็ได้) · " +
      "**hiddenEverSold = กองที่เคยขายได้จริงในรอบปี ⇒ ใช้ตัวนี้ตัดสินใจ ไม่ใช่ hidden** · " +
      "listedNoStock = ลงขายอยู่แต่ของหมด · " +
      "unknownOnChannel = รหัสบนแพลตฟอร์มที่คลังเราไม่รู้จัก",
  };
}
