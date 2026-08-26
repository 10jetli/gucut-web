"use client";

// ขอทะเบียนเลื่อยยนต์ — /permit/
//
// ---------------------------------------------------------------------------
// ⚠️ เจ้าของร้านสั่งว่า "เน้นสะดวกล้วน" และ "ร้านไหนสะดวกร้านนั้นได้ขาย"
//    ⇒ ถ่ายบัตรเป็นทางหลัก ไม่ใช่ทางเลือก · พิมพ์เองเป็นทางสำรอง
//    ⇒ ห้ามมีขั้นตอนไหนบังคับให้ล็อกอิน ใส่เลขออเดอร์ หรือติดต่อร้านก่อน
//
// ⚠️ "รูปบัตร" ถูกส่งออกจากเครื่องไปให้ AI อ่านแล้ว (เปลี่ยน 25 ส.ค. 2569)
//    เจ้าของร้านสั่งเอง — ตัวอ่านในเครื่องอ่านตัวหนังสือไทยจากรูปถ่ายไม่แม่นพอ
//    ⇒ ต้องเขียนบอกลูกค้าบนหน้าจอตรง ๆ ก่อนกดถ่าย ห้ามซ่อน
//    ⇒ ส่งไปอ่านอย่างเดียว ไม่เก็บที่ไหน (ดู netlify/functions/read-id.mjs)
//
// ⚠️ "ข้อมูลที่กรอกในฟอร์ม" ยังอยู่ในเครื่องล้วน ไม่มีการส่งไปเซิร์ฟเวอร์ร้าน
//    เลขประจำตัวประชาชนเป็นข้อมูลอ่อนไหวตาม PDPA เก็บไว้บนเซิร์ฟเวอร์ร้าน
//    คือรับความเสี่ยงฟรี ๆ โดยไม่ได้อะไรกลับมา
//    ห้ามเผลอเอาข้อมูลฟอร์มยัดเข้า /api/ ตัวไหน
//
// ⚠️ ระบบนี้ช่วยกรอกกับพิมพ์เท่านั้น ไม่ได้ยื่นแทนลูกค้า และไม่รับประกันว่าจะได้อนุญาต
//    ต้องเขียนให้ชัดบนหน้าจอ ไม่งั้นลูกค้าที่ถูกปฏิเสธจะมาเอาเรื่องกับร้าน
// ---------------------------------------------------------------------------

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Lz1Document, { type Lz1Data } from "./Lz1Document";
import MedCertDocument from "./MedCertDocument";
import PermitVideo from "./PermitVideo";
import {
  ageFromBirth, formatThaiId, parseIdCard, parseThaiAddress, thaiDateLabel, validThaiId,
} from "@/lib/idcard";
import {
  BAR_SIZES, CASE_STAGES, ENGINE_TYPE, EXEMPT_MODELS, PERMIT_MODELS, PERMIT_STEPS,
  DOC_MAILING, PROCESS_STEPS, REGISTRAR_OFFICE, REQUIRED_DOCS, stageDone,
  officeMapUrl, officeSiteUrl,
} from "@/lib/permit";
import { cachedUser, fetchMe, type User } from "@/lib/account";
import { PROVINCES, findPostcode, fixThaiAddress } from "@/lib/postcode";
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
    // ⚠️ qualified เป็น true ตายตัวหลังเอาช่องติ๊กบนจอออก (25 ส.ค. 2569)
    //    ค่านี้คุมแค่ "ติ๊กช่อง ๕.๑–๕.๑๑ บนกระดาษที่พิมพ์ออกมาไหม"
    //    ต้องเป็น true เพื่อให้ใบที่พิมพ์เหมือนใบที่เจ้าหน้าที่รับไปแล้ว
    //    ปล่อยเป็น false = พิมพ์ออกมาได้ช่องว่าง ๑๑ ช่อง ลูกค้าต้องนั่งติ๊กเองด้วยปากกา
    //    คำรับรองยังมีผลเพราะลูกค้าเซ็นชื่อใต้ข้อความนั้นบนกระดาษเอง
    saws: [], area: "", purpose: "", qualified: true,
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
  // ⚠️ จำนวนบาร์แยกจากจำนวนเครื่อง (เจ้าของร้านสั่ง 25 ส.ค. 2569 "เลือกจำนวนได้ ทั้ง 2")
  //    ลูกค้าซื้อเครื่อง ๑ ตัวแต่เอาบาร์ ๒ แผ่นได้ เป็นเรื่องปกติของร้าน
  //    ⚠️ ตัวเลขนี้ "ไม่ขึ้นบนแบบ ลซ.๑" — ดูเหตุผลตรงที่ประกอบรายการเลื่อย
  const [barQty, setBarQty] = useState("1");

  // ---- บัญชีลูกค้า
  //
  // ⚠️ เจ้าของร้านสั่ง (25 ส.ค. 2569) "ต้องล็อคอิน web เท่านั้นถึงทำการขอทะเบียนได้
  //    ลูกค้าจะได้รู้ว่าทำถึงไหนแล้ว" — กลับทางกติกาเดิมที่เคยห้ามบังคับล็อกอิน
  //    ⇒ ห้ามแก้กลับให้ทำได้โดยไม่ล็อกอิน
  // ⚠️ แต่ "อ่าน" ต้องไม่ต้องล็อกอิน — คลิปกับขั้นตอนยังเห็นได้ทุกคน
  //    ปิดทั้งหน้า = คนที่ยังไม่ตัดสินใจซื้อไม่มีทางรู้ว่าต้องทำอะไรบ้าง
  //    และ Google เก็บหน้านี้ไม่ได้เลย
  // ⚠️ เริ่มจาก cachedUser เพื่อไม่ให้หน้ากระพริบเป็น "ยังไม่ได้เข้าสู่ระบบ"
  //    แล้วค่อยเด้งกลับตอน fetchMe ตอบ (ตัวจริงคือฝั่งเซิร์ฟเวอร์เสมอ)
  const [me, setMe] = useState<User | null>(cachedUser);
  const [meReady, setMeReady] = useState(false);

  // ---- เรื่องขอทะเบียนของฉัน — เดินมาถึงขั้นไหนแล้ว
  const [stage, setStage] = useState("");
  const [stageBusy, setStageBusy] = useState(false);

  // ---- ส่งรูปใบ ลซ.๒ ให้ร้าน (ขั้นหลังจากยื่นเรื่องแล้วประมาณ ๗ วัน)
  const lz2Ref = useRef<HTMLInputElement>(null);
  const [lz2Busy, setLz2Busy] = useState(false);
  const [lz2Msg, setLz2Msg] = useState("");
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
      // ⚠️ qualified ต้องทับเป็น true เสมอหลังเอาค่าที่เก็บไว้มาใช้
      //    คนที่เคยกรอกไว้ก่อน 25 ส.ค. 2569 แล้วไม่ได้ติ๊ก จะมี qualified: false ค้างในเครื่อง
      //    ค่านั้นชนะค่าตั้งต้นเพราะมันถูก spread ทับทีหลัง
      //    ผลคือพิมพ์ออกมาได้ช่องว่าง ๑๑ ช่อง และ**ไม่มีอะไรบนจอให้กดแก้แล้ว**
      //    (ช่องติ๊กถูกเอาออกไปแล้ว) ลูกค้าจึงติดตายโดยไม่รู้ตัว
      //    ใช้กับลิงก์แชร์ที่สร้างไว้ก่อนหน้าด้วยเหตุผลเดียวกัน
      const raw = localStorage.getItem(KEY);
      if (raw) setD({ ...blank(), ...JSON.parse(raw), qualified: true });
      setPrinted(localStorage.getItem(KEY + "-printed") === "1");
      setUseProvince(localStorage.getItem(KEY + "-useprov") || "");
      // ⚠️ ลิงก์ที่ถูกส่งมาต้องชนะค่าที่เก็บไว้ในเครื่อง
      //    คนที่เปิดลิงก์คือคนที่ "ช่วยพิมพ์ให้" ไม่ใช่เจ้าของข้อมูล
      //    ถ้าเอาค่าในเครื่องตัวเองมาทับ จะพิมพ์ได้เอกสารของคนอื่นผิดคน
      const shared = readShareLink<{ d: Lz1Data; m: string; b: string; q: string; bq?: string }>();
      if (shared?.d) {
        setD({ ...blank(), ...shared.d, qualified: true });
        if (shared.m) setModelName(shared.m);
        if (shared.b) setBar(shared.b);
        if (shared.bq) setBarQty(shared.bq);
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
  //
  // ⚠️ ใส่เฉพาะ "จำนวนเครื่อง" ลงแบบ ลซ.๑ ห้ามเอาจำนวนบาร์ไปใส่ด้วย
  //    แบบราชการมีช่องเดียวคือ "จำนวน ___ เครื่อง" ไม่มีช่องจำนวนแผ่นบาร์เลย
  //    ยัดลงไป = เอกสารไม่ตรงกับแบบ และต่างจากใบที่เจ้าหน้าที่รับไปแล้ว
  //    จำนวนบาร์เป็นข้อมูลของ "ออเดอร์" ไม่ใช่ของ "คำขออนุญาต" — คนละเรื่องกัน
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
  //
  // ⚠️ ย่อรูปในเครื่องก่อนส่งเสมอ
  //    กล้องมือถือให้ไฟล์ 4-8 MB ลูกค้าเน็ตช้าจะรอนาน และเปลืองเครดิตร้านฟรี ๆ
  //    1400px กว้างพอให้อ่านตัวหนังสือบนบัตรออกครบ
  const shrink = (file: File) =>
    new Promise<string>((ok, no) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale) || 1;
        c.height = Math.round(img.height * scale) || 1;
        const ctx = c.getContext("2d");
        if (!ctx) { no(new Error("ย่อรูปไม่ได้")); return; }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); no(new Error("เปิดรูปไม่ได้")); };
      img.src = url;
    });

  /**
   * ทางหลัก — ให้ AI อ่าน (เจ้าของร้านสั่ง 25 ส.ค. 2569 "ยอมจ่ายเครดิต")
   *
   * ⚠️ ใช้ไม่ได้ต้องโยน error ออกไป ห้ามคืนค่าว่างเงียบ ๆ
   *    ตัวเรียกใช้ error เป็นสัญญาณว่าให้ถอยไปใช้ตัวอ่านในเครื่อง
   *    คืนค่าว่าง = ลูกค้าเห็นฟอร์มเปล่าโดยไม่มีใครรู้ว่าตัวอ่านล่ม
   */
  const readByAi = async (file: File) => {
    const image = await shrink(file);
    const r = await fetch("/api/read-id", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) throw new Error((out && out.error) || "ตัวอ่านตอบ " + r.status);
    const g = (out || {}) as Record<string, string>;
    return {
      got: {
        name: g.name || "",
        idNumber: g.idNumber || "",
        birth: g.birth || "",
        unsure: [] as string[],
      },
      a: {
        houseNo: g.houseNo || "", moo: g.moo || "", soi: g.soi || "", road: g.road || "",
        tambon: g.tambon || "", amphoe: g.amphoe || "", province: g.province || "",
      } as Record<string, string>,
    };
  };

  /**
   * ทางสำรอง — อ่านในเครื่องด้วย tesseract
   *
   * ⚠️ ห้ามลบทิ้งถึงจะมี AI แล้ว
   *    เน็ตล่ม · เครดิตหมด · ยังไม่ได้ตั้งคีย์ — ลูกค้าต้องยังใช้งานได้
   *    และไฟล์ 5.7 MB จะไม่ถูกโหลดเลยถ้า AI ทำงานปกติ จึงไม่มีต้นทุนกับคนส่วนใหญ่
   */
  const readLocal = useCallback(async (file: File) => {
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
      return { got, a: parseThaiAddress(got.address || "") as Record<string, string> };
  }, []);

  const readCard = useCallback(async (file: File) => {
    setBusy("กำลังอ่านบัตร…");
    try {
      let got: { name?: string; idNumber?: string; birth?: string; unsure: string[] };
      let a: Record<string, string>;
      try {
        ({ got, a } = await readByAi(file));
      } catch (e) {
        // ⚠️ "ถ่ายถี่เกินไป" กับ "ไม่ใช่บัตรประชาชน" ไม่ใช่อาการที่ของพัง
        //    ถอยไปใช้ตัวอ่านในเครื่องก็ได้ผลแย่กว่าเปล่า ๆ บอกลูกค้าตรง ๆ ดีกว่า
        const msg = String((e as Error).message || "");
        if (msg.includes("ถี่เกินไป") || msg.includes("ไม่ใช่บัตรประชาชน")) {
          setBusy(msg);
          return;
        }
        setBusy("ตัวอ่านหลักใช้ไม่ได้ กำลังลองตัวอ่านในเครื่องแทน… (ใช้เวลาสักครู่)");
        ({ got, a } = await readLocal(file));
      }
      // ⚠️ ช่องที่อ่านไม่ออกต้อง "ล้างทิ้ง" ไม่ใช่เก็บค่าเก่าไว้
      //    ของเดิมเขียน got.birth ? ... : p.birth — พอรอบนี้อ่านวันเกิดไม่ออก
      //    มันเก็บวันเกิดจากการสแกนครั้งก่อนไว้ ลูกค้าเห็นข้อมูลผิดที่ดูเหมือนเพิ่งอ่านมา
      //    เจอของจริง 25 ส.ค. 2569: บัตรเขียน 2 พ.ค. 2512 แต่ช่องขึ้น 10 เมษายน 2503
      //    ซึ่งเป็นค่าค้างจากรอบก่อน — อันตรายเพราะเป็นคำรับรองต่อนายทะเบียน
      //    ⇒ สแกนใหม่ = ล้างทุกช่องที่มาจากบัตรก่อนเสมอ ว่างดีกว่าผิด
      // ⚠️ ตรวจที่อยู่กับข้อมูลราชการก่อนเสมอ อย่าเชื่อที่ตัวอ่านให้มาตรง ๆ
      //    ตัวอ่านสลับ "ตำบล" กับ "อำเภอ" กันได้ และสะกดผิดได้
      //    เจอของจริง 26 ส.ค. 2569: บัตรเขียน "ต.กู่กาสิงห์ อ.เกษตรวิสัย จ.ร้อยเอ็ด"
      //    แต่ได้มา ตำบล=เกษตรวิสัย อำเภอ=ภูกาสิงห์ (สลับกัน + สะกดผิด)
      //    ทั้งสองอย่างไม่มีอะไรฟ้อง ลูกค้าพิมพ์ออกมายื่นได้ทั้งที่ที่อยู่ผิด
      //    fixThaiAddress แก้ให้เท่าที่มั่นใจ และบอกกลับมาว่าแก้ช่องไหนบ้าง
      const fix = fixThaiAddress(a.tambon || "", a.amphoe || "", a.province || "");

      setD((p) => ({
        ...p,
        name: got.name || "",
        idNumber: got.idNumber || "",
        birth: got.birth ? thaiDateLabel(got.birth) : "",
        age: got.birth ? String(ageFromBirth(got.birth) ?? "") : "",
        houseNo: a.houseNo || "",
        moo: a.moo || "",
        soi: a.soi || "",
        road: a.road || "",
        tambon: fix.tambon,
        amphoe: fix.amphoe,
        province: fix.province,
        // รหัสไปรษณีย์มาจากที่อยู่ที่ตรวจแล้วเสมอ ไม่ใช่ค้างของจังหวัดเดิม
        postcode: fix.postcode,
      }));
      // ที่อยู่อ่านพลาดบ่อยที่สุด ให้ไฮไลต์ทุกช่องที่มาจากบัตรเสมอ
      const addrKeys = Object.keys(a).filter((k) => k !== "houseNo" && k !== "moo");
      setUnsure([...got.unsure.filter((u) => u !== "address"), ...addrKeys]);
      // ⚠️ บอกให้ชัดว่า "อะไรที่อ่านไม่ออก" ไม่ใช่แค่นับจำนวน
      //    ลูกค้าจะได้รู้ว่าต้องกรอกช่องไหนเอง ไม่ต้องไล่หาเองทีละช่อง
      const missing = [
        !got.name && "ชื่อ",
        !got.idNumber && "เลขบัตร",
        !got.birth && "วันเกิด",
        !fix.province && "ที่อยู่",
      ].filter(Boolean) as string[];
      // ⚠️ ถ้าระบบแก้ที่อยู่ให้ ต้องบอกลูกค้าตรง ๆ ห้ามแก้เงียบ ๆ
      //    เขาเป็นคนเซ็นรับรองที่อยู่นี้ต่อนายทะเบียน ต้องรู้ว่าอะไรถูกแก้
      const fixedLabel = fix.changed.length
        ? " · ระบบแก้ " +
          fix.changed
            .map((k) => (k === "tambon" ? "ตำบล" : k === "amphoe" ? "อำเภอ" : "จังหวัด"))
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join("/") +
          " ให้ตรงกับทะเบียนราชการแล้ว ช่วยตรวจอีกที"
        : "";
      setBusy(
        (missing.length === 4
          ? "อ่านไม่ออกเลย — ลองถ่ายใหม่ให้ชัดขึ้น หรือกรอกเองด้านล่างได้"
          : missing.length
            ? `อ่านไม่ออก: ${missing.join(" · ")} — กรอกช่องนั้นเองด้านล่าง ที่เหลืออ่านให้แล้ว`
            : "อ่านได้ครบทุกส่วน — ช่วยตรวจอีกทีก่อนพิมพ์") + fixedLabel,
      );
    } catch (e) {
      setBusy("อ่านบัตรไม่สำเร็จ — กรอกเองด้านล่างได้เลย (" + (e as Error).message + ")");
    }
  }, [readLocal]);

  // ถามเซิร์ฟเวอร์ว่าตอนนี้เป็นใคร แล้วดึงเรื่องของคนนั้นมา
  useEffect(() => {
    let live = true;
    fetchMe()
      .then((u) => { if (live) setMe(u); })
      .catch(() => { /* เน็ตหลุด ใช้ของที่จำไว้ไปก่อน */ })
      .finally(() => { if (live) setMeReady(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!me?.phone) { setStage(""); return; }
    let live = true;
    fetch("/api/permit-doc?mine=1", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.item) setStage(String(d.item.stage || "")); })
      .catch(() => { /* ไม่ได้ก็ไม่เป็นไร แถบความคืบหน้าแค่ว่างไว้ */ });
    return () => { live = false; };
  }, [me?.phone]);

  /**
   * บอกเซิร์ฟเวอร์ว่าทำขั้นนี้แล้ว
   *
   * ⚠️ ห้ามล้มทั้งงานเพราะบันทึกไม่สำเร็จ
   *    เช่นตอนกดพิมพ์ — เอกสารต้องออกมาให้ได้ แม้เน็ตจะสะดุด
   *    แถบความคืบหน้าเป็นของเสริม ไม่ใช่เงื่อนไขของงานหลัก
   */
  const markStage = useCallback(async (next: string) => {
    if (!me?.phone) return;
    setStageBusy(true);
    try {
      const r = await fetch("/api/permit-doc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ stage: next }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.item) setStage(String(d.item.stage || ""));
    } catch { /* เงียบไว้ ไม่ใช่เรื่องที่ลูกค้าต้องมาแก้ */ }
    finally { setStageBusy(false); }
  }, [me?.phone]);

  /**
   * ส่งรูปใบ ลซ.๒ ให้ร้าน
   *
   * ⚠️ เป็นที่เดียวในหน้านี้ที่ส่งข้อมูลออกจากเครื่องลูกค้าไปเก็บที่ร้าน
   *    (ตัวอ่านบัตรส่งออกไปอ่านแล้วลืม ไม่ได้เก็บ — อันนี้เก็บจริง)
   *    ห้ามเอาข้อมูลในแบบ ลซ.๑ ที่กรอกไว้ติดไปด้วยเด็ดขาด
   *    ส่งเฉพาะสิ่งที่ลูกค้าพิมพ์ในกล่องนี้กับรูปที่เขาเลือกถ่ายเท่านั้น
   */
  const sendLz2 = useCallback(async (files: File[]) => {
    // ⚠️ ตัวตนมาจากบัญชีที่ล็อกอิน ไม่ใช่ชื่อ/เบอร์ที่พิมพ์เอง
    //    พิมพ์เองได้ = ใครก็ยัดรูปในชื่อคนอื่นได้ และร้านจับคู่กับออเดอร์ไม่ได้
    if (!me?.phone) { setLz2Msg("ต้องเข้าสู่ระบบก่อนถึงจะส่งใบให้ร้านได้"); return; }
    setLz2Busy(true);
    setLz2Msg("กำลังย่อรูป…");
    try {
      // ย่อก่อนส่งเหมือนตอนถ่ายบัตร — กล้องมือถือให้ไฟล์หลายเมกต่อใบ
      const images = await Promise.all(files.slice(0, 2).map((f) => shrink(f)));
      setLz2Msg("กำลังส่ง…");
      const r = await fetch("/api/permit-doc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          saw: modelName
            ? `${modelName} ${qty || "1"} เครื่อง${bar ? ` · บาร์ ${bar} นิ้ว ${barQty || "1"} แผ่น` : ""}`
            : "",
          province: useProvince,
          images,
        }),
      });
      const out = await r.json().catch(() => null);
      if (!r.ok) throw new Error(out?.error || `ส่งไม่สำเร็จ (${r.status})`);
      if (out?.item?.stage) setStage(String(out.item.stage));
      setLz2Msg(
        "ส่งให้ร้านแล้ว ทางร้านจะติดต่อกลับเรื่องยอดและการส่งเครื่อง — " +
        "อย่าลืมส่งใบตัวจริงตามมาด้วย รูปใช้แทนไม่ได้",
      );
    } catch (e) {
      setLz2Msg("ส่งไม่สำเร็จ — " + (e as Error).message + " · ทักไลน์ร้านส่งให้ก็ได้");
    } finally {
      setLz2Busy(false);
    }
    // ⚠️ qty กับ barQty ต้องอยู่ในรายการนี้ด้วย ไม่งั้นร้านได้จำนวนเก่าติดไปกับใบ ลซ.๒
  }, [me?.phone, modelName, bar, qty, barQty, useProvince]);

  const idOk = validThaiId(d.idNumber);
  // ⚠️ ไม่มี d.qualified ในเงื่อนไขแล้ว — ช่องติ๊กถูกเอาออกตามคำสั่งเจ้าของร้าน
  //    ถ้ายังเช็คอยู่ ปุ่มพิมพ์จะเป็นสีเทาตลอดกาลโดยไม่มีอะไรบนจอบอกว่าทำไม
  const canPrint = Boolean(d.name && idOk && d.province && picked);

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

        {/* ⚠️ คลิปคือคำอธิบายหลัก ข้อความบนหน้าเป็นตัวเสริม (เจ้าของร้านสั่ง 25 ส.ค. 2569)
            "ลูกค้าทุกคนดูแล้วเขาเข้าใจ" — วางบนสุดก่อนอย่างอื่นทั้งหมด */}
        <PermitVideo />

        {/*
          ⚠️ แผนภาพสามใบต้องอยู่ ก่อนช่องกรอกทุกช่อง
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
          {/* ⚠️ รายการอธิบาย ลซ.๑/๒/๓ สามบรรทัดใต้ป้ายถูกเอาออกตามคำสั่งเจ้าของร้าน
                 (26 ส.ค. 2569) ห้ามเอากลับมาโดยไม่ถามก่อน
              ข้อความไม่ได้หายไปไหน — ป้ายสามใบด้านบนยังบอกชื่อใบครบ
              และรายละเอียดเต็มอยู่ในส่วน "ดูขั้นตอนทั้งหมด ๘ ขั้น" ที่กดเปิดได้ */}
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
            <p className="mt-2 border-t border-steel-700 pt-2 text-[11.5px] leading-relaxed text-ink-300">
              หน้านี้สำหรับคนที่ซื้อเลื่อยจากร้านนี้ — ขั้นที่ ๕ ต้องส่งใบ ลซ.๒
              ให้ร้านที่ขายเก็บไว้เป็นหลักฐานการจำหน่าย
              ถ้าซื้อจากร้านอื่นยังกรอกและพิมพ์ ลซ.๑ ที่นี่ได้ แต่ส่ง ลซ.๒ ไปที่ร้านนั้นแทน
            </p>
          </details>

          {/* ⚠️ เรื่องนี้ต้องเห็นโดยไม่ต้องกดเปิด — ลูกค้าเข้าใจผิดกันบ่อยที่สุด */}
          {/*
            ⚠️ เจ้าของร้านสั่งตัดข้อความให้สั้น (25 ส.ค. 2569)
               "ผมมีคลิปสรุปให้ลูกค้า ลูกค้าทุกคนดูแล้วเขาเข้าใจ"
               ⇒ เหลือบรรทัดเดียวที่ต้องเห็นแน่ ๆ ส่วนรายละเอียดอยู่ในส่วนที่กดเปิด
               ห้ามเอาข้อความยาว ๆ กลับมาใส่ตรงนี้อีก
          */}
          <p className="mt-2 rounded-sm bg-safety-tint p-2.5 text-[12.5px] leading-relaxed text-ink">
            <b>ต้องขออนุญาตก่อน ร้านถึงส่งเครื่องให้ได้</b> ·
            ยื่นที่จังหวัด<b>ที่จะเอาเลื่อยไปใช้</b>
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

        {/* ------------------------------------------------ ด่านล็อกอิน
            ⚠️ เจ้าของร้านสั่ง (25 ส.ค. 2569) "ต้องล็อคอิน web เท่านั้นถึงทำการขอทะเบียนได้
               ลูกค้าจะได้รู้ว่าทำถึงไหนแล้ว" — กลับทางกติกาเดิมที่ห้ามบังคับล็อกอิน
               ⇒ ห้ามแก้กลับ และห้ามลบคอมเมนต์นี้
            ⚠️ ปิดเฉพาะ "ส่วนที่ทำเรื่อง" เท่านั้น คลิปกับขั้นตอนด้านบนยังเปิดให้ทุกคนอ่าน
               ปิดทั้งหน้า = คนที่ยังไม่ตัดสินใจซื้อไม่มีทางรู้ว่าต้องทำอะไรบ้าง
               และ Google เก็บหน้านี้ไม่ได้เลย
            ⚠️ ระหว่างที่ยังไม่รู้ว่าล็อกอินอยู่ไหม ห้ามขึ้นหน้า "ต้องเข้าสู่ระบบ"
               คนที่ล็อกอินอยู่แล้วจะเห็นหน้านั้นแวบหนึ่งทุกครั้งที่เปิด ซึ่งดูเหมือนระบบเตะออก */}
        {!meReady ? (
          <p className="mt-5 rounded-sm bg-steel-900 p-4 text-center text-[13px] text-ink-300">
            กำลังตรวจสอบบัญชี…
          </p>
        ) : !me ? (
          <div className="mt-5 rounded-sm bg-white p-4 text-center">
            <p className="text-[15px] font-bold text-ink">เข้าสู่ระบบก่อนเริ่มทำเรื่อง</p>
            <p className="mx-auto mt-1.5 max-w-[320px] text-[12.5px] leading-relaxed text-ink-300">
              เรื่องขอทะเบียนใช้เวลาหลายสัปดาห์และมีหลายขั้น
              เข้าสู่ระบบไว้แล้ว<b className="text-ink-700">เปิดมาดูได้ตลอดว่าทำถึงไหนแล้ว</b>
              และร้านตามเรื่องให้คุณได้ถูกคน
            </p>
            <Link
              href="/account/login/?next=/permit/"
              className="mt-4 inline-block rounded-sm bg-safety px-8 py-2.5 text-[15px] font-bold text-white"
            >
              เข้าสู่ระบบ
            </Link>
            <p className="mt-2 text-[12px] text-ink-300">
              ยังไม่มีบัญชี?{" "}
              <Link href="/account/register/?next=/permit/" className="text-safety underline">
                สมัครด้วยเบอร์โทร
              </Link>
            </p>
          </div>
        ) : (
        <>
        {/* ------------------------------------------------ แถบความคืบหน้า
            ⚠️ ขึ้นเฉพาะคนที่เริ่มเดินแล้ว (มี stage) — คนที่เพิ่งเข้ามาครั้งแรก
               ยังไม่ได้ทำอะไรเลย เอาแถบว่าง ๖ ขั้นมาขวางคือทำให้ดูยุ่งยากเกินจริง */}
        {stage && (
          <section className="mt-5 rounded-sm bg-white p-3">
            <h2 className="text-[14px] font-bold text-ink">เรื่องของคุณตอนนี้</h2>
            <ol className="mt-2 space-y-1.5">
              {CASE_STAGES.map((st) => {
                const done = stageDone(stage, st.key);
                const now = stage === st.key;
                return (
                  <li key={st.key} className="flex gap-2">
                    <span
                      className={
                        "mt-0.5 flex h-4.5 w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                        (done ? "bg-[#1f7a3d] text-white" : "bg-steel-700 text-steel-300")
                      }
                    >
                      {done ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={"block text-[13px] leading-snug " + (now ? "font-bold text-ink" : done ? "text-ink-700" : "text-ink-300")}>
                        {st.label}
                        <span className="ml-1 text-[10.5px] font-normal text-ink-300">({st.by}ทำ)</span>
                      </span>
                      {now && (
                        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-300">
                          {st.hint}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
            {/* ⚠️ ปุ่มนี้ต้องเป็นของลูกค้ากดเอง เว็บไม่มีทางรู้ว่าเขาไปสำนักงานมาแล้ว
                และฝั่งเซิร์ฟเวอร์กันไม่ให้ลูกค้ากดขั้นของร้านไว้แล้ว */}
            {stage === "printed" && (
              <button
                onClick={() => void markStage("submitted")}
                disabled={stageBusy}
                className="mt-2.5 w-full rounded-sm border border-steel-600 py-2.5 text-[13.5px] font-semibold text-ink disabled:text-steel-300"
              >
                {stageBusy ? "กำลังบันทึก…" : "ยื่นที่สำนักงานเรียบร้อยแล้ว"}
              </button>
            )}
            {stage === "shipped" && (
              <button
                onClick={() => void markStage("done")}
                disabled={stageBusy}
                className="mt-2.5 w-full rounded-sm border border-steel-600 py-2.5 text-[13.5px] font-semibold text-ink disabled:text-steel-300"
              >
                {stageBusy ? "กำลังบันทึก…" : "ได้ใบ ลซ.๓ ครบแล้ว"}
              </button>
            )}
          </section>
        )}

        {/* ------------------------------------------------ 1. เลือก
            ⚠️ ภาพร่างของเจ้าของร้านวาง "เลื่อยยนต์" กับ "ขนาดบาร์" เป็นช่องเลือก
               สองช่องเรียงคู่กันตั้งแต่แรก ใต้หัวข้อคำเดียวว่า "เลือก"
               ⇒ ห้ามซ่อนช่องขนาดบาร์ไว้หลังการเลือกรุ่น (ของเดิมทำแบบนั้น)
               ลูกค้าเห็นทีเดียวว่าต้องตอบแค่สองเรื่องก่อนจะเริ่มถ่ายบัตร */}
        <h2 className="mt-5 text-[15px] font-bold text-ink">๑. เลือก</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label>
            <span className="mb-1 block text-[12px] text-ink-300">เลื่อยยนต์</span>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full rounded-sm border border-steel-600 px-3 py-2.5 text-[14px]"
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
          </label>
          <label>
            <span className="mb-1 block text-[12px] text-ink-300">ขนาดบาร์</span>
            <select
              value={bar}
              onChange={(e) => setBar(e.target.value)}
              className="w-full rounded-sm border border-steel-600 px-3 py-2.5 text-[14px]"
            >
              {/* ⚠️ เว้นว่างได้จริง เจ้าของร้านบอกว่า "ลูกค้าบางคนก็ซื้อแต่เครื่อง" */}
              <option value="">ไม่ระบุ (ซื้อแต่เครื่อง)</option>
              {BAR_SIZES.map((b) => <option key={b} value={b}>{b} นิ้ว</option>)}
            </select>
          </label>
        </div>

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
                  {bar && <> · บาร์ {bar} นิ้ว {barQty || "1"} แผ่น</>}
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

            {/* ⚠️ เลือกจำนวนได้ทั้งสองอย่าง (เจ้าของร้านสั่ง 25 ส.ค. 2569)
                ลูกค้าซื้อเครื่อง ๑ ตัวแต่เอาบาร์ ๒ แผ่นได้ เป็นเรื่องปกติของร้าน
                ⚠️ จำนวนบาร์กดไม่ได้ถ้ายังไม่ได้เลือกขนาดบาร์
                   ปล่อยให้กรอกได้ = ได้ "บาร์ ๓ แผ่น" ที่ไม่มีขนาด ซึ่งร้านเอาไปทำอะไรไม่ได้ */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label>
                <span className="mb-1 block text-[12px] text-ink-300">จำนวนเครื่อง</span>
                <input
                  type="number" min={1} max={5} value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full rounded-sm border border-steel-600 px-3 py-2 text-[14px]"
                />
              </label>
              <label>
                <span className="mb-1 block text-[12px] text-ink-300">
                  จำนวนบาร์ (แผ่น)
                </span>
                <input
                  type="number" min={1} max={9} value={bar ? barQty : ""}
                  disabled={!bar}
                  placeholder={bar ? "" : "เลือกขนาดบาร์ก่อน"}
                  onChange={(e) => setBarQty(e.target.value)}
                  className="w-full rounded-sm border border-steel-600 px-3 py-2 text-[14px] placeholder:text-[12px] disabled:bg-steel-900 disabled:text-ink-300"
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
            {/* ⚠️ ต้องบอกก่อนกดถ่าย ไม่ใช่หลังถ่าย
                รูปบัตรออกจากเครื่องไปให้ตัวอ่านอ่าน ลูกค้ามีสิทธิ์รู้ก่อนตัดสินใจ
                ห้ามลบบรรทัดนี้ตราบใดที่ยังส่งรูปออกไปข้างนอก */}
            <p className="mt-1.5 rounded-sm bg-[#fffbe6] p-2 text-[12px] leading-relaxed text-ink-700">
              รูปบัตรจะถูกส่งไปให้ตัวอ่านอัตโนมัติอ่านข้อความ <b>เพื่ออ่านอย่างเดียว
              ไม่ได้เก็บไว้ที่ไหน</b> — ไม่อยากส่งรูปก็กรอกเองด้านล่างได้เลย
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void readCard(f); }}
            />
            {/* ⚠️ ภาพร่างของเจ้าของร้านวาดตรงนี้เป็น "กรอบรูปบัตร" ไม่ใช่ปุ่มแท่งเดียว
                ในกรอบมีรูปคนซ้าย · บรรทัดข้อความกลาง · ช่องสี่เหลี่ยมขวา
                ⇒ ทำให้หน้าตาเหมือนบัตรจริง ลูกค้ารู้ทันทีว่าต้องเอาอะไรมาวาง
                   โดยไม่ต้องอ่านตัวหนังสือ (คนที่มาหน้านี้บางส่วนอ่านหนังสือไม่คล่อง)
                ⚠️ ทั้งกรอบคือปุ่ม ไม่ใช่แค่ข้อความข้างใน — นิ้วโป้งบนมือถือกดโดนง่ายกว่ามาก */}
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="ถ่ายบัตรประชาชน"
              className="mt-2 block w-full rounded-sm border-2 border-safety bg-white p-3 text-left"
            >
              <span className="flex items-center gap-3">
                {/* รูปคนบนบัตร */}
                <span className="flex h-14 w-12 shrink-0 items-center justify-center rounded-sm bg-steel-900 text-[26px] leading-none">
                  🧑
                </span>
                {/* บรรทัดชื่อ-ที่อยู่ */}
                <span className="min-w-0 flex-1 space-y-1.5" aria-hidden>
                  <span className="block h-2 w-11/12 rounded-full bg-steel-700" />
                  <span className="block h-2 w-9/12 rounded-full bg-steel-700" />
                  <span className="block h-2 w-10/12 rounded-full bg-steel-700" />
                </span>
                {/* ช่องสี่เหลี่ยมมุมขวาของบัตร */}
                <span className="h-8 w-8 shrink-0 rounded-sm border border-steel-600" aria-hidden />
              </span>
              <span className="mt-2.5 block rounded-sm bg-safety py-2.5 text-center text-[15px] font-bold text-white">
                📷 แสกนบัตรประชาชน
              </span>
            </button>
            {/* ⚠️ ลูกศรนี้อยู่ในภาพร่าง — บอกว่าแสกนแล้วข้อมูลไหลเข้าแบบ ลซ.๑ ให้เอง
                เป็นเหตุผลเดียวที่ลูกค้ายอมถ่ายบัตร ต้องเห็นก่อนกด ไม่ใช่หลังกด */}
            <p className="mt-1.5 text-center text-[12px] text-ink-300">
              ↓ เข้าแบบฟอร์ม ลซ.๑ ให้อัตโนมัติ
            </p>
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
              {/* ⚠️ สี่ช่องนี้ถูกเอาออกจากหน้าจอตามคำสั่งเจ้าของร้าน (26 ส.ค. 2569)
                     "เอาออก เดี๋ยวลูกค้ากรอกเอง"
                     คือ ประกอบอาชีพหรือกิจการ · พื้นที่ที่จะใช้เลื่อย · ใช้ทำอะไร ·
                     เขียนคำขอที่ — ลูกค้าเขียนด้วยปากกาบนกระดาษที่พิมพ์ออกมาแทน
                     เข้าใจได้ เพราะเป็นช่องข้อความยาวที่พิมพ์บนมือถือแล้วช้ากว่าเขียนมือ

                  ⚠️ ห้ามลบช่องพวกนี้ออกจาก Lz1Data หรือจาก Lz1Document
                     ค่าเป็นค่าว่างแล้วเอกสารจะพิมพ์เป็นเส้นจุดไข่ปลาว่างไว้ให้เขียน
                     ซึ่งคือสิ่งที่ต้องการพอดี — ถอดออกจากเอกสารเมื่อไหร่
                     ใบที่พิมพ์จะขาดหัวข้อไปเลย และไม่ตรงกับแบบราชการ
                  ⚠️ เอากลับมาต้องถามเจ้าของร้านก่อน */}
            </div>

            {/* ------------------------------------------ 4. พิมพ์
                ⚠️ เจ้าของร้านสั่งให้เอาช่องติ๊ก "คำรับรองคุณสมบัติ" ออก (25 ส.ค. 2569)
                   ไม่ได้ทำให้คำรับรองหายไป — คุณสมบัติทั้ง ๑๑ ข้ออยู่ในแบบ ลซ.1 ที่พิมพ์ออกมา
                   และลูกค้าเซ็นชื่อรับรองบนกระดาษอยู่แล้ว ซึ่งเป็นการรับรองที่มีผลจริง
                   ช่องติ๊กบนจอจึงเป็นแค่ขั้นตอนซ้ำที่ขวางทางลูกค้าเปล่า ๆ
                ⚠️ ห้ามเอากลับมาโดยไม่ถามเจ้าของร้านก่อน */}
            <h2 className="mt-6 text-[15px] font-bold text-ink">๔. พิมพ์แล้วนำไปยื่น</h2>
            <button
              onClick={() => {
                window.print();
                setPrinted(true);
                try { localStorage.setItem(KEY + "-printed", "1"); } catch { /* โหมดส่วนตัว */ }
                // ⚠️ บันทึกขั้นแบบไม่รอผล เอกสารต้องพิมพ์ออกมาให้ได้แม้เน็ตสะดุด
                //    แถบความคืบหน้าเป็นของเสริม ไม่ใช่เงื่อนไขของงานหลัก
                void markStage("printed");
              }}
              disabled={!canPrint}
              className="mt-2 w-full rounded-sm bg-ink py-3.5 text-[15px] font-bold text-white disabled:bg-steel-700 disabled:text-steel-300"
            >
              {/* ⚠️ ภาพร่างเขียนปุ่มนี้ว่า "ขอใบอนุญาต" จึงใช้คำนั้นเป็นตัวใหญ่
                  แต่ต้องมีบรรทัดล่างบอกว่าจริง ๆ แล้วมันคือการพิมพ์เอกสาร
                  ปุ่มที่เขียนแค่ "ขอใบอนุญาต" เฉย ๆ = ลูกค้าเข้าใจว่ากดแล้วยื่นเรื่องให้ราชการแล้ว
                  แล้วนั่งรอใบอนุญาตที่ไม่มีวันมา ซึ่งแย่กว่าคำที่ยาวขึ้นหนึ่งบรรทัดมาก
                  ห้ามตัดบรรทัดล่างออก */}
              ขอใบอนุญาต
              <span className="mt-0.5 block text-[11.5px] font-normal opacity-80">
                🖨️ พิมพ์แบบ ลซ.๑ + ใบรับรองแพทย์ แล้วนำไปยื่นเอง
              </span>
            </button>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
              ได้ ๔ แผ่น — แบบ ลซ.๑ สามแผ่น และใบรับรองแพทย์อีกหนึ่งแผ่น
              <b className="text-ink"> เอาใบรับรองแพทย์ไปให้หมอกรอกและเซ็นก่อน</b>
              แล้วค่อยเอาไปยื่นพร้อมกันทั้งชุด
            </p>
            {!canPrint && (
              <p className="mt-1.5 text-[12px] text-ink-300">
                ต้องมี ชื่อ · เลขบัตรที่ถูกต้อง · จังหวัด · รุ่นเลื่อย ก่อน
              </p>
            )}

            {/* ⚠️ มาจากภาพร่าง: "สแกนเสร็จมีลิงค์ ส่งไป Line ได้ และปริ้นได้"
                ของจริงคือลูกค้ากรอกในมือถือแต่ไม่มีเครื่องปริ้น ต้องส่งให้คนอื่นช่วยพิมพ์ */}
            {canPrint && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={lineShareUrl(makeShareLink({ d, m: modelName, b: bar, q: qty, bq: barQty }))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-sm bg-[#06C755] py-3 text-center text-[14px] font-semibold text-white"
                  >
                    ส่งไปไลน์
                  </a>
                  <button
                    onClick={() => {
                      const link = makeShareLink({ d, m: modelName, b: bar, q: qty, bq: barQty });
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
                แล้วรอเครื่องอยู่บ้านโดยที่ร้านก็รออยู่เหมือนกัน
                จึงห้ามลบทิ้ง ต้องหาเจอตอนถึงคิวของมัน

                ⚠️ แต่ต้อง "พับไว้" ไม่ใช่กางอยู่ตลอด (เจ้าของร้านสั่ง 25 ส.ค. 2569)
                   "ให้แสดงตอนลูกค้าได้ ลซ.2 แล้ว ขั้นตอนนี้ปิดไว้ก่อน"
                   คนที่เพิ่งเข้ามาครั้งแรกยังไม่ได้ยื่นด้วยซ้ำ ห่างจากขั้นนี้อีกอย่างน้อย ๗ วัน
                   กางไว้ = เอาที่อยู่ร้านกับขั้นตอนของอีกสัปดาห์หน้ามาขวางคนที่แค่จะกรอกใบแรก
                ⚠️ ใช้ details ไม่ใช่ซ่อนด้วยเงื่อนไข — ระบบไม่มีทางรู้ว่าลูกค้าได้ ลซ.๒ มาหรือยัง
                   เดาเอาแล้วซ่อนจริง = คนที่ได้ใบมาแล้วหาที่อยู่ส่งของไม่เจอ ซึ่งแย่กว่า
                   ให้เขากดเปิดเองเมื่อถึงคิว และหัวข้อต้องเขียนให้รู้ว่าข้างในคืออะไร */}
            <details className="mt-6">
              <summary className="cursor-pointer rounded-sm bg-white p-3 text-[14px] font-bold text-ink">
                ได้ใบ ลซ.๒ มาแล้ว ส่งมาที่ร้าน
                <span className="mt-0.5 block text-[11.5px] font-normal text-ink-300">
                  ขั้นนี้อยู่หลังจากยื่นเรื่องแล้วประมาณ ๗ วัน — กดดูที่อยู่ส่งเอกสาร
                </span>
              </summary>
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

              {/* ------------------------------------ ถ่ายใบ ลซ.๒ ส่งมาก่อน
                  เจ้าของร้านเสนอเอง: "พอลูกค้าได้ใบจริงมาก็ถ่ายอัพโหลดมาที่นี่"
                  แก้ปัญหาที่เว็บไม่มีทางรู้ว่าลูกค้าเดินมาถึงขั้นไหนแล้ว
                  เพราะใบ ลซ.๒ มาทางไปรษณีย์ ไม่ได้ผ่านเว็บเลย

                  ⚠️ ต้องบอกให้ชัดว่ารูป "ไม่แทน" การส่งเอกสารตัวจริง
                     ร้านต้องเก็บ ลซ.๒ ตอนกลางตัวจริงไว้เป็นหลักฐานการจำหน่ายตามกฎหมาย
                     ปล่อยให้ลูกค้าเข้าใจว่าอัปแล้วจบ = เขานั่งรอเครื่องที่ร้านส่งไม่ได้
                  ⚠️ ตรงนี้ "ส่งข้อมูลออกจากเครื่อง" ต่างจากส่วนอื่นของหน้านี้ทั้งหมด
                     ต้องเขียนบอกก่อนกดส่ง ไม่ใช่หลังส่ง */}
              <div className="mt-3 rounded-sm border border-steel-700 bg-white p-3">
                <p className="text-[13px] font-bold text-ink">ถ่ายใบส่งมาให้ร้านดูก่อนได้</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-300">
                  ร้านจะได้เตรียมเครื่องและแจ้งยอดให้ทันที ไม่ต้องรอซองมาถึง
                  <b className="mt-1 block text-ink-700">
                    ยังต้องส่งใบตัวจริงมาอยู่ — รูปใช้แทนไม่ได้
                    เพราะร้านต้องเก็บตอนกลางตัวจริงไว้เป็นหลักฐานการจำหน่าย
                  </b>
                </p>

                {/* ⚠️ ไม่มีช่องกรอกชื่อ/เบอร์แล้ว — ตัวตนมาจากบัญชีที่ล็อกอิน
                    ให้พิมพ์เอง = ใครก็ยัดรูปในชื่อคนอื่นได้ และร้านจับคู่กับออเดอร์ไม่ได้ */}
                <p className="mt-2 rounded-sm bg-steel-900 p-2 text-[12px] text-ink-700">
                  ส่งในชื่อ <b>{me?.name || me?.phone}</b>
                </p>

                <input
                  ref={lz2Ref}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const fs = Array.from(e.target.files || []);
                    if (fs.length) void sendLz2(fs);
                  }}
                />
                <button
                  onClick={() => lz2Ref.current?.click()}
                  disabled={lz2Busy}
                  className="mt-2 w-full rounded-sm bg-ink py-2.5 text-[14px] font-bold text-white disabled:bg-steel-700"
                >
                  {lz2Busy ? "กำลังส่ง…" : "📷 ถ่ายใบ ลซ.๒ ส่งให้ร้าน"}
                </button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-300">
                  ถ่ายได้ทั้ง ๒ ตอนในครั้งเดียว · รูปเก็บไว้ที่ร้าน
                  เปิดดูได้เฉพาะคนที่มีรหัสหลังร้าน
                </p>
                {lz2Msg && (
                  <p className="mt-2 rounded-sm bg-steel-900 p-2.5 text-[12.5px] leading-relaxed text-ink-700">
                    {lz2Msg}
                  </p>
                )}
              </div>
            </details>

            {/* ⚠️ กล่อง "ขอใบอนุญาตไม่มีค่าธรรมเนียม" ถูกเอาออกตามคำสั่งเจ้าของร้าน
                   (25 ส.ค. 2569) ห้ามเอากลับมาโดยไม่ถามก่อน
                ข้อเท็จจริงยังอยู่ใน CLAUDE.md: ไม่มีค่าธรรมเนียม · ไม่ต้องใช้รูปถ่าย */}

            <h3 className="mt-6 text-[14px] font-bold text-ink">เอกสารที่ต้องเตรียมไปด้วย</h3>
            <ul className="mt-1.5 space-y-1.5">
              {REQUIRED_DOCS.map((doc) => (
                <li key={doc.label} className="rounded-sm bg-white p-2.5 text-[13px] text-ink">
                  {doc.label} <b className="text-safety">{doc.qty}</b>
                  <span className="mt-0.5 block text-[11.5px] text-ink-300">{doc.note}</span>
                  {/* ⚠️ ลิงก์ตัวอย่างแบบฟอร์ม — เจ้าของร้านสั่งให้มี (26 ส.ค. 2569)
                      คลินิกทั่วไปไม่รู้ว่าใบรับรองแพทย์เรื่องนี้ต้องรับรองอะไรบ้าง
                      ลูกค้าไปมือเปล่าแล้วได้ใบทั่วไปมา สำนักงานตีกลับ เสียทั้งค่าตรวจและเสียเที่ยว
                      ⚠️ ต้องมี download ระบุชื่อไทย ไม่งั้นลูกค้าได้ไฟล์ชื่อ med-cert-lz1.pdf
                         ซึ่งหาไม่เจอในเครื่องตัวเอง
                      ⚠️ ต้องมี rel="noopener" คู่กับ target="_blank" เสมอ */}
                  {"sample" in doc && doc.sample && (
                    <a
                      href={doc.sample.url}
                      download={doc.sample.filename}
                      target="_blank"
                      rel="noopener"
                      className="mt-1.5 inline-block rounded-sm border border-steel-600 px-2.5 py-1.5 text-[12.5px] font-semibold text-ink"
                    >
                      📄 โหลดตัวอย่างแบบฟอร์ม (PDF)
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
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
