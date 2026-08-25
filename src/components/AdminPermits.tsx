"use client";

// ขอทะเบียนเลื่อยยนต์ — หน้าสำหรับร้านติดตามว่าลูกค้าแต่ละคนเดินมาถึงขั้นไหน
//
// ⚠️ ลูกค้าต้องล็อกอินถึงทำเรื่องได้ (เจ้าของร้านสั่ง 25 ส.ค. 2569)
//    หนึ่งลูกค้า = หนึ่งเรื่อง ผูกกับเบอร์โทรของบัญชี
//
// ⚠️ รูปในหน้านี้เป็นเอกสารราชการของลูกค้า มีชื่อ เลขบัตร ที่อยู่ และเลขที่ใบอนุญาต
//    ห้ามทำปุ่มแชร์ ปุ่มดาวน์โหลดเป็นลิงก์สาธารณะ หรือส่งต่อไปที่อื่น
//
// ⚠️ รูปต้องดึงผ่าน adminFetch เท่านั้น เปิด URL ตรง ๆ ในแท็บใหม่ไม่ได้
//    เพราะรหัสหลังร้านอยู่ในหัวข้อความ ไม่ได้อยู่ในคุกกี้
//    (กติกาเดียวกับรูปลงเวลาพนักงาน)
//
// ⚠️ รูปไม่ได้แทนเอกสารตัวจริง ร้านยังต้องได้ ลซ.๒ ตอนกลางตัวจริงมาเก็บ
//    สถานะ "ได้ตัวจริงแล้ว" จึงต้องมี ไม่งั้นร้านจำไม่ได้ว่าใบไหนได้ซองแล้ว

import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";
import { CASE_STAGES, type CaseStage } from "@/lib/permit";

// ⚠️ หนึ่งลูกค้า = หนึ่งเรื่อง ผูกกับเบอร์โทรของบัญชี (ไม่ใช่ id สุ่มอีกแล้ว)
//    เจ้าของร้านสั่งให้ต้องล็อกอินถึงทำเรื่องได้ ตัวตนจึงมาจากบัญชีเสมอ
interface Doc {
  phone: string;
  name: string;
  at: string;
  stage: string;
  history?: Record<string, string>;
  saw?: string;
  province?: string;
  note?: string;
  images: number;
  updatedAt?: string;
}

const LABEL = (st: string) =>
  CASE_STAGES.find((x) => x.key === st)?.label || "ยังไม่เริ่ม";

// รอร้านทำ = ลูกค้าส่งรูปมาแล้วแต่ร้านยังไม่ได้กดว่าได้ตัวจริง
const TONE = (st: string) =>
  st === "lz2" ? "bg-safety text-white"
  : st === "done" ? "bg-steel-700 text-ink-700"
  : st ? "bg-[#1f7a3d] text-white"
  : "bg-steel-700 text-ink-700";

