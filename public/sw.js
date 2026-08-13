// Service worker ของ GUCUT — ทำ 2 หน้าที่
//   1) แคชไฟล์ให้เปิดเว็บได้แม้เน็ตหลุด (ทำให้ติดตั้งเป็นแอปแล้วใช้ได้จริง)
//   2) รับแจ้งเตือนลูกค้าทักแชท แล้วเด้งขึ้นหน้าจอ (ใช้ที่หลังร้าน)
//
// กฎการแคช — สำคัญมาก อย่าแก้มั่ว
//   /api/*        ห้ามแคชเด็ดขาด (ล็อกอิน สต็อก ราคา ต้องสดเสมอ)
//   หน้าเว็บ      ขอเน็ตก่อน ถ้าไม่ได้ค่อยใช้ของเก่า → deploy ใหม่แล้วเห็นทันที
//   ไฟล์คงที่     ใช้ของเก่าก่อน (ชื่อไฟล์มี hash อยู่แล้ว เปลี่ยนเมื่อไหร่ชื่อเปลี่ยน)
const VERSION = "gucut-v1";
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;

// หน้าที่ต้องมีติดเครื่องไว้ เผื่อเปิดตอนไม่มีเน็ต
const PRECACHE = ["/offline/", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (p) =>
  p.startsWith("/_next/static/") || p.startsWith("/img/") || p.startsWith("/rv") || p.startsWith("/icon-");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;         // รูป/สคริปต์จากที่อื่น ปล่อยผ่าน
  if (url.pathname.startsWith("/api/")) return;            // ข้อมูลสด ห้ามแคช
  if (url.pathname.startsWith("/.netlify/")) return;       // Image CDN จัดการแคชเองแล้ว
  if (url.pathname.startsWith("/admin")) return;           // หลังร้าน เอาของสดเสมอ

  // ---------- ไฟล์คงที่: ใช้ของเก่าก่อน เร็วสุด ----------
  if (isStatic(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // ---------- หน้าเว็บ: ขอเน็ตก่อน ไม่ได้ค่อยใช้ของเก่า ----------
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/offline/"))),
    );
  }
});

/* ---------- แจ้งเตือนเข้าเครื่อง (ใช้ที่หลังร้าน) ---------- */

self.addEventListener("push", (event) => {
  let d = { title: "GUCUT", body: "มีข้อความใหม่", url: "/admin/chat/" };
  try { d = { ...d, ...event.data.json() }; } catch { /* ข้อความเปล่า ก็ใช้ค่าเริ่มต้น */ }
  event.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.tag || "gucut-chat",
      renotify: true,
      data: { url: d.url },
    })
  );
});

// แตะการแจ้งเตือน → เปิดหน้าที่เกี่ยวข้อง (ถ้าเปิดอยู่แล้วให้สลับไปแท็บนั้น)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/admin/chat/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url)) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
