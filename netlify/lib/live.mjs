// นับคนเข้าเว็บ — เก็บเอง ไม่พึ่งบริการใคร ไม่ใช้คุกกี้
//
// ทำไมไม่ใช้ GA4 อย่างเดียว: GA4 นับไม่ครบ คนใช้ตัวบล็อกโฆษณาหรือ Safari/iOS
// ที่ตัดคุกกี้จะหายไปจากตัวเลข — ลูกค้าร้านนี้ส่วนใหญ่ใช้ iPhone ตัวเลขจึงต่ำกว่าจริง
// ตัวนี้นับที่เซิร์ฟเวอร์ บล็อกไม่ได้ ใช้ดูของจริงคู่กับ GA4
//
// ⚠️ วิธีเก็บสำคัญมาก — "ห้ามอ่านมาแก้แล้วเขียนกลับ" (read-modify-write)
//    คนเข้าพร้อมกันหลายคนจะเขียนทับกันจนนับหาย
//    จึงใช้วิธี "หนึ่งคน = หนึ่งคีย์" แล้วนับจำนวนคีย์เอา ไม่ต้องอ่านเนื้อในเลย
//      l/<นาที>/<รหัสผู้ชม>          → ใครออนไลน์อยู่ (เก็บหน้าที่ดูไว้ในเนื้อ)
//      v/<วันที่>/<รหัสผู้ชม>         → ใครเข้าเว็บวันไหน
//      c/<วันที่>/<ประเทศ>/<รหัสผู้ชม> → ใครมาจากประเทศไหน (นับคีย์ต่อประเทศ ไม่ต้องอ่านเนื้อ)
//      s/<วันที่>/<ช่องทาง>/<รหัสผู้ชม> → มาจากช่องทางไหน (Google · Facebook · LINE · ChatGPT ฯลฯ)
//    เขียนทับคีย์เดิมได้ไม่เป็นไร เพราะเราสนแค่ "มีคีย์นี้ไหม" ไม่ใช่ค่าในนั้น
import { getStore } from "@netlify/blobs";
import { channelKind, channelLabel, classify } from "./channels.mjs";

const store = () => getStore({ name: "gucut-live", consistency: "eventual" });

const ONLINE_MIN = 5;          // ไม่มีความเคลื่อนไหวเกินกี่นาที = ถือว่าออกไปแล้ว
const KEEP_DAYS = 30;          // เก็บสถิติรายวันย้อนหลังกี่วัน

const minuteOf = (t = Date.now()) => Math.floor(t / 60000);
export const dayOf = (t = Date.now()) =>
  new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10);   // เวลาไทย

const safe = (v, max = 80) => String(v ?? "").replace(/[^\w\-./]/g, "").slice(0, max);

/**
 * บันทึกว่ามีคนเปิดหน้านี้ — เรียกจากหน้าเว็บทุกครั้งที่เปลี่ยนหน้า
 * @param cc รหัสประเทศ 2 ตัว จาก Netlify (context.geo) — ไม่ต้องพึ่งบริการภายนอก
 */
export async function ping(vid, path, cc, src, selfHost, pwa, install) {
  const s = store();
  const id = safe(vid, 40);
  if (!id) return;
  // รหัสที่ขึ้นต้นด้วย test- คือของที่ยิงทดสอบตอนพัฒนา ไม่ใช่ลูกค้าจริง — ไม่นับ
  // (หน้าเว็บจริงสร้างรหัสเป็นตัวอักษรสุ่ม ไม่มีทางขึ้นต้นแบบนี้)
  if (id.startsWith("test-")) return;
  const p = String(path || "/").slice(0, 120);
  const day = dayOf();
  const country = /^[A-Za-z]{2}$/.test(cc || "") ? cc.toUpperCase() : "ZZ";   // ZZ = ไม่รู้
  const jobs = [
    s.setJSON(`l/${minuteOf()}/${id}`, { p }),
    s.setJSON(`v/${day}/${id}`, { p }),
    s.setJSON(`c/${day}/${country}/${id}`, { p }),
  ];
  // PWA — เจ้าของร้านอยากรู้ว่ามีคนโหลดแอปกี่คน (27 ส.ค. 2569)
  // "เปิดจากแอปที่ติดตั้ง" นับหนึ่งคนหนึ่งคีย์ต่อวัน (กติกาเดียวกับ v/)
  // "กดติดตั้งใหม่" (pwi/) มาจาก event appinstalled — Android เท่านั้น iPhone ไม่มี event นี้
  if (pwa) jobs.push(s.setJSON(`pw/${day}/${id}`, { p }));
  if (install) jobs.push(s.setJSON(`pwi/${day}/${id}`, { p }));

  // ⚠️ ช่องทางถูกส่งมาแค่ "ครั้งแรกของการเข้าเว็บรอบนั้น" เท่านั้น
  //    หน้าถัด ๆ ไปเป็นการเดินภายในเว็บเราเอง ต้นทางจะกลายเป็น gucut.com ซึ่งไม่มีความหมาย
  //    และการเขียนทุกหน้าจะเพิ่มภาระเป็น 4 ครั้งต่อการเปิดหนึ่งหน้าโดยไม่ได้อะไรเพิ่ม
  if (src) {
    // ⚠️ ห้ามใช้ safe() ตัวเดียวกับรหัสผู้ชม — มันอนุญาต "/" ซึ่งจะทำให้คีย์แตกเป็นชั้นเกิน
    //    และมันตัด "~" ทิ้ง ซึ่งเราใช้แทนจุดในชื่อเว็บอื่น (web~pantip~com)
    const ch = String(classify(src, selfHost)).replace(/[^\w.~-]/g, "").slice(0, 40);
    if (ch) jobs.push(s.setJSON(`s/${day}/${ch}/${id}`, 1));
  }

  await Promise.allSettled(jobs);
}

