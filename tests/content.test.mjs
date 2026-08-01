import test from "node:test";
import assert from "node:assert/strict";

globalThis.__BAPT_TEST__ = {};
await import("../src/content.js?content-unit-tests");
const content = globalThis.__BAPT_TEST__;
delete globalThis.__BAPT_TEST__;

test("preserves whitespace around translated text", () => {
  assert.deepEqual(content.splitWhitespace("  Hola mundo\n"), {
    prefix: "  ",
    core: "Hola mundo",
    suffix: "\n"
  });
});

test("selects readable text and skips URLs or symbols", () => {
  assert.equal(content.shouldTranslateText("Hola"), true);
  assert.equal(content.shouldTranslateText("https://example.com/hola"), false);
  assert.equal(content.shouldTranslateText("12345"), false);
  assert.equal(content.shouldTranslateText("A"), false);
});

test("honours excluded and editable elements", () => {
  assert.equal(content.elementIsExcluded({ closest: () => ({ tagName: "CODE" }), isContentEditable: false }), true);
  assert.equal(content.elementIsExcluded({ closest: () => null, isContentEditable: true }), true);
  assert.equal(content.elementIsExcluded({ closest: () => null, isContentEditable: false }), false);
});

test("chunks page records by count and character budget", () => {
  const records = [{ text: "one" }, { text: "two" }, { text: "three" }];
  assert.deepEqual(content.chunkRecords(records, 2, 100), [[records[0], records[1]], [records[2]]]);
  assert.deepEqual(content.chunkRecords(records, 10, 6), [[records[0], records[1]], [records[2]]]);
});
