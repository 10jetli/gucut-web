/* สุขภาพ token ของมาร์เก็ตเพลส — **อ่านอย่างเดียว ห้ามต่ออายุ**
 *
 * ⚠️ ทำไมต้องห้ามต่ออายุในนี้: หน้าสถานะถูกกดดูบ่อย ถ้าตัวตรวจไปเรียก refresh
 *    จะมีผลข้างเคียง (refresh_token หมุนตัวใหม่) และช้า ⇒ ตัวตรวจต้องไม่เปลี่ยนสิ่งที่มันตรวจ
 *
 * 🔴 กับดักหน่วยเวลา (ของจริง วัด 22 ต.ค. 2569 — ห้ามเขียนใหม่โดยอ่านชื่อฟิลด์เดาเอง)
 *    lazada : `expiresAt` เป็น **มิลลิวินาที** (`Date.now() + expires_in*1000`)
 *    shopee : `expireAt`  เป็น **วินาที**     (`now() + expire_in`)   ← ไม่มี s และคนละหน่วย
 *    tiktok : `expireAt`  เป็น **วินาที**     (`access_token_expire_in`)
 *    ⇒ อ่านฟิลด์เดียวจะได้ undefined → 0 → "หมดอายุ" ลวงสำหรับสองเจ้า
 *    สูตรข้างล่างจึงดู **ทั้งสองชื่อ** แล้วเดาหน่วยจากขนาด ไม่ใช่จากชื่อเจ้า
 */

/** แปลงเป็นมิลลิวินาที — รับทั้งสองชื่อ ทั้งสองหน่วย · คืน 0 เมื่อไม่มีข้อมูลเวลาเลย */
export function หมดอายุเป็นมิลลิ(t) {
  const ms = Number(t?.expiresAt || 0);
  const sec = Number(t?.expireAt || 0);
  return ms > 0 ? ms : sec > 0 ? sec * 1000 : 0;
}

/** ประเมินหนึ่งเจ้า — ฟังก์ชันบริสุทธิ์ (ทดสอบด้วยค่าที่ปลูกได้)
 *  🔑 สามสถานะต้องแยกกันเสมอ:
 *     ไม่มีระเบียน  = ยังไม่ได้เชื่อมร้าน (ไม่ใช่ของเสีย)
 *     มีระเบียนแต่ไม่มีเวลา = **ไม่รู้** (ไม่ใช่ "หมดอายุ")
 *     มีเวลา = ตัดสินได้
 *  ⚠️ `connected` ของเส้น ?tokens=1 ตอบว่า "เรามีระเบียน token" ไม่ใช่ "ใช้งานได้"
 *     ⇒ ที่นี่ห้ามใช้ connected เป็นเกณฑ์ (เจอจริง 22 ต.ค.: lazada connected:true พร้อม ok:false)
 */
export function ประเมินToken(เจ้า, t, ตอนนี้ = Date.now()) {
  if (!t || !t.accessToken) {
    return { เจ้า, state: "off", hoursLeft: null, expiresAtUtc: null, why: "ยังไม่ได้เชื่อมร้าน" };
  }
  const หมด = หมดอายุเป็นมิลลิ(t);
  const hoursLeft = หมด ? Math.floor((หมด - ตอนนี้) / 3600e3) : null;
  const expiresAtUtc = หมด ? new Date(หมด).toISOString() : null;
  if (t.refreshError) {
    return { เจ้า, state: "down", hoursLeft, expiresAtUtc,
      why: `ต่ออายุล้ม: ${String(t.refreshError).slice(0, 120)}` };
  }
  if (hoursLeft === null) {
    return { เจ้า, state: "unknown", hoursLeft, expiresAtUtc,
      why: "มีระเบียน token แต่ไม่มีเวลาหมดอายุ ⇒ บอกไม่ได้ว่ายังใช้ได้ไหม" };
  }
  if (hoursLeft < 0) {
    return { เจ้า, state: "down", hoursLeft, expiresAtUtc,
      why: `หมดอายุไปแล้ว ${Math.abs(hoursLeft)} ชม.` };
  }
  if (hoursLeft < 24) {
    return { เจ้า, state: "warn", hoursLeft, expiresAtUtc,
      why: `เหลือ ${hoursLeft} ชม. — ถ้าตัวต่ออายุไม่วิ่ง จะหลุดเอง` };
  }
  return { เจ้า, state: "ok", hoursLeft, expiresAtUtc, why: `เหลือ ${hoursLeft} ชม.` };
}

/** รวมผลหลายเจ้าเป็นสถานะเดียวให้หน้าสถานะ
 *  ⚠️ "ยังไม่ได้เชื่อม" ทุกเจ้า ≠ ของเสีย ⇒ คืน off (หน้าจอขึ้น "ยังไม่เปิดใช้")
 *  ⚠️ เจ้าที่ยังไม่เชื่อม **ไม่ถ่วง** ผลรวมให้แดง — ไม่งั้นร้านที่ใช้แค่เจ้าเดียวจะแดงตลอดกาล
 */
export function รวมผลToken(ผล) {
  const ใช้งาน = ผล.filter((x) => x.state !== "off");
  if (!ใช้งาน.length) return { state: "off", note: "ยังไม่ได้เชื่อมมาร์เก็ตเพลสเจ้าไหนเลย", ราย: ผล };
  const พูด = (x) => `${x.เจ้า}: ${x.why}`;
  const แดง = ใช้งาน.filter((x) => x.state === "down");
  const ไม่รู้ = ใช้งาน.filter((x) => x.state === "unknown");
  const เหลือง = ใช้งาน.filter((x) => x.state === "warn");
  if (แดง.length) return { state: "down", note: แดง.map(พูด).join(" · "), ราย: ผล };
  if (ไม่รู้.length) return { state: "warn", unknown: true, note: ไม่รู้.map(พูด).join(" · "), ราย: ผล };
  if (เหลือง.length) return { state: "warn", note: เหลือง.map(พูด).join(" · "), ราย: ผล };
  return { state: "ok", note: ใช้งาน.map(พูด).join(" · "), ราย: ผล };
}
