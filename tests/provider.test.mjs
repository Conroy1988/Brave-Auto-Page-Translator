import test from "node:test";
import assert from "node:assert/strict";
import {
  groupTranslationTexts,
  joinTranslationBatch,
  parseGoogleTranslation,
  splitTranslationBatch,
  translateTexts
} from "../src/provider.js";

function responseFor(value) {
  return {
    ok: true,
    status: 200,
    async json() {
      return [[[value, "source"]], null, "es"];
    }
  };
}

test("parses all translated response segments", () => {
  assert.equal(parseGoogleTranslation([[['Hello ', 'Hola '], ['world', 'mundo']], null, 'es']), "Hello world");
});

test("joins and restores ordered translation batches", () => {
  const joined = joinTranslationBatch(["Hola", "Adiós"]);
  assert.deepEqual(splitTranslationBatch(joined, 2), ["Hola", "Adiós"]);
  assert.equal(splitTranslationBatch("markers removed", 2), null);
});

test("groups text without exceeding the item limit", () => {
  assert.deepEqual(groupTranslationTexts(["one", "two", "three"], 1000, 2), [["one", "two"], ["three"]]);
});

test("translates batches while preserving duplicate positions", async () => {
  let requests = 0;
  const fakeFetch = async (_url, options) => {
    requests += 1;
    const source = new URLSearchParams(options.body).get("q");
    return responseFor(source.replaceAll("Unique one", "Translated one").replaceAll("Unique two", "Translated two"));
  };

  const result = await translateTexts(["Unique one", "Unique two", "Unique one"], "es", "en", fakeFetch);
  assert.deepEqual(result, ["Translated one", "Translated two", "Translated one"]);
  assert.equal(requests, 1);
});

test("falls back to individual requests when batch markers are changed", async () => {
  let requests = 0;
  const fakeFetch = async (_url, options) => {
    requests += 1;
    const source = new URLSearchParams(options.body).get("q");
    if (source.includes("BAPTSEGMENT")) return responseFor("Batch markers were removed");
    return responseFor(`T:${source}`);
  };

  const result = await translateTexts(["Fallback alpha", "Fallback beta"], "es", "en", fakeFetch);
  assert.deepEqual(result, ["T:Fallback alpha", "T:Fallback beta"]);
  assert.equal(requests, 3);
});
