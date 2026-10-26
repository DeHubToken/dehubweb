import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import { EditorError, editorErrorText } from "./editorError";
import { CLOUD_SERVER_MESSAGES, CloudDraftRecovery, CloudProjectConflict, cloudServerError } from "./cloudProjectFormat";

const ROOT = resolve(__dirname, "../../..");
const sources = (directory: string): string[] => readdirSync(directory).flatMap(name => {
  const path = join(directory, name);
  if (statSync(path).isDirectory()) return sources(path);
  return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
});
const files = [...sources(join(ROOT, "src/lib/editor")), ...sources(join(ROOT, "src/components/editor")), ...readdirSync(join(ROOT, "src/store")).filter(name => /^editor.*\.ts$/.test(name) && !name.includes(".test.")).map(name => join(ROOT, "src/store", name))];
const STRING = '"((?:[^"\\\\]|\\\\.)*)"';
const USES = [
  new RegExp(`new (?:EditorError|CloudProjectConflict|CloudDraftRecovery|CloudDraftDeferred|CloudProjectTransferBusy)\\("(copy\\.[0-9a-f]{12})", ${STRING}`, "g"),
  new RegExp(`(?:\\bt|_copy|translateCopy|_translateCopy)\\("(copy\\.[0-9a-f]{12})",\\s*\\{\\s*defaultValue:\\s*${STRING}`, "g"),
];
const copy = (en as unknown as { copy: Record<string, string> }).copy;
const keyFor = (english: string) => "copy." + createHash("sha256").update(english).digest("hex").slice(0, 12);

describe("editor errors", () => {
  it("shows a known failure by its key and anything else as the translated fallback", () => {
    expect(editorErrorText(new EditorError("copy.test", "Use at most {{maximum}} rows", { maximum: 50 }), "fallback")).toBe("Use at most 50 rows");
    expect(new EditorError("copy.test", "Use at most {{maximum}} rows", { maximum: 50 }).message).toBe("Use at most 50 rows");
    for (const raw of [new Error("TypeError: undefined is not a function"), new DOMException("Failed to fetch", "NetworkError"), "boom", null]) expect(editorErrorText(raw, "fallback")).toBe("fallback");
  });

  it("classes cloud server failures without matching their wording elsewhere", () => {
    const conflict = cloudServerError({ code: "PT409", message: "A newer cloud version exists. Open it or save a separate copy." });
    expect(conflict).toBeInstanceOf(CloudProjectConflict);
    expect(editorErrorText(conflict, "fallback")).toBe("A newer cloud version exists. Open it or save a separate copy.");
    expect(editorErrorText(cloudServerError({ code: "40001", message: "could not serialize access" }), "fallback")).toBe("The cloud project changed during this request. Your local draft was kept; try again.");
    expect(cloudServerError({ code: "PT403", message: "Live draft writer expired. Preserve your local edit and join again." })).toBeInstanceOf(CloudDraftRecovery);
    const unknown = cloudServerError({ code: "42501", message: "permission denied for function" });
    expect(unknown).not.toBeInstanceOf(EditorError);
    expect(unknown.message).toBe("permission denied for function");
  });

  it("keeps every editor message key in en.json with the English it was made from", () => {
    const problems: string[] = [];
    const check = (key: string, english: string, where: string) => {
      if (keyFor(english) !== key) problems.push(`${where}: ${key} is not the key for ${JSON.stringify(english)}`);
      if (copy[key.slice(5)] !== english) problems.push(`${where}: en.json ${key} is ${JSON.stringify(copy[key.slice(5)])}, not ${JSON.stringify(english)}`);
    };
    let count = 0;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const pattern of USES) for (const match of text.matchAll(pattern)) { check(match[1], JSON.parse(`"${match[2]}"`), relative(ROOT, file)); count++; }
    }
    for (const [english, key] of Object.entries(CLOUD_SERVER_MESSAGES)) check(key, english, "CLOUD_SERVER_MESSAGES");
    expect(count).toBeGreaterThan(700);
    expect(problems).toEqual([]);
  });
});
