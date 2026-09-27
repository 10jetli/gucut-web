/* 🔴 ด่าน: **เนื้อ hook ในตัวติดตั้ง ต้องตรงกับ `.git/hooks/pre-push` ที่ใช้จริง**
 *
 * ที่มา 27 ก.ย. 2569: ผมเพิ่มตาข่าย 2 ชั้นลง hook ของจริง (log แยกต่อรีโป · จับอินพุตเปลี่ยนกลางทาง
 * · จับแรมไม่พอ) แต่ **ตัวติดตั้งยังเป็นของเก่า** ⇒ เครื่องใหม่จะได้ hook ที่อ่อนกว่า
 * 🔑 คลาสเดิมของทีม: **สองสำเนาของกติกาเดียวกันจะเพี้ยนกันเสมอ** — และรอบนี้เพี้ยนไปทาง
 *    "เครื่องใหม่ไม่มีตาข่าย" ซึ่งไม่มีอะไรฟ้องเลย เพราะเครื่องเก่ายังมีครบ
 *
 * ⚠️ `.git/hooks/` ไม่ได้อยู่ใน git ⇒ ถ้าไม่มีไฟล์นั้น (เช่นบน CI) ให้ **ข้ามอย่างประกาศตัว**
 *    ไม่ใช่ผ่านเงียบ ๆ
 */
import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const hookPath = new URL("../../.git/hooks/pre-push", import.meta.url);
const instPath = new URL("../../scripts/install-pre-push.sh", import.meta.url);

const มีhook = await access(hookPath).then(() => true, () => false);

test("เนื้อ hook ในตัวติดตั้งต้องตรงกับ hook ที่ใช้จริงทุกบรรทัด", async (t) => {
  if (!มีhook) {
    t.skip("ไม่มี .git/hooks/pre-push ในเครื่องนี้ (ไม่ได้อยู่ใน git) ⇒ ข้ามโดยประกาศตัว");
    return;
  }
  const hook = (await readFile(hookPath, "utf8")).trimEnd();
  const inst = await readFile(instPath, "utf8");
  const m = inst.match(/cat > \.git\/hooks\/pre-push <<'HOOK_EOF'\n([\s\S]*?)\nHOOK_EOF/);
  assert.ok(m, "หาบล็อกเนื้อ hook ในตัวติดตั้งไม่เจอ ⇒ ด่านนี้ต้องแดง ไม่ใช่ผ่านเงียบ");
  assert.equal(m[1].trimEnd(), hook,
    "เนื้อ hook สองที่ไม่ตรงกัน ⇒ เครื่องใหม่จะได้ตาข่ายไม่ครบ · รัน `bash scripts/install-pre-push.sh` หรือซิงก์ด้วยมือ");
});

test("ตาข่ายสามชั้นต้องอยู่ในตัวติดตั้ง (ไม่ใช่มีแต่ในเครื่องผม)", async () => {
  const inst = await readFile(instPath, "utf8");
  for (const [ชื่อ, คำ] of [["log แยกต่อรีโป", "LOGDIR="],
                            ["จับอินพุตเปลี่ยนกลางทาง", "FP_BEFORE="],
                            ["จับแรมไม่พอ", "RAM_BEFORE="]]) {
    assert.ok(inst.includes(คำ), `ตัวติดตั้งต้องมีตาข่าย "${ชื่อ}" (หา ${คำ} ไม่เจอ)`);
  }
});
