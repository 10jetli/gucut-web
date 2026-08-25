"use client";

// ขอทะเบียนเลื่อยยนต์ — /permit/
//
// ---------------------------------------------------------------------------
// ⚠️ เจ้าของร้านสั่งว่า "เน้นสะดวกล้วน" และ "ร้านไหนสะดวกร้านนั้นได้ขาย"
//    ⇒ ถ่ายบัตรเป็นทางหลัก ไม่ใช่ทางเลือก · พิมพ์เองเป็นทางสำรอง
//    ⇒ ห้ามมีขั้นตอนไหนบังคับให้ล็อกอิน ใส่เลขออเดอร์ หรือติดต่อร้านก่อน
//
// ⚠️ รูปบัตรกับข้อมูลทุกอย่างอยู่ในเครื่องลูกค้าเท่านั้น
//    ไม่มี fetch ไปหาเซิร์ฟเวอร์ร้านสักบรรทัดในไฟล์นี้ — ตั้งใจให้เป็นแบบนั้น
//    เลขประจำตัวประชาชนเป็นข้อมูลอ่อนไหวตาม PDPA เก็บไว้บนเซิร์ฟเวอร์ร้าน
//    คือรับความเสี่ยงฟรี ๆ โดยไม่ได้อะไรกลับมา
//
// ⚠️ ระบบนี้ช่วยกรอกกับพิมพ์เท่านั้น ไม่ได้ยื่นแทนลูกค้า และไม่รับประกันว่าจะได้อนุญาต
//    ต้องเขียนให้ชัดบนหน้าจอ ไม่งั้นลูกค้าที่ถูกปฏิเสธจะมาเอาเรื่องกับร้าน
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Lz1Document, { type Lz1Data } from "./Lz1Document";
import {
  ageFromBirth, formatThaiId, parseIdCard, parseThaiAddress, thaiDateLabel, validThaiId,
} from "@/lib/idcard";
import {
  BAR_SIZES, ENGINE_TYPE, EXEMPT_MODELS, PERMIT_MODELS, REGISTRAR_OFFICE,
  REQUIRED_DOCS, officeMapUrl,
} from "@/lib/permit";
import { findPostcode } from "@/lib/postcode";

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const KEY = "gucut-permit-draft";

const blank = (): Lz1Data => {
  const now = new Date();
  return {
    writtenAt: "", day: String(now.getDate()), month: TH_MONTHS[now.getMonth()],
    year: String(now.getFullYear() + 543),
    name: "", idNumber: "", nationality: "ไทย", ethnicity: "ไทย", birth: "", age: "",
    houseNo: "", moo: "", soi: "", road: "", tambon: "", amphoe: "", province: "",
    postcode: "", phone: "", email: "", occupation: "",
    saws: [], area: "", purpose: "", qualified: false,
    docs: { idCopy: true, house: true, job: false, jobDetail: false },
  };
};

