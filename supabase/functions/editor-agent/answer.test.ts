import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseAnswer } from "./answer.ts";
test("reads fenced objects and operation arrays with surrounding whitespace", () => {
  const op = { op: "segment", id: "v", count: 10, duration: 1 };
  assert.deepEqual(parseAnswer("  \n```json\n" + JSON.stringify([op]) + "\n``` \n"), { reply: "", ops: [op] });
  assert.deepEqual(parseAnswer("```json\n" + JSON.stringify({ reply: "Done", ops: [op] }) + "\n```"), { reply: "Done", ops: [op] });
});
test("rejects incomplete JSON and recovers complete objects from prose", () => {
  assert.equal(parseAnswer('{"ops":['), null);
  assert.deepEqual(parseAnswer('Result: {"reply":"Done","ops":[]}'), { reply: "Done", ops: [] });
});
