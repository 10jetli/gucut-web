"use client";

import { useState } from "react";
import { teethOf } from "@/lib/useLiveStock";
import type { Variant } from "@/lib/types";

/* ตัวหาขนาดโซ่ให้ตรงกับบาร์ — แก้ปัญหา "คืนโซ่" ที่เจ้าของร้านบอกว่าเป็นปัญหาใหญ่ (5 ก.ย. 2569)
 *
 * ⚠️ **ต้นตอของปัญหา** — บาร์ "16 นิ้ว" ของแต่ละโรงงานจีนคลาดเคลื่อนไม่เท่ากัน
 *    ร้านจึงต้องมีหลายตัวเลือกในนิ้วเดียวกัน (30T กับ 30.5T ทั้งคู่คือ 16")
 *    ลูกค้าเห็น "16 นิ้ว" โผล่หลายบรรทัดแล้วเดา ⇒ ได้ของผิด ⇒ คืน
 *
 * ⚠️ **วิธีนี้ไม่ใช่ผมคิดเอง** — เป็นวิธีที่เจ้าของร้านใช้กับลูกค้าอยู่แล้วและบอกว่า "ช่วยได้"
 *    คือให้ลูกค้า **นับฟันและนับข้อต่อตามจากโซ่เดิม** ก่อนสั่ง
 *    เอามาทำเป็นหน้าจอเพื่อให้คนที่ไม่ได้ทักแชทก็ทำตามได้
 *
 * ⚠️ **ข้อต่อตามคือตัวชี้ขาด ฟันเป็นแค่ตัวตรวจทาน** — เหตุผลอยู่ที่เลข .5
 *    ชื่อ "30.5T" ไม่ได้แปลว่าครึ่งฟัน แต่แปลว่า **ข้อต่อตาม 61 ตัว (เลขคี่)**
 *    (เจ้าของร้านยืนยัน: 30T → 60 ตัว · 30.5T → 61 ตัว)
 *    ⇒ คนที่นับ "ฟัน" ได้ 30 อาจเป็นได้ทั้ง 30T และ 30.5T — ตอบไม่ได้ด้วยเลขเดียว
 *    ⇒ จึงบังคับให้กรอกข้อต่อตาม และใช้ฟันเป็นตัวจับความผิดพลาดตอนนับ
 *
 * ⚠️ **หาไม่เจอต้องบอกตรง ๆ ห้ามเดาให้ใกล้เคียง** — เดาผิดคือของถูกคืนอีกใบ
 *    ซึ่งแย่กว่าการบอกว่า "ไม่มีขนาดนี้ ทักร้านได้"
 */

/** ฟัน ↔ ข้อต่อตาม สัมพันธ์กันแบบตายตัว: ข้อต่อตาม = ฟัน × 2
 *  ⚠️ ห้ามเปลี่ยนตัวคูณนี้โดยไม่ถามเจ้าของร้าน — ตรวจกับบันไดสินค้าจริงแล้วตรงทั้งหมด
 *     (22T→44 · 30T→60 · 34T→68 · 36T→72 · 42T→84 ซึ่งเป็นเลขมาตรฐานที่ใช้กันทั้งโลก) */
const DL_PER_TOOTH = 2;

/* ── ขั้นก่อนหน้า: เช็คว่าอยู่ถูกหน้าสินค้าหรือเปล่า ──
 *  เจ้าของร้านส่งวิธีมา 5 ก.ย. 2569 (เป็นภาพของร้านเอง มีลายน้ำ GUCUT)
 *  วัดระยะ **ข้าม 3 หมุด** ได้เท่าไหร่ = โซ่เบอร์อะไร
 *
 *  ⚠️ **ขั้นนี้สำคัญกว่าการนับข้อต่อตาม** — ถ้าลูกค้าอยู่ผิดหน้าสินค้าตั้งแต่ต้น
 *     (เอาโซ่ 325 มาเทียบกับหน้า 3/8) นับข้อต่อตามให้แม่นแค่ไหนก็ได้ของผิดอยู่ดี
 *  ⚠️ ตัวเลขคือ **2 เท่าของ pitch** (3/8" = 9.525mm ⇒ วัดข้าม 3 หมุดได้ 19.05mm)
 *     เพราะวัดจากหมุดที่ 1 ถึงหมุดที่ 3 ห้ามเอา pitch ดิบมาใส่ */
const PITCH_MM: Record<string, number> = {
  "1/4": 12.7,
  "325": 16.51,
  "3/8": 19.05,
  "3/8p": 19.05,
  "404": 20.52,
};

