// อ่านบัตรประชาชนจากรูปถ่าย — ทำในเครื่องลูกค้าทั้งหมด
//
// ⚠️ รูปบัตรต้องไม่ออกจากเครื่องลูกค้าเด็ดขาด
//    เลขประจำตัวประชาชนเป็นข้อมูลส่วนบุคคลตาม PDPA เก็บไว้บนเซิร์ฟเวอร์ร้าน
//    คือรับความเสี่ยงฟรี ๆ โดยไม่ได้อะไรกลับมา
//    (หลักการเดียวกับปุ่มกล้องหาสินค้าใน ScanSheet.tsx)
//
// ⚠️ ตัวอ่านโหลดตอนกดปุ่มกล้องเท่านั้น ห้ามโหลดตอนเปิดหน้า
//    ไฟล์รวมกันราว 5.7 MB — คนที่กรอกเองไม่ควรต้องจ่ายค่าเน็ตส่วนนี้
//
// ⚠️ อ่านตัวหนังสือไทยจากรูปถ่ายไม่มีทางแม่น 100%
//    ที่อยู่ตัวเล็กและมีสระวรรณยุกต์เยอะ ถ่ายเอียง แสงสะท้อน บัตรซีด ผิดได้ทั้งนั้น
//    ⇒ ทุกช่องที่อ่านมาต้องให้ลูกค้าเห็นและแก้ได้ ห้ามส่งเข้าฟอร์มเงียบ ๆ
//    เพราะฟอร์มนี้เป็นคำรับรองต่อนายทะเบียน ผิดตัวเดียวก็โดนตีกลับ

export interface IdCardData {
  name?: string;
  idNumber?: string;
  birth?: string;
  address?: string;
  /** ช่องที่ระบบไม่มั่นใจ — หน้าจอต้องไฮไลต์ให้ลูกค้าเช็ค */
  unsure: string[];
}

/**
 * ตรวจเลขประจำตัวประชาชนด้วยหลักตรวจสอบในตัว
 *
 * หลักที่ 13 คำนวณจาก 12 หลักแรก — ถ้ากล้องอ่านผิดแม้แต่หลักเดียวจะจับได้ทันที
 * ทดสอบแล้ว: 1101700123456 ผ่าน · แก้ไปหลักเดียวเป็น 1101790123456 ไม่ผ่าน
 *
 * ⚠️ ผ่านการตรวจนี้ไม่ได้แปลว่าเป็นเลขที่มีอยู่จริง แค่แปลว่า "รูปแบบถูก"
 *    ห้ามเขียนบนหน้าจอว่า "เลขบัตรถูกต้อง" — เขียนได้แค่ว่าไม่พบข้อผิดพลาด
 */
export function validThaiId(id: string): boolean {
  const d = String(id).replace(/\D/g, "");
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/** จัดรูปเลขบัตรเป็น 1-2345-67890-12-3 ให้อ่านง่ายตอนตรวจ */
export const formatThaiId = (id: string) => {
  const d = String(id).replace(/\D/g, "").slice(0, 13);
  const parts = [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12, 13)];
  return parts.filter(Boolean).join("-");
};

