// Service worker — รับแจ้งเตือนลูกค้าทักแชท แล้วเด้งขึ้นหน้าจอ
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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

// แตะการแจ้งเตือน → เปิดหน้าแชท (ถ้าเปิดอยู่แล้วให้สลับไปแท็บนั้น)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/admin/chat/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes("/admin/chat")) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
