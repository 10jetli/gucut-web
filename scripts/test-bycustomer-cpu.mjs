#!/usr/bin/env node
// Local-only SQL/response regression test. No credentials, D1, HTTP, or new API meter.
// node scripts/test-bycustomer-cpu.mjs [--explain] [--bench]
// Production measurements: ~/gucut-next/scripts/measure-core.mjs (reviewer only).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(new URL("../netlify/functions/core.mjs", import.meta.url), "utf8");
// Frozen pre-fix oracle: keep comparisons independent of future HEAD/main changes.
const baseline = execFileSync("git", ["show", "445a1a5:netlify/functions/core.mjs"], { cwd: root, encoding: "utf8" });
const schema = readFileSync(new URL("../netlify/lib/coredb.mjs", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const NOW = Date.parse("2026-09-11T03:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}
globalThis.fetch = () => { throw new Error("Network forbidden in this local fixture test"); };

function route(text) {
  const start = text.indexOf('    if (url.searchParams.get("daily") || url.searchParams.get("bycustomer")) {');
  const end = text.indexOf('    if (url.searchParams.get("monthly")) {', start);
  assert.ok(start >= 0 && end > start, "daily/bycustomer route boundaries must exist");
  const code = text.slice(start, end).replace('const { coreQuery } = await import("../lib/coredb.mjs");', "");
  assert.ok(!code.includes("import("), "never load real coreQuery/credentials");
  return new AsyncFunction("url", "coreQuery", "json", "Date", code);
}
const before = route(baseline);
const after = route(source);

function database() {
  const dir = mkdtempSync(join(tmpdir(), "bycustomer-cpu-"));
  const path = join(dir, "fixture.sqlite");
  const statements = [...schema.matchAll(/`(CREATE (?:TABLE|INDEX) IF NOT EXISTS (?:orders|idx_orders_\w+)\b[^`]+)`/g)];
  assert.ok(statements.length >= 4, "use actual orders schema and indexes");
  execFileSync("sqlite3", [path], { input: statements.map(([, sql]) => `${sql};`).join("\n") });
  const execute = (sql) => execFileSync("sqlite3", ["-json", path], {
    input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  return {
    all(sql, params = []) {
      let i = 0;
      const bound = sql.replaceAll("?", () => sqliteLiteral(params[i++]));
      assert.equal(i, params.length, "all SQL parameters must be bound");
      const out = execute(bound).trim();
      return out ? JSON.parse(out) : [];
    },
    get(sql, params = []) { return this.all(sql, params)[0]; },
    exec(sql) { execute(sql); },
    close() { rmSync(dir, { recursive: true, force: true }); },
  };
}
function sqliteLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}
function insert(db, entries) {
  const rows = entries.map((r, i) => [String(i), r.source ?? "z1", String(i),
    r.channel === undefined ? "online" : r.channel, r.status === undefined ? "paid" : r.status,
    r.amount ?? 1, r.name === undefined ? "ลูกค้า" : r.name, r.day === undefined ? "2026-09-10" : r.day]);
  const inserts = [];
  for (let i = 0; i < rows.length; i += 500) {
    inserts.push("INSERT INTO orders(id,source,number,channel,status,amount,customer,order_date) VALUES\n" +
      rows.slice(i, i + 500).map((row) => `(${row.map(sqliteLiteral).join(",")})`).join(",\n") + ";");
  }
  db.exec(`BEGIN;\n${inserts.join("\n")}\nCOMMIT;\nANALYZE;`);
}
function stage(sql) {
  if (sql.includes("AS newCustomers")) return "monthly";
  if (sql.includes("AS firstDay")) return "firstDay";
  if (sql.includes("AS d FROM orders")) return "historyFrom";
  return "range";
}
async function run(fn, db, query, { explain = false, fail = "", timings = null, queries = null } = {}) {
  return fn(new URL(`http://fixture.invalid/api/core?${query}`), async (sql, params = []) => {
    assert.ok(params.length <= 100, "stay below D1 bind-variable limit even at limit=500");
    assert.match(sql.trim(), /^(SELECT|WITH)\b/i, "route must remain read-only");
    const label = stage(sql);
    queries?.push({ label, binds: params.length });
    if (explain) {
      console.log(`  ${label} (${params.length} binds): ${sql.replace(/\s+/g, " ").trim()}`);
      for (const r of db.all(`EXPLAIN QUERY PLAN ${sql}`, params)) console.log(`    ${r.detail}`);
    }
    if (fail === label) throw new Error(`injected ${label} failure`);
    const t0 = performance.now();
    const rows = db.all(sql, params);
    if (timings) timings[label] = (timings[label] ?? 0) + performance.now() - t0;
    return rows;
  }, (x) => JSON.parse(JSON.stringify(x)), FixedDate);
}

const cases = [];
for (const store of ["", "&store=z1", "&store=z2", "&store=invalid"]) {
  for (const days of [7, 30, 90, 400]) {
    for (const limit of [1, 100, 500]) cases.push(`bycustomer=1&days=${days}&limit=${limit}${store}`);
  }
}
cases.push("bycustomer=1&days=0&limit=0", "bycustomer=1&days=999&limit=999",
  "bycustomer=1&days=bad&limit=bad", "daily=1&days=90", "daily=1&bycustomer=1&days=90&store=z2");
const fixture = [
  { name: " เก่า ", day: "2024-01-01", source: "z2" },
  { name: "เก่า", day: "2026-06-13", amount: 10.25 },
  { name: " เก่า", day: "2026-08-01", amount: -2.5, channel: "X, Y" },
  { name: "เก่า ", day: "2026-09-01", source: "z2", amount: 7 },
  { name: "ใหม่", day: "2026-09-01", amount: 1.25 },
  { name: "ใหม่", day: "2026-09-10", amount: 2.5 },
  { name: "ใหม่", day: "2026-09-11", source: "z2", amount: 3.75 },
  ...["cancelled", "VOID", "ยกเลิกแล้ว", null].map((status) => ({ name: "ใหม่", day: "2023-01-01", status })),
  ...["cancelled", "VOID", "ยกเลิกแล้ว", null].map((status) => ({ name: "ตัดออก", status, amount: 999999 })),
  ...[null, "", " ", "   "].flatMap((name) => [
    { name, channel: null }, { name, channel: "", source: "z2", day: "2026-08-01" },
  ]),
  { name: "\t", channel: " " }, // SQLite TRIM strips spaces, not all JS whitespace.
  { name: "(ไม่ระบุ)", amount: 0 },
  { name: "ขอบซ้าย", day: "2026-06-13" },
  { name: "ก่อนขอบ", day: "2026-06-12" },
  { name: "อนาคต", day: "2026-09-12" },
  { name: "ใหม่", day: null },
  { name: "วันว่าง", day: "" }, { name: "วันว่าง" },
  ...['O\'Brien "ร้าน" \\ สาขา', "'); DROP TABLE orders; --", "123", "ลูกค้า 🪚\nบรรทัดสอง"].map((name) => ({ name })),
];
const db = database();
console.log(`SQLite ${db.get("SELECT sqlite_version() AS v").v}; local synthetic data only`);
for (const q of cases) assert.deepStrictEqual(await run(after, db, q), await run(before, db, q), `empty: ${q}`);
insert(db, fixture);
for (const q of cases) assert.deepStrictEqual(await run(after, db, q), await run(before, db, q), q);
const q = "bycustomer=1&days=90&limit=500";
const result = await run(after, db, q);
assert.equal(result.customers.find((r) => r.name === "เก่า").firstDay, "2024-01-01");
assert.equal(result.customers.find((r) => r.name === "ใหม่").firstDay, "2026-09-01");
assert.equal(result.unnamed.orders, 8);
assert.ok(result.customers.some((r) => r.name === "\t"));
assert.equal("fallthrough" in result, false);
for (const fail of ["monthly", "historyFrom"]) {
  assert.deepStrictEqual(await run(after, db, q, { fail }), await run(before, db, q, { fail }), fail);
}
for (const fail of ["firstDay", "range"]) {
  await assert.rejects(run(after, db, q, { fail }), new RegExp(`injected ${fail} failure`));
  await assert.rejects(run(before, db, q, { fail }), new RegExp(`injected ${fail} failure`));
}
// Prove this suite rejects a real broken cancellation predicate, not just matching empty responses.
const mutatedSource = source.replaceAll("status NOT LIKE '%cancel%'", "status LIKE '%cancel%'");
assert.ok(source !== mutatedSource, "mutation must change the cancellation predicate");
const mutant = route(mutatedSource);
assert.notDeepStrictEqual(await run(mutant, db, q), result, "cancel-filter mutation must be detected");
db.close();

const many = database();
insert(many, Array.from({ length: 601 }, (_, i) => ({ name: `ลูกค้า ${i}`, amount: i + 0.25 })));
for (const limit of [1, 100, 500]) {
  const query = `bycustomer=1&days=90&limit=${limit}`;
  const actual = await run(after, many, query);
  assert.deepStrictEqual(actual, await run(before, many, query), `601 names, limit=${limit}`);
  assert.equal(actual.monthly[0].newCustomers, 601, "monthly must not be limited to top customers");
  assert.equal(actual.customers.length, limit);
}
if (process.argv.includes("--explain")) {
  for (const [name, fn] of [["before", before], ["after", after]]) {
    for (const store of ["", "&store=z1"]) {
      console.log(`\nEXPLAIN ${name}${store} (601 named rows, ANALYZE, actual schema/indexes)`);
      await run(fn, many, `bycustomer=1&days=90&limit=100${store}`, { explain: true });
    }
  }
}
many.close();
const blanks = database();
insert(blanks, [{ name: null }, { name: " " }, { name: "", source: "z2" }]);
assert.deepStrictEqual(await run(after, blanks, q), await run(before, blanks, q), "only unnamed orders");
blanks.close();
const calls = [];
const checkCalls = database();
insert(checkCalls, Array.from({ length: 501 }, (_, i) => ({ name: String(i) })));
await run(after, checkCalls, q + "&store=z1", { queries: calls });
assert.deepStrictEqual(calls.map((r) => r.label), ["range", "firstDay", "monthly", "historyFrom"]);
assert.ok(calls.every((r) => r.binds <= 4), "query/bind count must not grow with top 500 names");
checkCalls.close();
console.log(`PASS: ${cases.length * 2} empty/edge response comparisons + 3 truncation cases + blank-only + error contracts + mutation control + query/bind budget`);

if (process.argv.includes("--bench")) {
  const bench = database();
  const entries = Array.from({ length: 57002 }, (_, i) => ({
    name: `history-${i % 10000}`, day: "2024-01-01", source: i % 2 ? "z1" : "z2",
  }));
  for (let i = 0; i < 1700; i++) entries.push({ name: `recent-${i % 1036}`, day: "2026-09-10", amount: i + 0.25 });
  insert(bench, entries);
  console.log("\nSynthetic benchmark: 58,702 total orders / 1,700 recent / 1,036 recent names (NOT D1 latency)");
  let oracle;
  for (const [name, fn] of [["before", before], ["after", after]]) {
    for (let i = 0; i < 3; i++) {
      const timings = {};
      const t0 = performance.now();
      const body = await run(fn, bench, q, { timings });
      if (!oracle) oracle = body;
      assert.deepStrictEqual(body, oracle);
      console.log(`${name} #${i + 1}: ${(performance.now() - t0).toFixed(1)} ms; 500 customers; ${JSON.stringify(timings)}`);
    }
  }
  bench.close();
}