/** อายุจากวันเกิด (พ.ศ. หรือ ค.ศ. ก็ได้) */
export function ageFromBirth(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const before =
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (before) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/**
 * ตัวย่อเดือนที่ใช้บนบัตรจริง
 *
 * ⚠️ ตัวย่อไทยไม่ใช่แค่ตัดคำให้สั้น — "ม.ค." กับ "มกราคม" ไม่ได้ขึ้นต้นเหมือนกัน
 *    เทียบด้วยการตัดคำจึงพลาด ต้องมีตารางตรง ๆ (เจอตอนทดสอบ 25 ส.ค. 2569)
 * ⚠️ "ม.ค." กับ "มี.ค." ต่างกันตัวเดียว เรียงจากยาวไปสั้นเวลาเทียบ ไม่งั้นจับผิดเดือน
 */
const TH_MONTH_ABBR: Record<string, number> = {
  "มกรา": 0, "มค": 0, "กุมภา": 1, "กพ": 1, "มีนา": 2, "มีค": 2,
  "เมษา": 3, "เมย": 3, "พฤษภา": 4, "พค": 4, "มิถุนา": 5, "มิย": 5,
  "กรกฎา": 6, "กค": 6, "สิงหา": 7, "สค": 7, "กันยา": 8, "กย": 8,
  "ตุลา": 9, "ตค": 9, "พฤศจิกา": 10, "พย": 10, "ธันวา": 11, "ธค": 11,
};

/** "12 มี.ค. 2530" หรือ "12 มีนาคม 2530" → ISO */
export function parseThaiDate(s: string): string | null {
  const m = /(\d{1,2})\s*([ก-๛.]+)\s*(\d{4})/.exec(s);
  if (!m) return null;
  const word = m[2].replace(/[.\s]/g, "");
  const keys = Object.keys(TH_MONTH_ABBR).sort((a, b) => b.length - a.length);
  const hit = keys.find((k) => word.startsWith(k));
  const mi = hit !== undefined ? TH_MONTH_ABBR[hit] : -1;
  if (mi < 0) return null;
  let year = Number(m[3]);
  if (year > 2400) year -= 543;    // พ.ศ. → ค.ศ.
  const d = String(m[1]).padStart(2, "0");
  return `${year}-${String(mi + 1).padStart(2, "0")}-${d}`;
}

export const thaiDateLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
};

/**
 * ดึงข้อมูลจากข้อความที่กล้องอ่านมาได้
 *
 * ⚠️ เขียนแบบ "ได้เท่าไหร่เอาเท่านั้น" ไม่ใช่ต้องได้ครบถึงจะใช้ได้
 *    อ่านได้แค่เลขบัตรอย่างเดียวก็ยังช่วยลูกค้าได้มาก ดีกว่าล้มทั้งใบ
 */
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * หาวันเกิดจากบัตร — ต้องผูกกับป้ายเสมอ
 *
 * ⚠️ ลองบรรทัดภาษาอังกฤษก่อน ("2 May 1969") เพราะกล้องอ่านอักษรโรมันแม่นกว่าไทยมาก
 *    และเป็น ค.ศ. อยู่แล้วจึงไม่ต้องเดาว่าเป็น พ.ศ. หรือ ค.ศ.
 *    ถ้าไม่เจอค่อยถอยไปอ่านบรรทัดไทยที่ตามหลัง "เกิดวันที่"
 */
