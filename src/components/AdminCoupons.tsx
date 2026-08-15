"use client";

// จัดการโค้ดส่วนลด — /admin/coupons/
// ร้านสร้าง/แก้/ปิดโค้ดเองได้ ไม่ต้องแก้โค้ดหรือไปตั้ง env ที่ Netlify อีก
// โค้ดที่ตั้ง "โชว์บนหน้าเว็บ" จะไปขึ้นเป็นการ์ดให้ลูกค้ากดเก็บแบบ Shopee
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";

interface Coupon {
  code: string;
  title: string;
  type: "amount" | "percent";
  value: number;
  max: number;
  min: number;
  until: string;
  quota: number;
  perUser: number;
  visible: boolean;
  memberOnly: boolean;
  off: boolean;
  used?: number;
}

const EMPTY: Coupon = {
  code: "", title: "", type: "amount", value: 0, max: 0, min: 0,
  until: "", quota: 0, perUser: 1, visible: true, memberOnly: false, off: false,
};

export default function AdminCoupons() {
  const [key, setKey] = useState("");
  const [list, setList] = useState<Coupon[] | null>(null);
  const [form, setForm] = useState<Coupon | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => setKey(requireKey()), []);

  const load = useCallback(async () => {
    if (!key) return;
    // หน้าหลังร้านต้องเห็นทุกโค้ด รวมของที่ปิดอยู่ จึงขอผ่าน adminFetch
    const r = await adminFetch("/api/coupon?all=1", key);
    const d = await r.json().catch(() => null);
    setList(d?.all ?? d?.coupons ?? []);
  }, [key]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    setMsg("");
    const r = await adminFetch("/api/coupon", key, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", coupon: form }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setMsg(j?.error || "บันทึกไม่สำเร็จ"); return; }
    setForm(null);
    load();
  };

  const remove = async (code: string) => {
    setMsg("");
    const r = await adminFetch("/api/coupon", key, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", code }),
    });
    if (!r.ok) { setMsg("ลบไม่สำเร็จ"); return; }
    load();
  };

  const F = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-ink-300">{hint}</span>}
    </label>
  );

  const input = "w-full rounded-sm border border-steel-600 px-3 py-2 text-[14px] outline-none focus:border-safety";

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">โค้ดส่วนลด</span>
        <button
          onClick={() => setForm({ ...EMPTY })}
          className="ml-auto rounded-sm bg-safety px-3 py-1 text-[12.5px] font-semibold text-white"
        >
          + สร้างโค้ด
        </button>
      </header>

      <div className="mx-auto max-w-lg p-3">
        {msg && <p className="mb-3 rounded-sm bg-safety-tint px-3 py-2 text-[13px] text-safety">{msg}</p>}

        {list === null ? (
          <p className="py-16 text-center text-[13px] text-ink-300">กำลังโหลด...</p>
        ) : list.length === 0 ? (
          <div className="rounded-sm bg-white px-6 py-14 text-center">
            <p className="text-[14px] font-medium text-ink-700">ยังไม่มีโค้ดส่วนลด</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
              สร้างโค้ดแล้วจะไปขึ้นเป็นการ์ดให้ลูกค้ากดเก็บที่หน้าแรก
              และเลือกใช้ได้ตอนสั่งซื้อ
            </p>
          </div>
        ) : (
          list.map((c) => (
            <section key={c.code} className="mb-2 overflow-hidden rounded-sm bg-white">
              <div className="flex items-center gap-2 border-b border-steel-700 px-3 py-2.5">
                <span className="font-heading text-[15px] font-bold text-safety">{c.code}</span>
                {c.off && <span className="rounded-sm bg-steel-700 px-1.5 py-0.5 text-[10.5px] text-ink-500">ปิดอยู่</span>}
                {c.memberOnly && <span className="rounded-sm bg-safety-tint px-1.5 py-0.5 text-[10.5px] text-safety">เฉพาะสมาชิก</span>}
                {c.visible === false && <span className="rounded-sm bg-steel-700 px-1.5 py-0.5 text-[10.5px] text-ink-500">ไม่โชว์</span>}
                <span className="ml-auto text-[11.5px] text-ink-300">
                  ใช้ไป {c.used ?? 0}{c.quota ? `/${c.quota}` : ""}
                </span>
              </div>
              <div className="px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700">
                <p className="font-medium text-ink">{c.title || "-"}</p>
                <p className="text-ink-300">
                  {c.type === "percent" ? `ลด ${c.value}%` : `ลด ฿${c.value.toLocaleString("th-TH")}`}
                  {c.type === "percent" && c.max ? ` (สูงสุด ฿${c.max.toLocaleString("th-TH")})` : ""}
                  {c.min ? ` · ซื้อครบ ฿${c.min.toLocaleString("th-TH")}` : ""}
                  {c.perUser ? ` · คนละ ${c.perUser} ครั้ง` : " · ไม่จำกัดต่อคน"}
                  {c.until ? ` · ถึง ${c.until}` : ""}
                </p>
              </div>
              <div className="flex gap-2 border-t border-steel-700 px-3 py-2">
                <button onClick={() => setForm(c)} className="rounded-sm border border-steel-600 px-3 py-1 text-[12.5px] text-ink-700">แก้ไข</button>
                <button onClick={() => remove(c.code)} className="rounded-sm border border-safety px-3 py-1 text-[12.5px] text-safety">ลบ</button>
              </div>
            </section>
          ))
        )}
      </div>

      {/* ---------- ฟอร์มสร้าง/แก้ ---------- */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
          <button aria-label="ปิด" className="absolute inset-0 bg-black/50" onClick={() => setForm(null)} />
          <div className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="mb-3 text-[15px] font-semibold text-ink">{form.used ? "แก้ไขโค้ด" : "สร้างโค้ดใหม่"}</p>

            <div className="space-y-3">
              <F label="ตัวโค้ด" hint="ลูกค้าพิมพ์ตัวนี้ตอนสั่งซื้อ · ตัวอังกฤษ/ตัวเลข เช่น GUCUT100">
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                  className={`${input} uppercase`}
                />
              </F>

              <F label="ชื่อที่โชว์บนการ์ด" hint="เช่น ลด 100 บาท เมื่อซื้อครบ 1,000">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} />
              </F>

              <div className="flex gap-2">
                <F label="ลดแบบไหน">
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as Coupon["type"] })}
                    className={input}
                  >
                    <option value="amount">ลดเป็นบาท</option>
                    <option value="percent">ลดเป็น %</option>
                  </select>
                </F>
                <F label={form.type === "percent" ? "กี่ %" : "ลดกี่บาท"}>
                  <input type="number" inputMode="numeric" value={form.value || ""} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} className={input} />
                </F>
              </div>

              {form.type === "percent" && (
                <F label="ลดได้สูงสุดกี่บาท" hint="0 = ไม่มีเพดาน">
                  <input type="number" inputMode="numeric" value={form.max || ""} onChange={(e) => setForm({ ...form, max: Number(e.target.value) })} className={input} />
                </F>
              )}

              <F label="ยอดขั้นต่ำ" hint="0 = ไม่มีขั้นต่ำ">
                <input type="number" inputMode="numeric" value={form.min || ""} onChange={(e) => setForm({ ...form, min: Number(e.target.value) })} className={input} />
              </F>

              <div className="flex gap-2">
                <F label="จำนวนสิทธิ์ทั้งหมด" hint="0 = ไม่จำกัด">
                  <input type="number" inputMode="numeric" value={form.quota || ""} onChange={(e) => setForm({ ...form, quota: Number(e.target.value) })} className={input} />
                </F>
                <F label="ใช้ได้คนละกี่ครั้ง" hint="0 = ไม่จำกัด">
                  <input type="number" inputMode="numeric" value={form.perUser || ""} onChange={(e) => setForm({ ...form, perUser: Number(e.target.value) })} className={input} />
                </F>
              </div>

              <F label="ใช้ได้ถึงวันที่" hint="เว้นว่าง = ไม่มีวันหมดอายุ">
                <input type="date" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} className={input} />
              </F>

              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} className="h-4 w-4 accent-[#ff3c00]" />
                โชว์บนหน้าเว็บให้ลูกค้ากดเก็บ (ไม่ติ๊ก = โค้ดลับ ต้องบอกกันเอง)
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={form.memberOnly} onChange={(e) => setForm({ ...form, memberOnly: e.target.checked })} className="h-4 w-4 accent-[#ff3c00]" />
                เฉพาะสมาชิกที่ล็อกอินเท่านั้น
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={form.off} onChange={(e) => setForm({ ...form, off: e.target.checked })} className="h-4 w-4 accent-[#ff3c00]" />
                ปิดใช้ชั่วคราว
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={() => setForm(null)} className="flex-1 rounded-sm border border-steel-600 py-2.5 text-[14px] text-ink-700">ยกเลิก</button>
              <button
                onClick={save}
                disabled={!form.code || !form.value}
                className="flex-1 rounded-sm bg-safety py-2.5 text-[14px] font-semibold text-white disabled:bg-steel-600 disabled:text-ink-300"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
