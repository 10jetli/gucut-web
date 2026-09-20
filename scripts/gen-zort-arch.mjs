// ผังสถาปัตยกรรม "ZORT" — ท่านประธานสั่ง 20 ก.ย. 2569
//   *"แบแผนผังสถาปัตยกรรมการทำงานของโปรแกรม ZORT ใส่ในเมนู JET ให้ดูหน่อย
//     และอัปเดตด้วยตอนแก้ไขหรืออัปเดต"*
//
// 🔑 **ต่างจาก `gen-arch.mjs` ตรงที่ ZORT เป็นระบบของคนอื่น — เราอ่านซอร์สเขาไม่ได้**
//    ผังนี้จึงประกอบจากสามแหล่งที่ต่างชั้นความน่าเชื่อถือกัน และ **ต้องบอกบนจอว่าอันไหนเป็นอันไหน**
//      ① `calls`  = จุดที่ซอร์สเราเรียก ZORT จริง        ← แน่นอนที่สุด อัปเดตเองทุก build
//      ② `jobs`   = งานตามเวลาที่แตะ ZORT                ← แน่นอน อัปเดตเองทุก build
//      ③ `manual` = ของที่รู้จากคนเท่านั้น (ใครใช้ ZORT ทำอะไร) ← **ติดวันที่เสมอ**
//
// ⚠️ **ห้ามกวาดชื่อเส้นด้วย regex กว้าง ๆ เด็ดขาด** — ในซอร์สเรามีชื่อ ZORT ปลอมเต็มไปหมด:
//    ชื่อในคอมเมนต์ · รายการที่เคยกวาดแล้วได้ 404 · ตัวควบคุมของสคริปต์ยิงตรวจ (`Zzz/GetNothing`)
//    · ชื่อสมมติในเอกสาร (`Module/GetXxx`) — เอาไปวาดผังตรง ๆ = **ผังที่โกหกอย่างมั่นใจ**
//    ⇒ จับเฉพาะ "จุดเรียกจริง" เท่านั้น: `zortPost("X"` · `zortDetailFetch("X"` · URL ที่มี **`zortout.com`**
//      (เคยใช้ `/v4/` เป็นตัวชี้ แล้วไปโดน `api.cloudflare.com/client/v4/` เข้า — ดูเหตุผลเต็มที่ PATTERNS)
//
// ⚠️ ห้ามทำให้ build ตก — อ่านไม่ได้ให้ใส่ค่าว่างแล้วบอกในผังว่าอ่านไม่ได้
//    (ผังวาดไม่ออก ไม่ใช่เหตุผลที่ดีพอจะทำให้ร้านขายของไม่ได้)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/* 🔴 ต้องใช้ `fileURLToPath` ไม่ใช่ `.pathname` (แก้ 20 ก.ย. 2569 ตอนรวมสองสาย)
   `.pathname` เข้ารหัสอักษรไทยและช่องว่างเป็น `%xx` ⇒ พาธที่มีไทยจะหาไฟล์ไม่เจอ
   ⇒ รีโปนี้มีชื่อไฟล์ไทยจำนวนมาก ⇒ มีด่านเฝ้าเรื่องนี้อยู่ (`path-url-roundtrip.test.mjs`)
   🔑 ไฟล์นี้มาจากอีกสาขาที่ไม่มีด่านนั้น ⇒ **การรวมสองสายทำให้โค้ดที่เคยผ่าน กลายเป็นไม่ผ่าน** */
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => { try { return readFileSync(join(root, p), "utf8"); } catch { return ""; } };
const listDir = (p) => { try { return readdirSync(join(root, p)); } catch { return []; } };

