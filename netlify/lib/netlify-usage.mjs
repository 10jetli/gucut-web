// วัดว่า "อะไรกินเครดิต Netlify" — สำหรับแดชบอร์ดในหลังร้าน
//
// ⚠️ **Netlify ไม่เปิด API ให้ดูเครดิตแยกส่วน** (ตรวจแล้ว 3 ก.ย. 2569)
//    /accounts/{id}/usage · /billing · /credits ตอบ 404 ทั้งหมด
//    ที่เปิดจริงมีสองอย่าง: รายการ deploy (มีเวลา build ต่อครั้ง) กับ bandwidth
//    ⇒ ตัวเลขในจอนี้คือ **ตัวขับเคลื่อนเครดิต ไม่ใช่ยอดเครดิตจริง**
//       ห้ามเขียนบนจอว่า "ใช้ไปกี่เครดิต" — เขียนว่า "นาที build" กับ "แบนด์วิดท์"
//       เดาอัตราแปลงเอง = ตัวเลขที่ดูแม่นยำแต่ไม่มีใครตรวจได้ว่าจริงไหม
//
// ⚠️ จำนวนครั้งที่ฟังก์ชันถูกเรียก **ไม่มีทางรู้ย้อนหลัง** — Netlify ไม่เปิดให้
//    ถ้าอยากรู้ต้องนับเองตั้งแต่วันนี้เป็นต้นไป (ยังไม่ได้ทำ)
const API = "https://api.netlify.com/api/v1";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function token() {
  return process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || "";
}

async function call(path, t) {
  const r = await fetch(API + path, {
    headers: { authorization: `Bearer ${t}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`netlify ${r.status}`);
  return r.json();
}

/** ช่วงเวลาที่จอโชว์เป็นแท่ง — ตามที่เจ้าของร้านสั่ง */
export const WINDOWS = [1, 3, 7, 15, 30, 90, 365];

/** สรุปตัวขับเคลื่อนเครดิตแยกตามไซต์และช่วงเวลา
 *  ⚠️ ดึงหนักพอควร (ไล่ deploy ทีละหน้า) ⇒ **แคชไว้ 1 ชั่วโมง**
 *     จอนี้มีไว้ดูแนวโน้ม ไม่ใช่ของที่ต้องสด และตัวมันเองต้องไม่กลายเป็นตัวกินเครดิตเสียเอง */
export async function netlifyUsage() {
  const t = token();
  if (!t) {
    return {
      skip:
        "ยังไม่ได้ตั้ง NETLIFY_API_TOKEN ที่ Netlify — ต้องให้เจ้าของร้านใส่เอง " +
        "(สร้างที่ User settings → Applications → Personal access tokens)",
    };
  }
  const { getStore } = await import("@netlify/blobs");
  const store = getStore("gucut-coupon");
  const cached = await store.get("netlify-usage", { type: "json" }).catch(() => null);
  if (cached?.at && Date.now() - cached.at < 3600e3) return { ...cached, cached: true };

  const sites = await call("/sites?per_page=100", t);
  const today = new Date();
  const dayKey = (d) => d.toISOString().slice(0, 10);
  const oldest = dayKey(new Date(today.getTime() - 365 * 864e5));

  const perDay = {}; // { 'YYYY-MM-DD': { site: {builds, minutes} } }
  const bySite = {};
  for (const s of sites) {
    const name = s.name;
    bySite[name] = { builds: 0, minutes: 0, url: s.ssl_url || s.url };
    for (let page = 1; page <= 10; page++) {
      const list = await call(`/sites/${s.id}/deploys?per_page=100&page=${page}`, t);
      if (!Array.isArray(list) || !list.length) break;
      let tooOld = false;
      for (const d of list) {
        const day = String(d.created_at ?? "").slice(0, 10);
        if (!day) continue;
        if (day < oldest) { tooOld = true; continue; }
        const min = num(d.deploy_time) / 60;
        perDay[day] ||= {};
        perDay[day][name] ||= { builds: 0, minutes: 0 };
        perDay[day][name].builds += 1;
        perDay[day][name].minutes += min;
        bySite[name].builds += 1;
        bySite[name].minutes += min;
      }
      if (tooOld || list.length < 100) break;
    }
    bySite[name].minutes = Math.round(bySite[name].minutes * 10) / 10;
  }

  // แท่งตามช่วงเวลา — นับถอยหลังจากวันนี้ (เวลาไทย)
  const windows = {};
  for (const w of WINDOWS) {
    const from = dayKey(new Date(today.getTime() - (w - 1) * 864e5));
    const acc = {};
    let builds = 0;
    let minutes = 0;
    for (const [day, sitesOfDay] of Object.entries(perDay)) {
      if (day < from) continue;
      for (const [name, v] of Object.entries(sitesOfDay)) {
        acc[name] ||= { builds: 0, minutes: 0 };
        acc[name].builds += v.builds;
        acc[name].minutes += v.minutes;
        builds += v.builds;
        minutes += v.minutes;
      }
    }
    for (const v of Object.values(acc)) v.minutes = Math.round(v.minutes * 10) / 10;
    windows[w] = { from, days: w, builds, minutes: Math.round(minutes * 10) / 10, bySite: acc };
  }

  // แบนด์วิดท์ — Netlify ให้เฉพาะรอบบิลปัจจุบัน ไม่มีย้อนหลังรายวัน
  let bandwidth = null;
  try {
    const acc = await call("/accounts", t);
    const id = acc?.[0]?.id;
    if (id) {
      const b = await call(`/accounts/${id}/bandwidth`, t);
      bandwidth = {
        usedGB: Math.round((num(b.used) / 1e9) * 100) / 100,
        includedGB: Math.round((num(b.included) / 1e9) * 100) / 100,
        periodStart: b.period_start_date,
        periodEnd: b.period_end_date,
        note: "Netlify ให้เฉพาะยอดรวมรอบบิลปัจจุบัน ไม่มีรายวันย้อนหลัง",
      };
    }
  } catch {
    // ดึงไม่ได้ก็ไม่เป็นไร ส่วน build ยังใช้ได้
  }

  const daily = Object.entries(perDay)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 365)
    .map(([day, v]) => ({
      day,
      builds: Object.values(v).reduce((s, x) => s + x.builds, 0),
      minutes: Math.round(Object.values(v).reduce((s, x) => s + x.minutes, 0) * 10) / 10,
      bySite: Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, { builds: x.builds, minutes: Math.round(x.minutes * 10) / 10 }])
      ),
    }));

  const out = {
    at: Date.now(),
    windows,
    bySite,
    daily,
    bandwidth,
    // ⚠️ ข้อความนี้ต้องขึ้นบนจอ ห้ามตัดทิ้ง
    caveat:
      "Netlify ไม่เปิด API ให้ดูเครดิตแยกส่วน — ตัวเลขนี้คือ 'ตัวขับเคลื่อนเครดิต' " +
      "(นาที build · แบนด์วิดท์) ไม่ใช่ยอดเครดิตจริง · จำนวนครั้งที่ฟังก์ชันถูกเรียกดูย้อนหลังไม่ได้เลย",
  };
  await store.setJSON("netlify-usage", out);
  return { ...out, cached: false };
}
