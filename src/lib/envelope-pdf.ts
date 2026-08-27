// ใบแปะหน้าซองส่งใบ ลซ.๒ กลับร้าน — สร้าง PDF ในเครื่องลูกค้า (27 ส.ค. 2569)
//
// เจ้าของร้านสั่ง: "ถึงหน้านี้ ให้ลูกค้ากดปริ้นใบแปะหน้าซอง"
// ซองที่ใช้ใหญ่กว่า A4 นิดเดียว = ซอง C4 (229×324มม.)
// → ใบแปะขนาด A5 แนวนอน (210×148มม. = ครึ่งบนของ A4 พอดี)
//   พิมพ์กระดาษ A4 ธรรมดา ตัดครึ่งตามเส้น แปะได้เลย เหลือขอบซองไว้ติดแสตมป์
//
// ⚠️ นี่คือเอกสารของร้านเอง (ไม่ใช่ฟอร์มราชการ) จึงวาดเองได้ —
//    คำสั่ง "ห้ามวาดฟอร์มเอง" ใช้กับแบบ ลซ.1 ทางการเท่านั้น
// ⚠️ ทำในเบราว์เซอร์ทั้งหมด ข้อมูลผู้ส่ง (ชื่อ-ที่อยู่ลูกค้า) ไม่วิ่งออกจากเครื่อง

export interface EnvelopeData {
  /** ผู้ส่ง (ลูกค้า) — ช่องไหนว่างก็ข้าม ไม่พัง */
  senderName: string;
  senderAddress: string;
  senderPhone: string;
  /** ผู้รับ (ร้าน) */
  shopName: string;
  shopAddress: string;
  shopPhone: string;
}

export async function buildEnvelopePdf(
  d: EnvelopeData,
  fontBytes: ArrayBuffer,
): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, fontkitMod] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit((fontkitMod.default ?? fontkitMod) as never);
  const font = await pdf.embedFont(fontBytes, { subset: true });

  // A4 แนวตั้ง — ใบแปะอยู่ครึ่งบน (A5 แนวนอน 595×421pt)
  const W = 595.28;
  const H = 841.89;
  const CUT = H / 2;
  const page = pdf.addPage([W, H]);

  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);
  const put = (t: string, x: number, y: number, size: number, color = black) => {
    if (t) page.drawText(t, { x, y, size, font, color });
  };

  // กรอบใบแปะ
  page.drawRectangle({
    x: 16, y: CUT + 16, width: W - 32, height: H - CUT - 32,
    borderColor: black, borderWidth: 1.2,
  });

  // ผู้ส่ง — มุมซ้ายบน ตัวเล็ก
  let y = H - 48;
  put("จาก (ผู้ส่ง)", 32, y, 10, gray);
  y -= 16;
  put(d.senderName, 32, y, 12);
  y -= 15;
  // ที่อยู่ยาว ตัดบรรทัดหยาบ ๆ ที่ ~52 ตัวอักษร
  for (const line of wrap(d.senderAddress, 52)) { put(line, 32, y, 11); y -= 14; }
  if (d.senderPhone) { put(`โทร ${d.senderPhone}`, 32, y, 11); }

  // ผู้รับ — ตัวใหญ่ กลางค่อนล่างของใบแปะ
  let ry = CUT + 150;
  put("ถึง (ผู้รับ)", 150, ry, 11, gray);
  ry -= 24;
  put(d.shopName, 150, ry, 17);
  ry -= 22;
  for (const line of wrap(d.shopAddress, 50)) { put(line, 150, ry, 15); ry -= 20; }
  put(`โทร ${d.shopPhone}`, 150, ry, 15);

  // แถบบอกของในซอง — กันไปรษณีย์/ร้านสับสน และเตือนอย่าพับ
  put("เอกสารในซอง: ใบรับรอง ลซ.๒ จำนวน ๒ ใบ (ตอนกลาง + ตอนปลาย) — กรุณาอย่าพับ", 32, CUT + 30, 10.5, gray);

  // เส้นตัด + คำแนะนำใต้เส้น
  page.drawLine({
    start: { x: 0, y: CUT }, end: { x: W, y: CUT },
    thickness: 0.8, color: gray, dashArray: [6, 5],
  });
  put("ตัดตามเส้นประ แล้วติดครึ่งบนลงบนหน้าซอง (ซองใหญ่กว่า A4 เล็กน้อย = ซอง C4)", 32, CUT - 22, 10.5, gray);
  put("แนะนำติดเทปใสทับทั้งสี่มุม · อย่าลืมใส่ใบ ลซ.๒ ทั้ง ๒ ใบก่อนปิดซอง", 32, CUT - 38, 10.5, gray);

  return pdf.save();
}

/** ตัดบรรทัดข้อความไทยหยาบ ๆ ตามจำนวนตัวอักษร — พอสำหรับที่อยู่ */
function wrap(t: string, max: number): string[] {
  const words = String(t || "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { out.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, 4); // ที่อยู่ยาวผิดปกติก็ไม่ทะลุกรอบ
}
