"use client";

// ปุ่ม "รับแจ้งเตือนสถานะออเดอร์" — Web Push ฝั่งลูกค้า (27 ส.ค. 2569)
//
// มีไว้เพื่อลูกค้าที่ไม่ได้ล็อกอินด้วย LINE — จ่ายเงินสำเร็จ/ร้านส่งของ
// จะเด้งเข้าเครื่องเหมือนแอปทั่วไป ฟรี ไม่มีค่าใช้จ่ายต่อข้อความ
//
// พิสูจน์ว่าเป็นเจ้าของเบอร์ผ่าน orderId (หน้าสั่งซื้อสำเร็จ) หรือ cookie ล็อกอิน
// (หน้าการซื้อของฉัน) — ฝั่งเซิร์ฟเวอร์เป็นคนหาเบอร์เอง ห้ามส่งเบอร์จากเบราว์เซอร์
//
// ⚠️ iPhone เด้งได้เฉพาะตอน "เพิ่มลงหน้าจอโฮม" แล้วเท่านั้น (ข้อจำกัดของ iOS เอง)
//    ยังไม่เพิ่ม = โชว์คำแนะนำแทนปุ่ม อย่าซ่อนเงียบ ๆ เดี๋ยวลูกค้าคิดว่าเว็บพัง

import { useEffect, useState } from "react";

function b64ToU8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "hidden" | "idle" | "busy" | "on" | "ios" | "fail";

export default function NotifyBell({ orderId }: { orderId?: string }) {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    try {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone ที่ยังไม่เพิ่มลงหน้าจอโฮม ไม่มี PushManager — บอกวิธีแทนการเงียบ
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        setState(ios && !standalone ? "ios" : "hidden");
        return;
      }
      if (Notification.permission === "denied") { setState("hidden"); return; }
      navigator.serviceWorker
        .getRegistration()
        .then(async (r) => {
          const sub = await r?.pushManager.getSubscription();
          setState(sub && localStorage.getItem("gu-notify") === "1" ? "on" : "idle");
        })
        .catch(() => setState("idle"));
    } catch {
      setState("hidden");
    }
  }, []);

  async function enable() {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState("hidden"); return; }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const { key } = await fetch("/api/push").then((r) => r.json());
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToU8(key),
        }));
      const r = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer: 1, orderId: orderId || undefined, subscription: sub.toJSON() }),
      });
      if (!r.ok) { setState("fail"); return; }
      localStorage.setItem("gu-notify", "1");
      setState("on");
    } catch {
      setState("fail");
    }
  }

  if (state === "hidden") return null;

  if (state === "ios") {
    return (
      <div className="w-full max-w-sm rounded-lg border border-steel-700 bg-steel-800 p-3 text-left text-[13px] leading-relaxed text-steel-300">
        🔔 อยากให้เด้งเตือนตอนร้านส่งของ? กดปุ่มแชร์ของเบราว์เซอร์ แล้วเลือก
        <span className="font-semibold"> “เพิ่มลงหน้าจอโฮม”</span> จากนั้นเปิดจากไอคอนนั้นแล้วกดรับแจ้งเตือนได้เลย
      </div>
    );
  }

  if (state === "on") {
    return (
      <p className="text-[13px] font-semibold text-green-600">
        🔔 เปิดแจ้งเตือนแล้ว — จ่ายเงิน/จัดส่งเมื่อไหร่จะเด้งบอกทันที
      </p>
    );
  }

  if (state === "fail") {
    return (
      <p className="text-[13px] text-steel-300">
        เปิดแจ้งเตือนไม่สำเร็จ — ลองใหม่อีกครั้ง หรือดูสถานะได้ที่ “การซื้อของฉัน”
      </p>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={state === "busy"}
      className="rounded-lg border border-safety px-5 py-2.5 font-heading text-sm font-bold text-safety disabled:opacity-50"
    >
      {state === "busy" ? "กำลังเปิด…" : "🔔 รับแจ้งเตือนสถานะออเดอร์"}
    </button>
  );
}