/* ───────── ① จุดที่เราเรียก ZORT จริง ───────── */
// สามรูปแบบที่ใช้อยู่จริงในซอร์ส (นับ 20 ก.ย. 2569) — เพิ่ม helper ใหม่ต้องมาเพิ่มที่นี่
const PATTERNS = [
  // zortPost(`Order/AddOrder`, …)  ·  zortDetailFetch("Product/GetProductDetail", …)
  { re: /zort(?:Post|DetailFetch)\(\s*[`"']([A-Za-z]+\/[A-Za-z]+)/g, kind: (m) => (/\/(Get)/.test(m) ? "read" : "write") },
  // URL ตรง ๆ: https://open-api.zortout.com/v4/Product/GetProducts  หรือ  ${BASE}/Order/GetOrders
  /* 🔴 **ห้ามใช้ `/v4/` เป็นตัวชี้ว่าเป็น ZORT** (พลาดมาแล้ว 20 ก.ย. 2569)
     `api.cloudflare.com/client/v4/...` ก็มี `/v4/` ⇒ `coredb.mjs` ถูกตีตราเป็นไลบรารี ZORT
     แล้วลามไปอีก **22 ไฟล์** ที่ import มัน ⇒ ผังจะบอกว่าเกือบทุกงานแตะ ZORT ซึ่งไม่จริง
     ⇒ ต้องยึด **ชื่อโฮสต์ของ ZORT** เท่านั้น · ส่วน `${BASE}` ใช้ได้เฉพาะในไฟล์ที่พูดถึง zortout */
  { re: /zortout\.com\/v4\/([A-Za-z]+\/[A-Za-z]+)/g, kind: (m) => (/\/(Get)/.test(m) ? "read" : "write") },
  { re: /\$\{BASE\}\/([A-Za-z]+\/[A-Za-z]+)/g, needsZortHost: true, kind: (m) => (/\/(Get)/.test(m) ? "read" : "write") },
];
const mentionsZortHost = (src) => /zortout\.com/.test(src);

/* 🔴 กับดักที่ดักตัวเองไม่ทันรอบแรก (20 ก.ย. 2569)
   `core-products.mjs` มีรายการ **"ชื่อที่ลองยิงดู"** เก็บเป็น `{ name: …, url: `${BASE}/Stock/list…` }`
   regex เห็นเป็นเส้นที่เราเรียกจริง ⇒ ผังขึ้นโมดูล `Stock` **ทั้งที่ยิงตรวจแล้วได้ 404**
   ⇒ บรรทัดที่เป็น "รายการผู้สมัคร" (มีทั้ง `name:` และ `url:`) ไม่ใช่จุดเรียกจริง
   ⇒ แยกไปกอง `probedCandidates` **ไม่ทิ้งเงียบ** (ของที่เคยลองแล้วไม่ได้ ก็เป็นข้อมูลของผัง) */
const isCandidateLine = (line) => /\bname\s*:/.test(line) && /\burl\s*:/.test(line);

const calls = new Map();      // endpoint -> { endpoint, kind, files:Set }
const candidates = new Map(); // endpoint -> Set(files)  ← เคยลองยิง ไม่ใช่เส้นที่ใช้จริง
for (const dir of ["netlify/lib", "netlify/functions"]) {
  for (const f of listDir(dir).filter((n) => n.endsWith(".mjs"))) {
    const src = read(`${dir}/${f}`);
    if (!src) continue;
    for (const { re, kind, needsZortHost } of PATTERNS) {
      if (needsZortHost && !mentionsZortHost(src)) continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        const ep = m[1];
        const line = src.slice(src.lastIndexOf("\n", m.index) + 1, src.indexOf("\n", m.index));
        if (isCandidateLine(line)) {
          if (!candidates.has(ep)) candidates.set(ep, new Set());
          candidates.get(ep).add(`${dir}/${f}`);
          continue;
        }
        if (!calls.has(ep)) calls.set(ep, { endpoint: ep, kind: kind(ep), files: new Set() });
        calls.get(ep).files.add(`${dir}/${f}`);
      }
    }
  }
}
// เส้นที่ "เคยลอง" แต่ก็ใช้จริงด้วย ให้ถือว่าใช้จริง — กองผู้สมัครเก็บเฉพาะตัวที่ไม่มีที่ใช้จริงเลย
for (const ep of calls.keys()) candidates.delete(ep);
const candidateList = [...candidates.entries()]
  .map(([endpoint, files]) => ({ endpoint, files: [...files].sort() }))
  .sort((a, b) => a.endpoint.localeCompare(b.endpoint));
const callList = [...calls.values()]
  .map((c) => ({ ...c, module: c.endpoint.split("/")[0], files: [...c.files].sort() }))
  .sort((a, b) => a.endpoint.localeCompare(b.endpoint));

/* ───────── ② งานตามเวลาที่แตะ ZORT ───────── */
/* 🔴 รอบแรกตอบว่า "แตะ ZORT 1 จาก 17 งาน" ซึ่งผิดชัด ๆ (20 ก.ย. 2569)
   เพราะดูแค่ว่าไฟล์นั้น import `zort-*.mjs` ตรง ๆ ไหม — แต่ของจริงงานส่วนใหญ่
   import `core-sync.mjs` / `core-products.mjs` แล้ว **ไลบรารีพวกนั้น**ต่างหากที่คุยกับ ZORT
   ⇒ ต้องไล่ **ทางอ้อม** (transitive) ไม่งั้นผังจะโกหกด้วยการ "ไม่พูดถึง" ซึ่งจับยากกว่าพูดผิด */
const libSrc = new Map();
for (const f of listDir("netlify/lib").filter((n) => n.endsWith(".mjs"))) libSrc.set(f, read(`netlify/lib/${f}`));
const hitsZortDirectly = (src) => /zortout\.com/.test(src) || /zort(?:Post|DetailFetch)\(/.test(src);

const zortLibs = new Set([...libSrc].filter(([, s]) => hitsZortDirectly(s)).map(([f]) => f));
for (let pass = 0; pass < 12; pass++) {           // ไล่ซ้ำจนไม่มีอะไรเพิ่ม (กราฟตื้น 12 รอบเหลือเฟือ)
  let grew = false;
  for (const [f, s] of libSrc) {
    if (zortLibs.has(f)) continue;
    for (const m of s.matchAll(/from\s+["']\.\/([a-z0-9-]+\.mjs)["']/g))
      if (zortLibs.has(m[1])) { zortLibs.add(f); grew = true; break; }
  }
  if (!grew) break;
}

const jobs = [];
for (const f of listDir("netlify/functions").filter((n) => n.endsWith(".mjs"))) {
  const src = read(`netlify/functions/${f}`);
  const cron = src.match(/schedule:\s*["']([^"']+)["']/)?.[1];
  if (!cron) continue;
  const via = [...src.matchAll(/from\s+["']\.\.\/lib\/([a-z0-9-]+\.mjs)["']/g)]
    .map((m) => m[1]).filter((n) => zortLibs.has(n));
  jobs.push({
    name: f.replace(/\.mjs$/, ""), cron,
    zort: hitsZortDirectly(src) || via.length > 0,
    via: [...new Set(via)].sort(),   // โชว์ว่าแตะผ่านไลบรารีตัวไหน ไม่ใช่แค่ใช่/ไม่ใช่
  });
}
jobs.sort((a, b) => Number(b.zort) - Number(a.zort) || a.name.localeCompare(b.name));

/* ───────── ②ข ตัวจับมองไม่เห็นอะไรบ้าง — ต้องประกาศจุดบอดของตัวเอง ─────────
   ตัวจับยึด "ชื่อโฮสต์ ZORT" กับ "ชื่อ helper ที่รู้จัก" ⇒ ถ้าวันหนึ่งมีคนเรียก ZORT
   ด้วยวิธีใหม่ ตัวจับจะเงียบ และผังจะโกหก**ด้วยการไม่พูดถึง** ซึ่งจับยากกว่าพูดผิด
   ⇒ ไฟล์ที่ "พูดถึง ZORT แต่ตัวจับไม่เห็นว่าเรียก" = **รายการให้คนไปดู** ไม่ใช่รายการความผิด
   (ส่วนใหญ่จะเป็นแค่คอมเมนต์ ซึ่งถูกต้องแล้ว — แต่ตัวที่เรียกจริงจะซ่อนอยู่ในกองนี้) */
const blindSpots = [...libSrc]
  .filter(([f, s]) => /zort/i.test(s) && !zortLibs.has(f))
  .map(([f]) => f)
  .sort();

/* ───────── ③ ของที่รู้จากคนเท่านั้น — ติดวันที่ทุกบรรทัด ───────── */
/* 🔴 ส่วนนี้ **ไม่มีอะไรตรวจสอบให้** ⇒ หน้าจอต้องแสดงคนละสีกับ ① ②
      และต้องโชว์ `asOf` ให้เห็น ไม่งั้นอีกสามเดือนมันจะโกหกโดยไม่มีใครรู้
      (กฎเดียวกับ stale-state-comments — ของนอกโค้ดต้องเขียนเป็นเหตุการณ์+วันที่) */
/* 🔴 **ทุกอย่างในก้อนนี้มาจากแหล่งเดียว — ห้ามนับเป็นหลักฐานหลายชิ้น** (เพิ่ม 20 ก.ย. 2569)
   🔑 ที่มา: ฝั่งจอไล่ "ติดอะไร" ของแต่ละคนในผังนี้ แล้วเจอว่าข้ออ้าง
      *"ZORT ไม่มี API ปรับยอดสต็อก"* **สอดคล้องกับ `flow.stockRule`**
      ⇒ ⇒ **แต่ทั้งสองมาจากคนกรอกคนเดียวกัน (ก้อน `manual` นี้)**
      ⇒ **ไม่ใช่การยืนยันอิสระ** ⇒ ถ้าใครเอามาวางคู่กันจะดูเหมือนหลักฐานสองชิ้น
   ⇒ ⇒ นี่คือรูปเดียวกับกฎที่เราเขียนไว้แล้วว่า **ตัวตรวจที่ใช้สมมติฐานร่วมกับตัวที่ถูกตรวจ
      = ถามซ้ำ ไม่ใช่ทดสอบ** — แต่เกิดที่ระดับ **ข้อมูลในไฟล์เดียวกัน**
   📌 ของที่ยืนยันอิสระได้ในผังนี้คือ `probe` (ยิงจริง) และ `calls` (สกัดจากซอร์ส) เท่านั้น */
const manual = {
  asOf: "2026-09-20",
  source: "ท่านประธานบอกเอง",
  /* 🚫 ป้ายนี้ไปกับคำตอบ ⇒ ปลายทางอ่านได้เองว่าอย่านับซ้ำ (ไม่ต้องจำกติกา) */
  "⚠️ ทุกช่องในก้อนนี้มาจากแหล่งเดียว": "ห้ามใช้สองช่องในก้อนนี้ยืนยันกันเอง — ไม่ใช่หลักฐานอิสระ · ของที่ยืนยันอิสระได้คือ probe (ยิงจริง) และ calls (สกัดจากซอร์ส)",
  roles: [
    { who: "บัญชี", uses: "ออกเอกสารขาย/ภาษี แล้วส่งต่อเข้า PEAK",
      ourReplacement: "core/peak", blocker: "รอคีย์ PEAK (ต้องแพ็กเกจ PRO Plus)" },
    { who: "พนักงานแพ็คสินค้า", uses: "ดูใบที่ต้องส่ง · แพ็ก · ตัดส่ง · **เช็กสต็อก**",
      ourReplacement: "core/packing", blocker: "ส่วน 'ปรับยอดสต็อก' ย้ายไม่ได้ — ZORT ไม่มี API ให้ยิงกลับ" },
    { who: "พนักงานตอบแชท", uses: "ตอบ LINE/Facebook ที่ social.zortout.com แล้วเปิดบิลจากแชท",
      ourReplacement: "core/chat", blocker: "ต้องย้าย webhook LINE — เป็นประตูทางเดียว ทำเป็นขั้นสุดท้าย" },
    { who: "พนักงานขายหน้าร้าน", uses: "เครื่องคิดเงิน POS 2 สาขา (KLD · ANJ)",
      ourReplacement: "core/pos", blocker: "ท่านประธานบอก 20 ก.ย. 2569 ว่า 'ไม่ใช่ปัญหา'" },
  ],
  /* ───── ผังเมนู ZORT เชื่อมกันยังไง — ท่านประธานสั่ง 20 ก.ย. 2569 ─────
     *"แผนผังแต่ละเมนูของ ZORT มันเชื่อมกันยังไง ทำงานยังไง"*

     🔑 **ทุกเส้นต้องมี `basis` ว่ารู้ได้ยังไง** — ห้ามวาดลูกศรที่เดาเอาแล้วปล่อยให้ดูเท่ากับเส้นที่ยืนยันแล้ว
        `code`  = มีโค้ดเราเรียก/ยิงจริงยืนยัน        `probe` = ยิงตรวจแล้วเห็นจริง
        `std`   = เป็นลำดับมาตรฐานของระบบคลัง **ยังไม่ได้ยิงยืนยันกับ ZORT ของร้าน**
     ⚠️ เส้น `std` ห้ามเอาไปตัดสินใจย้ายระบบ — ต้องเปิด ZORT ของจริงดูก่อน */
  flow: {
    asOf: "2026-09-20",
    /* 🏷️ **`ชนิด` ของกล่อง — "รู้ได้ยังไงว่านี่คือเมนู"** (เพิ่ม 20 ก.ย. 2569)
       🔴 ที่มา: ฝั่งจอเทียบผังนี้กับตารางเมนู ZORT 46 แถวของเขา แล้วพบว่ากล่อง `channel`
          ("ช่องทางขาย") **ไม่มีอยู่ในเมนูแถบข้างของ ZORT เลย** (ค้น `ช่องทาง`/`Channel`/`Shopee`
          ใน DOM จริง 11 กลุ่ม 50 หน้า = 0 บรรทัด) ⇒ เขา**เกือบเติมแถวปลอมเข้าตาราง**
       ⇒ ⇒ เหตุคือกล่องทุกตัวในผังนี้มีฟิลด์ `menu:` ⇒ **จอปลายทางเรียกทั้ง 16 กล่องว่า "เมนู ZORT"**
          ⇒ **ผังพูดแทนของที่ยังไม่ได้ยืนยัน** (คำของเขาเอง)
       🚫 **`ยังไม่ยืนยันว่าเป็นเมนู` ≠ `ไม่ใช่เมนู`** — ไฟล์เมนูทั้งแผงเขียนขอบเขตตัวเองไว้ว่า
          *"เมนูที่สร้างด้วย JS ตอนคลิกอ่านไม่ได้"* ⇒ **"ไม่เจอ" ยังไม่ใช่ "ไม่มี"**
          ⇒ ต้องมีคนเปิด ZORT ของจริงยืนยันหนึ่งครั้ง (กติกาเราคืออ่านอย่างเดียว ⇒ ทำได้)
       ⚠️ ค่า `เมนูแถบข้าง` ของ 13 กล่องที่เหลือ **อ้างจากตารางเมนูของฝั่งจอ** ไม่ใช่ผมเปิดดูเอง
          ⇒ นั่นคือหลักฐานระดับ "อีกฝั่งวัดมาแล้ว" ไม่ใช่ "ยิงยืนยันเอง" */
    nodes: [
      { id: "quotation", menu: "ใบเสนอราคา", ชนิด: "เมนูแถบข้าง", group: "ขาย", ours: "core/quotations" },
      { id: "order", menu: "รายการขาย", ชนิด: "เมนูแถบข้าง", group: "ขาย", ours: "core/sales", stock: "ตัดออก" },
      { id: "returnorder", menu: "รับคืนสินค้า", ชนิด: "เมนูแถบข้าง", group: "ขาย", ours: "core/return-orders", stock: "เพิ่มเข้า" },
      { id: "purchaseorder", menu: "ใบสั่งซื้อ", ชนิด: "เมนูแถบข้าง", group: "ซื้อ", ours: "core/purchases" },
      { id: "receive", menu: "รับสินค้าเข้าคลัง", ชนิด: "เมนูแถบข้าง", group: "ซื้อ", ours: "core/receive", stock: "เพิ่มเข้า" },
      { id: "returnpo", menu: "คืนสินค้าผู้ขาย", ชนิด: "เมนูแถบข้าง", group: "ซื้อ", ours: "—", stock: "ตัดออก" },
      { id: "transfer", menu: "โอนย้ายสินค้า", ชนิด: "เมนูแถบข้าง", group: "คลัง", ours: "core/transfers", stock: "ย้ายคลัง ยอดรวมเท่าเดิม" },
      { id: "product", menu: "สินค้า", ชนิด: "เมนูแถบข้าง", group: "คลัง", ours: "core/stock" },
      { id: "bundle", menu: "สินค้าชุด", ชนิด: "เมนูแถบข้าง", group: "คลัง", ours: "core/bundles" },
      { id: "warehouse", menu: "คลัง/สาขา", ชนิด: "เมนูแถบข้าง", group: "ตั้งค่า", ours: "core/branches" },
      { id: "contact", menu: "ลูกค้า/คู่ค้า", ชนิด: "เมนูแถบข้าง", group: "ผู้ติดต่อ", ours: "core/customers" },
      { id: "document", menu: "เอกสารบัญชี", ชนิด: "เมนูแถบข้าง", group: "เอกสาร", ours: "core/accounting-docs" },
      { id: "channel", menu: "ช่องทางขาย (Shopee/Lazada/TikTok)", group: "เชื่อมต่อ", ชนิด: "ยังไม่ยืนยันว่าเป็นเมนู", ours: "core/channels" },
      { id: "social", menu: "แชท (social.zortout.com)", group: "เชื่อมต่อ", ชนิด: "คนละเว็บ", ours: "core/chat" },
      { id: "pos", menu: "ขายหน้าร้าน POS", ชนิด: "เมนูแถบข้าง", group: "ขาย", ours: "core/pos" },
      { id: "peak", menu: "PEAK (นอก ZORT)", group: "ปลายทาง", ชนิด: "นอก ZORT", ours: "core/peak" },
    ],
    edges: [
      { from: "channel", to: "order", label: "ดึงออเดอร์เข้า", basis: "code" },
      { from: "pos", to: "order", label: "ขายหน้าร้านกลายเป็นใบขาย", basis: "std" },
      { from: "social", to: "order", label: "เปิดบิลจากแชท", basis: "std" },
      { from: "quotation", to: "order", label: "ใบเสนอราคา → ใบขาย", basis: "std" },
      { from: "order", to: "product", label: "ตัดสต็อก", basis: "probe" },
      { from: "bundle", to: "product", label: "ขายชุด ⇒ ตัดตามสูตร", basis: "code" },
      { from: "returnorder", to: "product", label: "คืนจากลูกค้า ⇒ สต็อกเพิ่ม", basis: "code" },
      { from: "purchaseorder", to: "receive", label: "สั่งซื้อ → รับของ", basis: "code" },
      { from: "receive", to: "product", label: "รับของ ⇒ สต็อกเพิ่ม", basis: "code" },
      { from: "returnpo", to: "product", label: "คืนผู้ขาย ⇒ สต็อกลด", basis: "code" },
      { from: "transfer", to: "warehouse", label: "ย้ายระหว่างคลัง", basis: "probe" },
      { from: "order", to: "document", label: "ออกใบเสร็จ/ใบกำกับ", basis: "code" },
      { from: "document", to: "peak", label: "ส่งยอดขายเข้าบัญชี", basis: "std" },
      { from: "contact", to: "order", label: "ใบขายอ้างลูกค้า", basis: "code" },
    ],
    /* 🔴 ข้อที่ต้องเขียนไว้กลางผัง ไม่ใช่เชิงอรรถ — คนอ่านผังจะถามข้อนี้เป็นข้อแรก */
    stockRule: "สต็อกใน ZORT ขยับได้ **ทางเอกสารเท่านั้น** (ขาย · ซื้อ/รับของ · คืน · โอน) " +
      "— ไม่มีเส้น API สำหรับ 'ปรับยอด' และ Product/UpdateProduct ไม่มีช่องจำนวน " +
      "⇒ ใครปรับยอดใน ZORT เราดึงกลับมาเห็นได้ แต่ถ้าปรับฝั่งเรา ZORT ไม่มีวันรู้",
  },
  /* ผลกวาดชื่อโมดูลด้วย zort-probe.sh — ตัวควบคุมผ่าน 4/4 ทั้งสองรอบ
     ⚠️ "ไม่เจอ" แปลว่า **ยังไม่เจอ** ไม่ใช่ "ไม่มีแน่นอน" (absence-needs-full-probe)
        แต่รอบนี้กวาดคู่ (โมดูล × คำกริยา) 16 ชื่อแล้ว จึงมีน้ำหนักพอจะวางแผนได้ */
  probe: {
    at: "2026-09-20",
    found: ["Product", "Warehouse", "Transfer"],
    notFound: ["Stock", "Inventory", "Adjust", "StockAdjustment", "StockTake",
      "Movement", "StockMovement", "InventoryAdjustment", "Adjustment", "Lot", "Stocks"],
    note: "ไม่มีเส้น 'ปรับยอดสต็อก' — สต็อกใน ZORT ขยับได้ทางเอกสารเท่านั้น (ขาย/ซื้อ/คืน/โอน) " +
          "และ Product/UpdateProduct ไม่มีช่องจำนวน (ตรวจซอร์สแล้ว 20 ก.ย. 2569)",
  },
};

/* ───────── เขียนไฟล์ ───────── */
const byModule = {};
for (const c of callList) (byModule[c.module] ||= []).push(c.endpoint);

const out = {
  generatedAt: new Date().toISOString(),
  calls: callList,
  modules: Object.keys(byModule).sort().map((m) => ({
    module: m,
    endpoints: byModule[m].sort(),
    reads: callList.filter((c) => c.module === m && c.kind === "read").length,
    writes: callList.filter((c) => c.module === m && c.kind === "write").length,
  })),
  jobs,
  /* เส้นที่เคยลองยิงแต่ไม่ได้ใช้จริง — เก็บไว้ให้เห็น ไม่ตัดทิ้งเงียบ ๆ
     (ผังที่ตัดของทิ้งโดยไม่บอก = คนอ่านนึกว่าเราไม่เคยลอง แล้วไปลองซ้ำ) */
  probedCandidates: candidateList,
  blindSpots,
  manual,
};

/* ───────── ด่านกันผังโกหก — ตัวนี้โกหกไปแล้ว 2 ครั้งในชั่วโมงเดียว (20 ก.ย. 2569) ─────────
   ① โมดูล `Stock` โผล่มาจากรายการ "ชื่อที่ลองยิงดู"  ② `/v4/` ไปโดน URL ของ Cloudflare
   ทั้งสองครั้ง **ผลดูสมบูรณ์แบบทุกประการ** ถ้าไม่เอาไปเทียบกับผลยิงตรวจก็ไม่มีทางรู้
   ⇒ ตั้งด่านจากของที่ "รู้แน่ว่าต้องไม่มี" · ไม่ทำให้ build ตก (ผังวาดไม่ออกไม่ควรทำให้ร้านขายไม่ได้)
      แต่ติดธงไปกับข้อมูล ให้หน้าจอขึ้นเตือน — เงียบแล้วปล่อยผ่านคือสิ่งที่ทำให้สองครั้งแรกรอดมาได้ */
const MUST_NOT_APPEAR = out.manual.probe.notFound; // โมดูลที่ยิงตรวจแล้ว 404
const selfCheck = { at: new Date().toISOString(), problems: [] };
for (const m of out.modules)
  if (MUST_NOT_APPEAR.includes(m.module))
    selfCheck.problems.push(`โมดูล "${m.module}" อยู่ในผัง ทั้งที่ยิงตรวจแล้วไม่มีจริง — น่าจะจับชื่อจากรายการทดลองมา`);
for (const c of out.calls)
  if (c.files.some((f) => /coredb|cloudflare/i.test(f)))
    selfCheck.problems.push(`เส้น "${c.endpoint}" มาจาก ${c.files.join(",")} ซึ่งเป็นฝั่งฐานข้อมูล ไม่ใช่ ZORT`);
if (!out.calls.length) selfCheck.problems.push("ไม่เจอเส้น ZORT เลยสักเส้น — ตัวจับน่าจะพังมากกว่าที่เราเลิกใช้ ZORT แล้ว");
selfCheck.ok = selfCheck.problems.length === 0;
out.selfCheck = selfCheck;
if (!selfCheck.ok) for (const p of selfCheck.problems) console.warn(`gen-zort-arch ⚠️ ${p}`);

writeFileSync(
  join(root, "netlify/lib/zort-arch-data.mjs"),
  "// สร้างอัตโนมัติโดย scripts/gen-zort-arch.mjs ตอน build — **ห้ามแก้ด้วยมือ**\n" +
  "// แก้ที่นี่จะถูกเขียนทับรอบหน้า และทำให้ผัง ZORT ในหลังร้านโกหกจนกว่าจะมีคนสังเกต\n" +
  `export const ZORT_ARCH = ${JSON.stringify(out, null, 2)};\n`,
  "utf8"
);
console.log(`gen-zort-arch: เส้นที่เรียกจริง ${callList.length} · โมดูล ${out.modules.length} · งานตามเวลาแตะ ZORT ${jobs.filter((j) => j.zort).length}/${jobs.length}`);
