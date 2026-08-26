// กรอกแบบ ลซ.1 "ฉบับทางการ" — สร้าง PDF ในเครื่องลูกค้าทั้งหมด
//
// ---------------------------------------------------------------------------
// เจ้าของร้านสั่ง (26 ส.ค. 2569)
//   "ยึดอันนี้เป็นหลัก" · "ห้ามแก้ไข ไปถามหลายจังหวัดมาแล้ว" · "อันเก่าลบทิ้ง"
//   ⇒ ห้ามวาดแบบฟอร์มขึ้นเองอีก ต้องเอาข้อมูลไปวางลงบนไฟล์ทางการเท่านั้น
//     (กลับคำอนุญาตเดิม 25 ส.ค. ที่เคยให้ปรับเอกสารให้สวยงามได้)
//
// ⚠️ ทุกอย่างเกิดในเบราว์เซอร์ — ห้ามส่งข้อมูลไปเซิร์ฟเวอร์ใดทั้งสิ้น
//    ฟอร์มเปล่ากับฟอนต์ดึงจาก public/doc/ (ไฟล์นิ่ง ไม่มีข้อมูลลูกค้าวิ่งออก)
//    เลขบัตรประชาชนเป็นข้อมูลอ่อนไหวตาม PDPA
//
// ⚠️ พิกัดทุกตัวในแผนที่ข้างล่าง "วัดจากภาพเรนเดอร์จริง" แล้วตรวจด้วยตาทีละช่อง
//    (วนแก้ 6 รอบกว่าจะตรงหมด — 26 ส.ค. 2569)
//    - แหล่งที่เชื่อได้: ภาพเรนเดอร์ + การวัดตำแหน่งหมึกด้วยการเทียบภาพก่อน/หลัง
//    - ⚠️ พิกัด x จากการดัมพ์ตัวอักษรของ PDFKit "เชื่อไม่ได้" กับข้อความไทย
//      มันเลื่อนขวาเป็นช่วง ๆ ไม่เท่ากันแต่ละบรรทัด เคยหลงตามแล้วเสียสองรอบ
//    ⇒ จะแก้พิกัดต้องเรนเดอร์ดูจริงเท่านั้น ห้ามคำนวณแก้แบบไม่ดูภาพ
//
// ⚠️ แบบฟอร์มมี 8 หน้า: หน้า 1-3 ส่วนที่ผู้ขอกรอก (ระบบเติมให้)
//    หน้า 4 รายการแนบตามข้อ 4 · หน้า 5-8 ส่วนของนายทะเบียน — ห้ามแตะทั้งหมด
//    ช่องที่เจ้าของร้านสั่งเอาออกจากหน้าจอ (อาชีพ · พื้นที่ · วัตถุประสงค์ · เขียนที่)
//    ปล่อยเป็นจุดไข่ปลาว่างให้ลูกค้าเขียนมือ — ตั้งใจ ไม่ใช่ตกหล่น
// ---------------------------------------------------------------------------

import { MED_ITEMS } from "./medcert";

export interface Lz1SawRow {
  engine: string;
  hp: string;
  bar: string;
  qty: string;
}

export interface Lz1FillData {
  day: string;
  month: string;
  year: string;
  name: string;
  idNumber: string;
  nationality: string;
  ethnicity: string;
  birth: string;      // ป้ายวันเกิดแบบไทย เช่น "26 พ.ย. 2519"
  age: string;
  houseNo: string;
  moo: string;
  soi: string;
  road: string;
  tambon: string;
  amphoe: string;
  province: string;
  postcode: string;
  phone: string;
  email: string;
  saws: Lz1SawRow[];
  /** ติ๊กหลักฐานแนบ 6.1 (1) สำเนาบัตร (2) ทะเบียนบ้าน */
  docs: { idCopy: boolean; house: boolean };
}

const TH_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const th = (s: string) => String(s ?? "").replace(/[0-9]/g, (d) => TH_DIGITS[+d]);

/**
 * สร้าง PDF ที่กรอกแล้ว — คืน bytes พร้อมเปิด/บันทึก
 *
 * ⚠️ รับ bytes ของฟอร์มกับฟอนต์จากคนเรียก ไม่ fetch เอง
 *    เว็บส่งของที่ดึงจาก public/doc/ เข้ามา ส่วนตัวทดสอบส่งไฟล์จากดิสก์
 *    โค้ดเส้นเดียวกันเป๊ะ ทดสอบนอกเบราว์เซอร์ได้
 */
