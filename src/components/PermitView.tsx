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

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Lz1Document, { type Lz1Data } from "./Lz1Document";
import MedCertDocument from "./MedCertDocument";
import {
  ageFromBirth, formatThaiId, parseIdCard, parseThaiAddress, thaiDateLabel, validThaiId,
} from "@/lib/idcard";
import {
  BAR_SIZES, ENGINE_TYPE, EXEMPT_MODELS, PERMIT_MODELS, PERMIT_STEPS,
  DOC_MAILING, PROCESS_STEPS, REGISTRAR_OFFICE, REQUIRED_DOCS, officeMapUrl, officeSiteUrl,
} from "@/lib/permit";
import { PROVINCES, findPostcode } from "@/lib/postcode";
import { lineShareUrl, makeShareLink, readShareLink } from "@/lib/permit-link";
import SAW_IMG from "@/data/permit-saws.json";

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

/**
 * ลูกศรที่มีรถวิ่ง — ช่วง "ถือกระดาษไปยื่นเอง"
 *
 * ⚠️ ใช้ CSS ล้วน ไม่โหลดรูปหรือไลบรารีเพิ่ม
 * ⚠️ เคารพ prefers-reduced-motion — บางคนเวียนหัวกับของที่ขยับ
 *    และ iOS ปิดอนิเมชันให้ทั้งเครื่องได้ ต้องยังอ่านรู้เรื่องตอนไม่ขยับ
 */
function TruckArrow() {
  return (
    <span className="relative flex w-8 shrink-0 items-center justify-center self-center">
      <span className="absolute inset-x-0 top-1/2 h-px bg-[#1f7a3d]/40" />
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="permit-truck relative h-4 w-4 fill-none stroke-[#1f7a3d] stroke-[1.8]"
      >
        <path d="M1 6h11v9H1z" strokeLinejoin="round" />
        <path d="M12 9h4.5l2.5 3v3H12z" strokeLinejoin="round" />
        <circle cx="5" cy="17.5" r="1.8" />
        <circle cx="16" cy="17.5" r="1.8" />
      </svg>
    </span>
  );
}