function birthFrom(text: string): string | null {
  // ⚠️ ตัวอ่านมักสับสนอักษรโรมันบางตัว ต้องแก้ก่อนเทียบชื่อเดือน
  //    O↔0 · l/I↔1 · S↔5 — "Jun" อ่านเป็น "Jvn" หรือ "1969" เป็น "l969" ได้
  const fix = (w: string) =>
    w.toLowerCase().replace(/0/g, "o").replace(/1/g, "l").replace(/5/g, "s");

  // ⚠️ ต้องหา "ทุกวันที่แบบอังกฤษ" แล้วเลือกอันที่เป็นวันเกิดจริง
  //    บนบัตรมีสามวันที่ (เกิด / ออกบัตร / หมดอายุ) เอาอันแรกที่เจอไม่ได้
  //    วันเกิดคือ "อันที่เก่าที่สุด" เสมอ เพราะออกบัตรและหมดอายุต้องหลังวันเกิด
  // ⚠️ ยอมให้ตัวเลขเป็นตัวอักษรที่หน้าตาเหมือนกันได้ แล้วค่อยแปลงกลับ
  //    ตัวอ่านสับสน l/I↔1 · O↔0 · S↔5 เป็นเรื่องปกติกับตัวเลขบนบัตร
  //    ปลอดภัยเพราะยังบังคับว่าต้องมีชื่อเดือนคั่นกลางและปีต้องอยู่ในช่วงที่เป็นไปได้
  const digits = (w: string) =>
    Number(w.replace(/[lI]/g, "1").replace(/[oO]/g, "0").replace(/[sS]/g, "5"));

  const all: string[] = [];
  const re = /([\dlIoOsS]{1,2})\s*([A-Za-z]{3,9})\.?\s*([\dlIoOsS]{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const w = fix(m[2]).slice(0, 3);
    const mi = EN_MONTHS.findIndex((x) => x === w);
    const y = digits(m[3]);
    const d = digits(m[1]);
    if (mi >= 0 && y > 1900 && y < 2200 && d >= 1 && d <= 31) {
      all.push(`${y}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  if (all.length) return all.sort()[0];

  // ถอยไปอ่านบรรทัดไทยที่ตามหลังป้าย — ยอมให้ป้ายเพี้ยนได้บ้าง
  const th = /เกิด\s*วั?น?ที่?\s*([^\n]{6,32})/.exec(text);
  if (th) {
    const got = parseThaiDate(th[1]);
    if (got) return got;
  }

  // ⚠️ ทางสุดท้าย: หาวันที่ไทยทุกอันแล้วเอาอันเก่าสุดเหมือนกัน
  //    ห้ามเอาอันแรกที่เจอ เพราะบนบัตรวันออกบัตรอยู่ล่างสุดแต่ OCR อาจสลับลำดับ
  const thAll: string[] = [];
  const thRe = /(\d{1,2})\s*([ก-๛.]{2,12})\s*(\d{4})/g;
  while ((m = thRe.exec(text))) {
    const got = parseThaiDate(m[0]);
    if (got) thAll.push(got);
  }
  return thAll.length ? thAll.sort()[0] : null;
}

export function parseIdCard(text: string): IdCardData {
  const out: IdCardData = { unsure: [] };
  const flat = text.replace(/\s+/g, " ");

  // เลขบัตร — หา 13 หลักที่ผ่านหลักตรวจสอบก่อน ถ้าไม่มีค่อยเอาชุดแรกที่เจอ
  const runs = flat.match(/\d[\d\s-]{11,20}\d/g) || [];
  const digits = runs.map((r) => r.replace(/\D/g, "")).filter((d) => d.length === 13);
  const good = digits.find(validThaiId);
  if (good) out.idNumber = good;
  else if (digits[0]) {
    out.idNumber = digits[0];
    out.unsure.push("idNumber");   // รูปแบบไม่ผ่าน — ต้องให้คนดู
  }

  // ชื่อ — มองหาคำนำหน้าที่ใช้จริงบนบัตร
  const name = /((?:นาย|นาง|นางสาว|น\.ส\.)\s*[ก-๛]+\s+[ก-๛]+)/.exec(flat);
  if (name) out.name = name[1].replace(/\s+/g, " ").trim();

  // ⚠️ บนบัตรมีวันที่ถึงสามชุด — เกิด / ออกบัตร / หมดอายุ
  //    คว้าอันแรกที่เจอ = ได้วันผิดแบบเงียบ ๆ แล้วอายุก็ผิดตาม
  //    เจอของจริง 25 ส.ค. 2569: บัตรเขียน 2 พ.ค. 2512 แต่ระบบกรอก 10 เมษายน 2503
  //    ⇒ ต้องผูกกับป้าย "เกิดวันที่" หรือบรรทัดภาษาอังกฤษเท่านั้น
  const birth = birthFrom(text);
  if (birth) out.birth = birth;
  else out.unsure.push("birth");

  // ที่อยู่ — ตัวเล็กที่สุดบนบัตร อ่านพลาดบ่อยที่สุด ให้ตรวจเสมอ
  // ⚠️ ที่อยู่บนบัตรตัดขึ้นบรรทัดใหม่กลางคัน จังหวัดมักตกไปอยู่บรรทัดถัดไป
  //    (ของจริง: "ที่อยู่ 82 หมู่ที่ 11 ต.ค่ายบกหวาน อ.เมืองหนองคาย" / "จ.หนองคาย")
  //    ⇒ ต้องกินสองบรรทัด ไม่งั้นได้ที่อยู่ที่ไม่มีจังหวัด
  const addr = /(?:บ้านเลขที่|ที่อยู่)\s*([^\n]{4,90}(?:\n[^\n]{0,60})?)/.exec(text);
  if (addr) {
    out.address = addr[1].replace(/\s+/g, " ").trim();
    out.unsure.push("address");
  }

  // อ่านชื่อไม่ได้ = ให้กรอกเอง จะได้ไม่ต้องเดา
  if (!out.name) out.unsure.push("name");
  return out;
}

// ---------------------------------------------------------------------------
// แยกที่อยู่บนบัตรออกเป็นช่อง ๆ
//
// ⚠️ ที่อยู่บนบัตรเป็นข้อความก้อนเดียว แต่ฟอร์ม ลซ.1 ต้องกรอกแยก 6 ช่อง
//    ถ้าไม่แยกให้ ลูกค้าต้องพิมพ์เองทั้งหมด ซึ่งขัดกับที่เจ้าของร้านสั่งว่า "เน้นสะดวกล้วน"
//
// ⚠️ รูปแบบที่อยู่บนบัตรไม่ตายตัว เจอได้หลายแบบ
//      "123 หมู่ที่ 4 ต.บ้านใหม่ อ.เมือง จ.ขอนแก่น"
//      "99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร"
//      "45 ม.2 ต.หนองแคน อ.ดงหลวง จ.มุกดาหาร"
//    ⇒ จับด้วยคำนำหน้า ไม่ใช่ตำแหน่งในข้อความ
//
// ⚠️ กรุงเทพฯ ใช้ แขวง/เขต แทน ตำบล/อำเภอ และไม่มีคำว่า "จังหวัด" นำหน้า
//    ต้องดักเป็นกรณีพิเศษ ไม่งั้นคนกรุงเทพได้ช่องจังหวัดว่าง
// ---------------------------------------------------------------------------

export interface ThaiAddress {
  houseNo?: string;
  moo?: string;
  soi?: string;
  road?: string;
  tambon?: string;
  amphoe?: string;
  province?: string;
}

const pick = (re: RegExp, s: string) => {
  const m = re.exec(s);
  return m ? m[1].trim().replace(/[.,]+$/, "") : undefined;
};

export function parseThaiAddress(raw: string): ThaiAddress {
  // รวมบรรทัดเป็นก้อนเดียว ที่อยู่บนบัตรมักตัดขึ้นบรรทัดใหม่กลางคัน
  const s = raw.replace(/\s+/g, " ").trim();
  const out: ThaiAddress = {};

  // บ้านเลขที่ — ตัวเลขชุดแรก รองรับ 99/1 และ 99-1
  out.houseNo = pick(/(?:บ้านเลขที่|ที่อยู่)?\s*(\d+(?:[/-]\d+)?)/, s);

  out.moo = pick(/(?:หมู่ที่|หมู่|ม\.)\s*(\d+)/, s);
  out.soi = pick(/(?:ตรอก\/ซอย|ซอย|ซ\.)\s*([^\s]+)/, s);
  out.road = pick(/(?:ถนน|ถ\.)\s*([^\s]+)/, s);

  // ⚠️ ต้องลอง "ตำบล" เต็มก่อน "ต." เพราะ "ต." ไปตรงกับกลางคำอื่นได้
  // ⚠️ ห้ามใช้ \b กับอักษรไทย — JavaScript ไม่นับอักษรไทยเป็น word character
  //    /\bต\./ จึงไม่เคยตรงเลย และที่อยู่แบบย่อ (ต. อ. จ.) อ่านไม่ออกทั้งหมด
  //    เจอตอนทดสอบกับบัตรจริง 25 ส.ค. 2569 — ใช้ (^|\s) แทน
  out.tambon = pick(/(?:ตำบล|แขวง)\s*([ก-๛]+)/, s) || pick(/(?:^|\s)ต\.\s*([ก-๛]+)/, s);
  out.amphoe = pick(/(?:อำเภอ|เขต)\s*([ก-๛]+)/, s) || pick(/(?:^|\s)อ\.\s*([ก-๛]+)/, s);
  out.province = pick(/(?:จังหวัด)\s*([ก-๛]+)/, s) || pick(/(?:^|\s)จ\.\s*([ก-๛]+)/, s);

  // กรุงเทพฯ ไม่มีคำว่า "จังหวัด" นำหน้าบนบัตร
  if (!out.province && /กรุงเทพ/.test(s)) out.province = "กรุงเทพมหานคร";

  for (const k of Object.keys(out) as (keyof ThaiAddress)[]) {
    if (!out[k]) delete out[k];
  }
  return out;
}