async function keysWithPrefix(s, prefix) {
  const out = [];
  const { blobs } = await s.list({ prefix });
  for (const b of blobs) out.push(b.key);
  return out;
}

/** สมาชิก — แยกออกมาเป็นฟังก์ชันของตัวเองเพื่อให้ยิงพร้อมส่วนอื่นได้ */
async function memberStats(now) {
  const us = getStore({ name: "gucut-users", consistency: "strong" });
  const { blobs } = await us.list({ prefix: "u/" });
  const week = now - 7 * 24 * 3600 * 1000;
  let new7 = 0;
  const via = { line: 0, facebook: 0, google: 0, password: 0 };
  const recent = [];
  // ⚠️ อ่านมากสุด 400 บัญชี — จำนวนรวมยังถูกเสมอเพราะนับจากรายชื่อคีย์ ไม่ใช่จากที่อ่านได้
  await Promise.all(
    blobs.slice(0, 400).map(async (b) => {
      const u = await us.get(b.key, { type: "json" }).catch(() => null);
      if (!u) return;
      if ((u.created || 0) >= week) new7++;
      const social = Object.keys(u.social || {});
      if (social.length === 0) via.password++;
      for (const k of social) if (via[k] !== undefined) via[k]++;
      recent.push({ created: u.created || 0, name: String(u.name || "").slice(0, 30) });
    }),
  );
  recent.sort((a, b) => b.created - a.created);
  return { total: blobs.length, new7, via, recent: recent.slice(0, 5) };
}

/** PWA — เปิดจากแอปวันนี้/7 วัน + ยอดกดติดตั้ง */
async function pwaStats(s, weekDays) {
  const [pw, pwi] = await Promise.all([s.list({ prefix: "pw/" }), s.list({ prefix: "pwi/" })]);
  const uniqToday = new Set();
  const uniqWeek = new Set();
  for (const b of pw.blobs) {
    const [, d, id] = b.key.split("/");
    if (!d || !id) continue;
    if (d === weekDays[0]) uniqToday.add(id);
    if (weekDays.includes(d)) uniqWeek.add(id);
  }
  let installs7 = 0;
  for (const b of pwi.blobs) {
    const d = b.key.split("/")[1];
    if (weekDays.includes(d)) installs7++;
  }
  return { today: uniqToday.size, week: uniqWeek.size, installs7 };
}

/** สรุปให้หน้าหลังร้าน — ใช้แต่การ "นับคีย์" ไม่อ่านเนื้อ ยกเว้นคนที่ออนไลน์อยู่
 *
 *  ⚠️ **เคยช้า 25 วินาที** (เจ้าของร้านทักมา 5 ก.ย. 2569 ว่าหน้าหลังร้านดึงข้อมูลช้ามาก)
 *     วัดแล้วพบว่า `/api/live?admin=1` ใช้ 24.9 วิ ขณะที่ทุก endpoint อื่น 1–4 วิ
 *     สาเหตุมี 2 อย่าง **ทั้งคู่เป็นเรื่องจำนวนรอบไป-กลับ ไม่ใช่เรื่องคิดเลขหนัก**
 *     ① ทุกส่วนทำงาน "ต่อกันเป็นทอด" ทั้งที่ไม่ต้องรอกัน — และผู้เข้าชม 7 วัน
 *        มี `await` อยู่ในลูป ⇒ ยิง 7 รอบเรียงกัน
 *     ② ช่องทางที่มาลิสต์ `s/` **ทั้งหมดตั้งแต่เปิดร้าน** ไม่จำกัดวัน ⇒ โตขึ้นทุกวัน
 *        (เก็บ 30 วัน × คนเข้าราว 170/วัน ⇒ หลายพันคีย์ ทั้งที่ใช้แค่ 7 วัน)
 *
 *  ⚠️ Netlify Blobs อยู่ us-east-1 ⇒ **หนึ่งรอบไป-กลับราว 0.3–0.5 วิ**
 *     งานแบบนี้จึงชนะด้วย "ลดจำนวนรอบ + ยิงพร้อมกัน" ไม่ใช่ด้วยการเขียนโค้ดให้เร็วขึ้น
 *  ⚠️ **ห้ามเอา await กลับเข้าไปในลูปอีก** ต่อให้ดูอ่านง่ายกว่า
 */