export async function buildLz1Pdf(
  d: Lz1FillData,
  formBytes: ArrayBuffer,
  fontBytes: ArrayBuffer,
): Promise<Uint8Array> {
  // โหลดตอนใช้เท่านั้น — pdf-lib กับ fontkit รวมกันหลายร้อย KB
  // คนที่แค่เปิดหน้าอ่านขั้นตอนไม่ควรต้องจ่ายค่าโหลดส่วนนี้
  const [{ PDFDocument, rgb }, fontkitMod] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);

  const pdf = await PDFDocument.load(formBytes);
  pdf.registerFontkit((fontkitMod.default ?? fontkitMod) as never);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const pages = pdf.getPages();
  const [p1, p2, p3] = [pages[0], pages[1], pages[2]];
  // น้ำเงินเข้ม — อ่านชัดและดูเป็นการกรอกจริง ไม่กลืนกับตัวพิมพ์ของฟอร์ม
  const ink = rgb(0.05, 0.05, 0.35);

  type Page = typeof p1;
  const put = (pg: Page, t: string, x: number, y: number, size = 10) => {
    if (t) pg.drawText(String(t), { x, y, size, font, color: ink });
  };
  // วางกึ่งกลางช่วง แล้ว "ย่อขนาดอัตโนมัติ" จนไม่ล้นช่อง (ต่ำสุด 5.5)
  // ⚠️ ห้ามปล่อยให้ตัวหนังสือทับป้ายของฟอร์มราชการ ช่องแคบให้ตัวเล็กลงแทน
  const fit = (pg: Page, t: string, x0: number, x1: number, y: number, maxSize = 9) => {
    if (!t) return;
    let size = maxSize;
    while (size > 5.5 && font.widthOfTextAtSize(String(t), size) > x1 - x0 - 2) size -= 0.25;
    const w = font.widthOfTextAtSize(String(t), size);
    put(pg, t, x0 + Math.max(1, (x1 - x0 - w) / 2), y, size);
  };
  // เครื่องหมายติ๊ก — ใช้ "/" เพราะ Sarabun ไม่มี ✓ และดูเป็นการติ๊กมือจริง
  const tick = (pg: Page, x: number, y: number) =>
    put(pg, "/", x, y, 11);

  // ================= หน้า 1 — ผู้ขอ (บุคคลธรรมดา) =================
  fit(p1, th(d.day), 328, 368, 688);
  fit(p1, d.month, 403, 436, 688, 8.5);
  fit(p1, th(d.year), 462, 531, 688);
  fit(p1, d.name, 243, 531, 649, 12);
  tick(p1, 166, 628);                              // ☑ เป็นบุคคลธรรมดา
  // เลขบัตร 13 หลักลงกล่องทีละหลัก — พิกัดกลางกล่องจากการสแกนพิกเซล
  const idX = [391.8, 404.9, 414.6, 424.0, 433.7, 446.8, 456.5, 466.2, 475.5, 485.2, 498.3, 508.0, 521.1];
  const digits = String(d.idNumber ?? "").replace(/\D/g, "").slice(0, 13);
  digits.split("").forEach((g, i) => fit(p1, th(g), idX[i] - 5, idX[i] + 5, 626.8, 10));
  put(p1, d.nationality, 128, 606.5, 9);
  put(p1, d.ethnicity, 207, 606.5, 9);
  fit(p1, d.birth, 305, 425, 606.5, 9);
  fit(p1, th(d.age), 437, 460, 606.5, 9);
  put(p1, d.houseNo, 160, 587, 9);
  put(p1, d.moo, 237, 587, 9);
  put(p1, d.soi, 330, 587, 9);
  put(p1, d.road, 483, 587, 9);
  put(p1, d.tambon, 145, 567.5, 9);
  put(p1, d.amphoe, 302, 567.5, 9);
  put(p1, d.province, 428, 567.5, 9);
  put(p1, th(d.postcode), 158, 548, 9);
  fit(p1, th(d.phone), 318, 374, 548, 8);
  put(p1, d.email, 126, 528.5, 9);

  // ================= หน้า 2 — จำนวนเลื่อย + คำรับรอง =================
  tick(p2, 180, 699.5);                            // ☑ 1.1 บุคคลธรรมดา
  const total = d.saws.reduce((s, x) => s + (Number(x.qty) || 0), 0);
  fit(p2, th(String(total || "")), 340, 415, 659.5);
  // แถว 2.1–2.5 เว้นระยะเท่ากันแถวละ ~39.2pt (วัดจากฟอร์มจริง)
  d.saws.slice(0, 5).forEach((s, i) => {
    const dy = i * 39.2;
    fit(p2, s.engine, 333, 382, 639.5 - dy, 8);
    fit(p2, s.hp, 468, 494, 639.5 - dy, 9);
    fit(p2, th(s.bar), 190, 232, 620 - dy, 9);
    fit(p2, th(s.qty), 255, 300, 620 - dy, 9);
  });
  // ☑ คุณสมบัติ 5.1–5.11 — ติ๊กครบเสมอ
  // ⚠️ ตรงกับใบเดิมที่เจ้าหน้าที่รับไปแล้ว และคำรับรองมีผลจากลายเซ็นของลูกค้าเอง
  //    (เจ้าของร้านสั่งเอาช่องติ๊กบนจอออกไปแล้ว 25 ส.ค. — ดู PermitView)
  for (const y of [306.3, 286.4, 267.3, 247.9, 227.9, 208.0, 148.6, 129.6, 109.9, 91.1, 71.2]) {
    tick(p2, 179.5, y + 2.5);
  }

  // ================= หน้า 3 — หลักฐานแนบ + ชื่อใต้ช่องลงชื่อ =================
  tick(p3, 183, 719);                              // ☑ 6.1 บุคคลธรรมดา
  if (d.docs.idCopy) tick(p3, 219, 699);           // ☑ (1) สำเนาบัตรประจำตัว
  if (d.docs.house) tick(p3, 219, 678.5);          // ☑ (2) สำเนาทะเบียนบ้าน
  // ชื่อในวงเล็บใต้ช่องลงชื่อ — ตัวลายเซ็นลูกค้าเซ็นเอง ห้ามพิมพ์แทน
  fit(p3, d.name, 280, 378, 244, 9);

  // ================= หน้าแนบ: ใบให้แพทย์ =================
  // ⚠️ ไม่ใช่ส่วนหนึ่งของแบบ ลซ.1 — เป็นกระดาษช่วยของร้าน
  //    คลินิกทั่วไปไม่รู้ว่าใบรับรองแพทย์เรื่องนี้ต้องรับรองอะไรบ้าง
  //    ลูกค้าไปมือเปล่าได้ใบทั่วไปมา สำนักงานตีกลับ เสียทั้งค่าตรวจและเสียเที่ยว
  //    ข้อความ 4 ข้อมาจากเจ้าของร้าน (ส่งลูกค้ายื่นจริงมาแล้ว) — ห้ามแก้เอง
  // ⚠️ ห้ามเติมวันที่ตรวจหรือผลตรวจ เป็นคำรับรองของแพทย์ เติมให้ = ปลอมเอกสาร
  const med = pdf.addPage([595.28, 841.89]);
  const black = rgb(0.1, 0.1, 0.1);
  const mp = (t: string, x: number, y: number, size = 10, c = black) =>
    med.drawText(t, { x, y, size, font, color: c });
  const mc = (t: string, y: number, size: number) => {
    const w = font.widthOfTextAtSize(t, size);
    mp(t, (595.28 - w) / 2, y, size);
  };
  const dots = (x0: number, x1: number, y: number) => {
    med.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 0.6, color: black, dashArray: [1, 2] });
  };
  mp("หน้านี้เอาไปให้แพทย์ที่โรงพยาบาลหรือคลินิกกรอกและเซ็น — ไม่ต้องยื่นพร้อมแบบ ลซ.1 จนกว่าแพทย์จะเซ็นแล้ว", 60, 800, 8.5);
  mc("ใบรับรองแพทย์", 760, 16);
  mp("สถานพยาบาล", 320, 730, 10); dots(382, 535, 728);
  mp("วันที่", 320, 712, 10); dots(345, 390, 710);
  mp("เดือน", 395, 712, 10); dots(422, 480, 710);
  mp("พ.ศ.", 485, 712, 10); dots(508, 535, 710);
  mp("ขอรับรองว่า นาย/นาง/นางสาว", 60, 680, 10);
  {
    const bare = d.name.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, "").trim();
    const w = font.widthOfTextAtSize(bare, 10);
    dots(196, 535, 678);
    mp(bare, 200 + Math.max(0, (330 - w) / 2), 682, 10, ink);
  }
  mp("อายุ", 60, 660, 10); dots(80, 120, 658);
  if (d.age) mp(th(d.age), 92, 662, 10, ink);
  mp("ปี   เลขประจำตัวประชาชน", 124, 660, 10);
  dots(238, 420, 658);
  if (digits) mp(th(digits), 260, 662, 10, ink);
  mp("ได้รับการตรวจร่างกายเมื่อวันที่", 60, 640, 10); dots(190, 320, 638);
  mp("ผลการตรวจปรากฏว่า", 324, 640, 10);
  let y = 610;
  MED_ITEMS.forEach((item, i) => {
    // ตัดบรรทัดยาวเองแบบง่าย — ข้อความรับรองยาวเกินหนึ่งบรรทัด
    const label = `${th(String(i + 1))}. `;
    mp(label, 70, y, 10);
    const words = item.split(" ");
    let line = "";
    for (const wd of words) {
      const cand = line ? line + " " + wd : wd;
      if (font.widthOfTextAtSize(cand, 10) > 440) {
        mp(line, 90, y, 10);
        y -= 16;
        line = wd;
      } else line = cand;
    }
    mp(line, 90, y, 10);
    y -= 24;
  });
  mp("ใบรับรองนี้ออกให้เพื่อใช้ประกอบคำขอรับใบอนุญาตให้มีเลื่อยโซ่ยนต์ (แบบ ลซ.1)", 60, y - 6, 9);
  mp("ตามพระราชบัญญัติเลื่อยโซ่ยนต์ พ.ศ. 2545", 60, y - 22, 9);
  y -= 70;
  mp("(ลงชื่อ)", 300, y, 10); dots(335, 470, y - 2); mp("แพทย์ผู้ตรวจ", 474, y, 10);
  y -= 22;
  mp("(", 330, y, 10); dots(336, 460, y - 2); mp(")", 462, y, 10);
  y -= 22;
  mp("ใบอนุญาตประกอบวิชาชีพเวชกรรมเลขที่", 250, y, 10); dots(412, 520, y - 2);

  return pdf.save();
}
