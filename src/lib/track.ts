"use client";

// ยิง event การตลาดไปทุกช่องทางที่ร้านเปิดไว้ — เรียกที่เดียว ไปครบทุกเจ้า
//
// รหัสพิกเซลไม่ได้ฝังตายตัวในโค้ด แต่ดึงจาก /api/marketing ตอนเปิดเว็บ
// เจ้าของร้านเปลี่ยนรหัสในหลังร้านได้เองโดยไม่ต้อง deploy ใหม่
//
// ⚠️ ถ้าร้านไม่ได้เปิดช่องทางไหนเลย จะ "ไม่โหลดสคริปต์อะไรทั้งสิ้น"
//    เว็บเบาเท่าเดิม ลูกค้าไม่โดนตามรอยโดยไม่จำเป็น
//
// เรื่อง event id: ทั้ง Meta และ TikTok ยิงสองทาง (จากเบราว์เซอร์ + จากเซิร์ฟเวอร์)
// ถ้าไม่ส่ง id เดียวกันไปทั้งสองทาง ยอดจะถูกนับซ้ำสองเท่า
// ตอนสั่งซื้อสำเร็จเราจึงใช้ "เลขออเดอร์" เป็น event id ทั้งสองฝั่ง

export interface PixelConfig {
  meta: { on: boolean; pixelId: string };
  tiktok: { on: boolean; pixelId: string };
  ga4: { on: boolean; id: string };
  ads: { on: boolean; id: string; label: string };
  line: { on: boolean; tagId: string };
  cf: { on: boolean; token: string };
}

export interface TrackItem {
  id: string;
  title?: string;
  price?: number;
  qty?: number;
}

export interface TrackData {
  items?: TrackItem[];
  value?: number;
  eventId?: string;   // ใช้กันนับซ้ำกับฝั่งเซิร์ฟเวอร์
}

type W = Window & {
  fbq?: ((...a: unknown[]) => void) & { queue?: unknown[]; callMethod?: (...a: unknown[]) => void; loaded?: boolean; version?: string; push?: unknown };
  ttq?: Record<string, unknown> & { track?: (...a: unknown[]) => void; page?: () => void; load?: (id: string) => void };
  gtag?: (...a: unknown[]) => void;
  dataLayer?: unknown[];
  _lt?: (...a: unknown[]) => void;
};

let cfg: PixelConfig | null = null;
let started = false;

const w = () => window as unknown as W;
const el = (src: string, extra?: (s: HTMLScriptElement) => void) => {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  extra?.(s);
  document.head.appendChild(s);
};

