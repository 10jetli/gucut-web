// รัน: node --experimental-test-module-mocks --test scripts/tests/core-freshness.test.mjs
// 19 ก.ย. 2569 · ตอบคำถามฝั่งจอ "แคชตัวนับแท็บได้นานกี่นาที" — คำตอบคือ **ไม่วัดด้วยนาที**
// 🔴 สิ่งที่เฝ้า (ทุกข้อพิสูจน์ด้วยการปลูกบั๊กแล้วเห็นแดงจริง):
//    · ส่งสองเวลาแยกกัน (syncedAt = ชีพจร · changedAt = ข้อมูลเปลี่ยนจริง) ห้ามยุบเป็นอันเดียว
//    · syncedAtKnown แยก "ระบบไม่เก็บชีพจร" ออกจาก "เก็บแต่ยังไม่มีค่า" — ไม่งั้น null กลายเป็นแดงลวง
//    · ตารางไม่มี updated_at ⇒ ห้ามยัด "วัน" ลงช่องที่ชื่อลงท้าย Utc (จอจะบวก 7 แล้วได้เวลาผิด)
//    · อ่านไม่ได้ต้องติด readError — null เฉย ๆ แยกไม่ออกจาก "ไม่มีค่า"
//    · ชื่อตาราง/คอลัมน์ต่อเข้า SQL ตรง ⇒ ต้องมีด่านรูปแบบ ไม่ใช่เชื่อว่าผู้เรียกส่งดี
//    · markSync ล้มเหลวห้ามโยน — ชีพจรหายหนึ่งรอบ ดีกว่ารอบซิงก์ล้ม
import { freshnessOf, markSync } from "../../netlify/lib/core-freshness.mjs";
let pass=0, fail=0;
const ok=(c,m)=>{ c?pass++:(fail++,console.log("  ❌ "+m)); };

// ตัวปลอมของ coreQuery — จดคำสั่งที่ถูกยิงจริง
const mk=(map)=>{ const seen=[]; const q=async(sql,p=[])=>{ seen.push([sql.replace(/\s+/g," ").trim(),p]);
  for (const [re,val] of map) if (re.test(sql)) { if (val instanceof Error) throw val; return val; }
  return []; }; q.seen=seen; return q; };

// ① ตารางปกติ: ได้สองเวลา + note ถูก
{
  const q=mk([[/core_meta/,[{at:"2026-09-19 01:00:00"}]],[/MAX\(updated_at\) AS at FROM transfers$/,[{at:"2026-09-19 00:30:00"}]]]);
  const r=await freshnessOf(q,{table:"transfers",metaKey:"sync_transfers_z1"});
  ok(r.syncedAtUtc==="2026-09-19 01:00:00","syncedAtUtc");
  ok(r.changedAtUtc==="2026-09-19 00:30:00","changedAtUtc");
  ok(r.syncedAtKnown===true,"syncedAtKnown true");
  ok(!("changedDay" in r),"ตารางปกติไม่ควรมี changedDay");
  ok(/ครั้งสุดท้ายที่ไปดู ZORT/.test(r.syncedAtNote),"note ตอนมีค่า");
}
// ② ไม่มี metaKey (ระบบไม่เก็บชีพจร) — ต้องไม่ยิง core_meta และ note ต้องบอกว่าห้ามเตือน
{
  const q=mk([[/MAX\(updated_at\)/,[{at:"2026-09-19 00:00:00"}]]]);
  const r=await freshnessOf(q,{table:"bundles"});
  ok(r.syncedAtKnown===false,"syncedAtKnown false");
  ok(r.syncedAtUtc===null,"syncedAtUtc null");
  ok(/ห้ามขึ้นเตือน/.test(r.syncedAtNote),"note บอกห้ามเตือน");
  ok(!q.seen.some(([s])=>/core_meta/.test(s)),"ไม่ควรยิง core_meta เลย");
}
// ③ ตารางที่ไม่มี updated_at — ห้ามยัดวันลงช่อง Utc
{
  const q=mk([[/MAX\(day\) AS at FROM stock_snapshots/,[{at:"2026-09-18"}]]]);
  const r=await freshnessOf(q,{table:"stock_snapshots",dayCol:"day"});
  ok(r.changedAtUtc===null,"changedAtUtc ต้อง null (หน่วยคนละอย่าง)");
  ok(r.changedDay==="2026-09-18","changedDay");
  ok(/ห้ามบวก 7/.test(r.changedAtNote),"note เตือนหน่วย");
  ok(!q.seen.some(([s])=>/MAX\(updated_at\)/.test(s)),"ห้ามยิง updated_at กับตารางที่ไม่มี");
}
// ④ อ่านไม่ได้ ต้องแยกจาก "ไม่มีค่า" ด้วย readError
{
  const q=mk([[/MAX\(updated_at\)/,new Error("D1 ล่ม")]]);
  const r=await freshnessOf(q,{table:"transfers",metaKey:"sync_transfers_z1"});
  ok(r.changedAtUtc===null&&/D1 ล่ม/.test(r.readError||""),"readError ติดมาด้วย");
}
// ⑤ ⛔ ปลูกบั๊ก: ชื่อตารางที่มาจากคำขอ ต้องถูกตีกลับ ไม่ใช่ต่อเข้า SQL
{
  let threw=false;
  try { await freshnessOf(mk([]),{table:"transfers; DROP TABLE orders--"}); } catch { threw=true; }
  ok(threw,"ชื่อตารางแปลกต้องโยน error");
  threw=false;
  try { await freshnessOf(mk([]),{table:"stock_snapshots",dayCol:"day) FROM x--"}); } catch { threw=true; }
  ok(threw,"ชื่อคอลัมน์วันแปลกต้องโยน error");
}
// ⑥ where ใช้เฉพาะตอนมี updated_at (ไม่งั้นคิดผิดหน่วย)
{
  const q=mk([[/WHERE/,[{at:"2026-09-19 02:00:00"}]],[/MAX\(updated_at\) AS at FROM transfers$/,[{at:"x"}]]]);
  const r=await freshnessOf(q,{table:"transfers",metaKey:"k",where:"source = ?",params:["z1"]});
  ok(r.rangeChangedAtUtc==="2026-09-19 02:00:00","rangeChangedAtUtc");
  const q2=mk([[/MAX\(day\)/,[{at:"2026-09-18"}]]]);
  const r2=await freshnessOf(q2,{table:"stock_snapshots",dayCol:"day",where:"1=1"});
  ok(r2.rangeChangedAtUtc===null,"dayCol ต้องไม่คิด range");
}
// ⑦ markSync ล้มเหลวต้องคืน false ไม่โยน (ห้ามล้มรอบซิงก์)
{
  ok(await markSync(mk([[/core_meta/,new Error("ล่ม")]]),"k")===false,"markSync คืน false ตอนล้ม");
  ok(await markSync(mk([]),"k","ok")===true,"markSync คืน true ตอนสำเร็จ");
}
console.log(`\nfresh.test: ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail?1:0);
