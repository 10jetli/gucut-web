"use client";

// ประวัติการสั่งซื้อ — /account/orders/
// ดึงจาก /api/orders?mine=1 (จับคู่ด้วยเบอร์โทรของบัญชีกับเบอร์ผู้รับในออเดอร์)
import NotifyBell from "@/components/NotifyBell";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Price from "@/components/Price";

type Status = "pending" | "new" | "confirmed" | "shipped" | "done" | "cancelled";

interface MyOrder {
  id: string;
  at: number;
  status: Status;
  items: { title: string; variant: string; price: number; qty: number }[];
  paymentLabel: string;
  discount: number;
  shipping: number;
  codFee: number;
  total: number;
  /** เลขพัสดุจาก ZORT — มีเมื่อร้านส่งของแล้ว */
  tracking?: { no: string; channel: string; at: string } | null;
}

// แท็บกรองแบบ Shopee — คีย์ตรงกับ ?tab= ที่หน้าบัญชีส่งมา
const TABS: { key: string; t: string; match: (o: MyOrder) => boolean }[] = [
  { key: "all",     t: "ทั้งหมด",      match: () => true },
  { key: "pay",     t: "ที่ต้องชำระ",   match: (o) => o.status === "pending" },
  { key: "ship",    t: "ที่ต้องจัดส่ง", match: (o) => o.status === "new" || o.status === "confirmed" },
  { key: "receive", t: "ที่ต้องได้รับ", match: (o) => o.status === "shipped" },
  { key: "done",    t: "สำเร็จ",       match: (o) => o.status === "done" },
];

// ป้ายสถานะภาษาลูกค้า — คนละชุดกับหลังร้าน (ลูกค้าไม่ต้องเห็นคำว่า "จบงาน")
const STATUS: Record<Status, { t: string; cls: string }> = {
  pending:   { t: "รอชำระเงิน",           cls: "bg-[#b45309]/10 text-[#b45309]" },
  new:       { t: "ร้านได้รับออเดอร์แล้ว", cls: "bg-safety/10 text-safety" },
  confirmed: { t: "กำลังเตรียมของ",       cls: "bg-[#1d6fd1]/10 text-[#1d6fd1]" },
  shipped:   { t: "จัดส่งแล้ว",            cls: "bg-[#7c3aed]/10 text-[#7c3aed]" },
  done:      { t: "สำเร็จ",               cls: "bg-[#1f9254]/10 text-[#1f9254]" },
  cancelled: { t: "ยกเลิก",               cls: "bg-steel-700 text-steel-300" },
};