export async function stats() {
  const s = store();
  const now = Date.now();
  const today = dayOf(now);
  const weekDays = [];
  for (let i = 0; i < 7; i++) weekDays.push(dayOf(now - i * 86400000));
  const buckets = [];
  for (let i = 0; i < ONLINE_MIN; i++) buckets.push(minuteOf(now - i * 60000));

  // ── ยิงทุกส่วนพร้อมกัน — ไม่มีส่วนไหนต้องรอผลของอีกส่วน ──
  const [perBucket, dayKeys, ckeys, srcPerDay, members, pwa] = await Promise.all([
    Promise.all(buckets.map((b) => keysWithPrefix(s, `l/${b}/`))),
    Promise.all(weekDays.map((d) => keysWithPrefix(s, `v/${d}/`))),
    keysWithPrefix(s, `c/${today}/`),
    // ⚠️ ลิสต์ทีละวัน (7 ครั้งพร้อมกัน) แทนการลิสต์ `s/` ทั้งหมด — จำนวนคีย์คงที่ ไม่โตตามอายุร้าน
    Promise.all(weekDays.map((d) => keysWithPrefix(s, `s/${d}/`))),
    memberStats(now).catch(() => null), // นับสมาชิกพลาดต้องไม่ล้มสถิติที่เหลือ
    pwaStats(s, weekDays).catch(() => null),
  ]);

  // ออนไลน์ตอนนี้ = รวมคีย์ของ ONLINE_MIN นาทีล่าสุด แล้วตัดคนซ้ำ
  const seen = new Map(); // รหัสผู้ชม → คีย์ล่าสุดของคนนั้น
  for (const keys of perBucket) {
    for (const k of keys) {
      const id = k.split("/")[2];
      if (!seen.has(id)) seen.set(id, k); // วนจากนาทีล่าสุดก่อน จึงได้อันใหม่สุด
    }
  }

  // อ่านเฉพาะคนที่ออนไลน์อยู่ เพื่อรู้ว่ากำลังดูหน้าไหน (จำนวนน้อย ไม่หนัก)
  // ⚠️ ส่วนนี้ต้องรอ perBucket จริง ๆ จึงแยกออกมาอีกรอบ — เลี่ยงไม่ได้
  const pages = new Map();
  await Promise.all(
    [...seen.values()].slice(0, 200).map(async (k) => {
      try {
        const v = await s.get(k, { type: "json" });
        const p = v?.p || "/";
        pages.set(p, (pages.get(p) || 0) + 1);
      } catch { /* คีย์หายไประหว่างทาง ไม่เป็นไร */ }
    }),
  );

  const days = weekDays.map((d, i) => ({ d, n: dayKeys[i].length }));

  // มาจากประเทศไหนบ้าง (วันนี้) — นับคีย์ต่อประเทศ ไม่ต้องอ่านเนื้อ
  const byCountry = new Map();
  for (const k of ckeys) {
    const cc = k.split("/")[2] || "ZZ";
    byCountry.set(cc, (byCountry.get(cc) || 0) + 1);
  }

  // มาจากช่องทางไหนบ้าง — แยก "วันนี้" กับ "7 วัน" (นับคีย์อย่างเดียว)
  const chToday = new Map();
  const chWeek = new Map();
  srcPerDay.forEach((keys, i) => {
    const d = weekDays[i];
    for (const k of keys) {
      const ch = k.split("/")[2];
      if (!ch) continue;
      chWeek.set(ch, (chWeek.get(ch) || 0) + 1);
      if (d === today) chToday.set(ch, (chToday.get(ch) || 0) + 1);
    }
  });
  // ส่งป้ายชื่อไปกับข้อมูลเลย หน้าเว็บจะได้ไม่ต้องมีตารางชื่อช่องทางของตัวเองอีกชุด
  const rows = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([ch, n]) => ({ ch, n, label: channelLabel(ch), kind: channelKind(ch) }));

  return {
    members,
    pwa,
    channelsToday: rows(chToday),
    channelsWeek: rows(chWeek),
    countries: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).map(([cc, n]) => ({ cc, n })),
    online: seen.size,
    onlineWindowMin: ONLINE_MIN,
    pages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([p, n]) => ({ p, n })),
    today: days[0]?.n ?? 0,
    days: days.reverse(),
    at: now,
  };
}

