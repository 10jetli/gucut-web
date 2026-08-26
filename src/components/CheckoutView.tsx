"use client";

import Image from "next/image";
import { SHELL_W } from "@/lib/layout";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { clearBuyNow, getBuyNow, getCart, setBuyNowQty, updateQty, type CartItem } from "@/lib/cart";
import Price from "@/components/Price";
import { promptPayPayload } from "@/lib/promptpay";
import { SHOP } from "@/lib/shop";
import { shippingFor } from "@/lib/shipping";
import { track } from "@/lib/track";
import { cachedUser, fetchMe, saveProfile, type User } from "@/lib/account";

// หน้าสั่งซื้อแบบ Shopee — เห็นทุกอย่างในหน้าเดียว แล้วกดเช็คเอาต์จากแถบล่าง
//   order    ที่อยู่ / สินค้า (ปรับจำนวนได้) / หมายเหตุ / ใบกำกับภาษี / การจัดส่ง /
//            ช่องทางชำระเงิน / สรุปยอด
//   pay      เฉพาะคนจ่ายด้วย QR — สแกนจ่ายแล้วแนบสลิป (เก็บปลายทางข้ามขั้นนี้)
//   done     สั่งซื้อสำเร็จ
type Step = "order" | "pay" | "beam" | "done";
type Pay = "beam" | "cod" | "promptpay";

interface Address {
  name: string; phone: string; address: string; province: string; zip: string;
}
interface TaxInfo {
  name: string; taxId: string; address: string;
}
interface Coupon {
  code: string; label: string; discount: number;
  subtotal: number;   // ยอดที่ใช้คิดส่วนลดตอนนั้น — ตะกร้าเปลี่ยนแล้วต้องกดใหม่
}

const PROMPTPAY_ID = process.env.NEXT_PUBLIC_PROMPTPAY_ID ?? "";

// ---------------------------------------------------------------------------
// ตัวเลขเรื่องจัดส่ง — แก้ที่นี่ที่เดียว หน้าสรุปยอดกับกล่องจัดส่งขึ้นตามให้เอง
// ---------------------------------------------------------------------------
// ค่าส่งเป็นขั้นบันไดตามยอดค่าสินค้า — ตารางอยู่ที่ src/lib/shipping.ts
// (คัดมาจากค่าจริงที่ร้านตั้งไว้ใน Shopify) เซิร์ฟเวอร์คิดใหม่เองอยู่แล้ว
const COD_FEE: number = 0;             // ค่าบริการเก็บเงินปลายทาง

// เก็บเงินปลายทาง — ปิดอยู่ตามที่เจ้าของร้านสั่ง (16 ส.ค. 2569)
// ปิดแล้วปุ่มยังโชว์อยู่แต่เป็นสีเทา กดไม่ได้ พร้อมบอกเหตุผล
//
// เปิดใช้ใหม่: ตั้ง NEXT_PUBLIC_COD=1 ที่ Netlify แล้ว deploy — ไม่ต้องแก้โค้ด
// ไม่ตั้ง หรือตั้งเป็นค่าอื่น = ปิด (ตั้งใจให้ค่าเริ่มต้นเป็นปิด กันเปิดโดยไม่ตั้งใจ)
// ⚠️ ฝั่งเซิร์ฟเวอร์อ่าน env ตัวเดียวกันนี้ที่ netlify/functions/orders.mjs
//    ปิดที่หน้าเว็บอย่างเดียวไม่พอ ยิง POST ตรงยังสั่งแบบ COD ได้
const COD_ON = process.env.NEXT_PUBLIC_COD === "1";
// ⚠️ ข้อความต้องสอดคล้องกับความจริง ณ ตอนนั้น
//    ถ้าเก็บปลายทางปิด "และ" ยังไม่ได้ตั้งเบอร์พร้อมเพย์ = ลูกค้าจ่ายไม่ได้สักทาง
//    บอกให้ไปใช้ QR ทั้งที่ QR ก็ยังใช้ไม่ได้ = ลูกค้าวนอยู่ในหน้าเดิมแล้วเลิกซื้อ
const COD_OFF_NOTE = PROMPTPAY_ID
  ? "ยังไม่เปิดให้ใช้ตอนนี้ — สั่งด้วย QR พร้อมเพย์ได้เลย"
  : "ยังไม่เปิดให้ใช้ตอนนี้ — กดยืนยันคำสั่งซื้อไว้ก่อนได้ ทีมงานจะติดต่อกลับ";
const SHIP_MIN_DAYS = 2;       // ช่วงเวลาส่งถึงโดยประมาณ
const SHIP_MAX_DAYS = 4;
const SHIP_NAME = "ส่งธรรมดาในประเทศ";
const CARRIER = "Flash Express";   // ชื่อบริษัทขนส่ง · ว่าง = ไม่โชว์

const DAY = 24 * 60 * 60 * 1000;
const thaiDate = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });

