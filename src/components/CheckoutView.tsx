"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getCart, updateQty, type CartItem } from "@/lib/cart";
import Price from "@/components/Price";
import { promptPayPayload } from "@/lib/promptpay";
import { cachedUser, fetchMe, saveProfile, type User } from "@/lib/account";

// หน้าสั่งซื้อแบบ Shopee — เห็นทุกอย่างในหน้าเดียว แล้วกดสั่งซื้อจากแถบล่าง
//   order    ที่อยู่ / รายการสินค้า / ช่องทางชำระเงิน / สรุปยอด
//   pay      เฉพาะคนจ่ายด้วย QR — สแกนจ่ายแล้วแนบสลิป (เก็บปลายทางข้ามขั้นนี้)
//   done     สั่งซื้อสำเร็จ
type Step = "order" | "pay" | "done";
type Pay = "promptpay" | "cod";

interface Address {
  name: string;
  phone: string;
  address: string;
  province: string;
  zip: string;
  note: string;
}

const PROMPTPAY_ID = process.env.NEXT_PUBLIC_PROMPTPAY_ID ?? "";
const WEBHOOK_URL = process.env.NEXT_PUBLIC_ORDER_WEBHOOK_URL ?? "";

// ค่าจัดส่ง / ค่าบริการเก็บเงินปลายทาง — ร้านส่งฟรีทั่วไทยจึงเป็น 0 ทั้งคู่
// ถ้าวันหนึ่งอยากคิดเงินเพิ่ม แก้ตัวเลขสองบรรทัดนี้ที่เดียว หน้าสรุปยอดขึ้นให้เอง
const SHIPPING_FEE = 0;
const COD_FEE = 0;