export default function PermitView() {
  const [d, setD] = useState<Lz1Data>(blank);
  const [modelName, setModelName] = useState("");
  const [bar, setBar] = useState("");
  const [qty, setQty] = useState("1");
  const [unsure, setUnsure] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  // ⚠️ "ปริ้นแล้ว" ต้องจำข้ามการปิดหน้า ลูกค้าปริ้นวันนี้แล้วไปยื่นพรุ่งนี้เป็นเรื่องปกติ
  //    กลับมาเปิดแล้วเห็นแผนภาพย้อนกลับไปขั้นแรก = สับสนว่าตัวเองทำถึงไหนแล้ว
  const [printed, setPrinted] = useState(false);
  // ⚠️ จังหวัดที่ยื่น = จังหวัด "ที่จะใช้เลื่อย" ไม่ใช่จังหวัดตามทะเบียนบ้าน
  //    คนทำงานต่างจังหวัดพลาดข้อนี้แล้วเสียเที่ยวทั้งวัน
  //    ตั้งค่าเริ่มต้นเป็นจังหวัดตามบัตรเพราะส่วนใหญ่ตรงกัน แต่ต้องแก้ได้
  const [useProvince, setUseProvince] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ⚠️ อ่านค่าที่เคยกรอกตั้งแต่ตอนสร้าง state ไม่ใช่ใน useEffect
  //    เคยพลาดแบบนี้มาแล้วกับแผ่นแชท — เอฟเฟกต์วิ่งก่อนค่าจะเปลี่ยน
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setD({ ...blank(), ...JSON.parse(raw) });
      setPrinted(localStorage.getItem(KEY + "-printed") === "1");
      setUseProvince(localStorage.getItem(KEY + "-useprov") || "");
      // ⚠️ ลิงก์ที่ถูกส่งมาต้องชนะค่าที่เก็บไว้ในเครื่อง
      //    คนที่เปิดลิงก์คือคนที่ "ช่วยพิมพ์ให้" ไม่ใช่เจ้าของข้อมูล
      //    ถ้าเอาค่าในเครื่องตัวเองมาทับ จะพิมพ์ได้เอกสารของคนอื่นผิดคน
      const shared = readShareLink<{ d: Lz1Data; m: string; b: string; q: string }>();
      if (shared?.d) {
        setD({ ...blank(), ...shared.d });
        if (shared.m) setModelName(shared.m);
        if (shared.b) setBar(shared.b);
        if (shared.q) setQty(shared.q);
      }
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

        {/*
          ⚠️ แผนภาพสามใบต้องอยู่บนสุด ก่อนช่องกรอกทุกช่อง
             ลูกค้าที่ไม่รู้ว่า "กรอกใบนี้แล้วยังไงต่อ" จะกลัวว่าทำผิดขั้นตอนแล้วเลิกกลางคัน
             ทั้งที่จริงกรอกใบเดียวก็จบหน้าที่ของตัวเองแล้ว (มาจากภาพร่างของเจ้าของร้าน)
          ⚠️ ห้ามเขียนว่าร้านจะทำขั้น ลซ.2 / ลซ.3 ให้ — เจ้าหน้าที่เป็นคนออก ร้านไม่เกี่ยว
        */}
        <div className="mt-4 rounded-sm bg-white p-3.5">
          <p className="text-[13px] font-bold text-ink">ขอทะเบียนเลื่อยยนต์มี ๓ ใบ</p>
          <div className="mt-2.5 flex items-stretch gap-1.5">
            {PERMIT_STEPS.map((st, i) => {
              // ปริ้นแล้ว = ใบแรกเสร็จ ตัวไฮไลต์ขยับไปใบที่สอง
              const done = printed && st.tone === "now";
              const active = printed ? st.tone === "next" : st.tone === "now";
              return (
              <div key={st.code} className="flex min-w-0 flex-1 items-stretch gap-1.5">
                <div
                  className={
                    "min-w-0 flex-1 rounded-sm p-2 text-center " +
                    (active ? "bg-[#e8f5ea] ring-1 ring-[#1f7a3d]" : "bg-steel-900")
                  }
                >
                  <span
                    className={
                      "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold " +
                      (done
                        ? "bg-[#1f7a3d] text-white"
                        : active
                          ? "bg-[#1f7a3d] text-white"
                          : st.tone === "next"
                            ? "bg-safety text-white"
                            : "bg-ink text-white")
                    }
                  >
                    {done ? "✓" : st.code.replace("ลซ.", "")}
                  </span>
                  <span className="mt-1.5 block text-[11px] font-semibold leading-tight text-ink">
                    {st.code}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-tight text-ink-300">
                    {st.title.replace("ให้มีเลื่อยโซ่ยนต์", "")}
                  </span>
                </div>
                {/* ⚠️ รถขึ้นเฉพาะช่องแรกและเฉพาะหลังปริ้นแล้ว
                    เพราะช่วงนี้คือ "ลูกค้าถือกระดาษไปยื่นเอง" ตามภาพร่างของเจ้าของร้าน
                    ขึ้นตั้งแต่แรกจะกลายเป็นบอกให้ไปก่อนที่จะมีอะไรถือไป */}
                {i === 0 && printed && <TruckArrow />}
                {i === 0 && !printed && (
                  <span className="self-center text-[15px] text-ink-300">→</span>
                )}
                {i === 1 && (
                  <span className="self-center text-[15px] text-ink-300">→</span>
                )}
              </div>
              );
            })}
          </div>
          <ul className="mt-2.5 space-y-1">
            {PERMIT_STEPS.map((st) => (
              <li key={st.code} className="text-[11.5px] leading-relaxed text-ink-700">
                <b className={st.tone === "now" ? "text-[#1f7a3d]" : "text-ink"}>{st.code}</b>{" "}
                {st.title} — {st.who}
              </li>
            ))}
          </ul>
          {/*
            ⚠️ ต้องบอกให้ครบทั้ง 8 ขั้น ไม่ใช่แค่ "กรอก → ยื่น → จบ"
               ของจริงต้องไปสำนักงาน 2 รอบ และมีร้านอยู่ตรงกลาง
               ลูกค้าที่ไปรอบแรกแล้วคิดว่าจบ พอไม่มีใบอนุญาตมาก็จะมาโวยร้าน
          */}
          <details className="mt-2.5 rounded-sm bg-steel-900 p-2.5">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-ink">
              ดูขั้นตอนทั้งหมด ๘ ขั้น (ต้องไปสำนักงาน ๒ รอบ)
            </summary>
            <ol className="mt-2 space-y-2">
              {PROCESS_STEPS.map((st) => (
                <li key={st.n} className="flex gap-2">
                  <span
                    className={
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white " +
                      (st.by === "คุณ" ? "bg-[#1f7a3d]" : st.by === "ร้าน" ? "bg-safety" : "bg-steel-600")
                    }
                  >
                    {st.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium leading-snug text-ink">
                      {st.title}
                      <span className="ml-1 text-[10.5px] font-normal text-ink-300">({st.by}ทำ)</span>
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-300">
                      {st.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </details>

          {/* ⚠️ เรื่องนี้ต้องเห็นโดยไม่ต้องกดเปิด — ลูกค้าเข้าใจผิดกันบ่อยที่สุด */}
          {/* ⚠️ ต้องบอกตั้งแต่ต้น ก่อนลูกค้าลงแรงกรอกทั้งหน้า
              ขั้นที่ ๕ ต้องส่ง ลซ.๒ ให้ "ร้านที่ขาย" เก็บเป็นหลักฐานการจำหน่าย
              คนที่ซื้อจากร้านอื่นจะไปตันตรงนั้น ถ้าไม่บอกก่อนคือปล่อยให้เสียเวลาฟรี */}
          <p className="mt-2 rounded-sm bg-steel-900 p-2.5 text-[12px] leading-relaxed text-ink-700">
            หน้านี้สำหรับคนที่<b className="text-ink">ซื้อเลื่อย NEWWAVE หรือ KINGKONG จากร้านนี้</b> —
            เพราะขั้นตอนที่ ๕ ต้องส่งใบ ลซ.๒ ให้ร้านที่ขายเก็บไว้เป็นหลักฐานการจำหน่าย
            <span className="mt-1 block text-ink-300">
              ถ้าซื้อจากร้านอื่น ยังใช้หน้านี้กรอกและพิมพ์แบบ ลซ.๑ ได้ตามปกติ
              แต่ตอนส่งใบ ลซ.๒ ต้องส่งให้ร้านที่คุณซื้อมา ไม่ใช่ส่งมาที่นี่
            </span>
          </p>

          <p className="mt-2 rounded-sm bg-safety-tint p-2.5 text-[12px] leading-relaxed text-ink">
            <b>ต้องขออนุญาตก่อน ร้านถึงส่งเครื่องให้ได้</b> —
            รุ่นที่ต้องขอทะเบียนซื้อแล้วหิ้วกลับบ้านเลยไม่ได้ตามกฎหมาย
            และต้องยื่นที่จังหวัด<b>ที่จะเอาเลื่อยไปใช้</b> ไม่ใช่จังหวัดตามทะเบียนบ้าน
          </p>

          {printed ? (
            <p className="mt-2 rounded-sm bg-[#e8f5ea] p-2.5 text-[12px] leading-relaxed text-ink-700">
              <b className="text-[#1f7a3d]">ใบแรกเสร็จแล้ว</b> —
              ขั้นต่อไปคือถือเอกสารไปยื่นที่{REGISTRAR_OFFICE}
              พร้อมสำเนาบัตรประชาชนและสำเนาทะเบียนบ้าน
            </p>
          ) : (
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-300">
              หน้านี้ช่วยคุณทำ <b className="text-[#1f7a3d]">ใบแรก</b> ให้เสร็จ
              ส่วนอีกสองใบเป็นหน้าที่ของเจ้าหน้าที่หลังคุณยื่นคำขอแล้ว
            </p>
          )}
        </div>

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
            {/* ⚠️ มาจากภาพร่างที่วาดรูปเลื่อยไว้ — ลูกค้าต้องเห็นว่าเลือกถูกตัวก่อนกรอกยาว
                และเห็นเลย ว่าค่าอะไรจะถูกกรอกลงฟอร์มแทนเขา ไม่ใช่กรอกให้เงียบ ๆ */}
            <div className="mt-2 flex items-center gap-3 rounded-sm bg-white p-3">
              {SAW_IMG[picked.model as keyof typeof SAW_IMG]?.img && (
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-sm bg-steel-900">
                  <Image
                    src={SAW_IMG[picked.model as keyof typeof SAW_IMG].img as string}
                    alt={`${picked.brand} ${picked.model}`}
                    fill
                    sizes="80px"
                    className="object-contain"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-ink">{picked.brand} {picked.model}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-300">
                  ระบบจะกรอกให้: {ENGINE_TYPE}
                  {picked.hp !== null && <> · {picked.hp} แรงม้า</>}
                  {bar && <> · บาร์ {bar} นิ้ว</>}
                </p>
                {SAW_IMG[picked.model as keyof typeof SAW_IMG]?.handle && (
                  <Link
                    href={`/products/${SAW_IMG[picked.model as keyof typeof SAW_IMG].handle}/`}
                    className="mt-1 inline-block text-[12px] font-semibold text-safety underline"
                  >
                    ดูหน้าสินค้า →
                  </Link>
                )}
              </div>
            </div>

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
              onClick={() => {
                window.print();
                setPrinted(true);
                try { localStorage.setItem(KEY + "-printed", "1"); } catch { /* โหมดส่วนตัว */ }
              }}
              disabled={!canPrint}
              className="mt-2 w-full rounded-sm bg-ink py-3.5 text-[15px] font-bold text-white disabled:bg-steel-700 disabled:text-steel-300"
            >
              🖨️ พิมพ์เอกสาร (ลซ.๑ + ใบให้แพทย์)
            </button>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
              ได้ ๔ แผ่น — แบบ ลซ.๑ สามแผ่น และใบรับรองแพทย์อีกหนึ่งแผ่น
              <b className="text-ink"> เอาใบรับรองแพทย์ไปให้หมอกรอกและเซ็นก่อน</b>
              แล้วค่อยเอาไปยื่นพร้อมกันทั้งชุด
            </p>
            {!canPrint && (
              <p className="mt-1.5 text-[12px] text-ink-300">
                ต้องมี ชื่อ · เลขบัตรที่ถูกต้อง · จังหวัด · รุ่นเลื่อย และติ๊กคำรับรองก่อน
              </p>
            )}

            {/* ⚠️ มาจากภาพร่าง: "สแกนเสร็จมีลิงค์ ส่งไป Line ได้ และปริ้นได้"
                ของจริงคือลูกค้ากรอกในมือถือแต่ไม่มีเครื่องปริ้น ต้องส่งให้คนอื่นช่วยพิมพ์ */}
            {canPrint && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={lineShareUrl(makeShareLink({ d, m: modelName, b: bar, q: qty }))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-sm bg-[#06C755] py-3 text-center text-[14px] font-semibold text-white"
                  >
                    ส่งไปไลน์
                  </a>
                  <button
                    onClick={() => {
                      const link = makeShareLink({ d, m: modelName, b: bar, q: qty });
                      void navigator.clipboard.writeText(link)
                        .then(() => setBusy("คัดลอกลิงก์แล้ว — เอาไปวางที่ไหนก็ได้"))
                        .catch(() => setBusy("คัดลอกไม่ได้ ลองใช้ปุ่มส่งไปไลน์แทน"));
                    }}
                    className="rounded-sm border border-steel-600 bg-white py-3 text-[14px] font-semibold text-ink"
                  >
                    คัดลอกลิงก์
                  </button>
                </div>
                {/* ⚠️ ต้องบอกตรง ๆ ก่อนลูกค้ากด ไม่ใช่ซ่อนไว้ในนโยบาย */}
                <p className="rounded-sm bg-[#fffbe6] p-2.5 text-[11.5px] leading-relaxed text-ink-700">
                  <b>ลิงก์นี้มีข้อมูลของคุณอยู่ข้างใน</b> รวมถึงเลขบัตรประชาชน —
                  ส่งให้เฉพาะคนที่จะช่วยพิมพ์ให้เท่านั้น ใครได้ลิงก์ไปก็เปิดดูได้
                  <span className="mt-1 block text-ink-300">
                    ข้อมูลไม่ได้ถูกเก็บไว้ที่ทางร้าน — มันเดินทางไปกับตัวลิงก์เอง
                  </span>
                </p>
              </div>
            )}

            <label className="mt-3 block">
              <span className="mb-1 block text-[12px] text-ink-300">
                จังหวัดที่จะเอาเลื่อยไปใช้ (จังหวัดที่ต้องไปยื่น)
              </span>
              <select
                value={useProvince || d.province}
                onChange={(e) => {
                  setUseProvince(e.target.value);
                  try { localStorage.setItem(KEY + "-useprov", e.target.value); } catch { /* โหมดส่วนตัว */ }
                }}
                className="w-full rounded-sm border border-steel-600 px-3 py-2.5 text-[14px]"
              >
                <option value="">— เลือกจังหวัด —</option>
                {PROVINCES.map((pv) => <option key={pv} value={pv}>{pv}</option>)}
              </select>
              {useProvince && d.province && useProvince !== d.province && (
                <span className="mt-1 block text-[11.5px] text-[#b26a00]">
                  ต่างจากจังหวัดในบัตร ({d.province}) — ถูกต้องแล้วถ้าคุณจะเอาเลื่อยไปใช้ที่{useProvince}
                </span>
              )}
            </label>

            {/* ⚠️ ให้เว็บทางการมาก่อนแผนที่ — เว็บ ทสจ. มีทั้งแผนที่ ที่อยู่ เบอร์
                และเวลาทำการที่หน่วยงานอัปเดตเอง แม่นกว่าและครบกว่าผลค้นหา
                แต่ 2 จังหวัดไม่มีเว็บในรูปแบบนี้ (ตรวจแล้ว) จึงต้องมีทางถอยกลับเสมอ */}
            {(useProvince || d.province) && (() => {
              const pv = useProvince || d.province;
              const site = officeSiteUrl(pv);
              return (
                <div className="mt-2 space-y-2">
                  {site && (
                    <a
                      href={site}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full rounded-sm bg-ink py-3 text-center text-[14px] font-semibold text-white"
                    >
                      🏛️ เว็บทางการ ทสจ.{pv} — มีแผนที่ ที่อยู่ และเบอร์โทร
                    </a>
                  )}
                  <a
                    href={officeMapUrl(pv)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-sm border border-steel-600 bg-white py-3 text-center text-[14px] font-semibold text-ink"
                  >
                    📍 เปิดแผนที่นำทางไป ทสจ.{pv}
                  </a>
                </div>
              );
            })()}

            {/* ⚠️ ขั้นนี้คนมักตกหล่น — ได้ ลซ.2 มาแล้วไม่รู้ว่าต้องส่งให้ร้าน
                แล้วรอเครื่องอยู่บ้านโดยที่ร้านก็รออยู่เหมือนกัน */}
            <h3 className="mt-6 text-[14px] font-bold text-ink">
              ได้ใบ ลซ.๒ มาแล้ว ส่งมาที่ร้าน
            </h3>
            <div className="mt-1.5 rounded-sm bg-white p-3">
              <p className="text-[13px] font-semibold text-ink">{DOC_MAILING.name}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-700">
                {DOC_MAILING.address}
              </p>
              <p className="mt-0.5 text-[13px] text-ink-700">โทร {DOC_MAILING.phone}</p>
              <button
                onClick={() => {
                  const txt = `${DOC_MAILING.name}\n${DOC_MAILING.address}\nโทร ${DOC_MAILING.phone}`;
                  void navigator.clipboard.writeText(txt)
                    .then(() => setBusy("คัดลอกที่อยู่แล้ว"))
                    .catch(() => setBusy("คัดลอกไม่ได้ ลองจดเองนะครับ"));
                }}
                className="mt-2 w-full rounded-sm border border-steel-600 py-2 text-[13px] font-semibold text-ink"
              >
                คัดลอกที่อยู่สำหรับจ่าหน้าซอง
              </button>
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-300">
                ส่งมาทั้ง ๒ ตอน — ร้านเก็บตอนกลางไว้เป็นหลักฐานการจำหน่าย
                แล้วส่งตอนปลายคืนพร้อมเลื่อยยนต์และเอกสารประกอบ
                <b className="mt-1 block text-ink-700">
                  เฉพาะคนที่ซื้อเลื่อยจากร้านนี้ — ซื้อจากร้านอื่นให้ส่งไปที่ร้านนั้น
                </b>
              </p>
            </div>

            {/* ⚠️ เจ้าของร้านยืนยันว่าไม่มีค่าธรรมเนียม (25 ส.ค. 2569)
                เขียนได้แค่ "ค่าขอใบอนุญาต" เท่านั้น ห้ามเหมารวมว่าไปแล้วไม่เสียอะไรเลย
                ค่าใบรับรองแพทย์กับค่าถ่ายเอกสารยังเป็นเงินที่ลูกค้าต้องจ่ายอยู่ */}
            <p className="mt-6 rounded-sm bg-[#e8f5ea] p-3 text-[13px] leading-relaxed text-ink">
              <b className="text-[#1f7a3d]">ขอใบอนุญาตไม่มีค่าธรรมเนียม</b> —
              ยื่นและรับใบอนุญาตไม่ต้องเสียเงินให้ทางราชการ
              <span className="mt-1 block text-[11.5px] text-ink-300">
                ที่ต้องจ่ายเองมีแค่ค่าใบรับรองแพทย์กับค่าถ่ายเอกสาร
              </span>
              {/* ⚠️ คนมักเตรียมรูปไปเผื่อเพราะเอกสารราชการอื่นขอกัน
                  บอกไปเลยว่าไม่ต้อง จะได้ไม่เสียเวลาไปถ่ายรูปก่อน */}
              <span className="mt-1 block text-[11.5px] text-ink-300">
                และไม่ต้องใช้รูปถ่าย ๑ นิ้วหรือ ๒ นิ้ว
              </span>
            </p>

            <h3 className="mt-6 text-[14px] font-bold text-ink">เอกสารที่ต้องเตรียมไปด้วย</h3>
            <ul className="mt-1.5 space-y-1.5">
              {REQUIRED_DOCS.map((doc) => (
                <li key={doc.label} className="rounded-sm bg-white p-2.5 text-[13px] text-ink">
                  {doc.label} <b className="text-safety">{doc.qty}</b>
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
        {/* ⚠️ พิมพ์มาพร้อมกันโดยตั้งใจ — แยกปุ่มแล้วลูกค้าจะลืมพิมพ์ใบหมอ
            แล้วไปเจอปัญหาที่สำนักงานตอนที่กลับไปเอาใหม่ไม่ทันแล้ว */}
        <MedCertDocument name={d.name} age={d.age} idNumber={d.idNumber} />
      </div>
    </>
  );
}
