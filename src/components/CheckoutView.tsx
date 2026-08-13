"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getCart, cartTotal, updateQty, type CartItem } from "@/lib/cart";
import { formatPrice } from "@/lib/types";
import { promptPayPayload } from "@/lib/promptpay";
import { cachedUser, fetchMe, saveProfile, type User } from "@/lib/account";

// เช็คเอาต์ 3 ขั้น: ที่อยู่ → ชำระเงิน (QR PromptPay + แนบสลิป) → สำเร็จ
type Step = "address" | "payment" | "done";

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

export default function CheckoutView() {
  const [step, setStep] = useState<Step>("address");
  const [items, setItems] = useState<CartItem[]>([]);
  const [addr, setAddr] = useState<Address>({
    name: "", phone: "", address: "", province: "", zip: "", note: "",
  });
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
        return {
          ...a,
          name: u.addr?.name || u.name || "",
          phone: u.addr?.phone || u.phone || "",
          address: u.addr?.address || "",
          province: u.addr?.province || "",
          zip: u.addr?.zip || "",
        };
      });
    };
    fill(cachedUser());
    fetchMe().then(fill);
  }, []);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  // สร้างรูป QR เมื่อเข้าขั้นชำระเงิน
  useEffect(() => {
    if (step === "payment" && PROMPTPAY_ID) {
      QRCode.toDataURL(promptPayPayload(PROMPTPAY_ID, total), {
        width: 280,
        margin: 2,
      }).then(setQr);
    }
  }, [step, total]);

  const valid =
    addr.name.trim() && /^0\d{8,9}$/.test(addr.phone.replace(/[^0-9]/g, "")) &&
    addr.address.trim() && addr.province.trim() && /^\d{5}$/.test(addr.zip);

  // อ่านไฟล์สลิปเป็น base64
  const onSlip = (f: File) => {
    if (f.size > 3 * 1024 * 1024) { setError("ไฟล์สลิปต้องไม่เกิน 3MB"); return; }
    const r = new FileReader();
    r.onload = () => setSlip({ name: f.name, data: String(r.result) });
    r.readAsDataURL(f);
    setError("");
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
      // ล้างตะกร้า
      items.forEach((i) => updateQty(i.productId, i.variant, 0));
      setStep("done");
    } catch {
      setError("ส่งออเดอร์ไม่สำเร็จ ลองใหม่อีกครั้ง หรือติดต่อร้านทาง Facebook");
    } finally {
      setSending(false);
    }
  };

  if (items.length === 0 && step !== "done") {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-4xl">🛒</span>
        <p className="text-steel-300">ตะกร้าว่าง — เลือกสินค้าก่อนเช็คเอาต์</p>
        <Link href="/" className="rounded-lg bg-safety px-5 py-2.5 font-heading text-sm font-bold text-white">
          เลือกซื้อสินค้า
        </Link>
      </main>
    );
  }

  return (
    <main className="pb-8">
      <header className="sticky top-0 z-40 bg-steel-900/95 px-4 pb-3 backdrop-blur pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <h1 className="font-heading text-lg font-bold">
          {step === "address" && "ที่อยู่จัดส่ง (1/2)"}
          {step === "payment" && "ชำระเงิน (2/2)"}
          {step === "done" && "สั่งซื้อสำเร็จ"}
        </h1>
      </header>

      {step === "address" && (
        <div className="space-y-3 px-4 pt-2">
          {user ? (
            <label className="flex items-center gap-2 rounded-lg bg-safety-tint px-3 py-2.5">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-safety" />
              <span className="text-[13px] text-ink-700">บันทึกที่อยู่นี้ไว้ในบัญชี ครั้งหน้าไม่ต้องพิมพ์ใหม่</span>
            </label>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-safety-tint px-3 py-2.5">
              <span className="flex-1 text-[13px] text-ink-700">มีบัญชีแล้ว? เข้าสู่ระบบแล้วที่อยู่จะเติมให้อัตโนมัติ</span>
              <Link href="/account/login/?next=/checkout" className="shrink-0 text-[13px] font-semibold text-safety">เข้าสู่ระบบ</Link>
            </div>
          )}
          <Field label="ชื่อ-นามสกุล ผู้รับ" value={addr.name} onChange={(v) => setAddr({ ...addr, name: v })} />
          <Field label="เบอร์โทรศัพท์" value={addr.phone} inputMode="tel" onChange={(v) => setAddr({ ...addr, phone: v })} />
          <Field label="ที่อยู่ (บ้านเลขที่ หมู่ ตำบล อำเภอ)" value={addr.address} textarea onChange={(v) => setAddr({ ...addr, address: v })} />
          <div className="flex gap-3">
            <Field label="จังหวัด" value={addr.province} onChange={(v) => setAddr({ ...addr, province: v })} />
            <Field label="รหัสไปรษณีย์" value={addr.zip} inputMode="numeric" onChange={(v) => setAddr({ ...addr, zip: v })} />
          </div>
          <Field label="หมายเหตุถึงร้าน (ถ้ามี)" value={addr.note} onChange={(v) => setAddr({ ...addr, note: v })} />

          {/* สรุปรายการ */}
          <div className="rounded-lg bg-steel-800 p-3 text-sm">
            {items.map((i) => (
              <div key={`${i.productId}-${i.variant}`} className="flex justify-between py-0.5">
                <span className="min-w-0 flex-1 truncate pr-2 text-[#4a4a4a]">
                  {i.title} ({i.variant}) ×{i.qty}
                </span>
                <span className="shrink-0">{formatPrice(i.price * i.qty)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-steel-700 pt-2 font-heading font-bold">
              <span>ยอดรวม</span>
              <span className="text-safety">{formatPrice(total)}</span>
            </div>
          </div>

          <button
            disabled={!valid}
            onClick={() => {
              if (user && remember) {
                saveProfile({ addr: { name: addr.name, phone: addr.phone, address: addr.address, province: addr.province, zip: addr.zip } }).catch(() => {});
              }
              setStep("payment");
            }}
            className="w-full rounded-lg bg-safety py-3 font-heading font-bold text-white disabled:opacity-40"
          >
            ถัดไป: ชำระเงิน
          </button>
        </div>
      )}

      {step === "payment" && (
        <div className="space-y-4 px-4 pt-2">
          <div className="rounded-xl bg-white p-4 text-center text-steel-900">
            <p className="font-heading font-bold">สแกนจ่ายด้วย PromptPay</p>
            {PROMPTPAY_ID && qr ? (
              <>
                {/* QR ใช้ได้กับแอพธนาคารทุกแอพ ยอดใส่มาให้แล้ว */}
                <img src={qr} alt="PromptPay QR" className="mx-auto mt-2 h-64 w-64" />
                <p className="text-sm text-gray-600">PromptPay: {PROMPTPAY_ID}</p>
              </>
            ) : (
              <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
                ⚠️ ร้านยังไม่ได้ตั้งค่าเบอร์ PromptPay
                <br />(ใส่ NEXT_PUBLIC_PROMPTPAY_ID ใน .env แล้ว build ใหม่)
              </p>
            )}
            <p className="mt-1 font-heading text-2xl font-bold text-safety">{formatPrice(total)}</p>
          </div>

          {/* แนบสลิป */}
          <label className="block rounded-lg border-2 border-dashed border-steel-600 p-4 text-center text-sm text-steel-300">
            {slip ? (
              <span className="text-safety">📎 {slip.name} ✓</span>
            ) : (
              <>📎 แตะเพื่อแนบสลิปโอนเงิน</>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onSlip(e.target.files[0])}
            />
          </label>

          {error && <p className="text-center text-sm text-red-400">{error}</p>}

          <button
            disabled={sending || !slip}
            onClick={submit}
            className="w-full rounded-lg bg-safety py-3 font-heading font-bold text-white disabled:opacity-40"
          >
            {sending ? "กำลังส่งออเดอร์…" : "ยืนยันการสั่งซื้อ"}
          </button>
          <button onClick={() => setStep("address")} className="w-full text-center text-sm text-steel-300 underline">
            ‹ กลับไปแก้ที่อยู่
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-3 px-6 pt-14 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15 text-3xl">✅</span>
          <h2 className="font-heading text-xl font-bold">ได้รับออเดอร์แล้ว!</h2>
          <p className="text-sm text-steel-300">
            เลขที่ออเดอร์ <span className="font-bold text-safety">{orderId}</span>
            <br />ร้านจะตรวจสอบสลิปและจัดส่งให้เร็วที่สุด
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
        </div>
      )}
    </main>
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
    "w-full rounded-lg border border-steel-700 bg-steel-800 px-3 py-2.5 text-sm outline-none focus:border-safety";
  return (
    <label className="block flex-1">
      <span className="mb-1 block text-xs text-steel-300">{label}</span>
      {textarea ? (
        <textarea rows={3} className={cls} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={cls} value={value} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
