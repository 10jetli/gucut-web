"use client";

// หลังร้าน: ออเดอร์ — /admin/orders/
// รายการออเดอร์ทั้งหมด กดเปิดดูเต็มใบ (ที่อยู่ / สลิป / ใบกำกับภาษี) แล้วเปลี่ยนสถานะได้
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, clearKey, requireKey } from "@/lib/admin";
import { formatPrice } from "@/lib/types";

type Status = "new" | "confirmed" | "shipped" | "done" | "cancelled";

interface OrderItem { title: string; variant: string; price: number; qty: number }
interface Order {
  id: string;
  at: number;
  status: Status;
  customer: { name: string; phone: string; address: string; province: string; zip: string; note: string };
  items: OrderItem[];
  payment: "cod" | "promptpay";
  paymentLabel: string;
  couponCode: string | null;
  discount: number;
  subtotal: number;
  shipping: number;
  codFee: number;
  total: number;
  taxInvoice: { name: string; taxId: string; address: string } | null;
  hasSlip: boolean;
  zort?: { ok: boolean; skipped?: boolean; message?: string };
}

// ป้ายสถานะ — ชื่อไทย + สี ใช้ทั้งตัวกรองและปุ่มเปลี่ยนสถานะ
const STATUS: { key: Status; t: string; cls: string }[] = [
  { key: "new",       t: "ใหม่",        cls: "bg-safety text-white" },
  { key: "confirmed", t: "รับแล้ว",     cls: "bg-[#1d6fd1] text-white" },
  { key: "shipped",   t: "ส่งแล้ว",     cls: "bg-[#7c3aed] text-white" },
  { key: "done",      t: "จบงาน",       cls: "bg-[#1f9254] text-white" },
  { key: "cancelled", t: "ยกเลิก",      cls: "bg-steel-600 text-white" },
];
const badge = (s: Status) => STATUS.find((x) => x.key === s) ?? STATUS[0];

