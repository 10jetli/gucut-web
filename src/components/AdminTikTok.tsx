"use client";

// 🎬 ท่อคลิป TikTok — /admin/tiktok/
//
// ใบสั่งท่านประธาน 11 พ.ย. 2569: *"ไม่มีเวลาทำ คุณช่วยคิดหน่อยทำไงให้คุณลงให้ผม"* → *"ทำให้เสร็จ"*
//
// 🔴 **ทำไมหน้านี้ต้องอยู่บน gucut.com ไม่ใช่ admin.gucut.com**
//    กติการ้านคือฟีเจอร์แอดมินใหม่ทำที่ `gucut-next` ที่เดียว — ข้อนี้เป็น **ข้อยกเว้นที่มีเหตุ**
//    TikTok เขียนไว้ในหลักเกณฑ์รีวิวแอปว่า *"โดเมนของเว็บไซต์ที่แสดงในวิดีโอสาธิต
//    ต้องตรงกับ URL ของเว็บไซต์ที่คุณระบุ"* และ URL ที่จดไว้ในแอปคือ **https://gucut.com**
//    ⇒ ถ่ายสาธิตบนโดเมนอื่น = เสี่ยงถูกตีกลับด้วยเหตุที่แก้ไม่ได้ด้วยโค้ด
//    ⇒ จอฝั่ง `gucut-next` (`/web/tiktok`) **ยังอยู่เหมือนเดิม** หน้านี้ไม่ได้มาแทน
//
// 🔑 หน้านี้ไม่ได้ "ทำงาน" เอง — ท่อจริงอยู่บน g1 (`~/repost-fb-yt/ลงtiktok.py` + timer)
//    g1 ไม่มีชื่อโดเมนสาธารณะและไม่ควรเปิดพอร์ตรับ ⇒ คุยกันผ่านกล่องฝากของ `/api/tiktok-pipe`
//    ปุ่ม "ส่งเดี๋ยวนี้" = ฝากคำขอไว้ · g1 มาหยิบเองภายในหนึ่งนาที
//    ⇒ **ห้ามเขียนบนจอว่า "ส่งแล้ว" ทันทีที่กดปุ่ม** ตอนนั้นยังไม่มีอะไรถูกส่งเลย
//
// ⚠️ ค่าเริ่มต้นคือกดโหลดเอง ตามกฎที่ท่านสั่งไว้ว่าหน้าหลังร้านห้ามเช็คอัตโนมัติ
//    ยกเว้นช่วงที่มีคำขอค้างอยู่ — ตอนนั้นตามผลให้ถึงจบ ไม่งั้นคนกดปุ่มแล้วไม่รู้ว่าเกิดอะไร
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";

interface Row {
  fbid?: string;
  ชื่อ?: string;
  publish_id?: string;
  สถานะตอนส่ง?: string;
  สถานะล่าสุด?: string;
  ทาง?: string;
  ถามเมื่อ?: string;
  เหตุถามไม่ได้?: string;
  ขึ้นบัญชีแล้ว?: string | null;
  ลิงก์fb?: string;
}

interface ก้อน {
  สถานะข้อมูล?: string;
  เมื่อ?: string;
  บัญชี?: string;
  โหมด?: string;
  เพดานต่อรอบ?: number;
  รอบล่าสุด?: string;
  รายการ?: Row[];
  ดันเมื่อ?: string;
  ขอรอบค้าง?: string | null;
}

/* 🔑 แปลรหัสสถานะของ TikTok เป็นคำไทย — แต่ **ต้องโชว์ค่าดิบคู่กันเสมอ**
   เหตุผล: คำแปลคือการตีความของเรา ค่าดิบคือสิ่งที่ TikTok พูดจริง
   วันที่ TikTok เพิ่มสถานะใหม่ คำแปลจะตกยุคเงียบ ๆ แต่ค่าดิบไม่มีวันผิด
   🚫 ห้ามแปล `SEND_TO_USER_INBOX` ว่า "สำเร็จ" — มันคือ "ถึงกล่องร่าง รอกดลงในแอป" */
const คำแปล: Record<string, string> = {
  PROCESSING_UPLOAD: "กำลังประมวลผล",
  SEND_TO_USER_INBOX: "ถึงกล่องร่างในแอปแล้ว — รอกดลง",
  PUBLISH_COMPLETE: "ขึ้นช่องแล้ว",
  FAILED: "ล้มเหลว",
};