/** ดึงเบอร์โซ่จากชื่อสินค้า — **เช็คกลุ่มที่แน่นอนที่สุดก่อนแล้ว return ทันที**
 *  ⚠️ ห้ามไล่เช็คแบบ "ชื่อมีคำนี้ไหม" ตามลำดับมั่ว ๆ — `3/8p` มีคำว่า `3/8` อยู่ข้างใน
 *     เช็ค `3/8` ก่อนจะกลืน `3/8p` ไปทั้งกลุ่ม (no-substring-classification)
 *  ⚠️ `325` ต้องใช้ขอบคำ ไม่งั้นรุ่น `3623` `3652` จะโดนจับผิดกลุ่ม
 *  ตรวจกับสินค้าโซ่จริงทั้ง 43 รายการแล้ว แยกได้ครบ ไม่มีตกหล่น (5 ก.ย. 2569)
 *  แยกไม่ได้ ⇒ คืน null แล้ว **ไม่ต้องแสดงขั้นนี้เลย** ห้ามเดา */
export function chainPitch(title: string): { code: string; mm: number } | null {
  const t = String(title ?? "");
  if (t.includes("1/4")) return { code: "1/4", mm: PITCH_MM["1/4"] };
  if (/3\/8p/i.test(t)) return { code: "3/8p", mm: PITCH_MM["3/8p"] };
  if (t.includes("404")) return { code: "404", mm: PITCH_MM["404"] };
  if (/(^|[^\d])325([^\d]|$)/.test(t)) return { code: "325", mm: PITCH_MM["325"] };
  if (t.includes("3/8")) return { code: "3/8", mm: PITCH_MM["3/8"] };
  return null;
}

