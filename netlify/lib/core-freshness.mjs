/* ชีพจร + เวลาที่ข้อมูลเปลี่ยนจริง ของกระจกแต่ละตาราง — ใช้ร่วมกันทุกเส้น
 *
 * 🔴 ที่มา (19 ก.ย. 2569): ฝั่งจอจะแคชตัวนับแท็บไว้เองเพื่อไม่ให้กดแท็บทีละครั้งแล้วยิง 15 คำสั่งใหม่
 *    เขาถามว่า "ให้แคชได้นานกี่นาที" — **คำตอบเป็นจำนวนนาทีคือคำตอบที่ผิดรูป**
 *    เวลาเป็นตัวแทนหยาบของคำถามจริงคือ **"ข้อมูลเปลี่ยนไปหรือยัง"**
 *    ⇒ ให้ท่อตอบคำถามนั้นตรง ๆ แล้วจอเทียบค่าเอา: เท่าเดิม = ใช้ของในมือต่อ · ต่าง = ยิงใหม่
 *    (เส้น list=orders มีของนี้อยู่แล้วตั้งแต่ 6 ก.ย. — ตัวนี้คือยกออกมาให้อีก 5 เส้นใช้ได้ด้วย)
 *
 * ⚠️ **ต้องส่งสองเวลา ห้ามส่งอันเดียว** (กติกาเดิมจาก core-orders.mjs — คัดมาไว้ที่นี่ให้ครบ)
 *      syncedAtUtc  = ครั้งสุดท้ายที่ "เราไปดู ZORT" (ชีพจร · มีทุกรอบแม้เขียน 0 แถว)
 *      changedAtUtc = ครั้งสุดท้ายที่ "ข้อมูลเปลี่ยนจริง" (MAX updated_at)
 *    ส่งแต่ changedAt อย่างเดียวจะหลอกตา: คืนที่ไม่มีอะไรขยับ มันจะเก่าเป็นชั่วโมง
 *    ทั้งที่ซิงก์ทำงานปกติ ⇒ จอเตือนผิด แล้วคนจะเลิกเชื่อคำเตือน
 *
 * 🔴 **`syncedAtUtc: null` มีสองความหมายที่ห่างกันมาก — ห้ามให้จอเดา**
 *      (ก) ระบบ **ไม่ได้เก็บ** ชีพจรของตารางนี้ ⇒ ไม่ใช่ความผิดปกติ ห้ามขึ้นเตือน
 *      (ข) เก็บอยู่ แต่ **ยังไม่เคยมีรอบซิงก์** หลัง deploy ⇒ ควรหายเองในหนึ่งชั่วโมง
 *    วัดจริงตอนเขียน: ไม่มีใครเขียนชีพจรของ products/bundles/transfers ลง core_meta เลย
 *    (ตรวจด้วย `grep "INTO core_meta" netlify/lib/*.mjs` — มีแค่ orders · purchases · returns · contacts · slip)
 *    ⇒ ถ้าส่ง null เปล่า ๆ จอจะอ่านว่า "ซิงก์ตาย" = **แดงลวง ซึ่งแพงกว่าเขียวลวง**
 *      เพราะคนลงมือแก้ตาม [[probe-fails-toward-alarm]]
 *    ⇒ จึงส่ง `syncedAtKnown` (ระบบเก็บชีพจรของตารางนี้ไหม) แยกจาก `syncedAtUtc` (ค่าที่เก็บได้)
 *      🔑 ฟิลด์ที่ตัดสินใจต้องมีความหมายเดียว — `syncedAtNote` เป็นคำอธิบาย **ห้ามเอาไปตัดสิน**
 *         [[explain-fields-cant-decide]]
 *
 * ⚠️ **ตารางที่ไม่มี `updated_at` ห้ามยัดคำตอบลงช่อง changedAtUtc**
 *    `stock_snapshots` เก็บเป็น **วัน** (คอลัมน์ `day`) ไม่ใช่เวลา ⇒ หน่วยคนละอย่าง
 *    ยัดวันลงช่องที่ชื่อลงท้าย Utc = จอเอาไปบวก 7 ชั่วโมงแล้วได้เวลาผิด [[similar-name-other-unit]]
 *    ⇒ ตารางแบบนี้ส่ง `changedAtUtc: null` + `changedDay` แยกช่อง พร้อม note บอกหน่วย
 *
 * ⚠️ ทุกเวลาเป็น **UTC** ตามที่ D1/SQLite เก็บ — ชื่อฟิลด์ลงท้าย Utc เพื่อไม่ให้เดาหน่วยผิด
 * ⚠️ อ่านไม่สำเร็จ = `null` เหมือนกับ "ไม่มีค่า" ⇒ **แยกไม่ออก** จึงต้องติด `readError` มาด้วย
 *    ห้ามให้คำสั่งพวกนี้ทำให้ทั้งเส้นล้ม — มันเป็นของเสริม ไม่ใช่ข้อมูลที่จอต้องใช้แสดงแถว
 */

/** เขียนชีพจร "เราไปดู ZORT รอบล่าสุดเมื่อไหร่" — เรียกท้ายตัวซิงก์ทุกตัว
 *  ⚠️ ต้อง await เสมอ · Netlify แช่แข็งฟังก์ชันทันทีที่ตอบ promise ลอยตายกลางทาง
 *  ⚠️ ล้มเหลวห้ามทำให้รอบซิงก์ล้ม — ชีพจรหายหนึ่งรอบ ดีกว่าซิงก์ไม่เสร็จ */