export default function CheckoutView() {
  const [step, setStep] = useState<Step>("order");
  const [items, setItems] = useState<CartItem[]>([]);
  const [addr, setAddr] = useState<Address>({
    name: "", phone: "", address: "", province: "", zip: "", note: "",
  });
  const [editAddr, setEditAddr] = useState(true);
  const [pay, setPay] = useState<Pay>("promptpay");
  const [qr, setQr] = useState("");
  const [slip, setSlip] = useState<{ name: string; data: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [remember, setRemember] = useState(true);

  useEffect(() => setItems(getCart()), []);

  // ล็อกอินอยู่แล้วก็เติมที่อยู่ที่เคยบันทึกไว้ให้เลย ไม่ต้องพิมพ์ใหม่
  useEffect(() => {
    const fill = (u: User | null) => {
      setUser(u);
      if (!u) return;
      setAddr((a) => {
        if (a.name || a.address) return a;   // พิมพ์ไปแล้วห้ามทับ
        const next = {
          ...a,
          name: u.addr?.name || u.name || "",
          phone: u.addr?.phone || u.phone || "",
          address: u.addr?.address || "",
          province: u.addr?.province || "",
          zip: u.addr?.zip || "",
        };
        // ที่อยู่ครบอยู่แล้ว → พับเก็บให้เหมือน Shopee ไม่ต้องเห็นฟอร์มยาว ๆ
        if (ok(next)) setEditAddr(false);
        return next;
      });
    };
    fill(cachedUser());
    fetchMe().then(fill);
  }, []);

  const valid0 = ok(addr);
  useEffect(() => {
    if (valid0) setError((e) => (e.startsWith("กรอกที่อยู่") ? "" : e));
  }, [valid0]);

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const codFee = pay === "cod" ? COD_FEE : 0;
  const total = subtotal + SHIPPING_FEE + codFee;
  const valid = valid0;

  // สร้างรูป QR เมื่อเข้าขั้นชำระเงิน
  useEffect(() => {
    if (step === "pay" && PROMPTPAY_ID) {
      QRCode.toDataURL(promptPayPayload(PROMPTPAY_ID, total), { width: 280, margin: 2 })
        .then(setQr)
        .catch(() => {});
    }
  }, [step, total]);

  // อ่านไฟล์สลิปเป็น base64
  const onSlip = (f: File) => {
    if (f.size > 3 * 1024 * 1024) { setError("ไฟล์สลิปต้องไม่เกิน 3MB"); return; }
    const r = new FileReader();
    r.onload = () => setSlip({ name: f.name, data: String(r.result) });
    r.readAsDataURL(f);
    setError("");
  };

  // กดสั่งซื้อจากแถบล่าง — โอนก่อนไปหน้า QR · เก็บปลายทางส่งออเดอร์เลย
  const placeOrder = () => {
    if (!valid) {
      setEditAddr(true);
      setError("กรอกที่อยู่จัดส่งให้ครบก่อนครับ");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError("");
    if (user && remember) {
      saveProfile({
        addr: { name: addr.name, phone: addr.phone, address: addr.address, province: addr.province, zip: addr.zip },
      }).catch(() => {});
    }
    if (pay === "cod") submit();
    else setStep("pay");
  };

  // ส่งออเดอร์เข้า webhook (Make.com)
  const submit = async () => {
    setSending(true);
    setError("");
    const id = "GC" + Date.now().toString(36).toUpperCase();
    const order = {
      orderId: id,
      createdAt: new Date().toISOString(),
      customer: addr,
      items: items.map((i) => ({ title: i.title, variant: i.variant, price: i.price, qty: i.qty })),
      payment: pay,                                   // "promptpay" | "cod"
      paymentLabel: pay === "cod" ? "เก็บเงินปลายทาง" : "โอน/สแกน QR PromptPay",
      subtotal,
      shipping: SHIPPING_FEE,
      codFee,
      total,
      slipFilename: slip?.name ?? null,
      slipBase64: slip?.data ?? null,
    };
    try {
      if (WEBHOOK_URL) {
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(order),
        });
        if (!res.ok) throw new Error(`webhook ${res.status}`);
      } else {
        // ยังไม่ตั้งค่า webhook — จำลองสำเร็จ (ตั้งค่าใน .env: NEXT_PUBLIC_ORDER_WEBHOOK_URL)
        await new Promise((r) => setTimeout(r, 600));
      }
      setOrderId(id);
      items.forEach((i) => updateQty(i.productId, i.variant, 0));   // ล้างตะกร้า
      setStep("done");
    } catch {
      setError("ส่งออเดอร์ไม่สำเร็จ ลองใหม่อีกครั้ง หรือทักร้านทางแชท");
    } finally {
      setSending(false);
    }
  };

  if (items.length === 0 && step !== "done") {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-4xl">🛒</span>
        <p className="text-steel-300">ตะกร้าว่าง — เลือกสินค้าก่อนสั่งซื้อ</p>
        <Link href="/" className="rounded-lg bg-safety px-5 py-2.5 font-heading text-sm font-bold text-white">
          เลือกซื้อสินค้า
        </Link>
      </main>
    );
  }

  // ------------------------------------------------------------------ สำเร็จ
  if (step === "done") {
    return (
      <main className="flex flex-col items-center gap-3 px-6 pt-14 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15 text-3xl">✅</span>
        <h2 className="font-heading text-xl font-bold">ได้รับออเดอร์แล้ว!</h2>
        <p className="text-sm text-steel-300">
          เลขที่ออเดอร์ <span className="font-bold text-safety">{orderId}</span>
          <br />
          {pay === "cod"
            ? "ร้านจะโทรยืนยันก่อนจัดส่ง จ่ายเงินตอนรับของได้เลย"
            : "ร้านจะตรวจสอบสลิปและจัดส่งให้เร็วที่สุด"}
          {!WEBHOOK_URL && (
            <>
              <br />
              <span className="text-xs">(โหมดทดสอบ — ยังไม่ได้ต่อ webhook จริง)</span>
            </>
          )}
        </p>
        <Link href="/" className="mt-3 rounded-lg bg-safety px-6 py-2.5 font-heading text-sm font-bold text-white">
          กลับหน้าแรก
        </Link>
      </main>
    );
  }

  // ------------------------------------------------------------ สแกนจ่าย QR
  if (step === "pay") {
    return (
      <main className="pb-28">
        <Head title="สแกนจ่ายด้วย PromptPay" onBack={() => setStep("order")} />
        <div className="space-y-3 p-3">
          <div className="rounded-xl bg-white p-4 text-center">
            {PROMPTPAY_ID && qr ? (
              <>
                {/* QR ใช้ได้กับแอพธนาคารทุกแอพ ยอดใส่มาให้แล้ว */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="PromptPay QR" className="mx-auto h-60 w-60" />
                <p className="text-[13px] text-steel-300">PromptPay: {PROMPTPAY_ID}</p>
              </>
            ) : (
              <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
                ⚠️ ร้านยังไม่ได้ตั้งค่าเบอร์ PromptPay
                <br />
                (ใส่ NEXT_PUBLIC_PROMPTPAY_ID ที่ Netlify แล้ว deploy ใหม่)
              </p>
            )}
            <Price value={total} className="mt-1 block font-heading text-2xl font-bold text-safety" />
          </div>

          <label className="block rounded-lg border-2 border-dashed border-steel-600 bg-white p-4 text-center text-sm text-steel-300">
            {slip ? <span className="font-semibold text-safety">📎 {slip.name} ✓</span> : <>📎 แตะเพื่อแนบสลิปโอนเงิน</>}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onSlip(e.target.files[0])}
            />
          </label>
          {error && <p className="text-center text-[13px] text-safety">{error}</p>}
        </div>

        <BottomBar
          total={total}
          label={sending ? "กำลังส่งออเดอร์…" : "ยืนยันการสั่งซื้อ"}
          disabled={sending || !slip}
          hint={!slip ? "แนบสลิปก่อนกดยืนยัน" : undefined}
          onClick={submit}
        />
      </main>
    );
  }

  // -------------------------------------------------------------- หน้าสั่งซื้อ
  return (
    <main className="pb-28">
      <Head title="สั่งซื้อ" />

      {/* 1. ที่อยู่จัดส่ง */}
      <section className="mb-2 bg-white">
        <div className="flex items-start gap-2 border-b border-steel-700 px-3 py-2.5">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 fill-none stroke-safety stroke-2">
            <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" strokeLinejoin="round" />
            <circle cx="12" cy="10" r="2.4" />
          </svg>
          <span className="flex-1 text-[13px] font-semibold text-[#1a1a1a]">ที่อยู่จัดส่ง</span>
          {!editAddr && (
            <button onClick={() => setEditAddr(true)} className="text-[13px] font-semibold text-safety">
              แก้ไข
            </button>
          )}
        </div>

        {editAddr ? (
          <div className="space-y-2.5 p-3">
            {user ? (
              <label className="flex items-center gap-2 rounded-lg bg-safety-tint px-3 py-2">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-safety" />
                <span className="text-[12px] text-ink-700">บันทึกที่อยู่นี้ไว้ ครั้งหน้าไม่ต้องพิมพ์ใหม่</span>
              </label>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-safety-tint px-3 py-2">
                <span className="flex-1 text-[12px] text-ink-700">มีบัญชีแล้ว? เข้าสู่ระบบแล้วที่อยู่จะเติมให้เอง</span>
                <Link href="/account/login/?next=/checkout" className="shrink-0 text-[12px] font-semibold text-safety">
                  เข้าสู่ระบบ
                </Link>
              </div>
            )}
            <Field label="ชื่อ-นามสกุล ผู้รับ" value={addr.name} onChange={(v) => setAddr({ ...addr, name: v })} />
            <Field label="เบอร์โทรศัพท์" value={addr.phone} inputMode="tel" onChange={(v) => setAddr({ ...addr, phone: v })} />
            <Field label="ที่อยู่ (บ้านเลขที่ หมู่ ตำบล อำเภอ)" value={addr.address} textarea onChange={(v) => setAddr({ ...addr, address: v })} />
            <div className="flex gap-2.5">
              <Field label="จังหวัด" value={addr.province} onChange={(v) => setAddr({ ...addr, province: v })} />
              <Field label="รหัสไปรษณีย์" value={addr.zip} inputMode="numeric" onChange={(v) => setAddr({ ...addr, zip: v })} />
            </div>
            <Field label="หมายเหตุถึงร้าน (ถ้ามี)" value={addr.note} onChange={(v) => setAddr({ ...addr, note: v })} />
            {valid && (
              <button
                onClick={() => setEditAddr(false)}
                className="w-full rounded-sm border border-safety py-2 text-[13px] font-semibold text-safety"
              >
                ใช้ที่อยู่นี้
              </button>
            )}
          </div>
        ) : (
          <button onClick={() => setEditAddr(true)} className="block w-full px-3 py-2.5 text-left">
            <p className="text-[13px] font-semibold text-[#1a1a1a]">
              {addr.name} <span className="font-normal text-steel-300">{addr.phone}</span>
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-steel-300">
              {addr.address} {addr.province} {addr.zip}
            </p>
          </button>
        )}
      </section>

      {/* 2. รายการสินค้า */}
      <section className="mb-2 bg-white">
        <p className="border-b border-steel-700 px-3 py-2.5 text-[13px] font-semibold text-[#1a1a1a]">
          รายการสินค้า ({items.reduce((s, i) => s + i.qty, 0)} ชิ้น)
        </p>
        {items.map((i) => (
          <div key={`${i.productId}-${i.variant}`} className="flex gap-2.5 border-b border-steel-800 p-3 last:border-0">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded border border-steel-700 bg-white">
              {i.image && <Image src={i.image} alt={i.title} fill sizes="64px" className="object-contain" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="clamp-2 text-[13px] leading-snug text-[#1a1a1a]">{i.title}</p>
              {i.variant && i.variant !== "-" && (
                <p className="mt-0.5 text-[11px] text-steel-300">ตัวเลือก: {i.variant}</p>
              )}
              <div className="mt-1 flex items-baseline justify-between">
                <Price value={i.price} className="text-[13px] font-semibold text-safety" />
                <span className="text-[12px] text-steel-300">×{i.qty}</span>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* 3. ช่องทางชำระเงิน */}
      <section className="mb-2 bg-white">
        <p className="border-b border-steel-700 px-3 py-2.5 text-[13px] font-semibold text-[#1a1a1a]">
          ช่องทางชำระเงิน
        </p>
        <PayOption
          on={pay === "promptpay"}
          onClick={() => setPay("promptpay")}
          title="โอน / สแกน QR PromptPay"
          note="สแกนจ่ายด้วยแอปธนาคาร แล้วแนบสลิป — ร้านจัดส่งทันทีที่ตรวจสลิปเสร็จ"
        />
        <PayOption
          on={pay === "cod"}
          onClick={() => setPay("cod")}
          title="เก็บเงินปลายทาง"
          note="จ่ายเงินสดตอนรับของที่บ้าน ร้านจะโทรยืนยันก่อนส่ง"
        />
      </section>

      {/* 4. สรุปยอด */}
      <section className="mb-2 bg-white">
        <p className="border-b border-steel-700 px-3 py-2.5 text-[13px] font-semibold text-[#1a1a1a]">
          สรุปการชำระเงิน
        </p>
        <div className="space-y-1.5 px-3 py-2.5 text-[13px]">
          <Row label="ค่าสินค้า" value={subtotal} />
          <Row label="ค่าจัดส่ง" value={SHIPPING_FEE ? SHIPPING_FEE : "ฟรี"} free={!SHIPPING_FEE} />
          {codFee > 0 && <Row label="ค่าบริการเก็บเงินปลายทาง" value={codFee} />}
          <div className="flex items-center justify-between border-t border-steel-700 pt-2">
            <span className="font-semibold text-[#1a1a1a]">ยอดที่ต้องชำระ</span>
            <Price value={total} className="font-heading text-[17px] font-bold text-safety" />
          </div>
        </div>
      </section>

      {error && <p className="px-3 pb-2 text-center text-[13px] text-safety">{error}</p>}

      <BottomBar
        total={total}
        label={sending ? "กำลังส่งออเดอร์…" : pay === "cod" ? "สั่งซื้อ" : "ไปชำระเงิน"}
        disabled={sending}
        onClick={placeOrder}
      />
    </main>
  );
}

const ok = (a: Address) =>
  !!a.name.trim() &&
  /^0\d{8,9}$/.test(a.phone.replace(/[^0-9]/g, "")) &&
  !!a.address.trim() &&
  !!a.province.trim() &&
  /^\d{5}$/.test(a.zip);

function Head({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 border-b-[3px] border-safety bg-carbon px-3 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      {onBack && (
        <button onClick={onBack} aria-label="ย้อนกลับ" className="-ml-1 p-1 text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-white stroke-2">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <h1 className="font-heading text-[15px] font-bold text-white">{title}</h1>
    </header>
  );
}

// แถบสั่งซื้อติดล่างจอแบบ Shopee — ยอดรวมซ้าย ปุ่มส้มขวา
function BottomBar({
  total, label, disabled, hint, onClick,
}: {
  total: number;
  label: string;
  disabled?: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-lg border-t border-steel-700 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-steel-300">{hint ?? "ยอดที่ต้องชำระ"}</p>
          <Price value={total} className="font-heading text-[18px] font-bold text-safety" />
        </div>
        <button
          onClick={onClick}
          disabled={disabled}
          className="shrink-0 rounded-sm bg-safety px-10 py-3 font-heading text-[15px] font-bold text-white disabled:bg-steel-600"
        >
          {label}
        </button>
      </div>
    </div>
  );
}

function PayOption({
  on, onClick, title, note,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  note: string;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 border-b border-steel-800 px-3 py-2.5 text-left last:border-0">
      <span
        className={
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 " +
          (on ? "border-safety" : "border-steel-600")
        }
      >
        {on && <span className="h-2.5 w-2.5 rounded-full bg-safety" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={"block text-[13px] " + (on ? "font-semibold text-[#1a1a1a]" : "text-[#1a1a1a]")}>{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-steel-300">{note}</span>
      </span>
    </button>
  );
}

function Row({ label, value, free }: { label: string; value: number | string; free?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-steel-300">{label}</span>
      {typeof value === "number" ? (
        <Price value={value} className="text-[#1a1a1a]" />
      ) : (
        <span className={free ? "font-semibold text-[#1f9254]" : "text-[#1a1a1a]"}>{value}</span>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, textarea, inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  inputMode?: "tel" | "numeric";
}) {
  const cls =
    "w-full rounded-sm border border-steel-700 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-safety";
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block text-[11px] text-steel-300">{label}</span>
      {textarea ? (
        <textarea rows={3} className={cls} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={cls} value={value} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
