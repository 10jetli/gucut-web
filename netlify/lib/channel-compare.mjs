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

/* ⚠️ **ตรรกะจับคู่รหัสอยู่ที่ `sku-match.mjs` ที่เดียว** — เดิมกระจายอยู่ 3 ไฟล์
    (ไฟล์นี้ · core-stock · core-products) แล้ว **ชุดนี้มีเพดานความยาว อีกสองชุดไม่มี**
    ⇒ สามจอตอบเรื่องเดียวกันไม่ตรงกันได้โดยไม่มีอะไรฟ้อง · รวมเป็นชุดเดียว 4 ก.ย. 2569
    คำอธิบายว่าทำไมต้องตัดท้าย และทำไมมันคือ "การเดา" อยู่ในไฟล์นั้นทั้งหมด */
import { expandSku, buildSkuIndex } from "./sku-match.mjs";

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
  /* แยกให้ชัดว่าคีย์ไหนมาจาก "ชื่อตรงตัวบนแพลตฟอร์ม" กับคีย์ไหนมาจาก "การตัดท้าย"
     ตรงตัวมาก่อนเสมอ — ถ้ารหัสหนึ่งเข้าได้ทั้งสองทาง ให้ถือว่าเป็นตรงตัว */
  const idx = buildSkuIndex(
    Object.fromEntries([...listedRaw].map((c) => [c, [ch]]))
  );

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
    const how = idx.methodOf(sku)[ch] || null;
    const exact = how === "exact";
    const isListed = Boolean(how);
    const item = { sku, name: r.name || "", qty, soldYear: num(r.soldYear) };
    if (isListed) {
      // ⚠️ ติดไปกับแถวเสมอว่า "จับคู่ด้วยวิธีไหน" และถ้าเป็นการเดา ให้บอกด้วยว่าเดามาจากรหัสไหน
      item.matchedBy = exact ? "exact" : "base";
      if (!exact) item.matchedFrom = idx.fromOf(sku)[ch] || [];
    }
    if (isListed && qty > 0) listedInStock.push(item);
    else if (isListed) listedNoStock.push(item);
    else if (qty > 0) hidden.push(item);
    else noStockNotListed.push(item);
  }

  // รหัสบนแพลตฟอร์มที่คลังเราไม่รู้จักเลย (สะกดผิด / ของเลิกขาย / ยังไม่ได้สร้างในคลัง)
  const known = new Set(rows.map((r) => String(r.sku).trim()));
  const unknownOnChannel = [...listedRaw].filter((c) => !expandSku(c).some((k) => known.has(k)));

  /* เรียงตาม "เคยขายได้" ก่อน ไม่ใช่ตามจำนวนที่ค้าง
     ของค้าง 3,039 ตัวที่ไม่เคยขายเลย ไม่ใช่โอกาส แต่ของค้าง 5 ตัวที่ขายได้ 200 ชิ้น/ปี คือโอกาส */
  let listedExact = 0;
  let listedByBase = 0;
  const baseSample = [];
  for (const x of [...listedInStock, ...listedNoStock]) {
    if (x.matchedBy === "exact") listedExact += 1;
    else {
      listedByBase += 1;
      baseSample.push({ sku: x.sku, name: x.name, from: x.matchedFrom });
    }
  }

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
      /* ⚠️ **สองตัวนี้คือ "เชื่อได้แค่ไหน"** — listedByBase คือกองที่เรา**เดา**ว่าเป็นตัวเดียวกัน
          จอควรโชว์ให้เห็น ไม่ใช่ซ่อนไว้ · เดาเยอะ = ตัวเลขทั้งหน้าเชื่อได้น้อยลงตามส่วน */
      listedExact: listedExact,
      listedByBase: listedByBase,
    },
    // ตัวอย่างของที่จับคู่ด้วยการเดา — ไว้ให้คนไล่กลับไปดูของดิบได้ใน 1 คลิก
    baseMatchSample: baseSample.slice(0, 20),
    // ⚠️ ตัดให้สั้นเพื่อไม่ให้คำตอบบวม — ต้องบอกด้วยว่าตัดไป ห้ามเงียบ
    hidden: hidden.slice(0, limit),
    hiddenTruncated: Math.max(0, hidden.length - limit),
    listedNoStock: listedNoStock.slice(0, limit),
    listedNoStockTruncated: Math.max(0, listedNoStock.length - limit),
    unknownOnChannel: unknownOnChannel.slice(0, limit),
    unknownOnChannelTruncated: Math.max(0, unknownOnChannel.length - limit),
    note:
      "hidden = มีของในคลังแต่ไม่ได้ลงขายที่ช่องทางนี้ (อาจตั้งใจซ่อนไว้ก็ได้) · " +
      "hiddenEverSold = กองที่เคยขายได้จริงในรอบปี ⇒ ใช้ตัวนี้ตัดสินใจ ไม่ใช่ hidden · " +
      "listedNoStock = ลงขายอยู่แต่ของหมด · " +
      "unknownOnChannel = รหัสบนแพลตฟอร์มที่คลังเราไม่รู้จัก",
  };
}