const when = (ms: number) =>
  new Date(ms).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function OrdersView() {
  const router = useRouter();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("all");
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab") || "all";
      if (TABS.some((x) => x.key === t)) setTab(t);
    } catch { /* ไม่มีก็ทั้งหมด */ }
  }, []);

  useEffect(() => {
    fetch("/api/orders?mine=1")
      .then(async (r) => {
        if (r.status === 401) { setNeedLogin(true); setOrders([]); return; }
        if (!r.ok) throw new Error();
        const d = await r.json();
        setOrders(d.orders || []);
      })
      .catch(() => { setErr("โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง"); setOrders([]); });
  }, []);

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-1 bg-safety px-2 py-3 text-white">
        <button onClick={() => router.back()} aria-label="ย้อนกลับ" className="p-1 text-[22px] leading-none">‹</button>
        <span className="text-[15px] font-medium">การซื้อของฉัน</span>
      </header>

      {orders === null ? (
        <p className="px-3 py-16 text-center text-[13px] text-ink-300">กำลังโหลด...</p>
      ) : needLogin || (orders.length === 0 && !err) ? (
        <div className="flex flex-col items-center px-8 py-20 text-center">
          <svg viewBox="0 0 24 24" className="mb-4 h-16 w-16 fill-none stroke-steel-600 stroke-[1.2]">
            <path d="M7 4h10l1 16H6L7 4zM9.5 8h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-[14px] font-medium text-ink-700">ยังไม่มีรายการสั่งซื้อ</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
            {needLogin
              ? "เข้าสู่ระบบด้วยเบอร์โทรที่ใช้สั่งซื้อ แล้วรายการจะมาแสดงที่นี่"
              : "เมื่อสั่งซื้อแล้ว รายการจะมาแสดงที่นี่"}
          </p>
          {needLogin ? (
            <Link href="/account/login/?next=/account/orders/"
                  className="mt-5 rounded-sm bg-safety px-6 py-2.5 text-[14px] font-semibold text-white">
              เข้าสู่ระบบ
            </Link>
          ) : (
            <Link href="/" className="mt-5 rounded-sm bg-safety px-6 py-2.5 text-[14px] font-semibold text-white">
              เลือกซื้อสินค้า
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2 p-2">
          <div className="scrollbar-none -mx-2 flex gap-1.5 overflow-x-auto px-2 pb-0.5">
            {TABS.map((x) => {
              const n = x.key === "all" ? 0 : orders.filter(x.match).length;
              return (
                <button
                  key={x.key}
                  onClick={() => setTab(x.key)}
                  className={
                    "shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold " +
                    (tab === x.key ? "bg-safety text-white" : "bg-white text-ink-700")
                  }
                >
                  {x.t}{n > 0 ? ` (${n})` : ""}
                </button>
              );
            })}
          </div>
          {/* ลูกค้าที่ล็อกอินแล้ว (ไม่ต้องมี LINE) เปิดรับแจ้งเตือนเด้งเข้าเครื่องได้ที่นี่ */}
          <div className="px-1"><NotifyBell /></div>
          {err && <p className="px-1 text-[13px] text-safety">{err}</p>}
          {orders.filter(TABS.find((x) => x.key === tab)?.match ?? (() => true)).length === 0 && (
            <p className="px-1 py-10 text-center text-[13px] text-ink-300">ไม่มีรายการในหมวดนี้</p>
          )}
          {orders.filter(TABS.find((x) => x.key === tab)?.match ?? (() => true)).map((o) => {
            const st = STATUS[o.status] ?? STATUS.new;
            return (
              <section key={o.id} className="overflow-hidden rounded-xl bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-steel-300">
                    #{o.id} · {when(o.at)}
                  </span>
                  <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold " + st.cls}>
                    {st.t}
                  </span>
                </div>
                <div className="mt-1.5 space-y-0.5">
                  {o.items.map((i, n) => (
                    <p key={n} className="truncate text-[13px] text-[#1a1a1a]">
                      {i.title}
                      {i.variant && i.variant !== "-" ? ` (${i.variant})` : ""} ×{i.qty}
                    </p>
                  ))}
                </div>
                {o.tracking?.no && (
                  <a
                    href={`https://www.flashexpress.com/fle/tracking?se=${encodeURIComponent(o.tracking.no)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 flex items-center justify-between rounded-lg bg-[#7c3aed]/10 px-2.5 py-2"
                  >
                    <span className="text-[12.5px] text-[#7c3aed]">
                      📦 {o.tracking.channel || "ขนส่ง"} · <b>{o.tracking.no}</b>
                    </span>
                    <span className="text-[12px] font-semibold text-[#7c3aed]">ติดตามพัสดุ ›</span>
                  </a>
                )}
                <div className="mt-1.5 flex items-center justify-between border-t border-steel-800 pt-1.5">
                  <span className="text-[12px] text-steel-300">{o.paymentLabel}</span>
                  <span className="text-[13px] text-[#1a1a1a]">
                    รวม <Price value={o.total} className="font-heading font-bold text-safety" />
                  </span>
                </div>
              </section>
            );
          })}
          <p className="px-1 pt-1 text-center text-[12px] text-ink-300">
            มีคำถามเรื่องออเดอร์? ทักร้านได้จากปุ่มแชทมุมขวาบน
          </p>
        </div>
      )}
    </main>
  );
}
