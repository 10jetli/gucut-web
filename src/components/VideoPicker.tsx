"use client";

// หน้าหลังร้าน — เรียงรูปปกคลิปทั้งหมดเป็นตาราง ให้เจ้าของร้านกดเลือกเองว่าเอาใบไหน
// ทำขึ้นเพราะดูจากข้อมูลอย่างเดียวบอกไม่ได้ว่าคลิปไหนเป็นคลิปคนตัดไม้จริง
// เลือกเสร็จกด "คัดลอกรายการ" แล้วส่งข้อความที่ได้มาให้ผม เดี๋ยวตั้งเป็นค่าถาวรในโค้ดให้
import { useEffect, useMemo, useState } from "react";
import { durLabel, videoPoster, videoSrc, videos } from "@/lib/videos";

const KEY = "gucut-video-pick";
const upright = (v: (typeof videos)[number]) => v.vw / v.vh < 0.85;

export default function VideoPicker() {
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string | null>(null);   // คลิปที่กดดูอยู่

  // จำสิ่งที่เลือกไว้ในเครื่อง เผื่อเลือกไม่จบในรอบเดียว
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // ยังไม่เคยเลือก — ติ๊กคลิปแนวตั้งไว้ให้ก่อน เพราะเป็นคลิปที่ถ่ายหน้างาน
      setPick(new Set(saved ? JSON.parse(saved) : videos.filter(upright).map((v) => v.v)));
    } catch {
      setPick(new Set(videos.filter(upright).map((v) => v.v)));
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify([...pick]));
  }, [pick, ready]);

  const toggle = (id: string) =>
    setPick((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const all = (fn: (v: (typeof videos)[number]) => boolean) =>
    setPick(new Set(videos.filter(fn).map((v) => v.v)));

  const list = useMemo(() => videos.filter((v) => pick.has(v.v)).map((v) => v.v), [pick]);
  const mins = useMemo(
    () => Math.round(videos.filter((v) => pick.has(v.v)).reduce((s, v) => s + v.dur, 0) / 60),
    [pick],
  );

  const copy = async () => {
    const text = JSON.stringify(list);
    try {
      await navigator.clipboard.writeText(text);
      alert(`คัดลอกแล้ว ${list.length} คลิป — เอาไปวางในแชทได้เลย`);
    } catch {
      // บางเครื่องไม่ให้คัดลอกอัตโนมัติ เปิดให้เลือกเองแทน
      window.prompt("กดค้างเพื่อคัดลอกข้อความนี้", text);
    }
  };

  if (!ready) return <main className="grid min-h-[100dvh] place-items-center bg-carbon text-white">กำลังโหลด...</main>;

  const shown = videos.find((v) => v.v === open);

  return (
    <main className="min-h-[100dvh] bg-carbon pb-28 text-white">
      <header className="sticky top-0 z-10 bg-carbon-dark px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <h1 className="font-heading text-lg font-bold">เลือกคลิปที่จะขึ้นเว็บ</h1>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/60">
          แตะที่รูปเพื่อเอาออก/เอากลับ · แตะปุ่ม ▶ มุมขวาล่างเพื่อดูคลิปก่อนตัดสินใจ
          <br />ตอนนี้ติ๊กคลิปแนวตั้งไว้ให้ก่อนแล้ว (คลิปที่ถ่ายหน้างานมักเป็นแนวตั้ง)
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12px]">
          <Btn onClick={() => all(upright)}>เฉพาะแนวตั้ง</Btn>
          <Btn onClick={() => all((v) => upright(v) && v.a === "vizup")}>เฉพาะ Vizup แนวตั้ง</Btn>
          <Btn onClick={() => all(() => true)}>เลือกทั้งหมด</Btn>
          <Btn onClick={() => setPick(new Set())}>ล้างทั้งหมด</Btn>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-1 p-1 sm:grid-cols-4">
        {videos.map((v, i) => {
          const on = pick.has(v.v);
          return (
            <div key={v.v} className="relative aspect-[3/4] overflow-hidden rounded bg-black">
              <button
                onClick={() => toggle(v.v)}
                className="absolute inset-0"
                aria-label={`คลิปที่ ${i + 1} ${on ? "เอาออก" : "เอากลับ"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={videoPoster(v, 240)}
                  alt=""
                  loading="lazy"
                  className={`h-full w-full object-cover transition ${on ? "" : "opacity-25 grayscale"}`}
                />
              </button>

              <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] tabular-nums">
                {i + 1}
              </span>
              <span className="pointer-events-none absolute bottom-1 left-1 flex gap-1 text-[10px] tabular-nums">
                <span className="rounded bg-black/60 px-1">{durLabel(v.dur)}</span>
                {!upright(v) && (
                  <span className="rounded bg-safety px-1 font-bold">
                    {v.vw === v.vh ? "จัตุรัส" : "นอน"}
                  </span>
                )}
              </span>
              {on && (
                <span className="pointer-events-none absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-safety text-[10px] font-bold">
                  ✓
                </span>
              )}
              {/* ปุ่มดูคลิปเป็นวงเล็ก ๆ มุมเดียว — ที่เหลือทั้งใบต้องกดเลือก/ไม่เลือกได้ */}
              <button
                onClick={() => setOpen(v.v)}
                aria-label={`ดูคลิปที่ ${i + 1}`}
                className="absolute bottom-1 right-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-[11px] active:bg-black/80"
              >
                ▶
              </button>
            </div>
          );
        })}
      </div>

      {/* แถบสรุป + ปุ่มคัดลอก */}
      <div className="fixed inset-x-0 bottom-0 flex items-center gap-3 border-t border-white/15 bg-carbon-dark px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <span className="flex-1 text-[13px] leading-tight">
          เลือกไว้ <b className="font-heading text-safety">{list.length}</b> / {videos.length} คลิป
          <br />
          <span className="text-white/50">รวม {mins} นาที</span>
        </span>
        <button
          onClick={copy}
          className="rounded-sm bg-safety px-4 py-2.5 text-[14px] font-medium active:bg-safety-dark"
        >
          คัดลอกรายการ
        </button>
      </div>

      {/* ดูคลิปเต็ม ๆ ก่อนตัดสินใจ */}
      {shown && (
        <div
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-20 grid place-items-center bg-black/90 p-4"
        >
          <video
            src={videoSrc(shown)}
            poster={videoPoster(shown)}
            controls
            autoPlay
            playsInline
            className="max-h-[80dvh] w-full max-w-sm"
          />
        </div>
      )}
    </main>
  );
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-white/25 px-3 py-1 active:bg-white/15"
    >
      {children}
    </button>
  );
}