/** วันเวลาแบบไทย — ครอบ try เผื่อเบราว์เซอร์เก่าสร้าง Intl ไม่ได้ */
function whenLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminPermits() {
  const [key, setKey] = useState("");
  const [items, setItems] = useState<Doc[] | null>(null);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState("");   // เก็บเบอร์ของเรื่องที่กางอยู่
  const [imgs, setImgs] = useState<string[]>([]);
  const [loadingImg, setLoadingImg] = useState(false);

  useEffect(() => setKey(requireKey()), []);

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await adminFetch("/api/permit-doc", key);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      // ⚠️ กันรูปแบบไม่ครบเสมอ ตอน deploy ใหม่หน้าเก่ากับ API ใหม่จะอยู่ด้วยกันชั่วครู่
      setItems(Array.isArray(d?.items) ? d.items : []);
    } catch {
      setErr("โหลดรายการไม่สำเร็จ ลองใหม่ หรือเข้าระบบใหม่อีกครั้ง");
      setItems([]);
    }
  }, [key]);

  useEffect(() => { if (key) load(); }, [key, load]);

  const open = async (id: string) => {
    if (openId === id) { setOpenId(""); setImgs([]); return; }
    setOpenId(id);
    setImgs([]);
    setLoadingImg(true);
    try {
      const r = await adminFetch(`/api/permit-doc?phone=${encodeURIComponent(id)}`, key);
      const d = await r.json().catch(() => null);
      setImgs(Array.isArray(d?.imageData) ? d.imageData : []);
    } catch {
      setErr("เปิดรูปไม่สำเร็จ");
    } finally {
      setLoadingImg(false);
    }
  };

  const setStage = async (phone: string, stage: CaseStage) => {
    setErr("");
    const r = await adminFetch("/api/permit-doc", key, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, stage }),
    });
    if (!r.ok) { setErr("เปลี่ยนขั้นไม่สำเร็จ"); return; }
    setItems((cur) => (cur ?? []).map((x) => (x.phone === phone ? { ...x, stage } : x)));
  };

  const waiting = (items ?? []).filter((x) => x.stage === "lz2").length;

  return (
    <main className="mx-auto w-full max-w-[760px] px-3 pb-16 pt-4">
      <h1 className="text-[18px] font-bold text-ink">ขอทะเบียนเลื่อยยนต์</h1>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-300">
        ลูกค้าที่ล็อกอินแล้วทำเรื่องผ่านหน้า /permit/ — ที่นี่เห็นว่าแต่ละคนเดินมาถึงขั้นไหน
        <b className="mt-1 block text-ink-700">
          รูปใช้แทนเอกสารตัวจริงไม่ได้ — ยังต้องได้ ลซ.๒ ตอนกลางตัวจริงมาเก็บไว้เป็นหลักฐานการจำหน่าย
        </b>
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={load}
          className="rounded-sm border border-steel-600 px-3 py-1.5 text-[13px] font-semibold text-ink"
        >
          โหลดใหม่
        </button>
        {waiting > 0 && (
          <span className="rounded-sm bg-safety px-2 py-1 text-[12px] font-bold text-white">
            รอดำเนินการ {waiting}
          </span>
        )}
      </div>

      {err && (
        <p className="mt-3 rounded-sm bg-[#fdecea] p-2.5 text-[12.5px] text-[#b3261e]">{err}</p>
      )}

      {items === null && <p className="mt-4 text-[13px] text-ink-300">กำลังโหลด…</p>}
      {items?.length === 0 && !err && (
        <p className="mt-4 rounded-sm bg-steel-900 p-3 text-[13px] text-ink-300">
          ยังไม่มีลูกค้าเริ่มทำเรื่องขอทะเบียน
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {(items ?? []).map((x) => (
          <li key={x.phone} className="rounded-sm bg-white p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-ink">{x.name}</p>
                <p className="mt-0.5 text-[13px] text-ink-700">
                  <a href={`tel:${x.phone}`} className="underline">{x.phone}</a>
                </p>
                {x.saw && <p className="mt-0.5 text-[12px] text-ink-300">เลื่อย: {x.saw}</p>}
                {x.province && <p className="text-[12px] text-ink-300">ยื่นที่: {x.province}</p>}
                {x.note && <p className="mt-0.5 text-[12px] text-ink-700">“{x.note}”</p>}
                <p className="mt-0.5 text-[11px] text-ink-300">{whenLabel(x.at)}</p>
              </div>
              <span className={"shrink-0 rounded-sm px-2 py-1 text-[11px] font-bold " + TONE(x.stage)}>
                {LABEL(x.stage)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {x.images > 0 && (
                <button
                  onClick={() => open(x.phone)}
                  className="rounded-sm border border-steel-600 px-2.5 py-1.5 text-[12.5px] font-semibold text-ink"
                >
                  {openId === x.phone ? "ซ่อนรูป" : `ดูใบ ลซ.๒ (${x.images})`}
                </button>
              )}
              {/* ⚠️ ปุ่มของร้านมีแค่สองขั้นที่ร้านทำจริง (ได้ตัวจริง · ส่งเครื่อง)
                  ขั้นอื่นลูกค้ากดเองจากหน้า /permit/ ฝั่งเซิร์ฟเวอร์กันไว้แล้ว
                  แต่ร้านตั้งขั้นไหนก็ได้ผ่าน PATCH เพราะเป็นคนแก้ให้ตอนลูกค้ากดผิด */}
              {x.stage !== "got" && (
                <button
                  onClick={() => setStage(x.phone, "got")}
                  className="rounded-sm border border-steel-600 px-2.5 py-1.5 text-[12.5px] font-semibold text-ink"
                >
                  ได้ใบตัวจริงแล้ว
                </button>
              )}
              {x.stage !== "shipped" && (
                <button
                  onClick={() => setStage(x.phone, "shipped")}
                  className="rounded-sm border border-steel-600 px-2.5 py-1.5 text-[12.5px] font-semibold text-ink"
                >
                  ส่งเลื่อยแล้ว
                </button>
              )}
            </div>

            {openId === x.phone && (
              <div className="mt-2 space-y-2">
                {loadingImg && <p className="text-[12.5px] text-ink-300">กำลังเปิดรูป…</p>}
                {/* eslint-disable-next-line @next/next/no-img-element --
                    รูปเป็น data URL ที่ดึงผ่าน adminFetch แล้วถือไว้ในหน่วยความจำ
                    next/image ใช้ไม่ได้เพราะไม่มี URL ให้มันไปโหลดเอง */}
                {imgs.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`ใบ ลซ.๒ ของ ${x.name} รูปที่ ${i + 1}`}
                    className="w-full rounded-sm border border-steel-700"
                  />
                ))}
                {!loadingImg && !imgs.length && (
                  <p className="text-[12.5px] text-ink-300">ไม่พบรูปในใบนี้</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
