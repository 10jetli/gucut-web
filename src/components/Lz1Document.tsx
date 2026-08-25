"use client";

// แบบ ลซ.1 — คำขอรับใบอนุญาตให้มีเลื่อยโซ่ยนต์ (สร้างขึ้นใหม่เป็นเอกสารจริง)
//
// ---------------------------------------------------------------------------
// ⚠️ ทำไมไม่วางข้อความทับรูปสแกนของฟอร์มราชการ
//
//    ลองมาแล้วเมื่อ 25 ส.ค. 2569 — หาพิกัดช่องจากไฟล์ PDF ได้จริงและตรงด้วย
//    แต่พอวางข้อความจริงลงไปกลับพังหลายจุด:
//      · ช่อง "ประเภทเครื่องจักรกลต้นกำลัง" รับได้ราว 20 ตัวอักษร
//        แต่ข้อความที่ต้องกรอกยาว 45 ตัว → ทับช่องถัดไป
//      · เครื่องหมายถูก 11 ข้อเลื่อนสะสม เพราะข้อ 5.6 กินสามบรรทัด
//        ระยะห่างจึงไม่เท่ากันทุกข้อ หารเฉลี่ยไม่ได้
//      · ข้อความลอยเหนือเส้น เพราะเส้นฐานตัวอักษรไม่ตรงกับขอบล่างของป้าย
//
//    เจ้าของร้านยืนยันว่าแก้เอกสารให้สวยงามและเพิ่มจุดไข่ปลาได้
//    ⇒ สร้างเป็นเอกสารจริงจึงถูกกว่าทุกทาง: จุดไข่ปลายืดตามเนื้อหาเอง
//      ตัวหนังสือคมชัดตอนพิมพ์ (ไม่ใช่รูปสแกน) และไม่ต้องโหลดรูป 930 KB
//
// ✅ เจ้าหน้าที่รับเอกสารที่พิมพ์จากหน้านี้แล้ว (ยืนยัน 25 ส.ค. 2569)
//    ⇒ ห้ามเปลี่ยนกลับไปวางข้อความทับรูปสแกนของแบบราชการ
//      วิธีนี้ผ่านการใช้จริงแล้ว อย่ารื้อเพราะคิดว่า "ของจริงต้องเป็นแบบฟอร์มราชการ"
//
// ⚠️ ข้อความทุกบรรทัดคัดมาจากแบบ ลซ.1 ของจริง ห้ามแก้ถ้อยคำเอง
//    นี่คือคำขอที่ยื่นต่อนายทะเบียน เปลี่ยนคำ = เปลี่ยนความหมายทางกฎหมาย
//    ที่แก้ได้คือ "รูปแบบการจัดหน้า" เท่านั้น
//
// ⚠️ เลขทุกตัวต้องเป็นเลขไทย ตามใบที่ยื่นผ่านแล้ว (๕.๕ · ๒๘ · ๘๘๐๐)
//    แต่อักษรโรมันคงไว้ (NEWWAVE / SUPER-S)
// ---------------------------------------------------------------------------

import { QUALIFICATIONS, thaiDigits } from "@/lib/permit";

export interface Lz1Data {
  writtenAt: string;
  day: string;
  month: string;
  year: string;
  name: string;
  idNumber: string;
  nationality: string;
  ethnicity: string;
  birth: string;
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
  occupation: string;
  /** เลื่อยที่ขออนุญาต — ขอได้ทีเดียวหลายรุ่น */
  saws: { engine: string; brand: string; model: string; hp: string; bar: string; qty: string }[];
  area: string;
  purpose: string;
  /** ติ๊กรับรองคุณสมบัติครบทุกข้อหรือยัง */
  qualified: boolean;
  docs: { idCopy: boolean; house: boolean; job: boolean; jobDetail: boolean };
}

/** ช่องกรอกแบบเส้นจุดไข่ปลา — ยืดตามเนื้อหา ไม่มีวันล้น */
function Fill({ v, w, grow }: { v?: string; w?: string; grow?: boolean }) {
  return (
    <span
      className={"lz-fill" + (grow ? " lz-grow" : "")}
      style={w && !grow ? { minWidth: w } : undefined}
    >
      {v || ""}
    </span>
  );
}

/** กล่องติ๊ก — เว้นว่างไว้ให้เขียนมือก็ได้ */
const Box = ({ on }: { on?: boolean }) => <span className="lz-box">{on ? "✓" : ""}</span>;

