// รวมชื่อขนส่งที่สะกดต่างกันให้เป็นเจ้าเดียว
//
// ชื่อในช่อง ship_channel มาจากหลายทาง (ZORT · แพลตฟอร์ม · คนพิมพ์เอง) เจ้าเดียวกัน
// จึงมีหลายสะกด — วัดจริง 4 ก.ย. 2569 พบ Flash เจ้าเดียวแตกเป็น 4 ชื่อ 559 ใบ:
//   "Flash Express" 236 · "Drop-off: Flash Express, Delivery: Flash Express" 235
//   "Flash express" 54 · "Flash Express Thailand" 34
// ⇒ กราฟสัดส่วนขนส่งอ่านไม่ได้เลย ดูเหมือนใช้ 4 เจ้าเจ้าละนิดหน่อย
//
// ⚠️ **ห้ามใช้ includes() จัดกลุ่มเด็ดขาด** (กฎร้าน · โดนมาแล้ว 3 ครั้ง)
//    ชื่อที่คนตั้งเองมีคำของเจ้าอื่นปนได้เสมอ เช่น "ส่งเองไม่ผ่าน Flash"
//    ⇒ ใช้ **รายชื่อตรงตัว** หลัง normalize เท่านั้น
//
// ⚠️ **ไม่รู้จัก = ไม่เดา** ปล่อยเป็นกลุ่มของตัวเองแล้วนับไว้ใน `ungrouped`
//    ให้จอบอกได้ว่ามีกี่ชื่อที่ยังไม่ได้จัด — ตาข่ายกันวันที่ขนส่งเจ้าใหม่โผล่มา
//    เดาผิดแล้วยอดของเจ้าอื่นบวมโดยไม่มีใครรู้ แย่กว่าไม่จัดกลุ่มเลย
//
// ⚠️ **เก็บชื่อดิบไว้เสมอ** (`names`) — กลุ่มเป็นของสำหรับอ่าน ไม่ใช่ของแทนความจริง
//    วันไหนต้องไล่ว่าใบไหนมาจากชื่อไหน ต้องยังไล่ได้

/** ตัดวรรค · ตัวพิมพ์เล็ก · ยุบช่องว่างซ้ำ */
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/* รูปแบบ "Drop-off: X, Delivery: Y" ที่แพลตฟอร์มส่งมา — เอาชื่อ **ฝั่ง Delivery**
   เพราะนั่นคือเจ้าที่วิ่งส่งจริง ส่วน Drop-off คือจุดฝากของ (เจ้าเดียวกันก็ได้ คนละเจ้าก็ได้) */
function unwrap(name) {
  const m = norm(name).match(/^drop-?off:\s*.+?,\s*delivery:\s*(.+)$/);
  return m ? m[1].trim() : norm(name);
}

/* ชื่อจริงของแต่ละเจ้า → รายชื่อสะกดที่ยอมรับ (ตรงตัวหลัง normalize เท่านั้น)
   เจอสะกดใหม่ให้มาเติมที่นี่ที่เดียว */
const CARRIERS = [
  ["Flash Express", ["flash express", "flash", "flash express thailand", "flash express (th)", "flashexpress"]],
  ["Kerry Express", ["kerry express", "kerry", "kerry express thailand", "ket"]],
  ["J&T Express", ["j&t express", "j&t", "jt express", "j and t express"]],
  ["ไปรษณีย์ไทย", ["ไปรษณีย์ไทย", "thailand post", "thai post", "ems", "ไปรษณีย์"]],
  ["Shopee Express (SPX)", ["shopee express", "spx", "spx express", "spx th", "spx thailand"]],
  ["Ninja Van", ["ninja van", "ninjavan", "ninja"]],
  ["Best Express", ["best express", "best"]],
  ["Lazada Express (LEX)", ["lazada express", "lex", "lex th", "lel express"]],
  ["DHL", ["dhl", "dhl express", "dhl ecommerce"]],
  ["รับเองที่ร้าน", ["รับเองที่ร้าน", "รับที่ร้าน", "self pickup", "pickup", "รับหน้าร้าน"]],
];

const ALIAS = new Map();
for (const [name, list] of CARRIERS) for (const a of list) ALIAS.set(a, name);

/** ชื่อดิบหนึ่งชื่อ → ชื่อกลุ่ม (ไม่รู้จักคืน null — ห้ามเดา) */
export function carrierOf(raw) {
  const key = unwrap(raw);
  return ALIAS.get(key) ?? null;
}

/**
 * @param {{channel:string,c:number}[]} rows แถวจาก GROUP BY ship_channel (ต้องครบ ห้าม LIMIT มาก่อน)
 * @returns {{groups:{carrier:string,c:number,known:boolean,names:{name:string,c:number}[]}[],
 *            ungrouped:number, ungroupedNames:number}}
 */
export function groupCarriers(rows = []) {
  const acc = new Map();
  let ungrouped = 0;
  let ungroupedNames = 0;

  for (const r of rows) {
    const raw = String(r?.channel ?? "");
    const c = Number(r?.c) || 0;
    const hit = carrierOf(raw);
    // ไม่รู้จัก = ตั้งเป็นกลุ่มของตัวเอง ใช้ชื่อดิบ แล้วติดธง known:false
    const key = hit ?? raw;
    if (!hit) {
      ungrouped += c;
      ungroupedNames += 1;
    }
    const cur = acc.get(key) || { carrier: key, c: 0, known: Boolean(hit), names: [] };
    cur.c += c;
    cur.names.push({ name: raw, c });
    acc.set(key, cur);
  }

  const groups = [...acc.values()].sort((a, b) => b.c - a.c);
  for (const g of groups) g.names.sort((a, b) => b.c - a.c);
  return { groups, ungrouped, ungroupedNames };
}
