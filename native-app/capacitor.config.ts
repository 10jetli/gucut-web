import type { CapacitorConfig } from '@capacitor/cli';

// GUCUT app — ห่อเว็บ gucut.com (โหลดสดจากเว็บ ไม่ฝังไฟล์)
// ข้อดี: deploy เว็บ = แอปได้ของใหม่ทันที ไม่ต้องส่ง App Store/Play Store ใหม่
// ⚠️ Capacitor ตั้ง WebView ให้เล่นวิดีโอ+เสียงอัตโนมัติได้โดยไม่ต้องแตะจอ
//    (mediaTypesRequiringUserActionForPlayback ว่าง) — ฟีดคลิปจึงมีเสียงทันทีแบบแอป TikTok
//    ซึ่งเป็นสิ่งที่ Safari ห้ามแต่แอปทำได้
const config: CapacitorConfig = {
  appId: 'com.gucut.app',
  appName: 'GUCUT',
  webDir: 'www',
  server: {
    url: 'https://gucut.com',
    // ลิงก์ในโดเมนเราเปิดในแอป · ลิงก์ออกนอก (LINE/แผนที่) เด้งไปแอปจริง
    allowNavigation: ['gucut.com', 'www.gucut.com', 'video.gucut.com'],
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#333333',
  },
  android: {
    backgroundColor: '#333333',
    allowMixedContent: false,
  },
};

export default config;
