const txt = (v, max) => String(v ?? "").slice(0, max);

/** แปลงฟิลด์ขนส่งแบบเดียวกับ core-sync ก่อนนำไปเทียบกับกระจก */
export function zortShippingFields(order) {
  return {
    shipChannel: txt(order?.shippingchannel, 120),
    shipName: txt(order?.shippingname, 120),
    shipDate: txt(order?.shippingdateString ?? order?.shippingdate, 10),
    isCod: order?.isCOD ? 1 : 0,
  };
}

export function mirrorShippingFields(row) {
  return {
    shipChannel: txt(row?.ship_channel, 120),
    shipName: txt(row?.ship_name, 120),
    shipDate: txt(row?.ship_date, 10),
    isCod: Number(row?.is_cod) ? 1 : 0,
  };
}

/** คืนชื่อฟิลด์ที่ต่าง เพื่อให้นับรายฟิลด์และ union โดยไม่บวกใบซ้ำ */
export function shippingFieldsChanged(zortOrder, mirrorRow) {
  const z = zortShippingFields(zortOrder);
  const m = mirrorShippingFields(mirrorRow);
  return Object.keys(z).filter((field) => z[field] !== m[field]);
}

/** หลักฐานความครบของฝั่ง ZORT; null = ต้นทางไม่ประกาศยอดรวม */
export function ordercheckCoverage({ declaredTotal, uniqueOrders, rowsFetched, truncated }) {
  const declared = declaredTotal === null || declaredTotal === undefined || declaredTotal === ""
    ? null
    : Number.isFinite(Number(declaredTotal)) ? Number(declaredTotal) : null;
  const unique = Number(uniqueOrders) || 0;
  return {
    zortDeclaredTotal: declared,
    zortRowsFetched: Number(rowsFetched) || 0,
    zortUniqueOrders: unique,
    zortReadComplete: declared === null ? null : !truncated && unique === declared,
  };
}


/** จำกัดหน้าต่างไม่เกิน 31 วันรวมปลายทั้งสอง และไม่ยอม fallback วันที่ผิด */
export function validateOrdercheckWindow(params, now = Date.now()) {
  const hasFrom = params.has("from"), hasTo = params.has("to");
  if (hasFrom !== hasTo) throw new Error("ต้องส่ง from และ to คู่กัน");
  const days = Number(params.get("days") ?? 14);
  if (!hasFrom && (!Number.isInteger(days) || days < 1 || days > 31))
    throw new Error("days ต้องเป็นจำนวนเต็ม 1–31");
  const to = hasTo ? params.get("to") : new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
  const from = hasFrom ? params.get("from") : new Date(Date.parse(to) - (days - 1) * 864e5).toISOString().slice(0, 10);
  for (const day of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) ||
        new Date(day).toISOString().slice(0, 10) !== day)
      throw new Error("from/to ต้องเป็นวันที่จริง YYYY-MM-DD");
  }
  const span = (Date.parse(to) - Date.parse(from)) / 864e5 + 1;
  if (span < 1 || span > 31) throw new Error("ช่วงวันต้องเรียงจากเก่าไปใหม่และไม่เกิน 31 วันรวมวันต้นและปลาย");
  return { from, to, days: span };
}

/** HTTP 200 แต่ไม่มี list หรือเลขใบใช้เทียบไม่ได้ ต้องหยุด ไม่ใช่ตีความว่าไม่มีใบ */
export function readOrdercheckPage(data) {
  if (!data || !Array.isArray(data.list) || data.list.length > 200)
    throw new Error("ZORT ไม่มี list ที่ใช้เทียบได้");
  for (const row of data.list) {
    if (!row || typeof row !== "object" || !String(row.number ?? "").trim())
      throw new Error("ZORT ส่งใบที่ไม่มี number — เทียบไม่ได้");
  }
  const total = data.count ?? null;
  if (total !== null && (!Number.isSafeInteger(total) || total < 0))
    throw new Error("ZORT count ไม่ใช่จำนวนเต็มที่ใช้ยืนยันความครบได้");
  return { chunk: data.list, total };
}
