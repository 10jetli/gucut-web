"use client";

// ตั้งค่าแต้มสะสม + ปรับแต้มให้ลูกค้ามือ — /admin/points/
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";

interface Cfg { on: boolean; earnPer: number; redeemValue: number; minRedeem: number; maxPercent: number }

export default function AdminPoints() {
  const [key, setKey] = useState("");
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState("");
  const [phone, setPhone] = useState("");
  const [n, setN] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => setKey(requireKey()), []);

  const load = useCallback(() => {
    fetch("/api/points").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!cfg) return;
    setMsg("");
    const r = await adminFetch("/api/points", key, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "settings", ...cfg }),
    });
    setMsg(r.ok ? "บันทึกแล้ว" : "บันทึกไม่สำเร็จ");
  };

  const adjust = async () => {
    setMsg("");
    const r = await adminFetch("/api/points", key, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "adjust", phone, n: Number(n), note }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setMsg(j?.error || "ปรับแต้มไม่สำเร็จ"); return; }
    setMsg(`ปรับแล้ว — ตอนนี้ลูกค้ามี ${j.points} แต้ม`);
    setN(""); setNote("");
  };

  const input = "w-full rounded-sm border border-steel-600 px-3 py-2 text-[14px] outline-none focus:border-safety";
  const F = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-ink-300">{hint}</span>}
    </label>
  );

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">แต้มสะสม</span>
      </header>

      <div className="mx-auto max-w-lg p-3">
        {msg && <p className="mb-3 rounded-sm bg-safety-tint px-3 py-2 text-[13px] text-safety">{msg}</p>}

        <section className="mb-3 rounded-sm bg-white p-4">
          <p className="mb-3 text-[14px] font-bold text-ink">กติกาแต้ม</p>
          {!cfg ? (
            <p className="py-6 text-center text-[13px] text-ink-300">กำลังโหลด...</p>
          ) : (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={cfg.on} onChange={(e) => setCfg({ ...cfg, on: e.target.checked })} className="h-4 w-4 accent-[#ff3c00]" />
                เปิดใช้ระบบแต้มสะสม
              </label>
              <F label="ซื้อครบกี่บาท = 1 แต้ม" hint="นับจากค่าสินค้า ไม่รวมค่าส่ง">
                <input type="number" inputMode="numeric" value={cfg.earnPer} onChange={(e) => setCfg({ ...cfg, earnPer: Number(e.target.value) })} className={input} />
              </F>
              <F label="1 แต้ม แลกได้กี่บาท">
                <input type="number" inputMode="decimal" value={cfg.redeemValue} onChange={(e) => setCfg({ ...cfg, redeemValue: Number(e.target.value) })} className={input} />
              </F>
              <F label="ต้องมีกี่แต้มถึงเริ่มแลกได้">
                <input type="number" inputMode="numeric" value={cfg.minRedeem} onChange={(e) => setCfg({ ...cfg, minRedeem: Number(e.target.value) })} className={input} />
              </F>
              <F label="แลกได้ไม่เกินกี่ % ของค่าสินค้า" hint="กันลูกค้าแลกแต้มจนบิลเป็นศูนย์">
                <input type="number" inputMode="numeric" value={cfg.maxPercent} onChange={(e) => setCfg({ ...cfg, maxPercent: Number(e.target.value) })} className={input} />
              </F>
              <button onClick={save} className="w-full rounded-sm bg-safety py-2.5 text-[14px] font-semibold text-white">
                บันทึกกติกา
              </button>
              <p className="text-[11.5px] leading-relaxed text-ink-300">
                ตัวอย่าง: ซื้อครบ ฿{cfg.earnPer.toLocaleString("th-TH")} ได้ 1 แต้ม ·
                {" "}ลูกค้าซื้อ ฿10,000 จะได้ {Math.floor(10000 / (cfg.earnPer || 1))} แต้ม
                {" "}= ส่วนลด ฿{Math.floor(Math.floor(10000 / (cfg.earnPer || 1)) * cfg.redeemValue).toLocaleString("th-TH")}
              </p>
            </div>
          )}
        </section>

        <section className="rounded-sm bg-white p-4">
          <p className="mb-1 text-[14px] font-bold text-ink">ปรับแต้มให้ลูกค้า</p>
          <p className="mb-3 text-[11.5px] leading-relaxed text-ink-300">
            ใช้ตอนย้ายแต้มเก่าจากระบบอื่น หรือชดเชยให้ลูกค้า · ใส่ตัวเลขติดลบเพื่อหักแต้ม
          </p>
          <div className="space-y-2.5">
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} placeholder="เบอร์โทรลูกค้า" inputMode="tel" className={input} />
            <input value={n} onChange={(e) => setN(e.target.value.replace(/[^0-9-]/g, ""))} placeholder="จำนวนแต้ม เช่น 100 หรือ -50" inputMode="numeric" className={input} />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เหตุผล (ลูกค้าเห็นในประวัติ)" className={input} />
            <button
              onClick={adjust}
              disabled={!phone || !n}
              className="w-full rounded-sm border border-safety py-2.5 text-[14px] font-semibold text-safety disabled:border-steel-600 disabled:text-ink-300"
            >
              ปรับแต้ม
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
