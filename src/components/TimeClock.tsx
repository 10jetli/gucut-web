"use client";

// หน้าพนักงานลงเวลาเข้า-ออกงาน — /time/
// ใช้ในมือถือพนักงานหรือแท็บเล็ตหน้าร้านก็ได้: ใส่ PIN → กดปุ่มเดียว
// ครั้งแรกของวัน = เข้างาน · ครั้งถัดไป = เลิกงาน (กดซ้ำอัปเดตเวลาเลิกล่าสุด)
import { useEffect, useState } from "react";

interface Status {
  name: string;
  in: string | null;
  out: string | null;
  late: number;
  workStart: string;
}

export default function TimeClock() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [st, setSt] = useState<Status | null>(null);
  const [clock, setClock] = useState("");

  // นาฬิกาบนหัว — เวลาเครื่องพนักงานเอง แค่ไว้ดู เวลาจริงที่บันทึกคิดที่เซิร์ฟเวอร์
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  async function send(action: "clock" | "status") {
    if (busy || pin.length < 4) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/time", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, pin }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "ไม่สำเร็จ ลองใหม่อีกครั้ง"); setSt(null); return; }
      setSt(d);
    } catch {
      setErr("ต่อกับเซิร์ฟเวอร์ไม่ได้ — เช็คเน็ตแล้วลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  const digit = (d: string) => {
    setErr("");
    if (d === "⌫") { setPin((p) => p.slice(0, -1)); setSt(null); return; }
    setPin((p) => (p.length >= 6 ? p : p + d));
    setSt(null);
  };

  return (
    <main className="flex min-h-[100dvh] flex-col items-center bg-steel-900 px-5 pb-10 pt-[8vh]">
      <p className="font-heading text-[26px] font-extrabold italic leading-none tracking-tight">
        <span className="text-safety">GU</span><span className="text-ink">CUT</span>
      </p>
      <p className="mt-1 text-[12px] tracking-wide text-ink-500">ลงเวลาเข้า-ออกงาน</p>
      <p className="mt-4 font-heading text-[40px] font-bold tabular-nums leading-none text-ink" suppressHydrationWarning>
        {clock || "--:--:--"}
      </p>

      {/* ผลหลังกด */}
      {st && (
        <section className="mt-5 w-full max-w-xs rounded-xl bg-white p-4 text-center">
          <p className="text-[16px] font-semibold text-ink">{st.name}</p>
          <div className="mt-2 flex justify-center gap-6 text-[14px]">
            <span>
              เข้างาน{" "}
              <b className={st.late ? "text-safety" : "text-[#1f9254]"}>{st.in || "—"}</b>
            </span>
            <span>
              เลิกงาน <b className="text-ink">{st.out || "—"}</b>
            </span>
          </div>
          {st.late > 0 && (
            <p className="mt-1 text-[12px] font-medium text-safety">
              สาย {st.late} นาที (เวลาเข้างานร้าน {st.workStart})
            </p>
          )}
          {!st.out && st.in && (
            <p className="mt-1.5 text-[12px] text-ink-300">เลิกงานแล้วกลับมากดอีกครั้งนะ</p>
          )}
        </section>
      )}
      {err && <p className="mt-4 text-center text-[13px] font-medium text-safety">{err}</p>}

      {/* ช่อง PIN */}
      <div className="mt-5 flex h-8 items-center gap-2.5">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={"h-3.5 w-3.5 rounded-full " + (i < pin.length ? "bg-safety" : "border border-steel-500 bg-white")}
          />
        ))}
      </div>

      {/* แป้นตัวเลข */}
      <div className="mt-3 grid w-full max-w-xs grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) =>
          d === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => digit(d)}
              className="rounded-xl bg-white py-4 text-[20px] font-semibold text-ink active:bg-steel-800"
            >
              {d}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        disabled={busy || pin.length < 4}
        onClick={() => send("clock")}
        className="mt-4 w-full max-w-xs rounded-xl bg-safety py-4 font-heading text-[17px] font-bold text-white disabled:bg-steel-600 disabled:text-ink-300"
      >
        {busy ? "กำลังบันทึก..." : "ลงเวลา"}
      </button>
      <button
        type="button"
        disabled={busy || pin.length < 4}
        onClick={() => send("status")}
        className="mt-2 text-[13px] text-ink-500 underline disabled:opacity-40"
      >
        ดูเวลาของฉันวันนี้ (ไม่บันทึก)
      </button>

      <p className="mt-6 max-w-xs text-center text-[12px] leading-relaxed text-ink-300">
        ใส่ PIN ของตัวเองแล้วกด "ลงเวลา" — ครั้งแรกของวันคือเข้างาน กดอีกครั้งตอนเลิกงาน
        <br />
        ลืม PIN ให้ถามเจ้าของร้าน
      </p>
    </main>
  );
}