const when = (ms: number) =>
  new Date(ms).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AdminOrders() {
  const [key, setKey] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [openId, setOpenId] = useState("");
  const [slip, setSlip] = useState<Record<string, string | null>>({});
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => setKey(requireKey()), []);

  const load = useCallback(async (k: string) => {
    setErr("");
    try {
      const r = await adminFetch("/api/orders", k);
      if (r.status === 401) { clearKey(); window.location.replace("/admin/?next=/admin/orders/"); return; }
      if (!r.ok) throw new Error();
      const d = await r.json();
      setOrders(d.orders || []);
    } catch {
      setErr("โหลดรายการไม่สำเร็จ — ลองกดรีเฟรช");
      setOrders((o) => o ?? []);
    }
  }, []);

  useEffect(() => {
    if (key) load(key);
  }, [key, load]);

  // เปิดดูใบไหนค่อยโหลดสลิปใบนั้น — สลิปเป็นรูปใหญ่ ไม่โหลดมาทั้งกระดาน
  async function open(o: Order) {
    const next = openId === o.id ? "" : o.id;
    setOpenId(next);
    if (next && o.hasSlip && slip[o.id] === undefined) {
      try {
        const r = await adminFetch(`/api/orders?id=${encodeURIComponent(o.id)}`, key);
        const d = await r.json();
        setSlip((m) => ({ ...m, [o.id]: d.slip ?? null }));
      } catch {
        setSlip((m) => ({ ...m, [o.id]: null }));
      }
    }
  }

  // ส่งเข้า ZORT ซ้ำ — ใช้ตอนรอบแรกพัง (เช่น ZORT ล่มพอดี)
  async function retryZort(o: Order) {
    if (busyId) return;
    setBusyId(o.id);
    try {
      const r = await adminFetch("/api/orders", key, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id, action: "zort" }),
      });
      const d = await r.json();
      if (d.order) setOrders((list) => (list ?? []).map((x) => (x.id === o.id ? d.order : x)));
      if (!d.ok) setErr("ส่งเข้า ZORT ยังไม่สำเร็จ: " + (d.order?.zort?.message || "ไม่ทราบสาเหตุ"));
    } catch {
      setErr("ส่งเข้า ZORT ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusyId("");
    }
  }

  async function setStatus(o: Order, status: Status) {
    if (busyId) return;
    setBusyId(o.id);
    try {
      const r = await adminFetch("/api/orders", key, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id, status }),
      });
      if (!r.ok) throw new Error();
      setOrders((list) => (list ?? []).map((x) => (x.id === o.id ? { ...x, status } : x)));
    } catch {
      setErr("เปลี่ยนสถานะไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusyId("");
    }
  }

  const shown = (orders ?? []).filter((o) => filter === "all" || o.status === filter);
  const count = (s: Status) => (orders ?? []).filter((o) => o.status === s).length;

  return (
    <main className="min-h-[100dvh] bg-steel-900 pb-10">
      <header className="flex items-center gap-1 bg-ink px-2 py-3">
        <Link href="/admin/" aria-label="กลับ" className="p-1 text-[22px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">ออเดอร์</span>
        <button
          onClick={() => { setOrders(null); load(key); }}
          className="ml-auto rounded-sm border border-white/25 px-2.5 py-1 text-[12px] text-white/80"
        >
          รีเฟรช
        </button>
      </header>

      {/* ตัวกรองสถานะ */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 py-2.5">
        <Chip on={filter === "all"} onClick={() => setFilter("all")}>
          ทั้งหมด ({orders?.length ?? "…"})
        </Chip>
        {STATUS.map((s) => (
          <Chip key={s.key} on={filter === s.key} onClick={() => setFilter(s.key)}>
            {s.t} ({count(s.key)})
          </Chip>
        ))}
      </div>

      {err && <p className="px-3 pb-2 text-[13px] text-safety">{err}</p>}

      {orders === null ? (
        <p className="px-3 py-10 text-center text-[13px] text-ink-300">กำลังโหลด...</p>
      ) : shown.length === 0 ? (
        <p className="px-3 py-10 text-center text-[13px] text-ink-300">
          {filter === "all" ? "ยังไม่มีออเดอร์เข้ามา" : "ไม่มีออเดอร์สถานะนี้"}
        </p>
      ) : (
        <div className="space-y-2 px-2">
          {shown.map((o) => {
            const b = badge(o.status);
            const openNow = openId === o.id;
            return (
              <section key={o.id} className="overflow-hidden rounded-xl bg-white">
                {/* หัวใบ — กดเพื่อเปิด/ปิดรายละเอียด */}
                <button onClick={() => open(o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-ink">#{o.id}</span>
                      <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + b.cls}>{b.t}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-ink-500">
                      {o.customer.name} · {when(o.at)} · {o.paymentLabel}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-heading text-[15px] font-bold text-safety">{formatPrice(o.total)}</span>
                    <span className="text-[11px] text-ink-300">{o.items.reduce((s, i) => s + i.qty, 0)} ชิ้น</span>
                  </span>
                </button>

                {openNow && (
                  <div className="border-t border-steel-700 px-3 py-2.5 text-[13px]">
                    {/* รายการสินค้า */}
                    {o.items.map((i, n) => (
                      <div key={n} className="flex justify-between gap-2 py-0.5">
                        <span className="min-w-0 flex-1 text-ink-700">
                          {i.title}
                          {i.variant && i.variant !== "-" ? ` (${i.variant})` : ""} ×{i.qty}
                        </span>
                        <span className="shrink-0">{formatPrice(i.price * i.qty)}</span>
                      </div>
                    ))}
                    <div className="mt-1.5 space-y-0.5 border-t border-steel-800 pt-1.5 text-[12px] text-ink-500">
                      {o.discount > 0 && <p>ส่วนลด ({o.couponCode}) −{formatPrice(o.discount)}</p>}
                      {o.shipping > 0 && <p>ค่าส่ง {formatPrice(o.shipping)}</p>}
                      {o.codFee > 0 && <p>ค่าบริการ COD {formatPrice(o.codFee)}</p>}
                      <p className="font-semibold text-ink">รวม {formatPrice(o.total)} · {o.paymentLabel}</p>
                    </div>

                    {/* ผู้รับ — เบอร์กดโทรได้เลย */}
                    <div className="mt-2 rounded-sm bg-steel-800 p-2.5 text-[12px] leading-relaxed text-ink-700">
                      <p className="font-semibold text-ink">
                        {o.customer.name}{" "}
                        <a href={`tel:${o.customer.phone}`} className="font-normal text-safety underline">
                          {o.customer.phone}
                        </a>
                      </p>
                      <p>{o.customer.address} {o.customer.province} {o.customer.zip}</p>
                      {o.customer.note && <p className="mt-1">📝 {o.customer.note}</p>}
                    </div>

                    {/* สถานะ ZORT — เข้าแล้ว / พัง (พร้อมปุ่มส่งซ้ำ) / ยังไม่ได้ตั้งค่า */}
                    {o.zort && (
                      <div className="mt-2 flex items-center gap-2 text-[12px]">
                        {o.zort.ok ? (
                          <span className="text-[#1f9254]">✅ เข้า ZORT แล้ว (ตัดสต็อกอัตโนมัติ)</span>
                        ) : o.zort.skipped ? (
                          <span className="text-ink-300">ZORT: ยังไม่ได้ตั้งค่า</span>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 text-safety">⚠️ ยังไม่เข้า ZORT ({o.zort.message || "?"})</span>
                            <button
                              disabled={busyId === o.id}
                              onClick={() => retryZort(o)}
                              className="shrink-0 rounded-sm border border-safety px-2.5 py-1 font-semibold text-safety disabled:opacity-40"
                            >
                              ส่งซ้ำ
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {o.taxInvoice && (
                      <div className="mt-2 rounded-sm bg-amber-50 p-2.5 text-[12px] leading-relaxed text-amber-900">
                        <p className="font-semibold">🧾 ขอใบกำกับภาษีแบบเต็มรูป</p>
                        <p>{o.taxInvoice.name} · เลขผู้เสียภาษี {o.taxInvoice.taxId}</p>
                        <p>{o.taxInvoice.address}</p>
                      </div>
                    )}

                    {/* สลิป */}
                    {o.hasSlip && (
                      <div className="mt-2">
                        {slip[o.id] === undefined ? (
                          <p className="text-[12px] text-ink-300">กำลังโหลดสลิป...</p>
                        ) : slip[o.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={slip[o.id]!} alt="สลิปโอนเงิน" className="max-h-96 rounded-sm border border-steel-700" />
                        ) : (
                          <p className="text-[12px] text-safety">โหลดสลิปไม่สำเร็จ</p>
                        )}
                      </div>
                    )}

                    {/* ปุ่มเปลี่ยนสถานะ */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {STATUS.filter((s) => s.key !== o.status).map((s) => (
                        <button
                          key={s.key}
                          disabled={busyId === o.id}
                          onClick={() => setStatus(o, s.key)}
                          className="rounded-sm border border-steel-600 px-3 py-1.5 text-[12px] text-ink-700 disabled:opacity-40"
                        >
                          → {s.t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "shrink-0 rounded-full px-3 py-1.5 text-[12px] " +
        (on ? "bg-safety font-semibold text-white" : "bg-white text-ink-700")
      }
    >
      {children}
    </button>
  );
}