export default function PermitView() {
  const [d, setD] = useState<Lz1Data>(blank);
  const [modelName, setModelName] = useState("");
  const [bar, setBar] = useState("");
  const [qty, setQty] = useState("1");
  const [unsure, setUnsure] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ⚠️ อ่านค่าที่เคยกรอกตั้งแต่ตอนสร้าง state ไม่ใช่ใน useEffect
  //    เคยพลาดแบบนี้มาแล้วกับแผ่นแชท — เอฟเฟกต์วิ่งก่อนค่าจะเปลี่ยน
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setD({ ...blank(), ...JSON.parse(raw) });
    } catch { /* เปิดไม่ได้ก็เริ่มใหม่ ไม่ต้องรบกวนลูกค้า */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* โหมดส่วนตัว */ }
  }, [d]);

  const set = (k: keyof Lz1Data, v: string) => setD((p) => ({ ...p, [k]: v }));

  // ⚠️ บัตรประชาชนไม่มีรหัสไปรษณีย์ แต่ฟอร์มมีช่องให้กรอก — เติมให้จากตำบล/อำเภอ/จังหวัด
  //    เติมเฉพาะตอนช่องยังว่าง ห้ามทับค่าที่ลูกค้าแก้เอง
  //    (ชื่อตำบลที่กล้องอ่านมาอาจสะกดเพี้ยนแล้วได้รหัสผิด ลูกค้าต้องแก้ทับได้เสมอ)
  useEffect(() => {
    if (d.postcode || !d.province || !d.amphoe) return;
    const code = findPostcode(d.province, d.amphoe, d.tambon);
    if (code) setD((p) => (p.postcode ? p : { ...p, postcode: code }));
  }, [d.province, d.amphoe, d.tambon, d.postcode]);

  const picked = useMemo(
    () => PERMIT_MODELS.find((m) => m.model === modelName),
    [modelName],
  );
  const exempt = useMemo(
    () => EXEMPT_MODELS.find((m) => m.model === modelName),
    [modelName],
  );

  // รวมรุ่นที่เลือกเข้าเป็นรายการเลื่อยในคำขอ
  useEffect(() => {
    if (!picked) { setD((p) => ({ ...p, saws: [] })); return; }
    setD((p) => ({
      ...p,
      saws: [{
        engine: ENGINE_TYPE, brand: picked.brand, model: picked.model,
        hp: picked.hp !== null ? String(picked.hp) : "",
        bar, qty: qty || "1",
      }],
    }));
  }, [picked, bar, qty]);

  // ---------------------------------------------------------------- ถ่ายบัตร
  const readCard = useCallback(async (file: File) => {
    setBusy("กำลังเปิดตัวอ่าน…");
    try {
      // ⚠️ โหลดตอนกดปุ่มเท่านั้น ไฟล์รวม 5.7 MB
      //    คนที่กรอกเองไม่ควรต้องจ่ายค่าเน็ตส่วนนี้
      const w = window as unknown as { Tesseract?: { createWorker: (...a: unknown[]) => Promise<unknown> } };
      if (!w.Tesseract) {
        await new Promise<void>((ok, no) => {
          const s = document.createElement("script");
          s.src = "/ocr/tesseract.min.js";
          s.onload = () => ok();
          s.onerror = () => no(new Error("โหลดตัวอ่านไม่ได้"));
          document.head.appendChild(s);
        });
      }
      setBusy("กำลังอ่านบัตร… (ครั้งแรกใช้เวลาสักครู่)");
      const T = (window as unknown as { Tesseract: {
        createWorker: (lang: string, oem?: number, opts?: unknown) => Promise<{
          recognize: (i: File) => Promise<{ data: { text: string } }>;
          terminate: () => Promise<void>;
        }>;
      } }).Tesseract;
      const worker = await T.createWorker("tha", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core.js",
        langPath: "/ocr",
      });
      const { data } = await worker.recognize(file);
      await worker.terminate();

      const got = parseIdCard(data.text);
      // ⚠️ ต้องแยกที่อยู่เป็นช่อง ๆ ด้วย ไม่ใช่อ่านมาแล้วทิ้ง
      //    เคยพลาดมาแล้ว 25 ส.ค. 2569 — อ่านที่อยู่ได้แต่ไม่ได้ต่อสายเข้าฟอร์ม
      //    ลูกค้าจึงเห็นช่องที่อยู่ว่างทั้งหมดทั้งที่กล้องอ่านออก
      const a = parseThaiAddress(got.address || "");
      setD((p) => ({
        ...p,
        name: got.name || p.name,
        idNumber: got.idNumber || p.idNumber,
        birth: got.birth ? thaiDateLabel(got.birth) : p.birth,
        age: got.birth ? String(ageFromBirth(got.birth) ?? "") : p.age,
        houseNo: a.houseNo || p.houseNo,
        moo: a.moo || p.moo,
        soi: a.soi || p.soi,
        road: a.road || p.road,
        tambon: a.tambon || p.tambon,
        amphoe: a.amphoe || p.amphoe,
        province: a.province || p.province,
      }));
      // ที่อยู่อ่านพลาดบ่อยที่สุด ให้ไฮไลต์ทุกช่องที่มาจากบัตรเสมอ
      const addrKeys = Object.keys(a).filter((k) => k !== "houseNo" && k !== "moo");
      setUnsure([...got.unsure.filter((u) => u !== "address"), ...addrKeys]);
      const n = [got.name, got.idNumber, got.birth, a.province].filter(Boolean).length;
      setBusy(
        n === 0
          ? "อ่านไม่ออก ลองถ่ายใหม่ให้ชัดขึ้น หรือกรอกเองด้านล่างได้เลย"
          : `อ่านได้ ${n} จาก 4 ส่วนหลัก — ช่วยตรวจข้อมูลด้านล่างก่อนพิมพ์`,
      );
    } catch (e) {
      setBusy("อ่านบัตรไม่สำเร็จ — กรอกเองด้านล่างได้เลย (" + (e as Error).message + ")");
    }
  }, []);

  const idOk = validThaiId(d.idNumber);
  const canPrint = Boolean(d.name && idOk && d.province && picked && d.qualified);

  const field = (k: keyof Lz1Data, label: string, extra?: { wide?: boolean; type?: string }) => (
    <label className={extra?.wide ? "col-span-2" : ""}>
      <span className="mb-1 block text-[12px] text-ink-300">{label}</span>
      <input
        type={extra?.type || "text"}
        value={String(d[k] ?? "")}
        onChange={(e) => set(k, e.target.value)}
        className={
          "w-full rounded-sm border px-3 py-2 text-[14px] outline-none focus:border-safety " +
          (unsure.includes(k as string) ? "border-[#e0a800] bg-[#fffbe6]" : "border-steel-600")
        }
      />
    </label>
  );

  return (
    <>
      <main className="lz-noprint mx-auto max-w-2xl px-4 pb-24 pt-4">
        <h1 className="font-heading text-[22px] font-bold text-ink">ขอทะเบียนเลื่อยยนต์</h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-700">
          กรอกแบบ <b>ลซ.1</b> (คำขอรับใบอนุญาตให้มีเลื่อยโซ่ยนต์) ให้เสร็จในหน้าเดียว
          แล้วพิมพ์ไปยื่นที่{REGISTRAR_OFFICE}ได้เลย — ใช้ฟรี ไม่ต้องซื้อของกับร้านก่อน
        </p>

        {/* ⚠️ ต้องขึ้นก่อนที่ลูกค้าจะเริ่มกรอก ไม่ใช่ซ่อนไว้ท้ายหน้า */}
        <p className="mt-3 rounded-sm bg-steel-900 p-3 text-[12px] leading-relaxed text-ink-700">
          <b>รูปบัตรและข้อมูลของคุณอยู่ในเครื่องคุณเท่านั้น</b> —
          อ่านในเครื่อง กรอกในเครื่อง พิมพ์จากเครื่อง ทางร้านไม่เห็นและไม่เก็บอะไรทั้งสิ้น
          <span className="mt-1.5 block">
            ทางร้านช่วยกรอกและพิมพ์ให้เท่านั้น <b>ไม่ได้ยื่นแทน</b> และ
            <b>ไม่รับประกันว่าจะได้รับอนุญาต</b> — ผู้ขออนุญาตคือตัวคุณเอง
          </span>
        </p>

        {/* ------------------------------------------------ 1. เลือกรุ่น */}
        <h2 className="mt-5 text-[15px] font-bold text-ink">๑. เลื่อยรุ่นอะไร</h2>
        <select
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          className="mt-2 w-full rounded-sm border border-steel-600 px-3 py-2.5 text-[14px]"
        >
          <option value="">— เลือกรุ่น —</option>
          <optgroup label="ต้องขอใบอนุญาต">
            {PERMIT_MODELS.map((m) => (
              <option key={m.model} value={m.model}>{m.brand} {m.model}</option>
            ))}
          </optgroup>
          <optgroup label="ไม่ต้องขอใบอนุญาต">
            {EXEMPT_MODELS.map((m) => (
              <option key={m.model} value={m.model}>{m.brand} {m.model}</option>
            ))}
          </optgroup>
        </select>

        {exempt && (
          <div className="mt-2 rounded-sm bg-[#e8f5ea] p-3.5">
            <p className="text-[14px] font-bold text-[#1f7a3d]">
              รุ่นนี้ไม่ต้องขอใบอนุญาต ซื้อแล้วใช้ได้เลย
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-700">
              ไม่ต้องกรอกอะไรต่อ ไม่ต้องไปสำนักงาน
              <span className="mt-1 block text-ink-300">
                (หมายถึงไม่ต้องขอใบอนุญาต &ldquo;ให้มีเลื่อยโซ่ยนต์&rdquo; เท่านั้น
                การใช้งานยังต้องทำตามกฎหมายอื่น เช่น ห้ามใช้ในเขตป่าสงวนโดยไม่ได้รับอนุญาต)
              </span>
            </p>
            <Link href="/categories/" className="mt-2 inline-block text-[13px] font-semibold text-safety underline">
              ดูเลื่อยรุ่นที่ไม่ต้องขอใบอนุญาต →
            </Link>
          </div>
        )}

        {picked && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label>
                <span className="mb-1 block text-[12px] text-ink-300">ขนาดบาร์ (เว้นว่างได้)</span>
                <select
                  value={bar}
                  onChange={(e) => setBar(e.target.value)}
                  className="w-full rounded-sm border border-steel-600 px-3 py-2 text-[14px]"
                >
                  <option value="">ไม่ระบุ (ซื้อแต่เครื่อง)</option>
                  {BAR_SIZES.map((b) => <option key={b} value={b}>{b} นิ้ว</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[12px] text-ink-300">จำนวนเครื่อง</span>
                <input
                  type="number" min={1} max={5} value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full rounded-sm border border-steel-600 px-3 py-2 text-[14px]"
                />
              </label>
            </div>
            {picked.hp === null && (
              <p className="mt-1 text-[12px] text-[#b26a00]">
                รุ่นนี้ยังไม่มีข้อมูลแรงม้าในระบบ — กรุณาถามทางร้านก่อนพิมพ์
              </p>
            )}

            {/* ------------------------------------------ 2. ถ่ายบัตร */}
            <h2 className="mt-6 text-[15px] font-bold text-ink">๒. ถ่ายบัตรประชาชน</h2>
            <p className="mt-1 text-[12.5px] text-ink-300">
              วางบัตรบนพื้นเรียบ แสงสว่าง ถ่ายให้เต็มกรอบและไม่เอียง
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void readCard(f); }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-2 w-full rounded-sm bg-safety py-3.5 text-[15px] font-bold text-white"
            >
              📷 ถ่ายบัตรประชาชน
            </button>
            {busy && (
              <p className="mt-2 rounded-sm bg-steel-900 p-2.5 text-[12.5px] text-ink-700">{busy}</p>
            )}

            {/* ------------------------------------------ 3. ตรวจ/กรอก */}
            <h2 className="mt-6 text-[15px] font-bold text-ink">๓. ตรวจข้อมูลให้ถูกต้อง</h2>
            <p className="mt-1 text-[12.5px] text-ink-300">
              ช่องพื้นเหลืองคือช่องที่ระบบไม่มั่นใจ ช่วยดูให้แน่ใจอีกที
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              {field("name", "ชื่อ-นามสกุล (มีคำนำหน้า)", { wide: true })}
              <label className="col-span-2">
                <span className="mb-1 block text-[12px] text-ink-300">เลขประจำตัวประชาชน</span>
                <input
                  inputMode="numeric"
                  value={formatThaiId(d.idNumber)}
                  onChange={(e) => set("idNumber", e.target.value.replace(/\D/g, "").slice(0, 13))}
                  className={
                    "w-full rounded-sm border px-3 py-2 text-[16px] tracking-wider outline-none " +
                    (d.idNumber.length === 13 && !idOk
                      ? "border-safety bg-safety-tint"
                      : unsure.includes("idNumber") ? "border-[#e0a800] bg-[#fffbe6]" : "border-steel-600")
                  }
                />
                {/* ⚠️ ผ่านการตรวจ = "รูปแบบถูก" ไม่ใช่ "เลขนี้มีอยู่จริง" ห้ามเขียนเกินกว่านี้ */}
                {d.idNumber.length === 13 && (
                  <span className={"mt-1 block text-[12px] " + (idOk ? "text-[#1f7a3d]" : "text-safety")}>
                    {idOk ? "รูปแบบเลขบัตรถูกต้อง" : "เลขบัตรไม่ถูกต้อง — ตรวจดูอีกครั้ง"}
                  </span>
                )}
              </label>
              {field("birth", "วัน เดือน ปี เกิด")}
              {field("age", "อายุ (ปี)")}
              {field("houseNo", "บ้านเลขที่")}
              {field("moo", "หมู่ที่")}
              {field("soi", "ตรอก/ซอย")}
              {field("road", "ถนน")}
              {field("tambon", "ตำบล/แขวง")}
              {field("amphoe", "อำเภอ/เขต")}
              {field("province", "จังหวัด")}
              {field("postcode", "รหัสไปรษณีย์")}
              {field("phone", "โทรศัพท์")}
              {field("email", "E-mail")}
              {field("occupation", "ประกอบอาชีพหรือกิจการ", { wide: true })}
              {field("area", "พื้นที่ที่จะใช้เลื่อย", { wide: true })}
              {field("purpose", "ใช้ทำอะไร", { wide: true })}
              {field("writtenAt", "เขียนคำขอที่ (ชื่อสถานที่)", { wide: true })}
            </div>

            {/* ------------------------------------------ 4. คำรับรอง */}
            <h2 className="mt-6 text-[15px] font-bold text-ink">๔. คำรับรองคุณสมบัติ</h2>
            {/* ⚠️ ห้ามติ๊กให้ล่วงหน้า — เป็นคำรับรองต่อนายทะเบียน
                ติ๊กแทนกันคือให้เขารับรองสิ่งที่ยังไม่ได้อ่าน */}
            <label className="mt-2 flex items-start gap-2.5 rounded-sm bg-white p-3">
              <input
                type="checkbox"
                checked={d.qualified}
                onChange={(e) => setD((p) => ({ ...p, qualified: e.target.checked }))}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#c42d00]"
              />
              <span className="text-[13px] leading-relaxed text-ink-700">
                ข้าพเจ้าอ่านคุณสมบัติทั้ง ๑๑ ข้อในแบบ ลซ.1 แล้ว และขอรับรองว่าข้าพเจ้ามีคุณสมบัติ
                และไม่มีลักษณะต้องห้ามตามที่ระบุไว้ทุกข้อ
                <Link href="/policy/license/" className="ml-1 text-safety underline">อ่านทั้ง ๑๑ ข้อ</Link>
              </span>
            </label>

            {/* ------------------------------------------ 5. พิมพ์ */}
            <h2 className="mt-6 text-[15px] font-bold text-ink">๕. พิมพ์แล้วนำไปยื่น</h2>
            <button
              onClick={() => window.print()}
              disabled={!canPrint}
              className="mt-2 w-full rounded-sm bg-ink py-3.5 text-[15px] font-bold text-white disabled:bg-steel-700 disabled:text-steel-300"
            >
              🖨️ พิมพ์แบบ ลซ.1
            </button>
            {!canPrint && (
              <p className="mt-1.5 text-[12px] text-ink-300">
                ต้องมี ชื่อ · เลขบัตรที่ถูกต้อง · จังหวัด · รุ่นเลื่อย และติ๊กคำรับรองก่อน
              </p>
            )}

            {d.province && (
              <a
                href={officeMapUrl(d.province)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block w-full rounded-sm border border-steel-600 bg-white py-3 text-center text-[14px] font-semibold text-ink"
              >
                📍 หาสำนักงานที่รับยื่นในจังหวัด{d.province}
              </a>
            )}

            <h3 className="mt-5 text-[14px] font-bold text-ink">เอกสารที่ต้องเตรียมไปด้วย</h3>
            <ul className="mt-1.5 space-y-1.5">
              {REQUIRED_DOCS.map((doc) => (
                <li key={doc.label} className="rounded-sm bg-white p-2.5 text-[13px] text-ink">
                  {doc.label}
                  <span className="mt-0.5 block text-[11.5px] text-ink-300">{doc.note}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      {/* เอกสารจริง — ซ่อนบนจอ โผล่เฉพาะตอนสั่งพิมพ์ */}
      <div className="lz-print-root hidden print:block">
        <Lz1Document d={d} />
      </div>
    </>
  );
}