/** เก็บกวาดของเก่า — เรียกตอนหลังร้านเปิดดู ไม่ต้องตั้ง cron ให้เปลืองอีกตัว */
export async function sweep(o = {}) {
  /* ⚠️ **ห้ามเรียกตัวนี้ตอนเปิดหน้าหลังร้านอีก** (แก้ 5 ก.ย. 2569)
      ของเดิมเรียกตอนเปิดหน้า พร้อมคอมเมนต์ว่า "ไม่ต้องตั้งงานตามเวลาให้เปลืองอีกตัว"
      ผลคือ **คนเปิดหน้าคนแรกของวันต้องนั่งรอแทนเครื่อง**
      วัดจริง: เปิดครั้งแรก 25 วินาที · ครั้งถัดไป 3 วินาที (เพราะครั้งแรกกวาดไปหมดแล้ว)
      เจ้าของร้านบอกเองว่า "เสียอารมณ์เวลาเข้า"
      ⇒ ย้ายไปเป็นงานตามเวลาตอนตี 2 แทน · หน้าหลังร้านไม่ต้องรออะไรอีก
      ⇒ บทเรียน: **งานบ้านห้ามไปเกาะอยู่กับการกดของคน** ต่อให้ประหยัดกว่าในกระดาษ
         คนกดเป็นคนจ่ายเวลาให้เสมอ และจ่ายไม่เท่ากันด้วย (คนแรกของวันจ่ายทั้งหมด)

      ⚠️ **มีเพดานจำนวนที่ลบต่อรอบ** — `l/` โตนาทีละคีย์ต่อคนที่ออนไลน์
         วันที่คนเข้าเยอะ ๆ อาจมีหลายหมื่นคีย์ ⇒ ไม่มีเพดาน = ฟังก์ชันหมดเวลาแล้วไม่ได้ลบอะไรเลย
         ⇒ ลบเท่าที่ทำได้ แล้ว **บอกออกไปว่าเหลือค้างอีกกี่รายการ** ห้ามเงียบ
            (เหลือค้าง = รอบหน้ามาลบต่อ · ถ้าเหลือทุกวันแปลว่าเพดานต่ำไป ต้องมีคนเห็น) */
  const s = store();
  const cap = Math.max(200, Math.min(20000, Number(o.max) || 8000));
  let gone = 0;
  let left = 0;
  const del = async (keys) => {
    const take = keys.slice(0, Math.max(0, cap - gone));
    left += keys.length - take.length;
    gone += take.length;
    await Promise.allSettled(take.map((k) => s.delete(k)));
  };

  // คีย์ออนไลน์: เก็บแค่ช่วงที่ยังนับอยู่ ที่เหลือทิ้ง
  const keep = new Set();
  for (let i = 0; i < ONLINE_MIN + 2; i++) keep.add(String(minuteOf(Date.now() - i * 60000)));
  const { blobs } = await s.list({ prefix: "l/" });
  await del(blobs.filter((b) => !keep.has(b.key.split("/")[1])).map((b) => b.key));

  // สถิติรายวันเก่ากว่า KEEP_DAYS (ทั้งรายคนและรายประเทศ)
  const oldest = dayOf(Date.now() - KEEP_DAYS * 86400000);
  // p/ = บันทึกบอต AI รายหน้า — โตไม่หยุด (เคยสะสม 21,751 คีย์จนหน้าสถานะช้า 3 วิ)
  for (const prefix of ["v/", "c/", "s/", "pw/", "pwi/", "p/"]) {
    const { blobs } = await s.list({ prefix });
    await del(
      blobs
        .filter((b) => {
          const parts = b.key.split("/");
          // เก่าเกินกำหนด หรือเป็นข้อมูลทดสอบที่หลงเหลือจากตอนพัฒนา
          return (parts[1] || "") < oldest || (parts[parts.length - 1] || "").startsWith("test-");
        })
        .map((b) => b.key),
    );
  }
  return { gone, left, cap };
}