/** โหลดค่าจากหลังร้านแล้วติดตั้งสคริปต์ของช่องทางที่เปิดไว้ — เรียกครั้งเดียวพอ */
export async function initPixels() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const r = await fetch("/api/marketing", { credentials: "omit" });
    if (!r.ok) return;
    cfg = (await r.json()) as PixelConfig;
  } catch {
    return;   // ดึงค่าไม่ได้ = ไม่ติดตั้งอะไร ดีกว่าเว็บพัง
  }
  if (!cfg) return;

  if (cfg.meta.on) {
    const win = w();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const f: any = function (...args: unknown[]) {
      f.callMethod ? f.callMethod.apply(f, args) : f.queue!.push(args);
    };
    f.queue = []; f.loaded = true; f.version = "2.0"; f.push = f;
    win.fbq = f;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    el("https://connect.facebook.net/en_US/fbevents.js");
    f("init", cfg.meta.pixelId);
    f("track", "PageView");
  }

  if (cfg.tiktok.on) {
    const win = w();
    const q: unknown[] = [];
    const methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const t: any = { _i: {}, _t: {}, _o: {}, _partner: "", methods, queue: q };
    for (const m of methods) t[m] = (...a: unknown[]) => { q.push([m, ...a]); };
    t.load = (id: string) => { t._i[id] = []; el(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${id}&lib=ttq`); };
    win.ttq = t;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    t.load(cfg.tiktok.pixelId);
    t.page();
  }

  if (cfg.ga4.on || cfg.ads.on) {
    const win = w();
    win.dataLayer = win.dataLayer || [];
    // ต้องใช้ arguments จริง ๆ gtag ถึงทำงานถูก — spread แล้วค่าเพี้ยน
    // eslint-disable-next-line prefer-rest-params
    win.gtag = function () { win.dataLayer!.push(arguments); } as unknown as W["gtag"];
    const first = cfg.ga4.on ? cfg.ga4.id : cfg.ads.id;
    el(`https://www.googletagmanager.com/gtag/js?id=${first}`);
    win.gtag!("js", new Date());
    if (cfg.ga4.on) win.gtag!("config", cfg.ga4.id);
    if (cfg.ads.on) win.gtag!("config", cfg.ads.id);
  }

  if (cfg.cf?.on) {
    // Cloudflare Web Analytics — 11 KB ไม่ใช้คุกกี้ ไม่ต้องยิง event เอง
    // มันนับ pageview ให้เองรวมถึงตอนเปลี่ยนหน้าแบบ SPA
    el("https://static.cloudflareinsights.com/beacon.min.js", (t) => {
      t.defer = true;
      t.setAttribute("data-cf-beacon", JSON.stringify({ token: cfg!.cf.token }));
    });
  }

  if (cfg.line.on) {
    const win = w();
    const q: unknown[] = [];
    win._lt = ((...a: unknown[]) => { q.push(a); }) as W["_lt"];
    (win as unknown as { _lt_q?: unknown[] })._lt_q = q;
    el("https://tr.line.me/tag.js", (s) => s.setAttribute("data-tagid", cfg!.line.tagId));
    win._lt!("init", { customerType: "lap", tagId: cfg.line.tagId });
    win._lt!("send", "pv", [cfg.line.tagId]);
  }

  // ปล่อยเหตุการณ์ที่ค้างไว้ตอนพิกเซลยังไม่พร้อม
  const q = pending.splice(0);
  for (const [ev, d] of q) send(ev, d);
}

type Ev = "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase";

// ⚠️ เหตุการณ์ที่ยิงก่อนพิกเซลโหลดเสร็จ ต้องเก็บไว้ยิงทีหลัง ห้ามทิ้ง
//    ตั้งแต่ 18 ส.ค. 2569 พิกเซลไม่โหลดจนกว่าลูกค้าจะขยับตัวครั้งแรก (ดู PixelSetup)
//    ถ้าลูกค้ากด "หยิบใส่ตะกร้า" เป็นการขยับครั้งแรกพอดี พิกเซลจะยังโหลดไม่เสร็จ
//    ของเดิม track() จะ return ทิ้งเงียบ ๆ = ยอดขายหายจากระบบโฆษณา
const pending: [Ev, TrackData][] = [];

/** ยิง event เดียวไปทุกช่องทางที่เปิดอยู่ */
export function track(ev: Ev, d: TrackData = {}) {
  if (typeof window === "undefined") return;
  if (!cfg) {
    // ยังไม่พร้อม — เก็บไว้ก่อน แล้วสั่งโหลดพิกเซลทันที (ถ้ายังไม่ได้โหลด)
    pending.push([ev, d]);
    void initPixels();
    return;
  }
  send(ev, d);
}

/** ยิงจริง — เรียกได้เมื่อ cfg พร้อมแล้วเท่านั้น */
function send(ev: Ev, d: TrackData) {
  if (!cfg) return;
  const win = w();
  const ids = (d.items || []).map((i) => i.id).filter(Boolean);
  const value = d.value ?? 0;
  const opts = d.eventId ? { eventID: d.eventId } : undefined;

  try {
    if (cfg.meta.on && win.fbq) {
      win.fbq("track", ev, {
        content_ids: ids,
        content_type: "product",
        value,
        currency: "THB",
        num_items: (d.items || []).reduce((s, i) => s + (i.qty || 1), 0),
      }, opts);
    }

    if (cfg.tiktok.on && win.ttq?.track) {
      // ชื่อ event ของ TikTok ไม่เหมือน Meta ต้องแปลงชื่อ
      const name = ev === "ViewContent" ? "ViewContent"
        : ev === "AddToCart" ? "AddToCart"
        : ev === "InitiateCheckout" ? "InitiateCheckout"
        : "CompletePayment";
      win.ttq.track(name, {
        contents: (d.items || []).map((i) => ({
          content_id: i.id, content_name: i.title, price: i.price, quantity: i.qty || 1,
        })),
        content_type: "product",
        value,
        currency: "THB",
      }, d.eventId ? { event_id: d.eventId } : undefined);
    }

    if (win.gtag) {
      // GA4 ใช้ชื่อ event มาตรฐานของตัวเอง
      const g = ev === "ViewContent" ? "view_item"
        : ev === "AddToCart" ? "add_to_cart"
        : ev === "InitiateCheckout" ? "begin_checkout"
        : "purchase";
      if (cfg.ga4.on) {
        win.gtag("event", g, {
          currency: "THB",
          value,
          transaction_id: ev === "Purchase" ? d.eventId : undefined,
          items: (d.items || []).map((i) => ({
            item_id: i.id, item_name: i.title, price: i.price, quantity: i.qty || 1,
          })),
        });
      }
      // Google Ads นับ conversion เฉพาะตอนซื้อสำเร็จ
      if (cfg.ads.on && ev === "Purchase" && cfg.ads.label) {
        win.gtag("event", "conversion", {
          send_to: `${cfg.ads.id}/${cfg.ads.label}`,
          value,
          currency: "THB",
          transaction_id: d.eventId,
        });
      }
    }

    if (cfg.line.on && win._lt) {
      const l = ev === "Purchase" ? "cv" : "pv";
      win._lt("send", l, [cfg.line.tagId], { value, currency: "THB" });
    }
  } catch {
    // พิกเซลพังห้ามทำให้เว็บพัง — เงียบไว้
  }
}