export default function Lz1Document({ d }: { d: Lz1Data }) {
  const t = thaiDigits;
  const idDigits = String(d.idNumber || "").replace(/\D/g, "").padEnd(13, " ").slice(0, 13);

  return (
    <div className="lz-doc">
      {/* ---------------------------------------------------- หน้า 1 */}
      <section className="lz-page">
        <div className="lz-corner">
          <div>เลขรับที่<Fill grow /></div>
          <div>วันที่<Fill grow /></div>
          <div>ลงชื่อ<Fill grow />ผู้รับคำขอ</div>
        </div>
        <div className="lz-code">ลซ.๑</div>

        <h1 className="lz-title">คำขอรับใบอนุญาตให้มีเลื่อยโซ่ยนต์</h1>

        <div className="lz-right">
          <div>เขียนที่<Fill v={d.writtenAt} w="46mm" /></div>
          <div>
            วันที่<Fill v={t(d.day)} w="14mm" />เดือน<Fill v={d.month} w="28mm" />
            พ.ศ.<Fill v={t(d.year)} w="18mm" />
          </div>
        </div>

        <p className="lz-ind">
          ข้าพเจ้า<Fill v={d.name} grow />
        </p>

        <p className="lz-ind2">
          <Box on /> เป็นบุคคลธรรมดา&ensp;เลขประจำตัวประชาชน&ensp;
          <span className="lz-id">
            {idDigits.split("").map((c, i) => (
              <span key={i} className="lz-idbox">{c.trim() ? t(c) : ""}</span>
            ))}
          </span>
        </p>

        <p className="lz-line">
          สัญชาติ<Fill v={d.nationality} w="26mm" />เชื้อชาติ<Fill v={d.ethnicity} w="26mm" />
          วัน เดือน ปี เกิด<Fill v={t(d.birth)} w="42mm" />อายุ<Fill v={t(d.age)} w="14mm" />ปี
        </p>
        <p className="lz-line">
          มีภูมิลำเนาอยู่บ้านเลขที่<Fill v={t(d.houseNo)} w="20mm" />หมู่ที่<Fill v={t(d.moo)} w="16mm" />
          ตรอก/ซอย<Fill v={d.soi} w="32mm" />ถนน<Fill v={d.road} grow />
        </p>
        <p className="lz-line">
          ตำบล/แขวง<Fill v={d.tambon} w="40mm" />อำเภอ/เขต<Fill v={d.amphoe} w="40mm" />
          จังหวัด<Fill v={d.province} grow />
        </p>
        <p className="lz-line">
          รหัสไปรษณีย์<Fill v={t(d.postcode)} w="24mm" />หมายเลขโทรศัพท์<Fill v={t(d.phone)} w="38mm" />
          หมายเลขโทรสาร<Fill grow />
        </p>
        <p className="lz-line">E-mail<Fill v={d.email} grow /></p>
        <p className="lz-line">ประกอบอาชีพหรือกิจการ<Fill v={d.occupation} grow /></p>

        <p className="lz-ind2 lz-mt">
          <Box /> เป็นนิติบุคคลประเภท<Fill grow />
        </p>
        <p className="lz-note">
          (ผู้ขอที่เป็นนิติบุคคลกรอกส่วนนี้ด้วยลายมือ — ระบบนี้ช่วยเฉพาะบุคคลธรรมดา)
        </p>
      </section>

      {/* ---------------------------------------------------- หน้า 2 */}
      <section className="lz-page">
        <div className="lz-code">ลซ.๑</div>
        <div className="lz-pageno">- ๒ -</div>

        <h2 className="lz-h2">ขอยื่นต่อนายทะเบียนเลื่อยโซ่ยนต์มีข้อความดังต่อไปนี้</h2>

        <p className="lz-item">๑. ข้าพเจ้ามีความประสงค์ขออนุญาตมีเลื่อยโซ่ยนต์ในฐานะ</p>
        <p className="lz-sub"><Box on /> ๑.๑ บุคคลธรรมดา</p>
        <p className="lz-sub"><Box /> ๑.๒ นิติบุคคล</p>

        <p className="lz-item">
          ๒. จำนวนเลื่อยโซ่ยนต์ที่ขออนุญาตให้มี รวม
          <Fill v={t(String(d.saws.reduce((s, x) => s + (Number(x.qty) || 0), 0) || ""))} w="18mm" />
          เครื่อง มีรายละเอียดดังนี้
        </p>

        {/* ⚠️ ฟอร์มจริงมี ๕ ช่อง — คงไว้ครบเสมอ ช่องที่ไม่ได้ใช้เว้นว่าง
            ตัดช่องที่ว่างทิ้ง = เอกสารไม่ตรงกับแบบราชการ */}
        {Array.from({ length: 5 }, (_, i) => {
          const s = d.saws[i];
          const engine = s ? `${s.engine} ยี่ห้อ/รุ่น ${s.brand}/${t(s.model)}` : "";
          return (
            <div key={i}>
              <p className="lz-sub">
                ๒.{t(String(i + 1))} ประเภทเครื่องจักรกลต้นกำลัง<Fill v={engine} grow />
              </p>
              <p className="lz-sub2">
                กำลังเครื่องจักรกล<Fill v={s ? t(s.hp) : ""} w="22mm" />แรงม้า&ensp;
                แผ่นบังคับโซ่ความยาว<Fill v={s?.bar ? t(s.bar) : ""} w="20mm" />นิ้ว&ensp;
                จำนวน<Fill v={s ? t(s.qty) : ""} w="18mm" />เครื่อง
              </p>
            </div>
          );
        })}

        <p className="lz-item">
          ๓. พื้นที่ที่จะขออนุญาตมีเลื่อยโซ่ยนต์<Fill v={d.area} grow />
        </p>
        <p className="lz-item">
          ๔. โดยมีวัตถุประสงค์หรือประเภทของกิจการที่ต้องใช้เลื่อยโซ่ยนต์ ดังนี้<Fill v={d.purpose} grow />
        </p>

        <p className="lz-item">๕. ข้าพเจ้าขอรับรองว่ามีคุณสมบัติและไม่มีลักษณะต้องห้าม ดังนี้</p>
        {QUALIFICATIONS.map((q, i) => (
          <p key={i} className="lz-sub lz-qual">
            <Box on={d.qualified} /> ๕.{t(String(i + 1))} {q}
          </p>
        ))}
      </section>

      {/* ---------------------------------------------------- หน้า 3 */}
      <section className="lz-page">
        <div className="lz-code">ลซ.๑</div>
        <div className="lz-pageno">- ๓ -</div>

        <p className="lz-item">๖. พร้อมคำขอนี้ข้าพเจ้าได้แนบหลักฐานที่เกี่ยวข้องมา ดังนี้</p>
        <p className="lz-sub"><Box on /> ๖.๑ บุคคลธรรมดา</p>
        <p className="lz-sub2"><Box on={d.docs.idCopy} /> (๑) สำเนาบัตรประจำตัว</p>
        <p className="lz-sub2"><Box on={d.docs.house} /> (๒) สำเนาทะเบียนบ้าน</p>
        <p className="lz-sub2"><Box on={d.docs.job} /> (๓) หลักฐานประกอบอาชีพ (ถ้ามี)</p>
        <p className="lz-sub2">
          <Box on={d.docs.jobDetail} /> (๔) หลักฐานที่แสดงรายละเอียดเกี่ยวกับอาชีพหรือกิจการที่ต้องใช้เลื่อยโซ่ยนต์ (ถ้ามี)
        </p>
        <p className="lz-sub"><Box /> ๖.๒ นิติบุคคล</p>
        <p className="lz-sub"><Box /> ๖.๓ ผู้รับมอบอำนาจให้ดำเนินการแทน</p>
        <p className="lz-sub"><Box /> ๖.๔ เอกสารหรือหลักฐานอื่น ๆ ตามที่ทางราชการแจ้งให้นำส่ง</p>

        <div className="lz-sign">
          <p>(ลงชื่อ)<Fill w="52mm" />ผู้ขอ</p>
          <p className="lz-signname">(<Fill v={d.name} w="52mm" />)</p>
        </div>

        <p className="lz-note lz-mt">
          ⚠️ เซ็นชื่อด้วยปากกาหมึกดำหรือน้ำเงินก่อนนำไปยื่น — ส่วนของเจ้าหน้าที่อยู่ในแบบฟอร์ม
          ที่สำนักงาน ไม่ต้องกรอกเอง
        </p>
      </section>
    </div>
  );
}
