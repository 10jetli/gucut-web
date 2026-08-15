"use client";

// หน้าบัญชีของฉัน — /account/
// ยังไม่ล็อกอินก็เข้าดูได้ (ร้านไม่บังคับล็อกอินก่อนสั่งซื้อ) แต่จะมีปุ่มชวนเข้าสู่ระบบ
import Link from "next/link";
import { useEffect, useState } from "react";
import ChatSheet from "@/components/ChatSheet";
import { cachedUser, fetchMe, logout, saveProfile, type Addr, type User } from "@/lib/account";

const EMPTY: Addr = { name: "", phone: "", address: "", province: "", zip: "" };

export default function AccountHome() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [chat, setChat] = useState(false);
  const [editAddr, setEditAddr] = useState(false);
  const [form, setForm] = useState<Addr>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setUser(cachedUser());
    fetchMe().then((u) => { setUser(u); setReady(true); });
  }, []);

  function openAddr() {
    setForm(user?.addr || { ...EMPTY, name: user?.name || "", phone: user?.phone || "" });
    setMsg("");
    setEditAddr(true);
  }

  async function saveAddr() {
    setSaving(true); setMsg("");
    try {
      const u = await saveProfile({ addr: form });
      setUser(u);
      setEditAddr(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  }

  const addrOk =
    form.name.trim() && form.address.trim() && form.province.trim() && /^\d{5}$/.test(form.zip);

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      {/* ── หัวสีแบรนด์ ── */}
      <header className="bg-safety px-4 pb-5 pt-4 text-white">
        <div className="mb-4 flex items-center justify-end gap-4">
          <button onClick={() => setChat(true)} aria-label="แชทกับร้าน">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-none stroke-white stroke-[1.7]">
              <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.5A8 8 0 1121 12z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Link href="/cart" aria-label="ตะกร้า">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-none stroke-white stroke-[1.7]">
              <path d="M4 5h2l2.2 10.2A2 2 0 0010.2 17h7.3a2 2 0 002-1.6L21 8H7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10.5" cy="20" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </Link>
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-[22px] font-bold">
              {(user.name || "ล").trim()[0]}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[17px] font-semibold">{user.name}</span>
              <span className="block text-[13px] text-white/80">{user.phone}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-white stroke-[1.6]">
                <circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0115 0" strokeLinecap="round" />
              </svg>
            </span>
            <span className="flex-1">
              <span className="mb-1.5 block text-[14px] font-medium">ยังไม่ได้เข้าสู่ระบบ</span>
              <span className="flex gap-2">
                <Link href="/account/login/" className="rounded-sm bg-white px-3 py-1.5 text-[13px] font-semibold text-safety">
                  เข้าสู่ระบบ
                </Link>
                <Link href="/account/register/" className="rounded-sm border border-white px-3 py-1.5 text-[13px] font-semibold">
                  สมัครใหม่
                </Link>
              </span>
            </span>
          </div>
        )}
      </header>

      <div className="space-y-2.5 p-2.5">
        {/* ── การซื้อของฉัน ── */}
        <section className="rounded-sm bg-white">
          <Link href="/account/orders/" className="flex items-center border-b border-steel-700 px-3.5 py-3">
            <span className="flex-1 text-[14px] font-semibold text-ink">การซื้อของฉัน</span>
            <span className="text-[12px] text-ink-500">ประวัติการซื้อ</span>
            <span className="ml-1 text-[15px] text-ink-300">›</span>
          </Link>
          <div className="grid grid-cols-4 py-3.5">
            {[
              { t: "ที่ต้องชำระ", d: "M7 4h10l1 16H6L7 4zM9.5 8h5" },
              { t: "ที่ต้องจัดส่ง", d: "M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" },
              { t: "ที่ต้องได้รับ", d: "M4 8l8-4 8 4v8l-8 4-8-4V8zM4 8l8 4 8-4M12 12v8" },
              { t: "ให้คะแนน", d: "M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4z" },
            ].map((x) => (
              <Link key={x.t} href="/account/orders/" className="flex flex-col items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-ink-700 stroke-[1.4]">
                  <path d={x.d} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[11px] text-ink-700">{x.t}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── ที่อยู่จัดส่ง ── */}
        {user && (
          <section className="rounded-sm bg-white">
            <div className="flex items-center border-b border-steel-700 px-3.5 py-3">
              <span className="flex-1 text-[14px] font-semibold text-ink">ที่อยู่จัดส่ง</span>
              <button onClick={openAddr} className="text-[12px] font-medium text-safety">
                {user.addr ? "แก้ไข" : "เพิ่มที่อยู่"}
              </button>
            </div>
            <div className="px-3.5 py-3">
              {user.addr ? (
                <p className="text-[13px] leading-relaxed text-ink-700">
                  <b className="text-ink">{user.addr.name}</b> · {user.addr.phone}
                  <br />
                  {user.addr.address} {user.addr.province} {user.addr.zip}
                </p>
              ) : (
                <p className="text-[13px] text-ink-300">ยังไม่ได้บันทึก — บันทึกไว้แล้วเวลาสั่งของไม่ต้องพิมพ์ใหม่</p>
              )}
            </div>
          </section>
        )}

        {/* ── เมนูอื่น ── */}
        <section className="overflow-hidden rounded-sm bg-white">
          <button onClick={() => setChat(true)} className="flex w-full items-center gap-3 border-b border-steel-700 px-3.5 py-3.5 text-left">
            <Ico d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.5A8 8 0 1121 12z" />
            <span className="flex-1 text-[14px] text-ink">แชทกับร้าน</span>
            <span className="text-[15px] text-ink-300">›</span>
          </button>
          <Link href="/account/points/" className="flex items-center gap-3 border-b border-steel-700 px-3.5 py-3.5">
            <Ico d="M12 3l2.6 5.6 6.4.8-4.7 4.3 1.3 6.3L12 17l-5.6 3 1.3-6.3L3 9.4l6.4-.8L12 3z" />
            <span className="flex-1 text-[14px] text-ink">แต้มสะสม</span>
            <span className="text-[15px] text-ink-300">›</span>
          </Link>
          <Link href="/videos" className="flex items-center gap-3 border-b border-steel-700 px-3.5 py-3.5">
            <Ico d="M4 6.5h16v11H4zM10.5 9.5l4 2.5-4 2.5v-5z" />
            <span className="flex-1 text-[14px] text-ink">วิดีโอรีวิวสินค้า</span>
            <span className="text-[15px] text-ink-300">›</span>
          </Link>
          <Link href="/videos/?saved=1" className="flex items-center gap-3 border-b border-steel-700 px-3.5 py-3.5">
            <Ico d="M6.5 4h11v16l-5.5-4-5.5 4V4z" />
            <span className="flex-1 text-[14px] text-ink">คลิปที่บันทึกไว้</span>
            <span className="text-[15px] text-ink-300">›</span>
          </Link>
          <Link href="/categories" className="flex items-center gap-3 border-b border-steel-700 px-3.5 py-3.5">
            <Ico d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
            <span className="flex-1 text-[14px] text-ink">หมวดหมู่สินค้าทั้งหมด</span>
            <span className="text-[15px] text-ink-300">›</span>
          </Link>
          <Link href="/policy/privacy/" className="flex items-center gap-3 border-b border-steel-700 px-3.5 py-3.5">
            <Ico d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" />
            <span className="flex-1 text-[14px] text-ink">นโยบายความเป็นส่วนตัว</span>
            <span className="text-[15px] text-ink-300">›</span>
          </Link>
          <Link href="/policy/terms/" className="flex items-center gap-3 px-3.5 py-3.5">
            <Ico d="M6 3h9l3 3v15H6V3zM9 9h6M9 13h6M9 17h4" />
            <span className="flex-1 text-[14px] text-ink">เงื่อนไขการใช้บริการ</span>
            <span className="text-[15px] text-ink-300">›</span>
          </Link>
        </section>

        {ready && user && (
          <button
            onClick={async () => { await logout(); setUser(null); }}
            className="w-full rounded-sm bg-white py-3.5 text-[14px] font-medium text-ink-500"
          >
            ออกจากระบบ
          </button>
        )}

        <p className="py-4 text-center text-[11px] text-ink-300">
          GUCUT · เลื่อยยนต์ NEWWAVE / KingKong ของแท้
        </p>
      </div>

      {/* ── ฟอร์มที่อยู่ ── */}
      {editAddr && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setEditAddr(false)}>
          <div className="max-h-[88dvh] w-full overflow-y-auto rounded-t-xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
               onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-[15px] font-semibold text-ink">ที่อยู่จัดส่ง</p>
            <div className="space-y-2.5">
              <Field label="ชื่อผู้รับ" v={form.name} on={(v) => setForm({ ...form, name: v })} />
              <Field label="เบอร์โทร" v={form.phone} on={(v) => setForm({ ...form, phone: v.replace(/[^0-9]/g, "").slice(0, 10) })} tel />
              <Field label="บ้านเลขที่ / ถนน / ตำบล / อำเภอ" v={form.address} on={(v) => setForm({ ...form, address: v })} area />
              <div className="flex gap-2.5">
                <div className="flex-1"><Field label="จังหวัด" v={form.province} on={(v) => setForm({ ...form, province: v })} /></div>
                <div className="w-28"><Field label="รหัสไปรษณีย์" v={form.zip} on={(v) => setForm({ ...form, zip: v.replace(/[^0-9]/g, "").slice(0, 5) })} tel /></div>
              </div>
            </div>
            {msg && <p className="mt-2 text-[13px] text-safety">{msg}</p>}
            <div className="mt-4 flex gap-2.5">
              <button onClick={() => setEditAddr(false)} className="flex-1 rounded-sm border border-steel-600 py-2.5 text-[14px] text-ink-700">
                ยกเลิก
              </button>
              <button onClick={saveAddr} disabled={!addrOk || saving}
                className="flex-1 rounded-sm bg-safety py-2.5 text-[14px] font-semibold text-white disabled:bg-steel-600 disabled:text-ink-300">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ChatSheet open={chat} onClose={() => setChat(false)} />
    </main>
  );
}

const Ico = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-safety stroke-[1.6]">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Field({ label, v, on, tel, area }: {
  label: string; v: string; on: (v: string) => void; tel?: boolean; area?: boolean;
}) {
  const cls = "w-full rounded-sm border border-steel-600 px-3 py-2.5 text-[14px] outline-none focus:border-safety";
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-ink-500">{label}</span>
      {area ? (
        <textarea rows={2} value={v} onChange={(e) => on(e.target.value)} className={cls + " resize-none"} />
      ) : (
        <input inputMode={tel ? "numeric" : undefined} value={v} onChange={(e) => on(e.target.value)} className={cls} />
      )}
    </label>
  );
}
