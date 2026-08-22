"use client";

// ประวัติลูกค้าเก่าสมัย Shopify — /admin/legacy/
//
// ดึงออกมาก่อนปิดร้าน Shopify (26 ส.ค. 2569) เป็นข้อมูลนิ่ง ไม่มีอะไรมาอัปเดตอีก
// มีไว้ตอบคำถามเดียว: ลูกค้าที่โทรมาคนนี้ เคยซื้ออะไรกับเราไปบ้าง
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";

interface Item { t: string; q: number; p: number; sku?: string }
interface Order {
  id: string; at: string; paid: string; ship: string; total: number;
  phone: string; name: string; addr: string; items: Item[];
}
interface Person {
  name: string; phone: string; email?: string;
  spent: number; orders: number; addr?: string;
}
interface Summary { note: string; orders: number; customers: number; revenue: number }
interface Result { q: string; orders: Order[]; customers: Person[]; spent: number }

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const day = (s: string) => (s ? s.slice(0, 10) : "");

export default function AdminLegacy() {
  const [key, setKey] = useState("");
  const [sum, setSum] = useState<Summary | null>(null);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => setKey(requireKey()), []);

  useEffect(() => {
    if (!key) return;
    void (async () => {
      const r = await adminFetch("/api/legacy", key);
      if (r.ok) setSum(await r.json());
      else setErr("รหัสหลังร้านไม่ถูกต้อง");
    })();
  }, [key]);

  const search = useCallback(async () => {
    const term = q.trim();
    if (!term) return;
    setBusy(true); setErr("");
    const r = await adminFetch(`/api/legacy?q=${encodeURIComponent(term)}`, key);
    setBusy(false);
    if (!r.ok) { setErr("ค้นหาไม่สำเร็จ"); return; }
    setRes(await r.json());
  }, [q, key]);

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">ประวัติลูกค้าเก่า</span>
      </header>

      <div className="mx-auto max-w-lg p-3">
        {err && <p className="mb-3 rounded-sm bg-safety-tint px-3 py-2 text-[13px] text-safety">{err}</p>}

        {sum && (
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["ออเดอร์", sum.orders.toLocaleString("th-TH")],
              ["ลูกค้า", sum.customers.toLocaleString("th-TH")],
              ["ยอดขายรวม", baht(sum.revenue)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-sm bg-white p-2.5">
                <div className="text-[15px] font-bold text-ink">{v}</div>
                <div className="mt-0.5 text-[10.5px] text-ink-300">{k}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-3 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder="เบอร์โทร หรือ ชื่อลูกค้า"
            className="min-w-0 flex-1 rounded-sm border border-steel-600 px-3 py-2.5 text-[14px] outline-none focus:border-safety"
            autoComplete="off"
            data-1p-ignore
          />
          <button
            onClick={() => void search()}
            disabled={busy || !q.trim()}
            className="rounded-sm bg-safety px-4 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "..." : "ค้นหา"}
          </button>
        </div>

        {!res ? (
          <p className="rounded-sm bg-white p-4 text-center text-[12.5px] leading-relaxed text-ink-300">
            พิมพ์เบอร์โทรของลูกค้าที่โทรมา แล้วกดค้นหา<br />
            <span className="text-[11.5px]">พิมพ์แบบไหนก็ได้ — 081-234-5678 หรือ 0812345678</span>
          </p>
        ) : (
          <>
            {res.customers.map((c, i) => (
              <section key={i} className="mb-2 rounded-sm bg-white p-3">
                <p className="text-[14px] font-semibold text-ink">{c.name || "(ไม่มีชื่อ)"}</p>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  {c.phone || "ไม่มีเบอร์"}{c.email && <> · {c.email}</>}
                </p>
                {c.addr && <p className="mt-0.5 text-[11.5px] text-ink-300">{c.addr}</p>}
                <p className="mt-1 text-[12px] text-ink-700">
                  เคยซื้อ <b>{c.orders}</b> ครั้ง · รวม <b>{baht(c.spent)}</b>
                </p>
              </section>
            ))}

            {res.orders.length > 0 && (
              <p className="mb-2 mt-3 text-[12px] text-ink-300">
                ออเดอร์ที่เจอ {res.orders.length} ใบ · รวม {baht(res.spent)}
              </p>
            )}

            {res.orders.map((o) => (
              <section key={o.id} className="mb-2 rounded-sm bg-white p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">{o.id}</span>
                  <span className="text-[11.5px] text-ink-300">{day(o.at)}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  {o.name}{o.phone && <> · {o.phone}</>}
                </p>
                {o.addr && <p className="mt-0.5 text-[11.5px] text-ink-300">{o.addr}</p>}
                <ul className="mt-1.5 space-y-0.5">
                  {o.items.map((it, i) => (
                    <li key={i} className="flex gap-2 text-[12px]">
                      <span className="min-w-0 flex-1 text-ink">{it.t}</span>
                      <span className="shrink-0 tabular-nums text-ink-300">×{it.q}</span>
                      <span className="shrink-0 tabular-nums text-ink-500">{baht(it.p * it.q)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 border-t border-steel-800 pt-1.5 text-right text-[13px] font-semibold text-ink">
                  {baht(o.total)}
                  <span className="ml-2 text-[11px] font-normal text-ink-300">{o.paid} · {o.ship || "ยังไม่ส่ง"}</span>
                </p>
              </section>
            ))}

            {res.orders.length === 0 && res.customers.length === 0 && (
              <p className="rounded-sm bg-white p-4 text-center text-[13px] text-ink-300">
                ไม่พบประวัติของ &ldquo;{res.q}&rdquo;
              </p>
            )}
          </>
        )}

        {sum && (
          <p className="mt-3 rounded-sm bg-white p-3 text-[11px] leading-relaxed text-ink-300">
            {sum.note}
          </p>
        )}
      </div>
    </main>
  );
}
