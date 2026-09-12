// ให้ผู้รีวิวรันหลังนำ branch ไปใช้เท่านั้น — Codex ไม่ใช้คีย์หลังร้าน
// node scripts/check-ordercheck-shipping.mjs https://gucut.com z1 2026-09-01 2026-09-12
import { validateOrdercheckWindow } from '../netlify/lib/ordercheck-shipping.mjs';
const [origin, store, from, to] = process.argv.slice(2);
if (!origin || !['z1', 'z2'].includes(store) || !from || !to)
  throw new Error('ใช้: node scripts/check-ordercheck-shipping.mjs <origin> <z1|z2> <from> <to>');
const url = new URL('/api/core', origin);
if (url.protocol !== 'https:' || url.username || url.password)
  throw new Error('origin ต้องเป็น HTTPS ไม่มี user/password');
validateOrdercheckWindow(new URLSearchParams({ from, to }));
const key = process.env.CHAT_ADMIN_KEY;
if (!key) throw new Error('ให้ผู้รีวิวตั้ง CHAT_ADMIN_KEY ใน environment เอง');
url.search = new URLSearchParams({ ordercheck: '1', store, from, to }).toString();
const response = await fetch(url, { method: 'GET', redirect: 'error',
  headers: { 'x-admin-key': key }, signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`ordercheck HTTP ${response.status}`);
const body = await response.json();
if (!body.coverage || !body.counts?.shippingFields)
  throw new Error('ปลายทางยังไม่มีตัวเทียบสี่ฟิลด์ — ห้ามตีความว่าไม่มีความต่าง');
console.log(JSON.stringify({ receivedAt: new Date().toISOString(),
  coreBuild: response.headers.get('x-core-build'), store: body.store, window: body.window,
  ok: body.ok, partial: body.partial, truncated: body.truncated,
  coverage: body.coverage, counts: body.counts,
  sample: body.sample?.staleShipping?.map(({ number, fields }) => ({ number, fields })),
}, null, 2));
if (body.ok !== true || body.partial !== false) process.exitCode = 2;