export default function ChainSizeFinder({
  title,
  variants,
  onPick,
}: {
  title: string;
  variants: Variant[];
  onPick: (v: Variant) => void;
}) {
  const pitch = chainPitch(title);
  const [open, setOpen] = useState(false);
  const [dl, setDl] = useState("");
  const [teeth, setTeeth] = useState("");

  // บันไดขนาดของสินค้าตัวนี้ (เรียงจากน้อยไปมาก) — อ่านจากตัวเลือกจริง ไม่ได้ฝังตาราง
  const ladder = variants
    .map((v) => ({ v, t: teethOf(v.t) }))
    .filter((x): x is { v: Variant; t: number } => typeof x.t === "number")
    .sort((a, b) => a.t - b.t);

  if (ladder.length < 2) return null; // ไม่ใช่สินค้าที่มีหลายความยาว — ไม่ต้องขึ้นตัวช่วย

  const dlNum = Number(dl);
  const teethNum = Number(teeth);
  const dlOk = Number.isFinite(dlNum) && dlNum > 0;
  const teethOk = teeth.trim() !== "" && Number.isFinite(teethNum) && teethNum > 0;

  const want = dlOk ? dlNum / DL_PER_TOOTH : null;
  const hit = want === null ? null : (ladder.find((x) => x.t === want) ?? null);

  /* ⚠️ ยอมรับคลาดเคลื่อนได้ 0.5 — โซ่ที่ข้อต่อตามเป็นเลขคี่ (61) นับฟันจริงได้ 30 หรือ 31
      ไม่มีทางนับได้ 30.5 ⇒ บังคับให้ตรงเป๊ะจะเตือนผิดกับลูกค้าที่นับถูกแล้ว */
  const mismatch = dlOk && teethOk && want !== null && Math.abs(teethNum - want) > 0.5;

  // ใกล้เคียงที่สุด 2 ตัว ไว้บอกเวลาไม่มีขนาดนั้นจริง ๆ (บอกเฉย ๆ ไม่เลือกให้)
  const near =
    want === null
      ? []
      : [...ladder].sort((a, b) => Math.abs(a.t - want) - Math.abs(b.t - want)).slice(0, 2);

  return (
    <div className="mx-3 mb-1 rounded-lg border border-steel-600 bg-steel-100/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-[13px] font-medium text-[#1a1a1a]">
          📏 ไม่แน่ใจว่าต้องใช้กี่ฟัน? วัดจากโซ่เดิม
        </span>
        <span className="shrink-0 text-xs text-steel-300">{open ? "ซ่อน" : "กดดู"}</span>
      </button>

      {open && (
        <div className="border-t border-steel-600 px-3 py-3">
          <p className="text-[12px] leading-relaxed text-steel-300">
            บาร์ <b className="text-[#1a1a1a]">16 นิ้ว</b> ของแต่ละโรงงานยาวไม่เท่ากัน
            จึงมีหลายขนาดในนิ้วเดียวกัน — <b className="text-[#1a1a1a]">อย่าเลือกจากนิ้วอย่างเดียว</b>
          </p>

          {/* ขั้น 1 — เช็คว่าอยู่ถูกหน้าสินค้าไหม (สำคัญกว่าขั้นนับ)
              แยกเบอร์จากชื่อไม่ได้ ⇒ ไม่แสดงขั้นนี้ ไม่เดา */}
          {pitch && (
            <div className="mt-3 rounded-md border border-steel-600 bg-white px-3 py-2.5">
              <p className="text-[12px] font-medium text-[#1a1a1a]">
                ขั้นที่ 1 · เช็คว่าเป็นโซ่เบอร์เดียวกันก่อน
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-steel-300">
                เอาไม้บรรทัดทาบโซ่เดิม วัดจาก <b className="text-[#1a1a1a]">หมุดที่ 1 ถึงหมุดที่ 3</b>{" "}
                (ข้ามไป 1 หมุด)
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#1a1a1a]">
                สินค้าตัวนี้คือโซ่ <b>{pitch.code}</b> ⇒ ต้องวัดได้{" "}
                <b className="text-safety">{pitch.mm} มม.</b>
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-steel-300">
                วัดได้ไม่ตรง = คนละเบอร์ ใส่ไม่ได้ · 12.7 มม. = 1/4 · 16.51 = 325 · 19.05 = 3/8 และ
                3/8p · 20.52 = 404
              </p>
            </div>
          )}

          <p className="mt-3 text-[12px] font-medium text-[#1a1a1a]">
            ขั้นที่ {pitch ? 2 : 1} · นับจากโซ่เดิมว่ายาวเท่าไหร่
          </p>

          <div className="mt-2 space-y-2.5">
            <label className="block">
              <span className="text-[12px] text-[#1a1a1a]">
                ข้อต่อตาม (ข้อที่ยื่นลงร่องบาร์) — นับให้ครบรอบ
              </span>
              <input
                inputMode="numeric"
                value={dl}
                onChange={(e) => setDl(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="เช่น 60"
                className="mt-1 w-full rounded-md border border-steel-600 bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none focus:border-safety"
              />
            </label>

            <label className="block">
              <span className="text-[12px] text-steel-300">
                ฟัน (ใบมีดที่กัดไม้) — ใส่เพื่อตรวจทานว่านับไม่พลาด{" "}
                <span className="text-[11px]">· ไม่ใส่ก็ได้</span>
              </span>
              <input
                inputMode="decimal"
                value={teeth}
                onChange={(e) => setTeeth(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="เช่น 30"
                className="mt-1 w-full rounded-md border border-steel-600 bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none focus:border-safety"
              />
            </label>
          </div>

          {/* ⚠️ เตือนเรื่องนับไม่ตรงก่อนเสมอ — สำคัญกว่าคำตอบ เพราะถ้านับผิดคำตอบก็ผิด */}
          {mismatch && (
            <p className="mt-3 rounded-md bg-[#fff4e5] px-3 py-2 text-[12px] leading-relaxed text-[#8a4b00]">
              สองเลขไม่สอดคล้องกัน — ข้อต่อตามควรเป็นราว <b>2 เท่า</b> ของฟัน
              (นับข้อต่อตามได้ {dlNum} ⇒ ฟันควรราว {want}) ลองนับใหม่อีกรอบก่อนสั่งครับ
            </p>
          )}

          {dlOk && !mismatch && hit && (
            <div className="mt-3 rounded-md bg-[#eaf7ee] px-3 py-2.5">
              <p className="text-[12px] text-[#1f6b3a]">
                ข้อต่อตาม {dlNum} ตัว ⇒ ขนาดที่ตรงคือ
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#1a1a1a]">{hit.v.t}</p>
              {hit.v.s > 0 ? (
                <button
                  type="button"
                  onClick={() => onPick(hit.v)}
                  className="mt-2 w-full rounded-md bg-safety py-2 text-[13px] font-semibold text-white"
                >
                  เลือกขนาดนี้
                </button>
              ) : (
                <p className="mt-1.5 text-[12px] text-[#8a4b00]">
                  ขนาดนี้หมดอยู่ — ทักร้านสอบถามได้ครับ
                </p>
              )}
            </div>
          )}

          {/* ⚠️ ไม่มีในบันได = บอกตรง ๆ **ห้ามเลือกตัวใกล้เคียงให้อัตโนมัติ** */}
          {dlOk && !mismatch && !hit && (
            <p className="mt-3 rounded-md bg-steel-100 px-3 py-2 text-[12px] leading-relaxed text-[#1a1a1a]">
              สินค้าตัวนี้ไม่มีขนาด {want} ฟัน (ข้อต่อตาม {dlNum} ตัว)
              {/* ⚠️ ห้ามเขียนแท็ก HTML ลงในสตริงแล้ว join — JSX จะพิมพ์แท็กออกมาเป็นตัวหนังสือดิบ
                  (พลาดตอนเขียนรอบแรก · เป็นตระกูลเดียวกับ ${"{BRAND.name}"} ในเครื่องหมายคำพูดธรรมดา) */}
              {near.length > 0 && (
                <>
                  {" · ที่ใกล้ที่สุดคือ "}
                  {near.map((n, i) => (
                    <span key={n.v.k}>
                      {i > 0 && " กับ "}
                      <b>{n.v.t}</b>
                    </span>
                  ))}
                </>
              )}{" "}
              — <b>อย่าเพิ่งสั่ง</b> ทักร้านให้ช่วยดูก่อนจะชัวร์กว่าครับ
            </p>
          )}
        </div>
      )}
    </div>
  );
}