const เวลาไทย = (iso?: string) => {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleString("th-TH", {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok",
  });
};

export default function AdminTikTok() {
  const [key, setKey] = useState("");
  const [ก, setก] = useState<ก้อน | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ข้อความ, setข้อความ] = useState("");
  const ตัวตาม = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setKey(requireKey()), []);

  const โหลด = useCallback(async (k: string) => {
    if (!k) return;
    setBusy(true);
    try {
      const r = await adminFetch("/api/tiktok-pipe", k);
      if (r.status === 401) { setErr("รหัสหลังร้านไม่ถูกต้อง"); return; }
      if (!r.ok) { setErr(`อ่านข้อมูลไม่ได้ (HTTP ${r.status})`); return; }
      const j = await r.json();
      /* ⚠️ กันรูปแบบไม่ครบเสมอ — ตอน deploy ใหม่ หน้าเก่ากับ API ใหม่อยู่ด้วยกันชั่วครู่ */
      setก({ ...j, รายการ: Array.isArray(j?.รายการ) ? j.รายการ : [] });
      setErr("");
    } catch {
      setErr("ต่อเน็ตไม่ได้");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (key) void โหลด(key); }, [key, โหลด]);

  /* ตามผลให้ถึงจบเมื่อมีคำขอค้าง — g1 มาหยิบงานทุกหนึ่งนาที
     🔑 นี่ไม่ขัดกับกฎ "ห้ามเช็คอัตโนมัติ" เพราะตามเฉพาะตอนที่คนเพิ่งกดสั่งงานเอง
        และหยุดเองทันทีที่คำขอถูกหยิบไปแล้ว */
  useEffect(() => {
    const ค้าง = Boolean(ก?.ขอรอบค้าง);
    if (ตัวตาม.current) { clearInterval(ตัวตาม.current); ตัวตาม.current = null; }
    if (!ค้าง || !key) return;
    ตัวตาม.current = setInterval(() => { void โหลด(key); }, 20_000);
    return () => { if (ตัวตาม.current) clearInterval(ตัวตาม.current); };
  }, [ก?.ขอรอบค้าง, key, โหลด]);

  async function เชื่อมบัญชี() {
    setข้อความ("");
    const r = await adminFetch("/api/oauth/tiktok-video", key);
    const j = await r.json().catch(() => ({}));
    if (!j?.ลิงก์) {
      setข้อความ(`ขอลิงก์ยินยอมไม่ได้: ${j?.เหตุ || `HTTP ${r.status}`}`);
      return;
    }
    window.location.href = j.ลิงก์;
  }

  async function ส่งเดี๋ยวนี้() {
    setข้อความ("");
    setBusy(true);
    try {
      const r = await adminFetch("/api/tiktok-pipe", key, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ขอรอบ: 1 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setข้อความ(`ฝากคำขอไม่สำเร็จ: ${j?.เหตุ || `HTTP ${r.status}`}`); return; }
      /* 🚫 ห้ามเขียนว่า "ส่งแล้ว" — ตอนนี้แค่ฝากคำขอไว้ ของจริงยังไม่ถูกส่ง */
      setข้อความ("ฝากคำขอไว้แล้ว — เครื่องส่งคลิปจะมาหยิบงานภายใน 1 นาที");
      await โหลด(key);
    } finally {
      setBusy(false);
    }
  }

  if (!key) return null;

  const รายการ = ก?.รายการ ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">ท่อคลิป TikTok</h1>
        <Link href="/admin/" className="text-sm text-safety underline">← หลังร้าน</Link>
      </div>

      {err && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      )}

      {/* ── ① บัญชีที่เชื่อมไว้ (Login Kit · user.info.basic) ── */}
      <section className="mb-5 rounded-xl border border-gray-200 p-4">
        <h2 className="mb-2 font-semibold">บัญชี TikTok ที่เชื่อมไว้</h2>
        <p className="text-sm text-gray-700">
          {ก?.บัญชี
            ? <>กำลังใช้บัญชี <b>@{ก.บัญชี}</b></>
            : "ยังไม่ได้เชื่อมบัญชี"}
        </p>
        <button
          onClick={เชื่อมบัญชี}
          className="mt-3 rounded-lg bg-safety px-4 py-2 text-sm font-semibold text-white hover:bg-safety-dark"
        >
          เชื่อมบัญชี TikTok
        </button>
        <p className="mt-2 text-xs text-gray-500">
          เปิดหน้ายินยอมของ TikTok เพื่อขอสิทธิ์อ่านชื่อบัญชี และสิทธิ์ส่งคลิปขึ้นบัญชีนี้
        </p>
      </section>

      {/* ── ② ส่งคลิป (Content Posting API · video.publish / video.upload) ── */}
      <section className="mb-5 rounded-xl border border-gray-200 p-4">
        <h2 className="mb-2 font-semibold">ส่งคลิปใหม่ขึ้น TikTok</h2>
        <p className="text-sm text-gray-700">
          ระบบจะหยิบคลิปใหม่จากเพจเฟซบุ๊กของร้าน แล้วส่งขึ้นบัญชี TikTok ที่เชื่อมไว้
          {typeof ก?.เพดานต่อรอบ === "number" && <> (รอบละไม่เกิน {ก.เพดานต่อรอบ} คลิป)</>}
        </p>
        <button
          onClick={ส่งเดี๋ยวนี้}
          disabled={busy}
          className="mt-3 rounded-lg bg-safety px-4 py-2 text-sm font-semibold text-white hover:bg-safety-dark disabled:opacity-50"
        >
          ส่งคลิปขึ้น TikTok เดี๋ยวนี้
        </button>
        {ก?.ขอรอบค้าง && (
          <p className="mt-2 text-sm text-amber-700">
            มีคำขอค้างอยู่ตั้งแต่ {เวลาไทย(ก.ขอรอบค้าง)} — รอเครื่องส่งคลิปมาหยิบงาน
          </p>
        )}
        {ข้อความ && <p className="mt-2 text-sm text-gray-700">{ข้อความ}</p>}
      </section>

      {/* ── ③ ผลที่เกิดขึ้นจริง ── */}
      <section className="rounded-xl border border-gray-200 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">คลิปที่ส่งขึ้น TikTok แล้ว</h2>
          <button
            onClick={() => void โหลด(key)}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy ? "กำลังโหลด…" : "โหลดใหม่"}
          </button>
        </div>

        {/* 🔴 สามสถานะ ไม่ใช่สองสถานะ: "ยังไม่เคยมีใครดันข้อมูลขึ้นมา" ≠ "ไม่มีคลิปสักใบ" */}
        {ก?.สถานะข้อมูล && ก.สถานะข้อมูล !== "มีข้อมูล" ? (
          <p className="text-sm text-amber-700">
            ยังไม่มีข้อมูลจากเครื่องส่งคลิป ({ก.สถานะข้อมูล})
          </p>
        ) : รายการ.length === 0 ? (
          <p className="text-sm text-gray-600">ยังไม่มีคลิปที่ส่งขึ้น TikTok</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {รายการ.map((x) => {
              const ดิบ = x.สถานะล่าสุด || x.สถานะตอนส่ง || "";
              return (
                <li key={x.publish_id || x.fbid} className="py-2 text-sm">
                  <div className="font-medium">{x.ชื่อ || x.fbid}</div>
                  <div className="text-gray-600">
                    {/* คำแปล + ค่าดิบเสมอ — ดูเหตุผลที่หัวไฟล์ */}
                    {คำแปล[ดิบ] || "สถานะที่ยังไม่รู้จัก"}{" "}
                    <span className="text-gray-400">({ดิบ || "—"})</span>
                    {x.ทาง && <> · ทาง {x.ทาง}</>}
                  </div>
                  <div className="text-xs text-gray-400">
                    ตรวจสถานะล่าสุดเมื่อ {เวลาไทย(x.ถามเมื่อ)}
                  </div>
                  {x.เหตุถามไม่ได้ && (
                    /* 🔴 "ถามสถานะไม่ได้" ≠ "ไม่มีสถานะ" — ต้องเห็น ไม่ใช่กลืนหาย */
                    <div className="text-xs text-amber-700">
                      ถามสถานะล่าสุดไม่ได้: {x.เหตุถามไม่ได้}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {ก?.ดันเมื่อ && (
          <p className="mt-3 text-xs text-gray-400">
            ข้อมูลจากเครื่องส่งคลิปเมื่อ {เวลาไทย(ก.ดันเมื่อ)}
          </p>
        )}
      </section>
    </main>
  );
}