export default function CheckoutView() {
  const [step, setStep] = useState<Step>("order");
  const [items, setItems] = useState<CartItem[]>([]);
  const [addr, setAddr] = useState<Address>({ name: "", phone: "", address: "", province: "", zip: "" });
  const [editAddr, setEditAddr] = useState(true);
  const [note, setNote] = useState("");
  const [editNote, setEditNote] = useState(false);
  const [tax, setTax] = useState<TaxInfo | null>(null);
  // ⚠️ ห้ามเดาว่าจ่ายทางไหนได้ ต้องถามเซิร์ฟเวอร์
  //    เคยเขียนตายตัวว่าจ่ายปลายทางได้ทั้งที่ปิดอยู่ ลูกค้ากรอกครบแล้วมาเจอว่าสั่งไม่ได้
  const [pays, setPays] = useState<{ beam: boolean; cod: boolean } | null>(null);
  // ⚠️ รายชื่อช่องทางมาจากเซิร์ฟเวอร์เสมอ ห้ามเขียนซ้ำในไฟล์นี้
  //    เขียนสองที่ = วันหนึ่งหน้าเว็บโชว์ช่องที่เซิร์ฟเวอร์ไม่รับ
  //    แล้วลูกค้าเลือกไปจนสุดทางถึงเจอว่าใช้ไม่ได้
  const [beamMethods, setBeamMethods] = useState<{ id: string; label: string; note: string }[]>([]);
  const [beamMethod, setBeamMethod] = useState("QR_PROMPT_PAY");
  const [pay, setPay] = useState<Pay>(COD_ON ? "cod" : "promptpay");
  // จ่ายผ่าน Beam — QR จากธนาคารจริง ระบบยืนยันเงินเข้าเอง ไม่ต้องแนบสลิป
  const [beam, setBeam] = useState<{ qr: string; token: string; expiry: string | null } | null>(null);
  const [beamLeft, setBeamLeft] = useState(0);
  const [qr, setQr] = useState("");
  const [slip, setSlip] = useState<{ name: string; data: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");

  // ถามว่าตอนนี้จ่ายทางไหนได้บ้าง แล้วเลือกทางที่ดีที่สุดให้ลูกค้าอัตโนมัติ
  useEffect(() => {
    let alive = true;
    fetch("/api/pay-options")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        // ⚠️ Array.isArray ก่อนเสมอ — ตอน deploy ใหม่ หน้าเก่ากับ API ใหม่อยู่ด้วยกันชั่วครู่
        setBeamMethods(Array.isArray(j?.beamMethods) ? j.beamMethods : []);
        const o = { beam: !!j?.beam, cod: !!j?.cod };
        setPays(o);
        setPay(o.beam ? "beam" : o.cod ? "cod" : "promptpay");
      })
      .catch(() => setPays({ beam: false, cod: COD_ON }));
    return () => { alive = false; };
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [remember, setRemember] = useState(true);
  const [eta, setEta] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  // แต้มสะสม — กติกาและยอดแต้มมาจากเซิร์ฟเวอร์ (ฝั่งนี้แค่โชว์กับส่งจำนวนที่อยากแลก)
  const [loyalty, setLoyalty] = useState<{
    on: boolean; points: number; redeemValue: number; minRedeem: number; maxPercent: number;
  } | null>(null);
  const [usePoints, setUsePoints] = useState(false);

  // มาจากปุ่ม "ซื้อเลย" = สั่งเฉพาะชิ้นนั้นชิ้นเดียว ของในตะกร้าไม่เกี่ยวข้อง (แบบ Shopee)
  // เข้าหน้านี้ทางอื่น (ปุ่มสั่งสินค้าในตะกร้า) = สั่งของทั้งตะกร้าเหมือนเดิม
  const [buyNow, setBuyNowMode] = useState(false);
  useEffect(() => {
    const one = getBuyNow();
    if (one) { setBuyNowMode(true); setItems([one]); }
    else setItems(getCart());
  }, []);

  useEffect(() => {
    fetch("/api/points")
      .then((r) => r.json())
      .then((d) => setLoyalty(d))
      .catch(() => {});   // ระบบแต้มล่ม — หน้าสั่งซื้อต้องใช้ได้ตามปกติ
  }, []);

  // ช่วงวันที่ส่งถึงโดยประมาณ — คิดตอนเปิดหน้าเท่านั้น ไม่งั้น HTML ฝั่ง server ไม่ตรงกับ client
  useEffect(() => {
    const now = Date.now();
    setEta(`${thaiDate(new Date(now + SHIP_MIN_DAYS * DAY))} – ${thaiDate(new Date(now + SHIP_MAX_DAYS * DAY))}`);
  }, []);

  // ล็อกอินอยู่แล้วก็เติมที่อยู่ที่เคยบันทึกไว้ให้เลย ไม่ต้องพิมพ์ใหม่
  useEffect(() => {
    const fill = (u: User | null) => {
      setUser(u);
      if (!u) return;
      setAddr((a) => {
        if (a.name || a.address) return a;   // พิมพ์ไปแล้วห้ามทับ
        const next = {
          name: u.addr?.name || u.name || "",
          phone: u.addr?.phone || u.phone || "",
          address: u.addr?.address || "",
          province: u.addr?.province || "",
          zip: u.addr?.zip || "",
        };
        if (ok(next)) setEditAddr(false);    // ครบแล้วก็พับเก็บให้เหมือน Shopee
        return next;
      });
    };
    fill(cachedUser());
    fetchMe().then(fill);
  }, []);

  const valid = ok(addr);
  useEffect(() => {
    if (valid) setError((e) => (e.startsWith("กรอกที่อยู่") ? "" : e));
  }, [valid]);

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const codFee = pay === "cod" ? COD_FEE : 0;
  const discount = Math.min(coupon?.discount ?? 0, subtotal);

  // แลกแต้มได้เท่าไหร่ — คิดแบบเดียวกับฝั่งเซิร์ฟเวอร์ (เซิร์ฟเวอร์คิดใหม่อยู่ดี)
  const afterCoupon = Math.max(0, subtotal - discount);
  const pointCap = Math.floor((afterCoupon * (loyalty?.maxPercent ?? 0)) / 100);
  const canUsePoints =
    !!loyalty?.on && (loyalty?.points ?? 0) >= (loyalty?.minRedeem ?? 0) && pointCap > 0 && (loyalty?.points ?? 0) > 0;
  const pointsToUse = canUsePoints && usePoints
    ? Math.min(loyalty!.points, Math.floor(pointCap / loyalty!.redeemValue))
    : 0;
  const pointDiscount = Math.min(Math.floor(pointsToUse * (loyalty?.redeemValue ?? 1)), pointCap, afterCoupon);

  // ค่าส่งคิดจากยอดหลังหักส่วนลดโค้ด (ไม่นับแต้ม) ให้ตรงกับเงื่อนไขที่ตั้งไว้ใน Shopify
  const shippingFee = shippingFor(afterCoupon);
  const total = Math.max(0, afterCoupon - pointDiscount) + shippingFee + codFee;

  // บอกช่องทางโฆษณาว่าลูกค้าเข้าหน้าสั่งซื้อแล้ว — ยิงครั้งเดียวต่อการเข้าหน้า
  // ไม่ผูกกับ total เพราะลูกค้าปรับจำนวน/ใส่โค้ดได้ ยิงทุกครั้งที่ยอดขยับจะรัวเกินจริง
  const sentBegin = useRef(false);
  useEffect(() => {
    if (sentBegin.current || !items.length) return;
    sentBegin.current = true;
    track("InitiateCheckout", {
      items: items.map((i) => ({ id: i.handle, title: i.title, price: i.price, qty: i.qty })),
      value: items.reduce((s, i) => s + i.price * i.qty, 0),
    });
  }, [items]);

  // ตะกร้าเปลี่ยนแล้วส่วนลดเดิมอาจใช้ไม่ได้ (เช่นมียอดขั้นต่ำ) — ให้กดใช้โค้ดใหม่
  useEffect(() => {
    setCoupon((c) => (c && c.subtotal !== subtotal ? null : c));
  }, [subtotal]);

  useEffect(() => {
    if (step === "pay" && PROMPTPAY_ID) {
      QRCode.toDataURL(promptPayPayload(PROMPTPAY_ID, total), { width: 280, margin: 2 })
        .then(setQr)
        .catch(() => {});
    }
  }, [step, total]);

  // ปรับจำนวน / ลบของ ได้จากหน้านี้เลยแบบ Shopee
  const setQty = (i: CartItem, q: number) => {
    if (buyNow) {
      setBuyNowQty(q);
      const one = getBuyNow();
      setItems(one ? [one] : []);
      return;
    }
    updateQty(i.productId, i.variant, q);
    setItems(getCart());
  };

  const onSlip = (f: File) => {
    if (f.size > 3 * 1024 * 1024) { setError("ไฟล์สลิปต้องไม่เกิน 3MB"); return; }
    const r = new FileReader();
    r.onload = () => setSlip({ name: f.name, data: String(r.result) });
    r.readAsDataURL(f);
    setError("");
  };

  // กดเช็คเอาต์จากแถบล่าง — โอนก่อนไปหน้า QR · เก็บปลายทางส่งออเดอร์เลย
  const placeOrder = () => {
    if (!valid) {
      setEditAddr(true);
      setError("กรอกที่อยู่จัดส่งให้ครบก่อนครับ");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError("");
    if (user && remember) saveProfile({ addr }).catch(() => {});
    if (pay === "cod" || pay === "beam") submit();
    else setStep("pay");
  };

  // ส่งออเดอร์เข้า /api/orders — เก็บที่ Netlify + เด้งแจ้งเตือนเข้ากลุ่ม Telegram ของร้าน
  // (เลขออเดอร์ออกจากเซิร์ฟเวอร์ ฝั่งนี้แค่รอรับ)
  const submit = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { ...addr, note },
          items: items.map((i) => ({ title: i.title, variant: i.variant, price: i.price, qty: i.qty, sku: i.sku ?? "" })),
          payment: pay,                                   // "beam" | "cod" | "promptpay"
          beamMethod,                                     // ช่องทางย่อยของ Beam ที่ลูกค้าเลือก
          couponCode: coupon?.code ?? null,
          discount,
          usePoints: pointsToUse,
          shipping: shippingFee,   // เซิร์ฟเวอร์คิดใหม่เองอยู่ดี ส่งไปเพื่อให้เทียบได้ว่าตรงกันไหม
          codFee,
          taxInvoice: tax,                                // null = ไม่ขอใบกำกับภาษี
          slipBase64: slip?.data ?? null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `orders ${res.status}`);
      setOrderId(j.orderId);

      // ⚠️ จ่ายผ่าน Beam ยังไม่ถือว่าซื้อสำเร็จตรงนี้ — เพิ่งได้ QR มาเฉย ๆ
      //    ห้ามล้างตะกร้าและห้ามยิงยอดขายเข้าโฆษณา จนกว่าเงินจะเข้าจริง
      //    (ล้างตะกร้าตอนนี้ = ลูกค้าที่ไม่จ่ายจะเสียของในตะกร้าไปฟรี ๆ)
      if (j.pay === "beam") {
        // ⚠️ วอลเล็ตกับแอปธนาคารไม่ได้คืน QR มา แต่คืนลิงก์ให้พาลูกค้าไปจ่ายที่แอปนั้น
        //    ต้องจำเลขออเดอร์ไว้ก่อนพาออกไป ไม่งั้นตอนเด้งกลับมาไม่รู้ว่าเป็นออเดอร์ไหน
        //    (เซิร์ฟเวอร์รู้อยู่แล้วจาก referenceId แต่หน้าเว็บต้องรู้ด้วยเพื่อโชว์ผล)
        if (j.redirectUrl) {
          try { localStorage.setItem("gucut-beam-pending", String(j.orderId)); } catch { /* โหมดส่วนตัว */ }
          window.location.href = j.redirectUrl;
          return;
        }
        setBeam({ qr: j.qrBase64 || "", token: j.checkToken || "", expiry: j.expiry || null });
        setStep("beam");
        return;
      }
      // ยอดที่ยิงให้โฆษณา = ยอดที่ลูกค้าจ่ายจริง (รวมค่าส่ง หักส่วนลดแล้ว)
      // eventId = เลขออเดอร์ ต้องตรงกับที่เซิร์ฟเวอร์ยิงผ่าน CAPI ไม่งั้นยอดถูกนับสองเท่า
      track("Purchase", {
        items: items.map((i) => ({ id: i.handle, title: i.title, price: i.price, qty: i.qty })),
        value: total,
        eventId: j.orderId,
      });
      // ซื้อเลย = ล้างเฉพาะของชิ้นที่ซื้อ ตะกร้าเดิมยังอยู่ครบ · สั่งจากตะกร้า = ล้างตะกร้า
      if (buyNow) clearBuyNow();
      else items.forEach((i) => updateQty(i.productId, i.variant, 0));
      setStep("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        /สลิป|ถี่เกินไป|ไม่ครบ/.test(msg)
          ? msg
          : "ส่งออเดอร์ไม่สำเร็จ ลองใหม่อีกครั้ง หรือทักร้านทางแชท",
      );
    } finally {
      setSending(false);
    }
  };

  // ---------------------------------------------------------------------------
  // รอเงินเข้า — ถามเซิร์ฟเวอร์เป็นระยะว่าจ่ายสำเร็จหรือยัง
  //
  // ⚠️ ไม่รอแต่ webhook จาก Beam อย่างเดียว ถ้ามันหายไปลูกค้าจะค้างหน้าจอทั้งที่จ่ายแล้ว
  //    ฝั่งเซิร์ฟเวอร์ของ /api/orders?t= จะถาม Beam เองด้วยทุกครั้งที่เราถาม
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (step !== "beam" || !beam?.token || !orderId) return;
    let alive = true;

    const tick = async () => {
      try {
        const r = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}&t=${encodeURIComponent(beam.token)}`);
        const j = await r.json().catch(() => null);
        if (!alive || !j?.paid) return;

        // เงินเข้าแล้ว — ตอนนี้ถึงจะถือว่าซื้อสำเร็จ
        track("Purchase", {
          items: items.map((i) => ({ id: i.handle, title: i.title, price: i.price, qty: i.qty })),
          value: total,
          eventId: orderId,
        });
        if (buyNow) clearBuyNow();
        else items.forEach((i) => updateQty(i.productId, i.variant, 0));
        setStep("done");
      } catch { /* เน็ตสะดุด รอบหน้าค่อยถามใหม่ */ }
    };

    const poll = setInterval(tick, 3000);
    void tick();

    const clock = setInterval(() => {
      const ms = beam.expiry ? new Date(beam.expiry).getTime() - Date.now() : 0;
      setBeamLeft(Math.max(0, Math.floor(ms / 1000)));
    }, 1000);

    return () => { alive = false; clearInterval(poll); clearInterval(clock); };
  }, [step, beam, orderId, items, total, buyNow]);

  // -------------------------------------------------------------- รอจ่ายเงิน
  if (step === "beam") {
    const mm = String(Math.floor(beamLeft / 60)).padStart(2, "0");
    const ss = String(beamLeft % 60).padStart(2, "0");
    const dead = beam?.expiry ? beamLeft <= 0 : false;
    return (
      <main className="pb-10">
        <Head title="สแกนจ่ายเงิน" onBack={() => setStep("order")} />
        <div className="space-y-2 p-3">
          <div className="rounded-lg bg-white p-4 text-center">
            {beam?.qr && !dead ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={beam.qr} alt="QR พร้อมเพย์" className="mx-auto h-64 w-64" />
                <Price value={total} className="mt-2 block font-heading text-2xl font-bold text-safety" />
                <p className="mt-1 text-[13px] text-steel-300">
                  สแกนด้วยแอปธนาคารใดก็ได้ · ยอดใส่มาให้แล้ว
                </p>
                {beam.expiry && (
                  <p className="mt-2 text-[13px] font-semibold text-[#1a1a1a]">
                    QR หมดอายุใน {mm}:{ss}
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-lg bg-amber-50 p-4 text-left">
                <p className="text-[15px] font-semibold text-amber-900">QR หมดอายุแล้ว</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-amber-800">
                  กดย้อนกลับแล้วสั่งใหม่อีกครั้งได้เลย ยังไม่มีการตัดเงินใด ๆ
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-white px-3 py-3 text-[13px] leading-relaxed text-steel-300">
            <p className="font-semibold text-[#1a1a1a]">ไม่ต้องแนบสลิป</p>
            <p className="mt-1">
              ระบบตรวจเงินเข้าให้อัตโนมัติ พอจ่ายเสร็จหน้านี้จะเปลี่ยนเป็นสั่งซื้อสำเร็จเอง
              ภายในไม่กี่วินาที — อย่าเพิ่งปิดหน้านี้
            </p>
            <p className="mt-2 text-[12px]">เลขคำสั่งซื้อ {orderId}</p>
          </div>
          {error && <p className="text-center text-[13px] text-safety">{error}</p>}
        </div>
      </main>
    );
  }

  if (items.length === 0 && step !== "done") {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-4xl">🛒</span>
        <p className="text-steel-300">
          {buyNow ? "ไม่มีสินค้าในรายการสั่งซื้อนี้" : "ตะกร้าว่าง — เลือกสินค้าก่อนสั่งซื้อ"}
        </p>
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
        <Head title="QR พร้อมเพย์" onBack={() => setStep("order")} />
        <div className="space-y-2 p-3">
          <div className="rounded-lg bg-white p-4 text-center">
            {PROMPTPAY_ID && qr ? (
              <>
                {/* QR ใช้ได้กับแอปธนาคารทุกแอป ยอดใส่มาให้แล้ว */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR พร้อมเพย์" className="mx-auto h-60 w-60" />
                <p className="text-[13px] text-steel-300">พร้อมเพย์: {PROMPTPAY_ID}</p>
              </>
            ) : (
              // ⚠️ ข้อความตรงนี้ "ลูกค้าเป็นคนอ่าน" ไม่ใช่ช่างเทคนิค
              //    ของเดิมเขียนว่า "ใส่ NEXT_PUBLIC_PROMPTPAY_ID ที่ Netlify แล้ว deploy ใหม่"
              //    ซึ่งลูกค้าอ่านไม่รู้เรื่องและทำให้ดูเหมือนเว็บพัง (เจ้าของร้านเจอเอง 17 ส.ค. 2569)
              //    ห้ามเอาข้อความสำหรับนักพัฒนามาโชว์หน้าร้านอีก — ให้ไปดูที่ /admin/status/ แทน
              <div className="rounded-lg bg-amber-50 p-4 text-left">
                <p className="text-[15px] font-semibold text-amber-900">
                  ระบบชำระเงินผ่าน QR อยู่ระหว่างปรับปรุงชั่วคราว
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-amber-800">
                  ขออภัยในความไม่สะดวก ท่านกดยืนยันคำสั่งซื้อไว้ก่อนได้เลย
                  ทีมงานจะติดต่อกลับตามเบอร์ที่ท่านให้ไว้ เพื่อแจ้งช่องทางชำระเงิน
                  และยืนยันการจัดส่ง
                </p>
                {/* เบอร์ร้านยังไม่ได้กรอกใน src/lib/shop.ts — กรอกเมื่อไหร่บรรทัดนี้ขึ้นเอง
                    ห้ามใส่เบอร์มั่วเพื่อให้ดูครบ (กติกาเดียวกับหน้านโยบาย) */}
                {SHOP.phone && (
                  <p className="mt-2 text-[13px] text-amber-800">
                    สอบถามด่วน{" "}
                    <a href={`tel:${SHOP.phone}`} className="font-semibold underline">
                      โทร. {SHOP.phone}
                    </a>
                  </p>
                )}
              </div>
            )}
            <Price value={total} className="mt-1 block font-heading text-2xl font-bold text-safety" />
          </div>

          <label className="block rounded-lg border-2 border-dashed border-steel-600 bg-white p-4 text-center text-sm text-steel-300">
            {slip ? <span className="font-semibold text-safety">📎 {slip.name} ✓</span> : <>📎 แตะเพื่อแนบสลิปโอนเงิน</>}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onSlip(e.target.files[0])} />
          </label>
          {error && <p className="text-center text-[13px] text-safety">{error}</p>}
        </div>

        <BottomBar
          total={total}
          label={sending ? "กำลังส่ง…" : "ยืนยันการสั่งซื้อ"}
          disabled={sending || !slip}
          hint={!slip ? "แนบสลิปก่อนกดยืนยัน" : undefined}
          onClick={submit}
        />
      </main>
    );
  }

  // -------------------------------------------------------------- หน้าสั่งซื้อ
  return (
    <main className="min-h-[100dvh] bg-steel-900 pb-28">
      <Head title="สั่งซื้อ" />
      <div className="pt-2" />

      {/* ที่อยู่จัดส่ง */}
      <Card>
        {editAddr ? (
          <div className="space-y-2.5 p-3">
            <p className="text-[13px] font-semibold text-[#1a1a1a]">ที่อยู่จัดส่ง</p>
            {user ? (
              <label className="flex items-center gap-2 rounded-sm bg-safety-tint px-3 py-2">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-safety" />
                <span className="text-[12px] text-ink-700">บันทึกที่อยู่นี้ไว้ ครั้งหน้าไม่ต้องพิมพ์ใหม่</span>
              </label>
            ) : (
              <div className="flex items-center gap-2 rounded-sm bg-safety-tint px-3 py-2">
                <span className="flex-1 text-[12px] text-ink-700">มีบัญชีแล้ว? เข้าสู่ระบบแล้วที่อยู่จะเติมให้เอง</span>
                <Link href="/account/login/?next=/checkout" className="shrink-0 text-[12px] font-semibold text-safety">เข้าสู่ระบบ</Link>
              </div>
            )}
            <Field label="ชื่อ-นามสกุล ผู้รับ" value={addr.name} onChange={(v) => setAddr({ ...addr, name: v })} />
            <Field label="เบอร์โทรศัพท์" value={addr.phone} inputMode="tel" onChange={(v) => setAddr({ ...addr, phone: v })} />
            <Field label="ที่อยู่ (บ้านเลขที่ หมู่ ตำบล อำเภอ)" value={addr.address} textarea onChange={(v) => setAddr({ ...addr, address: v })} />
            <div className="flex gap-2.5">
              <Field label="จังหวัด" value={addr.province} onChange={(v) => setAddr({ ...addr, province: v })} />
              <Field label="รหัสไปรษณีย์" value={addr.zip} inputMode="numeric" onChange={(v) => setAddr({ ...addr, zip: v })} />
            </div>
            {valid && (
              <button onClick={() => setEditAddr(false)} className="w-full rounded-sm border border-safety py-2 text-[13px] font-semibold text-safety">
                ใช้ที่อยู่นี้
              </button>
            )}
          </div>
        ) : (
          <button onClick={() => setEditAddr(true)} className="flex w-full items-start gap-2 p-3 text-left">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 fill-none stroke-safety stroke-2">
              <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" strokeLinejoin="round" />
              <circle cx="12" cy="10" r="2.4" />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-[#1a1a1a]">
                {addr.name} <span className="font-normal text-steel-300">({addr.phone})</span>
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-steel-300">
                {addr.address}
                <br />
                {addr.province} {addr.zip}
              </span>
            </span>
            <Chevron />
          </button>
        )}
      </Card>

      {/* สินค้า — ปรับจำนวน / ลบได้จากหน้านี้เลย */}
      <Card>
        {items.map((i) => (
          <div key={`${i.productId}-${i.variant}`} className="flex gap-2.5 border-b border-steel-800 p-3 last:border-0">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded border border-steel-700 bg-white">
              {i.image && <Image src={i.image} alt={i.title} fill sizes="64px" className="object-contain" />}
            </div>
            <div className="min-w-0 flex-1">
              <Link href={`/products/${encodeURIComponent(i.handle)}`} className="clamp-2 block text-[13px] leading-snug text-[#1a1a1a]">
                {i.title}
              </Link>
              {i.variant && i.variant !== "-" && <p className="mt-0.5 text-[11px] text-steel-300">{i.variant}</p>}
              <div className="mt-1.5 flex items-center gap-2">
                <Price value={i.price} className="flex-1 font-heading text-[15px] font-semibold text-safety" />
                <Stepper qty={i.qty} onChange={(q) => setQty(i, q)} />
                <button onClick={() => setQty(i, 0)} className="text-[12px] text-steel-300 underline">ลบ</button>
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* หมายเหตุ + ใบกำกับภาษี */}
      <Card>
        <CouponRow subtotal={subtotal} coupon={coupon} setCoupon={setCoupon} />

        {/* แต้มสะสม — ขึ้นเฉพาะคนที่ล็อกอินและมีแต้มพอ */}
        {loyalty?.on && (loyalty.points ?? 0) > 0 && (
          <button
            onClick={() => canUsePoints && setUsePoints((v) => !v)}
            disabled={!canUsePoints}
            className="flex w-full items-center gap-2 border-b border-steel-800 px-3 py-2.5 text-left last:border-0 disabled:opacity-60"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-[#1a1a1a]">ใช้แต้มสะสม</span>
              <span className="block text-[11.5px] text-steel-300">
                มี {loyalty.points.toLocaleString("th-TH")} แต้ม
                {!canUsePoints && ` · ต้องมีอย่างน้อย ${loyalty.minRedeem} แต้ม`}
                {canUsePoints && ` · แลกได้ไม่เกิน ${loyalty.maxPercent}% ของค่าสินค้า`}
              </span>
            </span>
            {usePoints && pointDiscount > 0 ? (
              <span className="shrink-0 text-[13px] font-bold text-safety">
                -฿{pointDiscount.toLocaleString("th-TH")}
              </span>
            ) : (
              <span className="shrink-0 text-[12.5px] text-safety">กดใช้แต้ม</span>
            )}
          </button>
        )}
        {editNote ? (
          <div className="space-y-2 p-3">
            <p className="text-[13px] font-semibold text-[#1a1a1a]">หมายเหตุ</p>
            <textarea
              rows={3}
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ฝากข้อความถึงร้านหรือบริษัทขนส่ง"
              className="w-full rounded-sm border border-steel-700 px-2.5 py-2 text-[13px] outline-none focus:border-safety"
            />
            <button onClick={() => setEditNote(false)} className="w-full rounded-sm border border-safety py-2 text-[13px] font-semibold text-safety">
              บันทึกหมายเหตุ
            </button>
          </div>
        ) : (
          <RowLink label="หมายเหตุ" value={note || "ฝากข้อความถึงร้านหรือบริษัทขนส่ง"} muted={!note} onClick={() => setEditNote(true)} />
        )}
        <TaxRow tax={tax} setTax={setTax} />
      </Card>

      {/* ตัวเลือกการจัดส่ง */}
      <Card>
        <p className="border-b border-steel-700 px-3 py-2.5 text-[13px] font-semibold text-[#1a1a1a]">
          ตัวเลือกการจัดส่ง
        </p>
        <div className="m-3 rounded-sm border border-[#1f9254]/50 bg-[#1f9254]/[0.06] p-2.5">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-[#1f9254] stroke-[1.8]">
              <path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" strokeLinejoin="round" />
              <circle cx="7" cy="17.5" r="1.6" />
              <circle cx="17" cy="17.5" r="1.6" />
            </svg>
            <span className="flex-1 text-[13px] font-semibold text-[#1f9254]">{eta || " "}</span>
            <span className="text-[13px] font-semibold text-[#1f9254]">
              {/* ⚠️ ห้ามเขียนคำว่า "ส่งฟรี" ที่ไหนในเว็บนี้ — ร้านไม่มีส่งฟรี
                  ค่าส่งจริงเป็นขั้นบันได 70-400 บาท (ดู src/lib/shipping.ts
                  ไม่มีขั้นไหนเป็น 0 สักขั้น) เดิมตรงนี้มีทางแยกไปโชว์ "ส่งฟรี"
                  ตอนค่าส่งเป็น 0 ซึ่งเกิดไม่ได้อยู่แล้ว และเป็นคำที่เจ้าของร้านห้ามใช้
                  โชว์เป็นตัวเลขตรง ๆ เสมอ ถ้าเป็น 0 จริงก็ขึ้น ฿0 ซึ่งไม่ได้โฆษณาอะไร */}
              {`฿${shippingFee.toLocaleString("th-TH")}`}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-steel-300">
            {SHIP_NAME}
            {CARRIER && ` · ${CARRIER}`}
          </p>
        </div>
      </Card>

      {/* ช่องทางการชำระเงิน */}
      <Card>
        <p className="border-b border-steel-700 px-3 py-2.5 text-[13px] font-semibold text-[#1a1a1a]">
          ช่องทางการชำระเงิน
        </p>
        {/* ⚠️ ลำดับสำคัญ — ทางที่สะดวกที่สุดต้องอยู่บนสุดและถูกเลือกไว้ให้เลย
            จ่ายผ่าน Beam ระบบตรวจเงินเข้าเอง ลูกค้าไม่ต้องแนบสลิป
            และร้านไม่ต้องมานั่งเปิดดูสลิปทีละใบ */}
        {pays?.beam && (
          <>
            <PayOption
              on={pay === "beam"}
              onClick={() => setPay("beam")}
              badge="QR"
              title="จ่ายออนไลน์"
              note="ระบบตรวจเงินเข้าให้อัตโนมัติ ไม่ต้องแนบสลิป"
            />
            {/* ⚠️ รายชื่อช่องทางย่อยมาจากเซิร์ฟเวอร์ (PAY_METHODS ใน beam.mjs)
                   ห้ามเขียนรายชื่อซ้ำในไฟล์นี้
                ⚠️ ขึ้นเฉพาะตอนเลือก "จ่ายออนไลน์" ไว้ ไม่งั้นเอา 12 ช่องมาขวางคนที่จะจ่ายปลายทาง
                ⚠️ "Beam รับได้" กับ "เปิดใช้กับร้านเรา" เป็นคนละเรื่อง
                   ช่องที่ร้านยังไม่ได้เปิด Beam จะตีกลับตอนกดสั่ง
                   จึงต้องมีข้อความบอกให้เลือกทางอื่น ไม่ใช่ปล่อยให้ลูกค้างง */}
            {pay === "beam" && beamMethods.length > 1 && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 px-3 pb-3">
                {beamMethods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setBeamMethod(m.id)}
                    className={
                      "rounded-sm border px-2.5 py-2 text-left text-[12.5px] leading-tight " +
                      (beamMethod === m.id
                        ? "border-safety bg-safety-tint font-semibold text-ink"
                        : "border-steel-600 bg-white text-ink-700")
                    }
                  >
                    {m.label}
                    {m.note && (
                      <span className="mt-0.5 block text-[10.5px] font-normal text-ink-300">
                        {m.note}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <PayOption
          on={COD_ON && pay === "cod"}
          onClick={() => setPay("cod")}
          disabled={!COD_ON}
          badge="COD"
          title="เก็บเงินปลายทาง"
          note={COD_ON ? "จ่ายเงินสดตอนรับของที่บ้าน ร้านจะโทรยืนยันก่อนส่ง" : COD_OFF_NOTE}
        />
        {/* ทางเดิม (แนบสลิปเอง) โชว์เฉพาะตอนที่ระบบตรวจอัตโนมัติใช้ไม่ได้
            ไม่งั้นลูกค้าจะเลือกทางที่ช้ากว่าและร้านต้องมาตรวจสลิปโดยไม่จำเป็น */}
        {pays && !pays.beam && (
          <PayOption
            on={pay === "promptpay"}
            onClick={() => setPay("promptpay")}
            badge="QR"
            title="QR พร้อมเพย์ (แนบสลิป)"
            note="สแกนจ่ายด้วยแอปธนาคาร แล้วแนบสลิป — ร้านจัดส่งทันทีที่ตรวจสลิปเสร็จ"
          />
        )}
      </Card>

      {/* สรุปการชำระเงิน */}
      <Card>
        <p className="border-b border-steel-700 px-3 py-2.5 text-[13px] font-semibold text-[#1a1a1a]">
          สรุปการชำระเงิน
        </p>
        <div className="space-y-1.5 px-3 py-2.5 text-[13px]">
          <Row label={`ค่าสินค้า (${items.reduce((s, i) => s + i.qty, 0)} ชิ้น)`} value={subtotal} />
          {discount > 0 && (
            <Row label={`ส่วนลดร้านค้า (${coupon?.code})`} value={`-฿${discount.toLocaleString("th-TH")}`} free />
          )}
          <Row label="ค่าจัดส่ง" value={shippingFee || "ฟรี"} free={!shippingFee} />
          {codFee > 0 && <Row label="ค่าบริการเก็บเงินปลายทาง" value={codFee} />}
          {pointDiscount > 0 && (
            <Row
              label={`ใช้แต้มสะสม (${pointsToUse.toLocaleString("th-TH")} แต้ม)`}
              value={`-฿${pointDiscount.toLocaleString("th-TH")}`}
              free
            />
          )}

          <div className="flex items-center justify-between border-t border-steel-700 pt-2">
            <span className="font-semibold text-[#1a1a1a]">ยอดรวมทั้งหมด</span>
            <Price value={total} className="font-heading text-[17px] font-bold text-safety" />
          </div>
        </div>
      </Card>

      {error && <p className="px-3 pb-2 text-center text-[13px] text-safety">{error}</p>}

      <BottomBar
        total={total}
        label={sending ? "กำลังส่ง…" : pay === "cod" ? "สั่งซื้อ" : "สั่งสินค้า"}
        disabled={sending}
        onClick={placeOrder}
      />
    </main>
  );
}

// ------------------------------------------------------------------ ชิ้นส่วน

const ok = (a: Address) =>
  !!a.name.trim() &&
  /^0\d{8,9}$/.test(a.phone.replace(/[^0-9]/g, "")) &&
  !!a.address.trim() &&
  !!a.province.trim() &&
  /^\d{5}$/.test(a.zip);

// การ์ดขาวขอบมนลอยบนพื้นเทา — ตามหน้าเช็คเอาต์ Shopee ที่เจ้าของร้านส่งมา
const Card = ({ children }: { children: React.ReactNode }) => (
  <section className="mx-2 mb-2 overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">{children}</section>
);

const Chevron = () => (
  <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 fill-none stroke-steel-600 stroke-2">
    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Head({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 border-b-[3px] border-safety bg-carbon px-3 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      {onBack && (
        <button onClick={onBack} aria-label="ย้อนกลับ" className="-ml-1 p-1">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-white stroke-2">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <h1 className="font-heading text-[15px] font-bold text-white">{title}</h1>
    </header>
  );
}

// ปุ่ม − จำนวน + แบบ Shopee (ปรับได้จากหน้าสั่งซื้อเลย ไม่ต้องย้อนกลับไปตะกร้า)
function Stepper({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  const btn = "flex h-7 w-7 items-center justify-center border border-steel-700 text-[15px] leading-none text-[#1a1a1a] disabled:text-steel-600";
  return (
    <span className="flex items-center">
      <button onClick={() => onChange(qty - 1)} disabled={qty <= 1} aria-label="ลดจำนวน" className={btn + " rounded-l-sm"}>−</button>
      <span className="flex h-7 min-w-9 items-center justify-center border-y border-steel-700 px-1 text-[13px]">{qty}</span>
      <button onClick={() => onChange(qty + 1)} aria-label="เพิ่มจำนวน" className={btn + " rounded-r-sm"}>+</button>
    </span>
  );
}

function RowLink({
  label, value, muted, onClick,
}: { label: string; value: string; muted?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 border-b border-steel-800 px-3 py-2.5 text-left last:border-0">
      <span className="shrink-0 text-[13px] text-[#1a1a1a]">{label}</span>
      <span className={"min-w-0 flex-1 truncate text-right text-[12px] " + (muted ? "text-steel-300" : "text-[#1a1a1a]")}>
        {value}
      </span>
      <Chevron />
    </button>
  );
}

// โค้ดส่วนลดร้านค้า
// ⚠️ ตรวจโค้ดที่ Netlify Function (/api/coupon) เท่านั้น — รายชื่อโค้ดอยู่ในตัวแปรลับ
//    ฝั่งนี้แค่ส่งโค้ดไปถามแล้วเอาผลมาโชว์ ลูกค้าเปิดซอร์สก็ไม่เห็นว่ามีโค้ดอะไรบ้าง
function CouponRow({
  subtotal, coupon, setCoupon,
}: { subtotal: number; coupon: Coupon | null; setCoupon: (c: Coupon | null) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // โค้ดที่ร้านเปิดให้เห็น + โค้ดที่ลูกค้าคนนี้เก็บไว้ (โค้ดที่ฉันเก็บไว้ขึ้นก่อน)
  const [offers, setOffers] = useState<{ code: string; title: string; label: string; min: number }[]>([]);
  const [mine, setMine] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!open) return;
    fetch("/api/coupon")
      .then((r) => r.json())
      .then((d) => { setOffers(d.coupons ?? []); setMine(d.mine ?? {}); })
      .catch(() => {});
  }, [open]);

  const use = useCallback(async (c: string) => {
    if (!c || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", code: c, subtotal }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.error || "ใช้โค้ดนี้ไม่ได้"); return; }
      setCoupon({ code: j.code, label: j.label, discount: j.discount, subtotal });
      setOpen(false);
      setCode("");
    } catch {
      setErr("ต่อกับร้านไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }, [busy, subtotal, setCoupon]);

  const apply = () => use(code.trim());

  if (!open) {
    return (
      <RowLink
        label="โค้ดส่วนลดร้านค้า"
        value={coupon ? `${coupon.code} · ${coupon.label}` : "กดใช้โค้ด"}
        muted={!coupon}
        onClick={() => setOpen(true)}
      />
    );
  }
  return (
    <div className="space-y-2 border-b border-steel-800 p-3">
      <p className="text-[13px] font-semibold text-[#1a1a1a]">โค้ดส่วนลดร้านค้า</p>
      <div className="flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="กรอกโค้ดส่วนลด"
          className="min-w-0 flex-1 rounded-sm border border-steel-700 px-2.5 py-2 text-[13px] uppercase outline-none focus:border-safety"
        />
        <button
          onClick={apply}
          disabled={!code.trim() || busy}
          className="shrink-0 rounded-sm bg-safety px-4 py-2 text-[13px] font-semibold text-white disabled:bg-steel-600"
        >
          {busy ? "..." : "ใช้โค้ด"}
        </button>
      </div>
      {err && <p className="text-[12px] text-safety">{err}</p>}

      {/* โค้ดที่กดเลือกได้เลย ไม่ต้องพิมพ์ — ของที่เก็บไว้แล้วขึ้นก่อน */}
      {offers.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {[...offers].sort((a, b) => Number(!!mine[b.code]) - Number(!!mine[a.code])).map((o) => {
            const ok = subtotal >= (o.min || 0);
            return (
              <button
                key={o.code}
                onClick={() => ok && use(o.code)}
                disabled={!ok || busy}
                className={`flex w-full items-center gap-2 rounded-sm border px-2.5 py-2 text-left ${
                  ok ? "border-safety/40 bg-safety-tint" : "border-steel-700 bg-white opacity-60"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-[#1a1a1a]">{o.title}</span>
                  <span className="block text-[11px] text-steel-300">
                    {o.code}
                    {o.min > 0 && ` · ซื้อครบ ฿${o.min.toLocaleString("th-TH")}`}
                    {!ok && " (ยอดยังไม่ถึง)"}
                  </span>
                </span>
                {mine[o.code] ? (
                  <span className="shrink-0 text-[11px] font-semibold text-safety">เก็บไว้แล้ว</span>
                ) : null}
                <span className={`shrink-0 text-[12px] font-bold ${ok ? "text-safety" : "text-steel-300"}`}>
                  {o.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        {coupon && (
          <button
            onClick={() => { setCoupon(null); setOpen(false); setErr(""); }}
            className="flex-1 rounded-sm border border-steel-700 py-2 text-[13px] text-steel-300"
          >
            เอาโค้ดออก
          </button>
        )}
        <button onClick={() => { setOpen(false); setErr(""); }} className="flex-1 rounded-sm border border-steel-700 py-2 text-[13px] text-steel-300">
          ปิด
        </button>
      </div>
    </div>
  );
}

// ใบกำกับภาษีแบบเต็มรูป — เก็บข้อมูลส่งไปกับออเดอร์ ร้านออกให้ทีหลัง
function TaxRow({ tax, setTax }: { tax: TaxInfo | null; setTax: (t: TaxInfo | null) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<TaxInfo>(tax ?? { name: "", taxId: "", address: "" });
  const valid = f.name.trim() && /^\d{13}$/.test(f.taxId.replace(/\D/g, "")) && f.address.trim();

  if (!open) {
    return (
      <RowLink
        label="ใบกำกับภาษีแบบเต็มรูป"
        value={tax ? tax.name : "ขอใบกำกับภาษี"}
        muted={!tax}
        onClick={() => setOpen(true)}
      />
    );
  }
  return (
    <div className="space-y-2 border-t border-steel-800 p-3">
      <p className="text-[13px] font-semibold text-[#1a1a1a]">ใบกำกับภาษีแบบเต็มรูป</p>
      <Field label="ชื่อบริษัท / ชื่อผู้เสียภาษี" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <Field label="เลขประจำตัวผู้เสียภาษี (13 หลัก)" value={f.taxId} inputMode="numeric" onChange={(v) => setF({ ...f, taxId: v })} />
      <Field label="ที่อยู่สำหรับออกใบกำกับภาษี" value={f.address} textarea onChange={(v) => setF({ ...f, address: v })} />
      <div className="flex gap-2">
        <button
          onClick={() => { setTax(null); setOpen(false); }}
          className="flex-1 rounded-sm border border-steel-700 py-2 text-[13px] text-steel-300"
        >
          ไม่ขอ
        </button>
        <button
          disabled={!valid}
          onClick={() => { setTax(f); setOpen(false); }}
          className="flex-1 rounded-sm bg-safety py-2 text-[13px] font-semibold text-white disabled:bg-steel-600"
        >
          บันทึก
        </button>
      </div>
    </div>
  );
}

// แถบเช็คเอาต์ติดล่างจอแบบ Shopee
// ยอดรวมชิดไปทางขวาติดกับปุ่ม (แบบเดียวกับ Shopee) ไม่ใช่แปะซ้ายสุดแล้วเว้นกลางโล่ง ๆ
// สายตาลูกค้าจะได้เห็น "ยอดที่ต้องจ่าย" กับ "ปุ่มกด" ในสายตาเดียว
function BottomBar({
  total, label, disabled, hint, onClick,
}: { total: number; label: string; disabled?: boolean; hint?: string; onClick: () => void }) {
  return (
    <div className={`fixed inset-x-0 bottom-0 z-[60] mx-auto ${SHELL_W} border-t border-steel-700 bg-white pb-[env(safe-area-inset-bottom)]`}>
      <div className="flex items-center justify-end gap-2.5 px-3 py-2">
        <div className="min-w-0 text-right">
          <p className="text-[11px] text-steel-300">{hint ?? "ยอดรวม"}</p>
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
  on, onClick, badge, title, note, disabled,
}: { on: boolean; onClick: () => void; badge: string; title: string; note: string; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={
        "flex w-full items-start gap-2.5 border-b border-steel-800 px-3 py-2.5 text-left last:border-0 " +
        (disabled ? "cursor-not-allowed opacity-45" : "")
      }
    >
      <span className={
        "mt-0.5 shrink-0 rounded-sm border px-1 py-px text-[9px] font-bold leading-tight " +
        (disabled ? "border-steel-500 text-steel-400" : "border-safety text-safety")
      }>
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className={"block text-[13px] " + (disabled ? "text-steel-400" : on ? "font-semibold text-[#1a1a1a]" : "text-[#1a1a1a]")}>{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-steel-300">{note}</span>
      </span>
      <span className={"mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full " + (on ? "bg-safety" : "border-2 border-steel-600")}>
        {on && (
          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-white stroke-[3.5]">
            <path d="M5 12.5l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
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
  const cls = "w-full rounded-sm border border-steel-700 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-safety";
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
