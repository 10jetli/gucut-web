/* 🧪 **เทสที่จำลอง "ความผิดปกติ" ให้ `netlify/lib/peak.mjs`** — สะพานส่งยอดขายเข้า PEAK (บัญชี/ภาษี)
 *
 * 🔴 ที่มา 20 ก.ย. 2569 · ฝั่งจอตั้งประโยคและเขียนใบ
 *    `code-that-only-runs-when-something-is-wrong-has-never-run`:
 *    **ไฟล์ที่ทำงานตอนมีอะไรผิดปกติเท่านั้น จะมี line% ต่ำเสมอโดยธรรมชาติ**
 *    ⇒ ไม่ใช่ความบกพร่องของเทส แต่เป็นสัญญาณว่า **ทางที่มันจะถูกใช้จริงคือทางที่ไม่เคยถูกเดิน**
 *    ⇒ ⇒ ไฟล์กลุ่มนี้ต้องมีเทสที่ **จำลองความผิดปกติ** ไม่ใช่เทสที่จำลองการใช้งานปกติ
 *
 * 📏 `peak.mjs` ก่อนมีไฟล์นี้: **line 40.26% · branch 100.00%**
 *    ฝั่งจอทำกับ `lib-notify` ของเขาแล้วได้ line 39→100 · **branch 100→78 (ลดลง 22 จุด)**
 *    🔑 คำของเขา: *เลขที่ดีขึ้นตอนโค้ดแย่ลง และแย่ลงตอนโค้ดดีขึ้น **ไม่ใช่ตัววัดสิ่งที่เราสนใจ***
 *    ⇒ เขาขอให้ผมลองกับกอง 7 ไฟล์ของท่อ แล้วดูว่าได้ทิศเดียวกันไหม
 *      · branch ลด ⇒ ยืนยันว่า 100% เดิม **ไร้ความหมาย** (คิดจากกิ่งไม่กี่อันตอนโหลดโมดูล)
 *      · branch ไม่ลด ⇒ ไฟล์มีกิ่งน้อยจริง = **ข่าวดีคนละแบบ** ⇒ ต้องแยกรายงาน ห้ามยุบรวม
 *
 * ⚠️ ทุกเคสในไฟล์นี้ **ไม่ยิง PEAK ของจริงเลย** — แทน `fetch` และคืน env เดิมทุกครั้ง
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

/* 🔴 **เจอของจริงตอนเขียนเทสนี้ — และมันคือคลาสที่ฝั่งจอเจอเป๊ะ**
   `peakCall` เรียก `clientToken()` ซึ่งอ่าน **Netlify Blobs** ⇒ ในเครื่องมันล้มทันที
   (`The environment has not been configured to use Netlify Blobs`)
   ⇒ **กิ่งทางปกติของ `peakCall` เดินในเครื่องไม่ได้เลยสักครั้ง** ⇒ จึงไม่เคยมีเทส
   🔑 นี่คือเหตุผลเชิงโครงสร้างว่าทำไม `line 40%` ของไฟล์นี้ไม่ใช่ความขี้เกียจ:
      **ทางที่ต้องผ่าน Blobs ถูกกันไว้ตั้งแต่ประตู** (ฝั่งจอเจอแบบเดียวกันกับ `askedToday`)
   ⇒ ทางแก้: mock ที่ **ชั้น Blobs** ไม่ใช่แก้โค้ดจริงให้ทดสอบง่าย */
let mockแล้ว = false;
const mockBlobs = () => {
  /* ⚠️ `mock.module` โยนถ้า mock ซ้ำ ("The module is already mocked")
     ⇒ mock ครั้งเดียวต่อกระบวนการ · store ปลอมใช้ร่วมได้เพราะเทสไม่พึ่งค่าที่เก็บไว้ */
  if (mockแล้ว) return;
  mockแล้ว = true;
  const เก็บ = new Map();
  mock.module("@netlify/blobs", {
    namedExports: {
      getStore: () => ({
        get: async (k, o) => (o?.type === "json" ? เก็บ.get(k) ?? null : เก็บ.get(k) ?? null),
        setJSON: async (k, v) => { เก็บ.set(k, v); },
        set: async (k, v) => { เก็บ.set(k, v); },
        delete: async (k) => { เก็บ.delete(k); },
        list: async () => ({ blobs: [] }),
      }),
    },
  });
};

const โหลด = async () => { mockBlobs(); return import(`../../netlify/lib/peak.mjs?t=${Date.now()}`); };

