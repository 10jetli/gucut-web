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
import { type Lz1Data } from "@/lib/lz1data";
import PermitVideo from "./PermitVideo";
import {
  ageFromBirth, formatThaiId, parseIdCard, parseThaiAddress, thaiDateLabel, validThaiId,
} from "@/lib/idcard";
import {
  BAR_SIZES, CASE_STAGES, ENGINE_TYPE, EXEMPT_MODELS, PERMIT_MODELS, PERMIT_STEPS,
  DOC_MAILING, PROCESS_STEPS, REGISTRAR_OFFICE, REQUIRED_DOCS, STAGE_AT_STEP, stageDone,
  officeMapUrl, officeSiteUrl,
} from "@/lib/permit";
import { cachedUser, fetchMe, type User } from "@/lib/account";
import { SHOP } from "@/lib/shop";
import { PROVINCES, amphoesOf, findPostcode, fixThaiAddress, tambonsOf } from "@/lib/postcode";
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
  // ชื่อยืนยันแล้วหรือยัง — เขียวเฉพาะเมื่อ "อ่านซูมตรงกับอ่านเต็มใบ" หรือลูกค้าพิมพ์เอง
  // (เจ้าของร้านสั่ง 27 ส.ค. 2569: ตรวจผิดห้ามขึ้นเขียว ให้เหลืองแล้วตรวจใหม่ —
  //  นามสกุลเคยเพี้ยน บุญ→มูล ทั้งที่ช่องขึ้นเขียวเพราะเช็คแค่รูปแบบ)
  const [nameOk, setNameOk] = useState(false);
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
  // ⚠️ ย่อรูป + หมุนตามองศาที่สั่ง — ตัวเรียก (readCard) เป็นคนไล่บันไดมุมหมุน
  //    บัตรตะแคงทำ AI อ่านบรรทัดที่อยู่ (ตัวเล็ก) เพี้ยนแบบดูเหมือนสำเร็จทุกครั้ง
  //    (บทเรียน 26 ส.ค. 2569 — เจอทั้งรูปแนวตั้งและรูปแนวนอนที่บัตรตะแคงข้างใน)
  const shrink = (file: File, deg = 0) =>
    new Promise<string>((ok, no) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale) || 1;
        const h = Math.round(img.height * scale) || 1;
        const c = document.createElement("canvas");
        const swap = deg % 180 !== 0;
        c.width = swap ? h : w;
        c.height = swap ? w : h;
        const ctx = c.getContext("2d");
        if (!ctx) { no(new Error("ย่อรูปไม่ได้")); return; }
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
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
  const readByAi = async (file: File, deg = 0) => {
    const image = await shrink(file, deg);
    const r = await fetch("/api/read-id", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, turn: deg }),
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

  // ครอป "โซนที่อยู่" (ล่างซ้ายของบัตรที่หมุนตั้งแล้ว) ซูมส่งอ่านแยก
  // ⚠️ ใช้เมื่ออ่านเต็มใบได้ชื่อ/เลขครบแต่บรรทัดที่อยู่เล็กเกิน (บทเรียน 26 ส.ค. 2569
  //    รูปจริงของเจ้าของร้าน: เต็มใบอ่านที่อยู่ไม่ออก พอครอปซูมก็อ่านชัด)
  const shrinkAddr = (file: File, deg = 0) =>
    new Promise<string>((ok, no) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const w = img.width, h = img.height;
        const swap = deg % 180 !== 0;
        const rw = swap ? h : w, rh = swap ? w : h;
        const full = document.createElement("canvas");
        full.width = rw; full.height = rh;
        const fc = full.getContext("2d");
        if (!fc) { no(new Error("ครอปรูปไม่ได้")); return; }
        fc.translate(rw / 2, rh / 2);
        fc.rotate((deg * Math.PI) / 180);
        fc.drawImage(img, -w / 2, -h / 2, w, h);
        // โซนชื่อ+ที่อยู่ของบัตร ≈ ซีกซ้าย (กว้าง 68% · สูงช่วง 25-95%)
        // ⚠️ ขยายขึ้นไปครอบบรรทัด "ชื่อตัวและชื่อสกุล" ด้วย — นามสกุลเคยเพี้ยน
        //    บุญ→มูล ซ้ำสองรูปที่ความละเอียดเต็มใบ (27 ส.ค. 2569) ซูมแล้วอ่านชัดกว่า
        const cy = Math.round(rh * 0.25), cw = Math.round(rw * 0.68), ch = Math.round(rh * 0.70);
        const c = document.createElement("canvas");
        const scale = Math.min(2.5, 1400 / cw);
        c.width = Math.round(cw * scale) || 1;
        c.height = Math.round(ch * scale) || 1;
        const ctx = c.getContext("2d");
        if (!ctx) { no(new Error("ครอปรูปไม่ได้")); return; }
        ctx.drawImage(full, 0, cy, cw, ch, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = () => { URL.revokeObjectURL(url); no(new Error("เปิดรูปไม่ได้")); };
      img.src = url;
    });

  const readAddrZone = async (file: File, deg = 0) => {
    const image = await shrinkAddr(file, deg);
    const r = await fetch("/api/read-id", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, turn: deg + 500, zone: "address" }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) throw new Error((out && out.error) || "ตัวอ่านตอบ " + r.status);
    return (out || {}) as Record<string, string>;
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
    setNameOk(false);
    try {
      let got: { name?: string; idNumber?: string; birth?: string; unsure: string[] } | undefined;
      let a: Record<string, string> | undefined;

      // ⚠️ บันไดหมุนรูป — บทเรียน 26 ส.ค. 2569 (เจอกับรูปจริงของเจ้าของร้าน)
      //    บัตรตะแคงมาได้สองแบบ: รูปแนวตั้ง (บัตรตะแคงแน่นอน เพราะบัตรเป็นแนวนอนเสมอ)
      //    และ "รูปแนวนอนที่บัตรตะแคงอยู่ข้างใน" — แบบหลังเคยหลุดเพราะกติกาเดิม
      //    ดูแค่สัดส่วนรูปแล้วสรุปว่าไม่ต้องหมุน ทั้งที่บัตรนอนขวางอยู่ข้างใน
      //    เกณฑ์ตัดสินของทุกมุม: ที่อยู่ต้องหารหัสไปรษณีย์เจอในทะเบียนราชการ
      //    ผ่านเมื่อไหร่หยุดทันที — มุมแรกผ่านก็จ่ายเครดิตเท่าเดิม
      const dims = await new Promise<{ w: number; h: number }>((ok, no) => {
        const img = new window.Image();
        const u = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(u); ok({ w: img.width, h: img.height }); };
        img.onerror = () => { URL.revokeObjectURL(u); no(new Error("เปิดรูปไม่ได้")); };
        img.src = u;
      });
      // ⚠️ ต้องรองรับ "ถ่ายได้ทุกองศา" (เจ้าของร้านสั่ง 27 ส.ค. 2569) — ลองครบ 4 มุมเสมอ
      //    เรียงตามโอกาส: รูปแนวตั้งบัตรมักตะแคง (90/270 ก่อน) · รูปแนวนอนมักตั้งตรง (0 ก่อน)
      //    เจอมุมที่ใช่เมื่อไหร่หยุดทันที มุมท้าย ๆ แทบไม่เคยถูกยิงจริง
      //    ส่วนเอียงเล็กน้อย (±30°) AI อ่านได้เองไม่ต้องหมุนช่วย
      const ladder = dims.h > dims.w ? [90, 270, 180, 0] : [0, 90, 270, 180];

      let aiError: Error | null = null;
      let bestDeg = 0;
      let bestScore = -1;
      // มุมที่บัตรตั้งตรงคือมุมที่อ่านได้ "ครบช่องที่สุด" — ให้คะแนนความครบแล้วเก็บตัวที่ดีสุด
      // ⚠️ ห้ามใช้แค่ "มีชื่อไหม" — มุมตะแคงก็อ่านชื่อออกมาบางส่วนได้ (เจอจริง: มุม 0°
      //    ได้ "นาย บุญประกอบ" ครึ่งเดียว แล้วมุมนั้นแย่งตำแหน่งมุมจริงไป)
      const scoreOf = (r: { got: { name?: string; birth?: string }; a: Record<string, string> }) =>
        (r.got.name ? 1 : 0) + (r.got.birth ? 1 : 0) + (r.a.houseNo ? 1 : 0) +
        (r.a.moo ? 1 : 0) + (r.a.tambon ? 1 : 0) + (r.a.province ? 1 : 0);
      // "ชื่อเต็มรูปแบบไทย" (คำนำหน้า + ชื่อ + สกุล) รอดตาข่ายเทียบสองรอบได้เฉพาะ
      // ตอนบัตรตั้งตรงจริง — มุมตะแคง/กลับหัวได้อย่างมากชื่อครึ่งเดียว
      // ⚠️ ห้ามใช้คะแนนรวมตัดสินมุม — มุมกลับหัวเคยชนะเพราะเดา "บ้านเลขที่ 28"
      //    จากวันเกิด 28 เม.ย. แบบตรงกันสองรอบ (ความเพี้ยนเชิงระบบ ไม่ใช่การสุ่ม)
      const fullThaiName = (n?: string) => /^(นาย|นาง|นางสาว|น\.ส\.)\s+\S+\s+\S+/.test(n || "");
      for (const deg of ladder) {
        try {
          const r = await readByAi(file, deg);
          const f = fixThaiAddress(r.a.tambon || "", r.a.amphoe || "", r.a.province || "");
          // ⚠️ "ครบ" ต้องมีตำบลจริงด้วย — รหัสไปรษณีย์หาได้จากรหัสหลักของอำเภอ
          //    ทั้งที่ตำบลว่าง (เจอจริง 27 ส.ค. 2569 รอบ 07:16: บันไดหยุดที่มุม 0°
          //    เพราะได้ อำเภอ+จังหวัด+รหัส แล้วข้ามด่านซูมซึ่งเป็นตัวอ่านตำบลเก่งสุด)
          if (f.postcode && f.tambon) { ({ got, a } = r); bestDeg = deg; break; }
          if (fullThaiName(r.got.name)) {
            // บัตรตั้งตรงแน่แล้ว มุมอื่นไม่ต้องลอง — ที่อยู่ไปเก็บที่ด่านซูมต่อ
            ({ got, a } = r); bestDeg = deg;
            break;
          }
          const sc = scoreOf(r);
          if (sc > bestScore) { ({ got, a } = r); bestDeg = deg; bestScore = sc; }
          setBusy("ที่อยู่อ่านไม่ชัด กำลังลองอ่านอีกมุม…");
        } catch (e) {
          const msg = String((e as Error).message || "");
          // ⚠️ "ถ่ายถี่เกินไป" ห้ามลองมุมต่อ — ยิ่งลองยิ่งโดนตัวกัน
          if (msg.includes("ถี่เกินไป")) { setBusy(msg); return; }
          aiError = e as Error;                          // เบลอ/ไม่ใช่บัตร → ลองมุมถัดไป
        }
      }

      if (!got || !a) {
        const msg = String(aiError?.message || "");
        // อ่านครบทุกมุมแล้วยังไม่ได้ เพราะรูปเบลอ/ไม่ใช่บัตร — บอกตรง ๆ ให้ถ่ายใหม่
        // (tesseract ช่วยไม่ได้กับรูปแบบนี้ อ่านแย่กว่า AI อีก)
        // "เลขบัตรไม่ชัด" = คุณภาพรูปต่ำ (อ่านสองรอบไม่ตรงกัน) — บอกให้ถ่ายใหม่
        // ห้ามถอยไป tesseract กับรูปแบบนี้ มันอ่านแย่กว่า AI แล้วได้ขยะกลับมา
        if (msg.includes("ไม่ใช่บัตรประชาชน") || msg.includes("เบลอหรือมืด") || msg.includes("เลขบัตรไม่ชัด")) {
          setBusy(msg + " (แนะนำ: เปิดไฟให้สว่าง ถือนิ่ง ๆ ให้บัตรเต็มกรอบ)");
          return;
        }
        // AI ล่มจริง (เครดิตหมด/เน็ต/คีย์) — ถอยไปตัวอ่านในเครื่อง
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
      // ด่านซูมที่อยู่ — เต็มใบอ่านไม่ออกแต่ครอปซูมมักออก (เสียเครดิตเพิ่มเฉพาะตอนจำเป็น)
      const pre = a ? fixThaiAddress(a.tambon || "", a.amphoe || "", a.province || "") : null;
      if (a && pre && !(pre.postcode && pre.tambon)) {
        try {
          setBusy("กำลังซูมอ่านบรรทัดที่อยู่…");
          const z = await readAddrZone(file, bestDeg);
          // ⚠️ ค่าจากซูมชนะเต็มใบเฉพาะช่องที่ซูม "อ่านออกจริง" — ช่องที่ซูมว่าง
          //    ห้ามไปทับค่าดีจากเต็มใบ (บทเรียน 27 ส.ค. 2569: ซูมสองรอบเห็นตำบล
          //    ไม่ตรงกันเลยว่าง แล้วค่าว่างไปทับตำบลที่เต็มใบอ่านถูก — ลูกค้าเห็น
          //    ช่องตำบลหายทั้งที่รหัสไปรษณีย์ขึ้นเขียวจากรหัสหลักของอำเภอ)
          //    รวมค่าก่อน (ซูม > เต็มใบ ต่อช่อง) แล้วค่อยตรวจทะเบียนทั้งชุด
          const mg = {
            tambon: z.tambon || a.tambon || "",
            amphoe: z.amphoe || a.amphoe || "",
            province: z.province || a.province || "",
          };
          const fz = fixThaiAddress(mg.tambon, mg.amphoe, mg.province);
          if (fz.postcode && fz.tambon) {
            a = {
              ...a, ...mg,
              houseNo: z.houseNo || a.houseNo || "", moo: z.moo || a.moo || "",
            };
          }
          // ชื่อจากซูมชนะเต็มใบเช่นกัน — บรรทัดชื่อในภาพซูมใหญ่กว่าหลายเท่า
          // (นามสกุลเคยเพี้ยน บุญ→มูล ที่เต็มใบ ซ้ำสองรูป)
          if (got && /^(นาย|นาง|นางสาว|น\.ส\.)\s+\S+\s+\S+/.test(z.name || "")) {
            // ซูมกับเต็มใบตรงกัน = ยืนยันสองชั้นอิสระ → ช่องชื่อขึ้นเขียวได้
            // ไม่ตรงกัน = ใช้ค่าจากซูม (ชัดกว่า) แต่คงเหลืองให้ลูกค้าตรวจ
            const same = (z.name || "").replace(/\s+/g, " ").trim() ===
              (got.name || "").replace(/\s+/g, " ").trim();
            got = { ...got, name: z.name };
            setNameOk(same);
          }
        } catch { /* ซูมอ่านไม่ได้ก็ปล่อยว่างตามกติกาเดิม */ }
      }

      const fix = fixThaiAddress(a.tambon || "", a.amphoe || "", a.province || "");
      // ⚠️ ที่อยู่ที่ตรวจกับทะเบียนราชการไม่ผ่าน = "ว่างดีกว่าผิด" — บทเรียน 26 ส.ค. 2569
      //    เดิมเอาค่ามั่ว (มกตาบาร/ทนอนเคน/ครงธวร) ขึ้นช่องเหมือนอ่านสำเร็จ
      //    ลูกค้าไม่มีทางรู้ว่าผิดจนกว่าจะเพ่งอ่าน — เว้นว่างแล้วบอกให้กรอกเองชัด ๆ
      const addrBad = !fix.postcode && !!(a.tambon || a.amphoe || a.province);

      setD((p) => ({
        ...p,
        name: got.name || "",
        idNumber: got.idNumber || "",
        birth: got.birth ? thaiDateLabel(got.birth) : "",
        age: got.birth ? String(ageFromBirth(got.birth) ?? "") : "",
        houseNo: a.houseNo || "",
        moo: a.moo || "",
        soi: "",   // ช่องถูกเอาออกจากจอ — ห้ามเติมค่าที่ลูกค้ามองไม่เห็น
        road: "",
        tambon: addrBad ? "" : fix.tambon,
        amphoe: addrBad ? "" : fix.amphoe,
        province: addrBad ? "" : fix.province,
        // รหัสไปรษณีย์มาจากที่อยู่ที่ตรวจแล้วเสมอ ไม่ใช่ค้างของจังหวัดเดิม
        postcode: fix.postcode,
      }));
      // ที่อยู่อ่านพลาดบ่อยที่สุด ให้ไฮไลต์ทุกช่องที่มาจากบัตรเสมอ
      const addrKeys = Object.keys(a).filter((k) => k !== "houseNo" && k !== "moo");
      // ⚠️ ช่อง "ชื่อ" ต้องติดไฮไลต์ช่วยตรวจเสมอ — บทเรียน 27 ส.ค. 2569:
      //    นามสกุลเพี้ยน (บุญประกอบ→มูลประกอบ) แบบผ่านตาข่ายทุกชั้น เพราะเป็น
      //    ความเพี้ยนเชิงระบบของรูปเบลอ ชื่อไม่มีทะเบียนให้ตรวจเหมือนที่อยู่
      //    มีแต่เจ้าของบัตรเท่านั้นที่รู้ — ต้องดึงสายตาให้เขาตรวจเอง
      setUnsure(["name", ...got.unsure.filter((u) => u !== "address"), ...addrKeys]);
      // ⚠️ บอกให้ชัดว่า "อะไรที่อ่านไม่ออก" ไม่ใช่แค่นับจำนวน
      //    ลูกค้าจะได้รู้ว่าต้องกรอกช่องไหนเอง ไม่ต้องไล่หาเองทีละช่อง
      const missing = [
        !got.name && "ชื่อ",
        !got.idNumber && "เลขบัตร",
        !got.birth && "วันเกิด",
        (addrBad || !fix.province) && "ตำบล/อำเภอ/จังหวัด",
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
            : "อ่านได้ครบทุกส่วน — ช่วยตรวจตัวสะกดชื่อ-นามสกุลอีกทีก่อนพิมพ์") + fixedLabel,
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

  // ---- สร้างแบบ ลซ.๑ จากฟอร์มทางการ
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState("");

  /**
   * สร้าง PDF ที่กรอกแล้วจากฟอร์มทางการ แล้วเปิดให้พิมพ์/บันทึก
   *
   * ⚠️ ทุกอย่างเกิดในเครื่องลูกค้า — ฟอร์มเปล่ากับฟอนต์เป็นไฟล์นิ่งจาก public/doc/
   *    ข้อมูลที่กรอกไม่วิ่งออกไปไหน (เลขบัตรเป็นข้อมูลอ่อนไหวตาม PDPA)
   * ⚠️ สร้างพลาดต้องมีทางไปต่อเสมอ — ปุ่มโหลดฟอร์มเปล่าไปเขียนมืออยู่ในรายการเอกสาร
   */
  const printOfficialForm = useCallback(async () => {
    setGenBusy(true);
    setGenError("");
    try {
      const [formRes, fontRes, mod] = await Promise.all([
        fetch("/doc/lz1-form.pdf"),
        fetch("/doc/Sarabun-Regular.ttf"),
        import("@/lib/lz1pdf"),
      ]);
      if (!formRes.ok || !fontRes.ok) throw new Error("โหลดแบบฟอร์มไม่สำเร็จ");
      const bytes = await mod.buildLz1Pdf(
        {
          day: d.day, month: d.month, year: d.year,
          name: d.name, idNumber: d.idNumber,
          nationality: d.nationality, ethnicity: d.ethnicity,
          birth: d.birth, age: d.age,
          houseNo: d.houseNo, moo: d.moo, soi: d.soi, road: d.road,
          tambon: d.tambon, amphoe: d.amphoe, province: d.province,
          postcode: d.postcode, phone: d.phone, email: d.email,
          saws: d.saws.map((s) => ({ engine: s.engine, brand: s.brand, model: s.model, hp: s.hp, bar: s.bar, qty: s.qty })),
          docs: { idCopy: d.docs.idCopy, house: d.docs.house },
        },
        await formRes.arrayBuffer(),
        await fontRes.arrayBuffer(),
      );
      // เปิดในแท็บใหม่ให้กดพิมพ์/บันทึกจากตัวเปิด PDF ของเครื่อง
      // ⚠️ ห้ามใช้ window.open หลัง await ตรง ๆ — iOS บล็อกป๊อปอัปที่ไม่ได้มาจากการกดทันที
      //    ใช้ลิงก์ blob แล้วสั่งกดแทน ซึ่ง Safari นับเป็นการนำทางปกติ
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const aEl = document.createElement("a");
      aEl.href = url;
      aEl.target = "_blank";
      aEl.rel = "noopener";
      aEl.download = "แบบ-ลซ1-กรอกแล้ว.pdf";
      document.body.appendChild(aEl);
      aEl.click();
      aEl.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      setPrinted(true);
      try { localStorage.setItem(KEY + "-printed", "1"); } catch { /* โหมดส่วนตัว */ }
      // ⚠️ บันทึกขั้นแบบไม่รอผล เอกสารต้องออกมาให้ได้แม้เน็ตสะดุด
      void markStage("printed");
    } catch (e) {
      setGenError("สร้างเอกสารไม่สำเร็จ (" + (e as Error).message + ")");
    } finally {
      setGenBusy(false);
    }
  }, [d, markStage]);


  /**
   * เริ่มเรื่องใหม่ทั้งหมด — กลับไปขั้น ๑
   *
   * ⚠️ ต้องล้าง "ทั้งสองฝั่ง" ล้างฝั่งเดียวไม่พอ
   *    ฝั่งเซิร์ฟเวอร์เก็บขั้นที่เดินมาถึงกับรูปใบ ลซ.๒
   *    ฝั่งเครื่องลูกค้าเก็บร่างที่กรอกไว้ · ธงว่าพิมพ์แล้ว · จังหวัดที่เลือก
   *    ล้างแต่เซิร์ฟเวอร์ = แถบสามใบยังขึ้นว่าพิมพ์แล้ว เพราะธงนั้นอยู่ในเครื่อง
   *
   * ⚠️ ต้องถามยืนยันก่อนเสมอ ลบแล้วเอากลับไม่ได้
   *    ปุ่มนี้อยู่ในกล่องที่พับไว้ซึ่งลูกค้าอาจกดเปิดมาสำรวจเฉย ๆ
   */
  const resetCase = useCallback(async () => {
    if (!window.confirm(
      "เริ่มเรื่องใหม่ทั้งหมด?\n\n" +
      "ข้อมูลที่กรอกไว้ ขั้นที่เดินมาถึง และรูปใบ ลซ.๒ ที่ส่งให้ร้านจะถูกลบทั้งหมด\n" +
      "กดแล้วเอากลับไม่ได้",
    )) return;
    setStageBusy(true);
    try {
      if (me?.phone) {
        await fetch("/api/permit-doc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ reset: true }),
        });
      }
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(KEY + "-printed");
        localStorage.removeItem(KEY + "-useprov");
      } catch { /* โหมดส่วนตัว */ }
      // ⚠️ โหลดหน้าใหม่ทั้งหน้า ไม่ใช่แค่ตั้ง state กลับ
      //    หน้านี้มี state กระจายหลายตัว (ร่าง · รุ่น · บาร์ · จำนวน · ช่องที่ไม่มั่นใจ)
      //    ตั้งกลับทีละตัวมีโอกาสตกหล่นแล้วเหลือค่าเก่าค้างโดยไม่มีใครรู้
      window.location.href = "/permit/";
    } catch {
      setStageBusy(false);
      setLz2Msg("เริ่มใหม่ไม่สำเร็จ ลองอีกครั้ง");
    }
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

  // เบอร์โทรดึงจากบัญชีที่ล็อกอินให้เอง — เจ้าของร้านสั่ง 27 ส.ค. 2569
  // (หน้านี้บังคับล็อกอินอยู่แล้ว และบัญชีผูกกับเบอร์เป็นหลัก)
  // เติมเฉพาะตอนช่องยังว่าง — ลูกค้าพิมพ์เองแล้วห้ามทับ
  useEffect(() => {
    const ph = String(me?.phone || "").replace(/\D/g, "");
    if (ph && /^0\d{8,9}$/.test(ph)) {
      setD((p) => (p.phone ? p : { ...p, phone: ph }));
    }
  }, [me?.phone]);

  const idOk = validThaiId(d.idNumber);
  // ⚠️ ไม่มี d.qualified ในเงื่อนไขแล้ว — ช่องติ๊กถูกเอาออกตามคำสั่งเจ้าของร้าน
  //    ถ้ายังเช็คอยู่ ปุ่มพิมพ์จะเป็นสีเทาตลอดกาลโดยไม่มีอะไรบนจอบอกว่าทำไม
  const canPrint = Boolean(d.name && idOk && d.province && picked);

  // ---------------------------------------------------------------------------
  // ตรวจสดทุกช่อง — ช่องที่ตรวจผ่านขึ้น "สีเขียว" ให้เห็นว่าเชื่อได้
  // (เจ้าของร้านสั่ง 27 ส.ค. 2569 "ตรวจทุกช่องให้เป็นสีเขียว")
  //   เขียว = ตรวจผ่านจริง: เลขบัตรผ่าน checksum · ตำบล/อำเภอ/จังหวัด/รหัสตรง
  //   ทะเบียนราชการ · อายุสอดคล้องวันเกิด · เบอร์/รูปแบบถูกต้อง
  //   เหลือง = ระบบไม่มั่นใจ ช่วยดู · ปกติ = ยังไม่มีข้อมูลหรือตรวจแทนไม่ได้
  // ⚠️ ชื่อเขียวแค่ "รูปแบบครบ" (คำนำหน้า+ชื่อ+สกุล) — ตัวสะกดตรวจแทนไม่ได้
  //    เคยเพี้ยน บุญประกอบ→มูลประกอบ แบบผ่านทุกด่าน ข้อความสรุปจึงยังเตือนเสมอ
  // ---------------------------------------------------------------------------
  // อ่านอายุจากวันเกิดที่เป็นได้ทั้ง ISO และป้ายไทย "28 เมษายน 2527"
  // (ageFromBirth เดิมรับแต่ ISO — ช่องวันเกิดบนจอเป็นป้ายไทยเสมอ เลยไม่เคยเขียว)
  const thaiBirthAge = (v: string): number | null => {
    const direct = ageFromBirth(v);
    if (direct !== null) return direct;
    const months = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
      "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
    const m = /^(\d{1,2})\s+(\S+)\s+(\d{4})$/.exec(v.trim());
    if (!m) return null;
    const mi = months.findIndex((x) => x === m[2] || x.startsWith(m[2].replace(/\.$/, "")));
    if (mi < 0) return null;
    const year = Number(m[3]) - (Number(m[3]) > 2200 ? 543 : 0);
    return ageFromBirth(`${year}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  };

  const addrOk = !!findPostcode(d.province, d.amphoe, d.tambon);
  const fieldOk = (k: keyof Lz1Data): boolean => {
    const v = String(d[k] ?? "").trim();
    if (!v) return false;
    switch (k) {
      case "idNumber": return idOk;
      // ⚠️ ชื่อห้ามเขียวจากแค่รูปแบบครบ — ต้องผ่านการยืนยัน (ซูมตรงกับเต็มใบ
      //    หรือลูกค้าพิมพ์เอง) เคยขึ้นเขียวทั้งที่นามสกุลเพี้ยน
      case "name": return nameOk && /^(นาย|นาง|นางสาว|น\.ส\.)\s+\S+\s+\S+/.test(v);
      case "birth": return thaiBirthAge(v) !== null;
      case "age": {
        const fromBirth = thaiBirthAge(d.birth);
        return fromBirth !== null && String(fromBirth) === v;
      }
      case "houseNo": return /^\d+(\/\d+)?$/.test(v);
      case "moo": return /^\d{1,2}$/.test(v);
      case "tambon": case "amphoe": case "province": return addrOk;
      case "postcode":
        return !!d.tambon && addrOk && findPostcode(d.province, d.amphoe, d.tambon) === v;
      case "phone": return /^0\d{8,9}$/.test(v.replace(/\D/g, ""));
      case "email": return /.+@.+\..+/.test(v);
      default: return false;   // ตรอก/ซอย · ถนน — ไม่มีอะไรให้ตรวจ ไม่ระบายสี
    }
  };

  const field = (k: keyof Lz1Data, label: string, extra?: { wide?: boolean; type?: string }) => {
    const ok = fieldOk(k);
    // ช่องที่อยู่มีรายการจากทะเบียนราชการให้จิ้มเลือก — พิมพ์เองสะกดพลาดได้
    // (จังหวัดถูก → อำเภอเด้งเฉพาะของจังหวัดนั้น → ตำบลเด้งเฉพาะของอำเภอนั้น)
    const options =
      k === "province" ? PROVINCES :
      k === "amphoe" ? amphoesOf(d.province) :
      k === "tambon" ? tambonsOf(d.province, d.amphoe) : null;
    const listId = options && options.length ? `dl-${String(k)}` : undefined;
    return (
      <label className={extra?.wide ? "col-span-2" : ""}>
        <span className="mb-1 block text-[12px] text-ink-300">
          {label}
          {ok && <span className="ml-1 text-[#1f7a3d]">✓</span>}
        </span>
        <input
          type={extra?.type || "text"}
          value={String(d[k] ?? "")}
          list={listId}
          onChange={(e) => { if (k === "name") setNameOk(true); set(k, e.target.value); }}
          className={
            "w-full rounded-sm border px-3 py-2 text-[14px] outline-none focus:border-safety " +
            (ok
              ? "border-[#2e9e5b] bg-[#f2fbf5]"
              : unsure.includes(k as string) ? "border-[#e0a800] bg-[#fffbe6]" : "border-steel-600")
          }
        />
        {listId && options && (
          <datalist id={listId}>
            {options.map((o) => <option key={o} value={o} />)}
          </datalist>
        )}
      </label>
    );
  };

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        {/* ⚠️ ช่องรับไฟล์ต้องอยู่นอก <details> เสมอ
            เนื้อหาใน details ที่ยังไม่กางจะไม่ถูกวาดลงหน้าเลย สั่ง .click() ไม่ติด
            แล้วปุ่มถ่ายรูปในแถบความคืบหน้าจะกดไม่ขึ้นแบบเงียบ ๆ */}
          {/* ⚠️ ห้ามใส่ capture="environment" กลับมา (เจ้าของร้านสั่ง 26 ส.ค. 2569
                 "สแกนได้ด้วย อ่านภาพจากรูปบัตรประชาชนได้ด้วย")
                 capture บังคับให้เปิดกล้องทันที iOS จะไม่ให้เลือกรูปที่ถ่ายไว้แล้วเลย
                 ⇒ ถอดออกแล้ว ระบบจะขึ้นเมนูให้เลือกเอง: ถ่ายรูป / คลังภาพ / ไฟล์
                 แลกกับการกดเพิ่มหนึ่งครั้ง แต่ได้ทั้งสองทาง
                 คนที่ถ่ายบัตรเก็บไว้แล้ว หรือมีไฟล์สแกนในเครื่อง ใช้ได้ทันที */}
        <input
          ref={lz2Ref}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files || []);
            if (fs.length) void sendLz2(fs);
          }}
        />

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
        {/* ==================================================== เส้นทาง ๓ ใบ
            ออกแบบใหม่ตามคำสั่งเจ้าของร้าน (26 ส.ค. 2569)
            "ออกแบบ UI ให้ทันสมัย สวยงาม เรียบง่าย"

            หลักที่ใช้ตัดสินใจ — ทุกข้อแก้ปัญหาที่เห็นในของเดิม
            1. ของเดิมเล่าเรื่องเดียวกันสองรอบ (ป้าย ๓ ใบ + รายการ ๘ ขั้น) ซ้อนกัน
               ⇒ ป้าย ๓ ใบเหลือเป็น "ราง" บาง ๆ ไม่ใช่กล่องสามกล่อง
                 แล้วให้รายการ ๘ ขั้นเป็นรายละเอียดที่กดเปิด
            2. ของเดิมเขียน "(คุณทำ)" ต่อท้ายทุกขั้น ทั้งที่ ๕ ใน ๘ ขั้นเป็นของลูกค้า
               ⇒ ค่าเริ่มต้นคือคุณทำ ติดป้ายเฉพาะขั้นที่ "ไม่ใช่" คุณ ลดคำซ้ำไป ๕ จุด
            3. ของเดิมใช้สามสี (เขียว/ส้ม/เทา) แทน "ใครทำ" ซึ่งอ่านไม่ออกถ้าไม่มีคำกำกับ
               และสีส้มบนขั้นของร้านดูเหมือนคำเตือน
               ⇒ เหลือสองสถานะที่ลูกค้าใช้จริง: ทำแล้ว(เขียว) · ตานี้(เข้ม) · ยังไม่ถึง(จาง)
            4. กล่องซ้อนกล่องซ้อนกล่อง ⇒ ใช้เส้นคั่นบาง ๆ แทนพื้นสีทึบ

            ⚠️ ไทม์ไลน์เดินตาม stage จริงของลูกค้า ไม่ใช่รายการนิ่ง ๆ
               เป็นเหตุผลที่เจ้าของร้านสั่งให้บังคับล็อกอิน "ลูกค้าจะได้รู้ว่าทำถึงไหนแล้ว"
            ⚠️ ห้ามเขียนว่าร้านจะทำขั้น ลซ.2 / ลซ.3 ให้ — เจ้าหน้าที่เป็นคนออก ร้านไม่เกี่ยว
            ⚠️ รถวิ่งขึ้นเฉพาะหลังปริ้นแล้ว มาจากภาพร่างของเจ้าของร้าน
               "แสกนเสร็จปริ้นแล้วค่อยมีรถวิ่ง" ห้ามให้ขึ้นตั้งแต่แรก
        */}
        <section className="mt-4 overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
          <div className="px-4 pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[14px] font-bold text-ink">เส้นทางขอใบอนุญาต</h2>
              <span className="shrink-0 text-[11px] text-ink-300">๓ ใบ · ไปสำนักงาน ๒ รอบ</span>
            </div>

            {/* รางสามจุด — เส้นเชื่อมวาดด้วย before ของช่องที่ ๒ และ ๓
                จึงลากจากจุดก่อนหน้ามาถึงจุดตัวเองพอดีทุกความกว้างจอ
                (วิธีวางเส้นเป็น flex-1 คั่นกลางจะทำให้จุดแรกไม่อยู่กลางช่อง) */}
            <ol className="mt-4 flex">
              {PERMIT_STEPS.map((st, i) => {
                const done = printed && i === 0;
                const active = printed ? i === 1 : i === 0;
                return (
                  <li
                    key={st.code}
                    className={
                      "relative flex min-w-0 flex-1 flex-col items-center text-center " +
                      (i > 0
                        ? "before:absolute before:left-[-50%] before:right-1/2 before:top-[13px] before:h-px before:bg-steel-700"
                        : "")
                    }
                  >
                    {/* รถวิ่งบนเส้นช่วงแรก — ขึ้นหลังปริ้นแล้วเท่านั้น */}
                    {i === 1 && printed && (
                      <span className="absolute left-0 top-[13px] z-10 -translate-x-1/2 -translate-y-1/2 bg-white px-1">
                        <TruckArrow />
                      </span>
                    )}
                    <span
                      className={
                        // ⚠️ ขั้นที่ยังไม่ถึงต้องเป็นวงกลม "มีเส้นขอบ" ไม่ใช่พื้นสี steel-800
                        //    เพราะ steel-800 ในจานสีนี้คือสีขาว วงกลมจะจมหายไปกับพื้นการ์ด
                        //    เหลือเป็นเลขลอย ๆ แล้วเส้นเชื่อมวิ่งทะลุตัวเลข (เห็นตอนลองจริง)
                        "relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold ring-4 ring-white " +
                        (done
                          ? "bg-[#1f7a3d] text-white"
                          : active
                            ? "bg-ink text-white"
                            : "border border-steel-600 bg-white text-ink-300")
                      }
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span
                      className={
                        "mt-2 block text-[12px] font-bold leading-tight " +
                        (active || done ? "text-ink" : "text-ink-300")
                      }
                    >
                      {st.code}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-tight text-ink-300">
                      {st.title.replace("ให้มีเลื่อยโซ่ยนต์", "")}
                    </span>
                  </li>
                );
              })}
            </ol>

            {/* ⚠️ บรรทัดนี้ต้องเห็นโดยไม่ต้องกดเปิด ลูกค้าเข้าใจผิดกันบ่อยที่สุด
                ⚠️ เจ้าของร้านสั่งให้สั้น "ผมมีคลิปสรุปให้ลูกค้า" ห้ามเขียนยาวกลับมาอีก */}
            <p className="mt-4 flex gap-2 rounded-lg bg-safety-tint px-3 py-2.5 text-[12.5px] leading-relaxed text-ink">
              <span aria-hidden className="shrink-0">⚠️</span>
              <span>
                <b>ต้องขออนุญาตก่อน ร้านถึงส่งเครื่องให้ได้</b>
                <span className="mt-0.5 block text-ink-700">
                  ยื่นที่จังหวัด<b className="text-ink">ที่จะเอาเลื่อยไปใช้</b> ไม่ใช่จังหวัดตามทะเบียนบ้าน
                </span>
              </span>
            </p>

            {printed && (
              <p className="mt-2 rounded-lg bg-[#e8f5ea] px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700">
                <b className="text-[#1f7a3d]">ใบแรกเสร็จแล้ว</b> — ถือเอกสารไปยื่นที่
                {REGISTRAR_OFFICE} พร้อมสำเนาบัตรประชาชนและสำเนาทะเบียนบ้าน
              </p>
            )}
          </div>

          {/* ⚠️ ต้องบอกให้ครบทั้ง ๘ ขั้น ไม่ใช่แค่ "กรอก → ยื่น → จบ"
              ของจริงต้องไปสำนักงาน ๒ รอบ และมีร้านอยู่ตรงกลาง
              ลูกค้าที่ไปรอบแรกแล้วคิดว่าจบ พอไม่มีใบอนุญาตมาก็จะมาโวยร้าน */}
          <details className="group mt-4 border-t border-steel-800">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[12.5px] font-semibold text-ink">
              <span>ขั้นตอนทั้งหมด ๘ ขั้น</span>
              <span
                aria-hidden
                className="shrink-0 text-[11px] font-normal text-ink-300 transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>

            <ol className="px-4 pb-4">
              {PROCESS_STEPS.map((st, i) => {
                const at = STAGE_AT_STEP[stage] ?? 2;
                const done = st.n < at;
                const now = st.n === at;
                const last = i === PROCESS_STEPS.length - 1;
                return (
                  <li key={st.n} className="relative flex gap-3 pb-3 last:pb-0">
                    {/* เส้นไทม์ไลน์ต่อลงไปหาขั้นถัดไป ขั้นสุดท้ายไม่ต้องมี */}
                    {!last && (
                      <span
                        aria-hidden
                        className={
                          "absolute left-[10px] top-[22px] w-px " +
                          (done ? "bg-[#1f7a3d]/40 " : "bg-steel-700 ") +
                          "bottom-0"
                        }
                      />
                    )}
                    <span
                      className={
                        "relative z-10 mt-[3px] flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                        (done
                          ? "bg-[#1f7a3d] text-white"
                          : now
                            ? "bg-ink text-white ring-4 ring-ink/10"
                            : "border border-steel-700 bg-white text-ink-300")
                      }
                    >
                      {done ? "✓" : st.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={
                          "block text-[13px] leading-snug " +
                          (now ? "font-bold text-ink" : done ? "text-ink-700" : "text-ink")
                        }
                      >
                        {st.title}
                        {/* ⚠️ ติดป้ายเฉพาะขั้นที่ "ไม่ใช่คุณทำ"
                            ค่าเริ่มต้นคือคุณทำ ๕ ใน ๘ ขั้นจึงไม่ต้องมีป้ายเลย */}
                        {st.by !== "คุณ" && (
                          <span className="ml-1.5 whitespace-nowrap rounded-full bg-steel-900 px-1.5 py-0.5 align-middle text-[10px] font-normal text-ink-300">
                            {st.by}ทำ
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-300">
                        {st.detail}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </details>
        </section>

        {/* ⚠️ ต้องขึ้นก่อนที่ลูกค้าจะเริ่มกรอก ไม่ใช่ซ่อนไว้ท้ายหน้า
            ⚠️ ข้อความ "ไม่รับประกันว่าจะได้รับอนุญาต" ถูกเอาออกตามคำสั่งเจ้าของร้าน
               (26 ส.ค. 2569 ขีดฆ่ามาในภาพหน้าจอ) ห้ามเอากลับมาโดยไม่ถามก่อน

            ⚠️ บรรทัดบนถูกแก้ให้ตรงกับความจริงด้วย ไม่ได้อยู่ในคำสั่ง แต่ของเดิมโกหก
               เดิมเขียนว่า "อ่านในเครื่อง ... ทางร้านไม่เห็นและไม่เก็บอะไรทั้งสิ้น"
               ซึ่งเลิกจริงตั้งแต่เปลี่ยนไปให้ AI อ่านบัตร (25 ส.ค. 2569)
               รูปบัตรออกจากเครื่องลูกค้าไปแล้ว การปล่อยข้อความเดิมไว้คือประกาศเท็จ
               และขัดกับกล่องเตือนเหนือปุ่มถ่ายบัตรที่บอกตรงข้ามกันอยู่ในหน้าเดียวกัน */}
        {/* ⚠️ ย่อหน้าสรุปความเป็นส่วนตัวตรงนี้ถูกลบตามคำสั่งเจ้าของร้าน (27 ส.ค. 2569 "ลบทิ้ง")
            คำแจ้งเรื่องรูปบัตร (ส่งไปอ่าน + เก็บ 7 วัน) "ยังอยู่" ในกล่องเหลือง
            เหนือปุ่มถ่ายบัตร — กล่องนั้นคือคำแจ้งตาม PDPA ตัวจริง ห้ามลบตาม */}

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
          </section>
        )}

        {/* ------------------------------------------------ 1. เลือก
            ⚠️ ภาพร่างของเจ้าของร้านวาง "เลื่อยยนต์" กับ "ขนาดบาร์" เป็นช่องเลือก
               สองช่องเรียงคู่กันตั้งแต่แรก ใต้หัวข้อคำเดียวว่า "เลือก"
               ⇒ ห้ามซ่อนช่องขนาดบาร์ไว้หลังการเลือกรุ่น (ของเดิมทำแบบนั้น)
               ลูกค้าเห็นทีเดียวว่าต้องตอบแค่สองเรื่องก่อนจะเริ่มถ่ายบัตร */}
        {/* ==================================== ส่วนกรอกและพิมพ์แบบ ลซ.๑
            ⚠️ เจ้าของร้านสั่ง (26 ส.ค. 2569) "ถ้าผ่านขั้นตอน 1 มาแล้วก็ไม่ให้แสดงอีก"
               คนที่พิมพ์ใบไปแล้วไม่ต้องเห็นช่องเลือกรุ่นกับช่องกรอกอีก
               หน้าที่ของหน้านี้เปลี่ยนจาก "กรอกเอกสาร" เป็น "ดูว่าเรื่องถึงไหนแล้ว"

            ⚠️ พับไว้ ไม่ใช่ลบทิ้ง — ต้องกลับมาพิมพ์ซ้ำได้เสมอ
               กระดาษหาย · เจ้าหน้าที่ตีกลับให้แก้ · พิมพ์ไม่ติด
               ลบทิ้งจริงเมื่อไหร่ ลูกค้าจะไม่มีทางได้ใบใหม่เลยนอกจากโทรหาร้าน
               ค่าที่กรอกไว้ยังอยู่ครบในเครื่องเขา กางออกมาก็พิมพ์ซ้ำได้ทันที

            ⚠️ ใช้ IIFE ครอบเพื่อให้ตัวฟอร์ม "เขียนอยู่ที่เดียว" แต่วางได้สองแบบ
               ห้ามคัดลอกฟอร์มไปวางสองชุดเด็ดขาด ส่วนนี้ถูกแก้บ่อยมาก
               (วันเดียวแก้ ๘ รอบ) สองชุดเมื่อไหร่ = วันหนึ่งจะแก้ชุดเดียว
               แล้วอีกชุดค้างของเก่าไว้เงียบ ๆ โดยไม่มีอะไรฟ้อง */}
        {(() => {
          const permitForm = (
            <>
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
              ถ่ายสด หรือเลือกรูปบัตรที่มีอยู่แล้วในเครื่องก็ได้ —
              ขอให้เห็นตัวหนังสือชัด เต็มกรอบ และไม่เอียง
            </p>
            {/* ⚠️ ต้องบอกก่อนกดถ่าย ไม่ใช่หลังถ่าย
                รูปบัตรออกจากเครื่องไปให้ตัวอ่านอ่าน ลูกค้ามีสิทธิ์รู้ก่อนตัดสินใจ
                ห้ามลบบรรทัดนี้ตราบใดที่ยังส่งรูปออกไปข้างนอก */}
            {/* ⚠️ เจ้าของร้านสั่งเก็บภาพไว้ตรวจสอบ (27 ส.ค. 2569) — ประกาศต้องตรงจริง:
                เก็บ 7 วันแล้วลบอัตโนมัติ ดูได้เฉพาะร้าน (read-id.mjs keepScan) */}
            <p className="mt-1.5 rounded-sm bg-[#fffbe6] p-2 text-[12px] leading-relaxed text-ink-700">
              รูปบัตรจะถูกส่งไปให้ตัวอ่านอัตโนมัติอ่านข้อความ และ
              <b>เก็บไว้ให้ทางร้านตรวจสอบคุณภาพการอ่าน 7 วันแล้วลบอัตโนมัติ</b>
              — ไม่อยากส่งรูปก็กรอกเองด้านล่างได้เลย
            </p>
            {/* ⚠️ ห้ามใส่ capture="environment" กลับมา — ดูเหตุผลที่ช่องรับไฟล์ใบ ลซ.๒ */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
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
              ช่องเขียว ✓ = ตรวจผ่านแล้ว · ช่องเหลือง = ระบบไม่มั่นใจ ช่วยดูให้แน่ใจอีกที
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
              {/* ⚠️ ช่อง ตรอก/ซอย กับ ถนน ถูกเอาออกตามคำสั่งเจ้าของร้าน (27 ส.ค. 2569)
                  ลูกค้าร้านส่วนใหญ่อยู่ต่างจังหวัดไม่มีสองช่องนี้ — บน PDF ปล่อยเป็น
                  จุดไข่ปลาว่างให้เขียนมือ และห้ามเอาค่าที่สแกนได้ยัดลง PDF
                  โดยที่ลูกค้าไม่เห็นบนจอ (ค่าอ่านผิดจะหลุดไปทั้งที่ไม่มีใครตรวจ) */}
              {field("tambon", "ตำบล/แขวง")}
              {field("amphoe", "อำเภอ/เขต")}
              {field("province", "จังหวัด")}
              {field("postcode", "รหัสไปรษณีย์")}
              {field("phone", "โทรศัพท์")}
              {/* ช่อง E-mail ถูกเอาออกตามคำสั่งเจ้าของร้าน (27 ส.ค. 2569)
                  บน PDF ปล่อยเป็นจุดไข่ปลาว่าง — ข้อมูลใน Lz1Data ยังอยู่ตามกติกาเดิม */}
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
              onClick={() => void printOfficialForm()}
              disabled={!canPrint || genBusy}
              className="mt-2 w-full rounded-sm bg-ink py-3.5 text-[15px] font-bold text-white disabled:bg-steel-700 disabled:text-steel-300"
            >
              {/* ⚠️ ภาพร่างเขียนปุ่มนี้ว่า "ขอใบอนุญาต" จึงใช้คำนั้นเป็นตัวใหญ่
                  แต่ต้องมีบรรทัดล่างบอกว่าจริง ๆ แล้วมันคือการพิมพ์เอกสาร
                  ปุ่มที่เขียนแค่ "ขอใบอนุญาต" เฉย ๆ = ลูกค้าเข้าใจว่ากดแล้วยื่นเรื่องให้ราชการแล้ว
                  แล้วนั่งรอใบอนุญาตที่ไม่มีวันมา ซึ่งแย่กว่าคำที่ยาวขึ้นหนึ่งบรรทัดมาก
                  ห้ามตัดบรรทัดล่างออก */}
              {genBusy ? "กำลังเตรียมเอกสาร…" : "ขอใบอนุญาต"}
              <span className="mt-0.5 block text-[11.5px] font-normal opacity-80">
                🖨️ พิมพ์แบบ ลซ.๑ (ฉบับทางการ) + ใบรับรองแพทย์ แล้วนำไปยื่นเอง
              </span>
            </button>
            {genError && (
              <p className="mt-1.5 rounded-sm bg-[#fdecea] p-2.5 text-[12px] text-[#b3261e]">
                {genError} — โหลดฟอร์มเปล่าไปเขียนมือแทนได้จากปุ่มในรายการเอกสารด้านล่าง
              </p>
            )}
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
              ได้แบบ ลซ.๑ ฉบับทางการที่กรอกข้อมูลให้แล้ว (๘ หน้า — หน้า ๕-๘ เป็นของเจ้าหน้าที่)
              และใบรับรองแพทย์อีกหนึ่งแผ่น
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
                      📄 โหลดแบบฟอร์ม (PDF)
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
            </>
          );
          if (!stage) return permitForm;
          return (
            // ⚠️ กล่องนี้ต้อง "ไม่เด่น" ตามที่เจ้าของร้านสั่ง (26 ส.ค. 2569)
            //    "มันผ่านมาแล้วอยากให้เป็นสีเทาอ่อน ๆ จะได้ไม่เด่น"
            //    เป็นขั้นที่ลูกค้าทำเสร็จไปแล้ว เก็บไว้เผื่อต้องพิมพ์ซ้ำเท่านั้น
            //    ⇒ ไม่มีพื้นขาว ไม่มีเงา ใช้เส้นขอบจาง ๆ บนพื้นหน้าเว็บ
            //      ตัวหนังสือใช้สีรอง ไม่ใช่สีเข้ม
            //    ⚠️ ห้ามทำให้เด่นกว่าปุ่มของขั้นปัจจุบันที่อยู่ถัดลงไป
            //       สองอันแย่งความสนใจกัน = ลูกค้ากดผิดอันแล้วงงว่าทำไมไม่คืบหน้า
            //    ⚠️ พอกางออกมาแล้วต้องอ่านง่ายตามปกติ (พื้นขาว)
            //       จางตอนพับไว้เพื่อไม่ให้เด่น ไม่ใช่จางตอนใช้งานจริง
            <details className="group mt-5 overflow-hidden rounded-xl border border-steel-700 open:border-transparent open:bg-white open:ring-1 open:ring-black/5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[12.5px] font-semibold text-ink-300 group-open:text-ink">
                <span>
                  แก้ข้อมูลหรือพิมพ์แบบ ลซ.๑ ใหม่
                  <span className="mt-0.5 block text-[11px] font-normal text-ink-300">
                    ข้อมูลที่กรอกไว้ยังอยู่ครบ — กดถ้ากระดาษหายหรือต้องแก้
                  </span>
                </span>
                <span
                  aria-hidden
                  className="shrink-0 text-[11px] font-normal text-ink-300 transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </summary>
              <div className="px-4 pb-4">
                {permitForm}
                {/* ⚠️ ปุ่มนี้อยู่ท้ายสุดของกล่องที่พับไว้โดยตั้งใจ
                       เป็นสิ่งที่ทำลายข้อมูล ต้องหายากกว่าปุ่มอื่นทุกปุ่ม
                    ⚠️ ใช้ได้จริงกับลูกค้าด้วย ไม่ใช่มีไว้เทสอย่างเดียว
                       คนที่เลือกรุ่นผิดหรือกดขั้นผิดไปแล้ว ไม่มีทางแก้เลยถ้าไม่มีปุ่มนี้
                       (ขั้นเดินหน้าอย่างเดียว ถอยเองไม่ได้) */}
                <button
                  onClick={() => void resetCase()}
                  disabled={stageBusy}
                  className="mt-4 w-full rounded-sm border border-steel-600 py-2.5 text-[12.5px] font-semibold text-ink-300 disabled:opacity-50"
                >
                  {stageBusy ? "กำลังเริ่มใหม่…" : "เริ่มเรื่องใหม่ทั้งหมด (ลบข้อมูลที่กรอกไว้)"}
                </button>
              </div>
            </details>
          );
        })()}

        {/* ==================================== ปุ่มของขั้นที่ต้องทำตอนนี้
            ⚠️ เจ้าของร้านสั่ง (26 ส.ค. 2569) "ตัวใหม่อยากให้อยู่ล่างสุดเสมอ"
               พร้อมลูกศรชี้ให้กล่องปุ่มลงล่าง และกล่อง "แก้ข้อมูล/พิมพ์ใหม่" ขึ้นไปอยู่บน

            ⇒ ปุ่มของขั้นปัจจุบันย้ายออกมาจากในแถบความคืบหน้า มาอยู่ล่างสุดของหน้าเสมอ
              บนมือถือล่างสุดคือที่ที่นิ้วโป้งถึงง่ายที่สุด
              และเป็นสิ่งสุดท้ายที่ลูกค้าเห็นก่อนลงมือทำ
            ⚠️ ต้องอยู่ล่างสุดจริง ๆ ทุกขั้น ห้ามเอาอะไรมาต่อท้ายอีก
               มีอะไรมาต่อ = ปุ่มถูกดันขึ้นไปกลางหน้า ซึ่งผิดจากที่เจ้าของร้านสั่ง
            ⚠️ ต้องวางหลัง })()} "ตัวนอกสุด" ของบล็อกฟอร์มเท่านั้น
               ในไฟล์มีสองตัว อีกตัวเป็นของแผนที่ ทสจ. ซึ่งอยู่ข้างในฟอร์ม
               วางผิดตัวแล้ว build ยังผ่าน แต่ปุ่มจะโผล่เฉพาะตอนกางฟอร์ม (พลาดมาแล้ว)
            ⚠️ ขึ้นเฉพาะตอนมี stage คนที่ยังไม่เริ่มไม่ต้องเห็นปุ่มลอย ๆ */}
        {stage && (
          <div className="mt-3">
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

          {/* ======================================== ขั้นที่หลุดง่ายที่สุด
              เจ้าของร้านสั่ง (26 ส.ค. 2569)
              "ขั้นตอนนี้สำคัญ ทำยังไงก็ได้ให้ลูกค้ากดเมื่อได้รับใบ ลซ.๒ แล้ว
               เราจะส่งที่อยู่จ่าหน้าซองให้ลูกค้าส่งมา"

              ⚠️ ทำไมขั้นนี้หลุดง่ายกว่าทุกขั้น
                 ลูกค้าห่างจากเว็บไปแล้วอย่างน้อย ๗ วัน · ใบมาทางไปรษณีย์ ไม่ผ่านเว็บ
                 และตอนนั้นเขาจำไม่ได้แล้วว่าต้องส่งไปไหน
                 ของเดิมที่อยู่ร้านถูกพับไว้ในกล่องท้ายหน้า = ต้องรู้ก่อนว่ามีถึงจะไปหาเจอ
              ⇒ พลิกเป็น "ปุ่มมาหาเขา" กดปุ่มเดียวแล้วที่อยู่โผล่ตรงนั้นเลย
              ⚠️ ห้ามเอาปุ่มนี้ออกไปซ่อนในส่วนที่ต้องกดเปิด */}
          {stage === "submitted" && (
            <div className="mt-3 rounded-lg bg-safety-tint p-3">
              <p className="text-[13px] font-bold text-ink">ได้ใบ ลซ.๒ มาแล้วหรือยัง</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-700">
                สำนักงานจะส่งมาให้ประมาณ ๗ วันหลังยื่น — พอได้มาแล้วกดปุ่มนี้
                ร้านจะส่งที่อยู่จ่าหน้าซองให้ทันที
              </p>
              <button
                onClick={() => void markStage("gotlz2")}
                disabled={stageBusy}
                className="mt-2.5 w-full rounded-sm bg-safety py-3 text-[14.5px] font-bold text-white disabled:bg-steel-700"
              >
                {stageBusy ? "กำลังบันทึก…" : "ได้ใบ ลซ.๒ มาแล้ว"}
              </button>

              {/* ⚠️ ช่องโหว่ที่ทำให้ระบบตามเตือนทาง LINE ส่งไม่ถึงแบบเงียบ ๆ
                     ถึงลูกค้าจะล็อกอินด้วย LINE แล้ว ถ้าเขา "ไม่ได้เพิ่มเพื่อน" กับ OA
                     LINE จะตอบ 403 แล้วข้อความไม่ถึงเขาเลย โดยไม่มีอะไรฟ้องทั้งสองฝั่ง
                  ⇒ ต้องชวนเพิ่มเพื่อนตรงนี้ ซึ่งเป็นจังหวะที่เขาเห็นประโยชน์พอดี
                    (กำลังจะรอใบอีก ๗ วัน และอยากให้มีคนมาเตือน)
                  ⚠️ ห้ามบังคับ ให้เป็นทางเลือก — คนที่ไม่กดยังได้รับทาง Web Push
                    และร้านยังเห็นชื่อเขาในรายการค้างทาง Telegram อยู่ดี */}
              <a
                href={SHOP.lineUrl}
                target="_blank"
                rel="noopener"
                className="mt-2 flex items-center justify-center gap-1.5 rounded-sm border border-[#06C755] bg-white py-2.5 text-[13px] font-semibold text-[#06C755]"
              >
                เพิ่มเพื่อน {SHOP.lineOa} ให้ร้านเตือนทางไลน์ได้
              </a>
              <p className="mt-1 text-center text-[11px] text-ink-300">
                ไม่เพิ่มก็ได้ — ร้านจะติดต่อทางเบอร์โทรแทน
              </p>
            </div>
          )}

          {/* ⚠️ ลำดับที่เจ้าของร้านสั่ง (26 ส.ค. 2569)
                 "ให้กลับมากดและถ่ายรูปส่งมา แล้วร้านจะส่งที่อยู่ให้"
                 ⇒ กด → ถ่ายรูปส่ง → ถึงจะได้ที่อยู่  ห้ามสลับลำดับ
                 ที่อยู่มาทีหลังโดยตั้งใจ เพราะเป็นสิ่งที่ทำให้ลูกค้ายอมถ่ายรูปส่ง
                 ให้ที่อยู่ไปก่อน = ร้านไม่มีทางรู้เลยว่าเขาได้ใบมาจริงไหม
                 จนกว่าซองจะมาถึงอีกหลายวัน */}
          {stage === "gotlz2" && (
            <div className="mt-3 rounded-lg bg-safety-tint p-3">
              <p className="text-[13px] font-bold text-ink">ถ่ายรูปใบ ลซ.๒ ส่งให้ร้าน</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-700">
                ถ่ายให้เห็นตัวหนังสือชัด ๆ ทั้ง ๒ ตอน — ส่งเสร็จร้านจะให้ที่อยู่จ่าหน้าซองทันที
              </p>
              <button
                onClick={() => lz2Ref.current?.click()}
                disabled={lz2Busy}
                className="mt-2.5 w-full rounded-sm bg-safety py-3 text-[14.5px] font-bold text-white disabled:bg-steel-700"
              >
                {lz2Busy ? "กำลังส่ง…" : "📷 ถ่ายใบ ลซ.๒ ส่งให้ร้าน"}
              </button>
              {lz2Msg && (
                <p className="mt-2 rounded-sm bg-white p-2.5 text-[12.5px] leading-relaxed text-ink-700">
                  {lz2Msg}
                </p>
              )}
            </div>
          )}

          {/* ส่งรูปแล้ว → ร้านให้ที่อยู่ */}
          {stage === "lz2" && (
            <div className="mt-3 rounded-lg bg-[#e8f5ea] p-3">
              <p className="text-[13px] font-bold text-[#1f7a3d]">
                ได้รับรูปแล้ว — ส่งใบตัวจริงมาตามที่อยู่นี้
              </p>
              <div className="mt-2 rounded-sm bg-white p-2.5">
                <p className="text-[13px] font-semibold text-ink">{DOC_MAILING.name}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-700">
                  {DOC_MAILING.address}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-700">โทร {DOC_MAILING.phone}</p>
              </div>
              <button
                onClick={() => {
                  const txt = `${DOC_MAILING.name}\n${DOC_MAILING.address}\nโทร ${DOC_MAILING.phone}`;
                  void navigator.clipboard.writeText(txt)
                    .then(() => setLz2Msg("คัดลอกที่อยู่แล้ว"))
                    .catch(() => setLz2Msg("คัดลอกไม่ได้ ลองจดเองนะครับ"));
                }}
                className="mt-2 w-full rounded-sm border border-[#1f7a3d] bg-white py-2.5 text-[13.5px] font-semibold text-[#1f7a3d]"
              >
                คัดลอกที่อยู่สำหรับจ่าหน้าซอง
              </button>
              {/* ⚠️ ต้องบอกว่าส่งทั้ง ๒ ตอน ลูกค้าส่งมาตอนเดียวบ่อยมาก
                  แล้วร้านไม่มีตอนกลางเก็บเป็นหลักฐานการจำหน่าย */}
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-700">
                <b>ส่งมาทั้ง ๒ ตอน</b> — ร้านเก็บตอนกลางไว้เป็นหลักฐานการจำหน่าย
                แล้วส่งตอนปลายคืนพร้อมเลื่อยยนต์
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-300">
                ร้านเตรียมเครื่องให้แล้วจากรูปที่ส่งมา และจะติดต่อกลับเรื่องยอด
              </p>
            </div>
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
          </div>
        )}
        </>
        )}
      </main>

      {/* ⚠️ ไม่มีการพิมพ์จากหน้าเว็บ (window.print) อีกแล้ว — เจ้าของร้านสั่ง
             "ยึดฟอร์มทางการเป็นหลัก อันเก่าลบทิ้ง" (26 ส.ค. 2569)
          เอกสารสร้างเป็น PDF จากฟอร์มทางการใน printOfficialForm()
          ห้ามเอาเอกสารที่วาดเองด้วย HTML กลับมาอีก */}
    </>
  );
}
