"use client";

// แต้มสะสมของลูกค้า — /account/points/
// แต้มเก็บไว้ในบัญชีของร้านเราเอง ไม่ได้ฝากไว้กับแอปของใคร
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Log { n: number; at: number; note: string; o: string | null }
interface Data {
  on: boolean; points: number; earnPer: number; redeemValue: number;
  minRedeem: number; maxPercent: number; log: Log[];
}

const when = (ms: number) =>
  new Date(ms).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

export default function PointsView() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/points").then((r) => r.json()),
      fetch("/api/auth").then((r) => r.json()).catch(() => ({ user: null })),
    ])
      .then(([p, a]) => { setD(p); setNeedLogin(!a.user); })
      .catch(() => setD(null));
  }, []);

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-1 bg-safety px-2 py-3 text-white">
        <button onClick={() => router.back()} aria-label="ย้อนกลับ" className="p-1 text-[22px] leading-none">‹</button>
        <span className="text-[15px] font-medium">แต้มสะสม</span>
      </header>

      {/* ยอดแต้ม */}
      <section className="mx-2 mt-2 rounded-xl bg-white p-5 text-center">
        <p className="text-[12px] text-ink-300">แต้มที่มีตอนนี้</p>
        <p className="mt-1 font-heading text-[38px] font-extrabold leading-none text-safety">
          {(d?.points ?? 0).toLocaleString("th-TH")}
        </p>
        {d && d.on && (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-300">
            ซื้อครบ ฿{d.earnPer.toLocaleString("th-TH")} = 1 แต้ม<br />
            แลกส่วนลดได้ 1 แต้ม = ฿{d.redeemValue} (เริ่มแลกที่ {d.minRedeem} แต้ม · ไม่เกิน {d.maxPercent}% ของค่าสินค้า)
          </p>
        )}
        {needLogin && (
          <Link href="/account/login/?next=/account/points/" className="mt-4 inline-block rounded-sm bg-safety px-6 py-2.5 text-[14px] font-semibold text-white">
            เข้าสู่ระบบเพื่อดูแต้ม
          </Link>
        )}
      </section>

      {/* ประวัติ */}
      {!!d?.log?.length && (
        <section className="mx-2 mb-8 mt-2 overflow-hidden rounded-xl bg-white">
          <p className="border-b border-steel-700 px-4 py-3 text-[14px] font-bold text-ink">ประวัติแต้ม</p>
          {d.log.map((l, i) => (
            <div key={`${l.at}-${i}`} className="flex items-center gap-3 border-b border-steel-700 px-4 py-3 last:border-0">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink">{l.note || (l.n > 0 ? "ได้แต้ม" : "ใช้แต้ม")}</span>
                <span className="block text-[11px] text-ink-300">{when(l.at)}</span>
              </span>
              <span className={`shrink-0 text-[14px] font-bold ${l.n > 0 ? "text-[#12a150]" : "text-safety"}`}>
                {l.n > 0 ? "+" : ""}{l.n.toLocaleString("th-TH")}
              </span>
            </div>
          ))}
        </section>
      )}

      {d && !needLogin && !d.log?.length && (
        <p className="px-8 py-12 text-center text-[13px] leading-relaxed text-ink-300">
          ยังไม่มีประวัติแต้ม — แต้มจะเข้าหลังจากออเดอร์ถึงมือคุณแล้ว
        </p>
      )}
    </main>
  );
}