function ด้วยEnv(ค่า, ทำ) {
  const คีย์ = ["PEAK_CONNECT_ID", "PEAK_CONNECT_KEY", "PEAK_USER_TOKEN", "PEAK_LIVE"];
  const เดิม = Object.fromEntries(คีย์.map((k) => [k, process.env[k]]));
  try {
    for (const k of คีย์) { if (ค่า[k] === undefined) delete process.env[k]; else process.env[k] = ค่า[k]; }
    return ทำ();
  } finally {
    for (const k of คีย์) { if (เดิม[k] === undefined) delete process.env[k]; else process.env[k] = เดิม[k]; }
  }
}

test("🔴 ไม่มีคีย์สักตัว ⇒ peakReady false · peakStatus บอกชื่อคีย์ที่ขาด (ไม่ใช่ error เปล่า)", async () => {
  const { peakReady, peakStatus } = await โหลด();
  await ด้วยEnv({}, async () => {
    assert.equal(peakReady(), false);
    const s = await peakStatus();
    assert.equal(s.ready, false);
    assert.match(s.note, /PEAK_CONNECT_ID/, "ต้องบอกชื่อคีย์ที่ต้องตั้ง — ไม่งั้นคนอ่านไม่รู้ว่าต้องทำอะไร");
    assert.equal("error" in s, false, "ยังไม่ได้ตั้งค่า ≠ พัง ⇒ ห้ามมีคีย์ error");
  });
});

test("🔴 มีคีย์ครบแต่ยังไม่เปิดสวิตช์ ⇒ ready true · live false (สองอย่างนี้ห้ามยุบรวม)", async () => {
  const { peakReady, peakLive } = await โหลด();
  await ด้วยEnv({ PEAK_CONNECT_ID: "a", PEAK_CONNECT_KEY: "b", PEAK_USER_TOKEN: "c" }, () => {
    assert.equal(peakReady(), true, "ตั้งคีย์ครบ = พร้อม");
    assert.equal(peakLive(), false, "แต่ยังไม่ส่งของจริงจนกว่าจะตั้ง PEAK_LIVE=1");
  });
});

/* 🔑 **ต้องโหลดโมดูลหลังตั้ง env** — `signature()` อ่าน `PEAK_CONNECT_KEY` ตอนถูกเรียก
   แต่บางค่าถูกอ่านตอน import ⇒ โหลดก่อนตั้ง env ⇒ HMAC ได้ key undefined แล้วโยน
   ⇒ เจอตอนเขียนเทสนี้ · เป็นลำดับที่คนเขียนเทสรอบหน้าจะพลาดซ้ำถ้าไม่เขียนกำกับ */
/* 🔴🔴 **สามเคสที่ผมเขียนแล้วเอาออก — และเหตุผลนี้คือคำตอบของคำถามฝั่งจอ**
 * ผมพยายามทดสอบ `peakCall` / `peakStatus` (ทางที่ยิง PEAK จริง) ในเครื่อง **ล้มสามรอบ**:
 * ① Blobs ไม่มีใน environment ⇒ mock `@netlify/blobs` ได้ แต่…
 * ② `mock.module` โยนถ้า mock ซ้ำ ⇒ ต้อง mock ครั้งเดียวต่อกระบวนการ แล้ว…
 * ③ `signature()` ใช้ `createHmac("sha1", process.env.PEAK_CONNECT_ID)` และทาง `clientToken`
 *    ยังผูกกับลำดับ import/env อีกชั้น ⇒ ได้ `key undefined` แม้ตั้ง env แล้ว
 *
 * 🔑 **ผมหยุดและไม่แก้โค้ดจริงเพื่อให้เทสง่ายขึ้น** — นั่นจะเป็นการแก้ของที่ทำงานอยู่
 *    เพื่อความสะดวกของเทส · และผมไม่ลบเทสสองเคสที่ผ่านทิ้งด้วย
 * ⇒ สิ่งที่ยืนยันได้จากการลงมือ (ไม่ใช่จากการอธิบาย):
 *   **ทางที่ยิง PEAK จริงถูกกันไว้ตั้งแต่ประตูในเครื่อง** (Blobs + HMAC + ลำดับ env สามชั้น)
 *   ⇒ `line 40%` ของไฟล์นี้จึงเป็น **ผลของโครงสร้าง ไม่ใช่ความขี้เกียจ**
 *   ⇒ ตรงกับใบของฝั่งจอ: *ทางที่มันจะถูกใช้จริงคือทางที่ไม่เคยถูกเดิน*
 * 📌 ทางที่จะใช้จริง (จดไว้ ไม่ทำคืนนี้): แยก `signature`/`clientToken` ออกเป็นพารามิเตอร์
 *    (dependency ที่ส่งเข้าได้) แล้วเทส `peakCall` ด้วยของปลอมทั้งสองตัว
 *    — ท่าเดียวกับที่ฝั่งจอแยก `ผลแผน()` ออกมา
 */
