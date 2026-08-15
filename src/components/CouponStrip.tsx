"use client";

// แถบโค้ดส่วนลดแบบ Shopee — การ์ดแดงเรียงเลื่อนแนวนอน กด "เก็บ" เข้าบัญชี
// ใช้ได้ทั้งหน้าแรกและหน้าบัญชี · ไม่มีโค้ดที่โชว์อยู่ = ไม่ขึ้นอะไรเลย (ไม่กินที่)
import Link from "next/link";
import { useEffect, useState } from "react";

interface Coupon {
  code: string;
  title: string;
  label: string;
  min: number;
  until: string | null;
  memberOnly: boolean;
  left: number | null;
}

export default function CouponStrip({ compact = false }: { compact?: boolean }) {
  const [list, setList] = useState<Coupon[]>([]);
  const [mine, setMine] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/coupon")
      .then((r) => r.json())
      .then((d) => { setList(d.coupons ?? []); setMine(d.mine ?? {}); })
      .catch(() => {});
  }, []);

  if (!list.length) return null;

  const collect = async (code: string) => {
    setBusy(code);
    setMsg("");
    try {
      const r = await fetch("/api/coupon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "collect", code }),
      });
      const j = await r.json();
      if (r.status === 401) { setMsg("เข้าสู่ระบบก่อนถึงจะเก็บโค้ดได้"); return; }
      if (!j.ok) { setMsg(j.error || "เก็บโค้ดไม่สำเร็จ"); return; }
      setMine(j.mine ?? {});
      setMsg("เก็บโค้ดแล้ว — ใช้ได้ตอนสั่งซื้อ");
    } catch {
      setMsg("ต่อกับร้านไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className={compact ? "" : "mt-2 bg-white py-3"}>
      {!compact && (
        <div className="mb-2 flex items-baseline gap-2 px-3">
          <h2 className="font-heading text-[15px] font-bold text-ink">โค้ดส่วนลดร้านค้า</h2>
          <span className="text-[11.5px] text-ink-300">เก็บไว้ใช้ตอนสั่งซื้อ</span>
        </div>
      )}

      {msg && <p className="mb-2 px-3 text-[12px] font-medium text-safety">{msg}</p>}

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-1">
        {list.map((c) => {
          const got = !!mine[c.code];
          return (
            // การ์ดโค้ด — ครึ่งซ้ายแดงบอกส่วนลด ครึ่งขวาปุ่มเก็บ (หน้าตาแบบ Shopee)
            <div key={c.code} className="flex w-[248px] shrink-0 overflow-hidden rounded-sm border border-safety/30">
              <div className="flex w-[92px] shrink-0 flex-col items-center justify-center bg-safety px-1 py-2.5 text-white">
                <span className="text-center text-[13px] font-bold leading-tight">{c.label}</span>
                {c.min > 0 && (
                  <span className="mt-0.5 text-center text-[10px] leading-tight opacity-90">
                    ซื้อครบ ฿{c.min.toLocaleString("th-TH")}
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2 bg-safety-tint px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="clamp-2 text-[12px] font-medium leading-snug text-ink">{c.title}</p>
                  <p className="mt-0.5 text-[10.5px] text-ink-300">
                    {c.memberOnly && "เฉพาะสมาชิก · "}
                    {c.until ? `ถึง ${c.until.split("-").reverse().join("/")}` : "ไม่มีวันหมดอายุ"}
                    {c.left !== null && c.left <= 20 && ` · เหลือ ${c.left} สิทธิ์`}
                  </p>
                </div>

                {got ? (
                  <span className="shrink-0 text-[11.5px] font-semibold text-ink-300">เก็บแล้ว</span>
                ) : (
                  <button
                    onClick={() => collect(c.code)}
                    disabled={busy === c.code}
                    className="shrink-0 rounded-sm bg-safety px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60"
                  >
                    {busy === c.code ? "..." : "เก็บ"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <p className="mt-1.5 px-3 text-[11px] text-ink-300">
          ยังไม่มีบัญชี? <Link href="/account/register/" className="text-safety underline">สมัครฟรี</Link> แล้วเก็บโค้ดไว้ใช้ได้เลย
        </p>
      )}
    </section>
  );
}