export async function markSync(coreQuery, key, value = "ok") {
  try {
    await coreQuery(
      `INSERT INTO core_meta (k,v,at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at`,
      [String(key), String(value)]
    );
    return true;
  } catch {
    return false;
  }
}

/** ชีพจร + เวลาเปลี่ยนล่าสุดของตารางหนึ่ง
 *  @param table    ชื่อตารางในกระจก (ต้องเป็นชื่อคงที่ในโค้ด ห้ามรับจากคำขอ — ต่อ SQL ตรง)
 *  @param metaKey  คีย์ชีพจรใน core_meta · **null = ระบบไม่เก็บชีพจรของตารางนี้** (คนละเรื่องกับอ่านไม่ได้)
 *  @param where    เงื่อนไขช่วงที่จอกรองอยู่ (ไม่ส่ง = ไม่คิด rangeChangedAtUtc)
 *  @param dayCol   ตารางที่ไม่มี updated_at แต่มีคอลัมน์วัน ⇒ ส่งชื่อคอลัมน์นั้นมา
 */
export async function freshnessOf(coreQuery, { table, metaKey = null, where = null, params = [], dayCol = null } = {}) {
  /* กันความผิดพลาดที่ตรวจไม่เจอทีหลัง: ชื่อตาราง/คอลัมน์ต่อเข้า SQL ตรง ๆ
     ⇒ ถ้าวันหนึ่งมีคนส่งค่าจากคำขอเข้ามา ต้องตกที่นี่ ไม่ใช่ไปถึงฐาน */
  const ชื่อปลอดภัย = (s) => typeof s === "string" && /^[a-z_][a-z0-9_]*$/.test(s);
  if (!ชื่อปลอดภัย(table)) throw new Error(`freshnessOf: ชื่อตารางไม่ถูกรูป (${table})`);
  if (dayCol && !ชื่อปลอดภัย(dayCol)) throw new Error(`freshnessOf: ชื่อคอลัมน์วันไม่ถูกรูป (${dayCol})`);

  let readError = null;
  const ยิง = async (sql, p = []) => {
    try {
      return await coreQuery(sql, p);
    } catch (e) {
      readError = String(e?.message || e).slice(0, 200);
      return [];
    }
  };

  const [beat, chg, rng] = await Promise.all([
    metaKey ? ยิง(`SELECT at FROM core_meta WHERE k = ?`, [metaKey]) : Promise.resolve([]),
    dayCol
      ? ยิง(`SELECT MAX(${dayCol}) AS at FROM ${table}`)
      : ยิง(`SELECT MAX(updated_at) AS at FROM ${table}`),
    where && !dayCol ? ยิง(`SELECT MAX(updated_at) AS at FROM ${table} WHERE ${where}`, params) : Promise.resolve([]),
  ]);

  const out = {
    syncedAtUtc: beat?.[0]?.at ?? null,
    /* ⚠️ true/false มาจาก "เราส่ง metaKey มาไหม" ซึ่งเป็นความจริงเรื่องระบบ
       ไม่ใช่ผลการอ่าน ⇒ ค่านี้จึงเชื่อได้แม้ตอนอ่าน core_meta ล้ม */
    syncedAtKnown: Boolean(metaKey),
    changedAtUtc: dayCol ? null : (chg?.[0]?.at ?? null),
    rangeChangedAtUtc: where && !dayCol ? (rng?.[0]?.at ?? null) : null,
  };
  if (dayCol) out.changedDay = chg?.[0]?.at ?? null;
  if (readError) out.readError = readError;

  /* คำอธิบาย **คิดจากค่าจริงทุกครั้ง ห้ามเขียนฝังไว้** — ไม่งั้นวันที่เราเริ่มเก็บชีพจรของตารางนี้
     ข้อความจะยังบอกว่า "ระบบไม่เก็บ" ต่อไปโดยไม่มีใครมาถอด [[warnings-computed-not-written]] */
  out.syncedAtNote = !metaKey
    ? "ระบบไม่ได้เก็บชีพจรของตารางนี้ (ไม่ใช่ความผิดปกติ — ห้ามขึ้นเตือน) ⇒ ใช้ changedAtUtc ตัดสินว่าต้องยิงใหม่ไหม"
    : out.syncedAtUtc
      ? "ครั้งสุดท้ายที่ไปดู ZORT (มีทุกรอบแม้ไม่มีอะไรเปลี่ยน) · UTC ต้องบวก 7 ก่อนโชว์"
      : "เก็บชีพจรอยู่แต่ยังไม่เคยมีรอบซิงก์บันทึกไว้ (เพิ่ง deploy = ปกติ · ควรมีค่าภายในหนึ่งชั่วโมง)";
  out.changedAtNote = dayCol
    ? `ตารางนี้ไม่มี updated_at ⇒ ส่ง changedDay (คอลัมน์ ${dayCol}) เป็น **วัน** ไม่ใช่เวลา ห้ามบวก 7`
    : "ครั้งสุดท้ายที่ข้อมูลในตารางเปลี่ยนจริง (MAX updated_at) · เท่าเดิม = ไม่ต้องยิงใหม่";
  return out;
}
