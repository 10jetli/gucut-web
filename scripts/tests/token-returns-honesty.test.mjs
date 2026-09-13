import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { tokenRefreshResponse } from "../../netlify/functions/token-refresh.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("token refresh: ผู้ให้บริการหนึ่งล้มต้องประกาศ partial บนสุด", () => {
  const result = tokenRefreshResponse({
    shopee: { ok: true, connected: true },
    lazada: { ok: false, why: "refresh ถูกปฏิเสธ" },
    tiktok: { ok: true, connected: false },
  });
  assert.equal(result.ok, true);
  assert.equal(result.partial, true);
  assert.deepEqual(result.failedParts, ["lazada"]);
  assert.equal(result.failedWhy.lazada, "refresh ถูกปฏิเสธ");
  assert.equal(result.tokens.lazada.ok, false);
});

test("token refresh: ทุกผู้ให้บริการตอบได้ต้องไม่มีธง partial", () => {
  const result = tokenRefreshResponse({ shopee: { ok: true }, lazada: { ok: true } });
  assert.equal(result.ok, true);
  assert.equal("partial" in result, false);
  assert.equal("failedParts" in result, false);
});

function returnsFeedHandler(store) {
  const file = path.join(root, "netlify/functions/returns-feed.mjs");
  const source = fs.readFileSync(file, "utf8")
    .replace(/^import .*?;\n/gm, "")
    .replace("export default async function handler", "async function handler")
    .replace(/export const config = [\s\S]*$/, "");
  return new Function("getStore", "adminGate", `${source}\nreturn handler;`)(
    () => store,
    async () => ({ ok: true }),
  );
}

test("returns feed: อ่านรายชื่อ Blob ไม่ได้ต้องไม่ปลอมเป็น list ว่าง", async () => {
  const handler = returnsFeedHandler({ list: async () => { throw Error("fixture list failed"); } });
  const res = await handler(new Request("https://fixture.invalid/api/returns-feed"), {});
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.match(body.error, /fixture list failed/);
  assert.equal("list" in body, false);
});

test("returns feed: อ่านบางใบไม่ได้ยังต้องส่งจำนวน unreadable", async () => {
  const handler = returnsFeedHandler({
    list: async () => ({ blobs: [{ key: "o/broken" }] }),
    get: async () => null,
  });
  const res = await handler(new Request("https://fixture.invalid/api/returns-feed"), {});
  assert.deepEqual(await res.json(), { list: [], unreadable: 1 });
});
