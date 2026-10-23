import { assert, assertEquals } from "jsr:@std/assert@1";
import { dailyPostDue, repeatsRecent, finish, isAwake, localClock, minutesUntilWake, soundsGenerated } from "./life.ts";

Deno.test("daily posts are due before the end of waking hours, including overnight", () => {
  for (let i = 0; i < 100; i++) {
    assert(!dailyPostDue(String(i), "2026-10-23", { wake: 8, sleep: 24 }, 8));
    assert(dailyPostDue(String(i), "2026-10-23", { wake: 8, sleep: 24 }, 18));
    assert(dailyPostDue(String(i), "2026-10-23", { wake: 14, sleep: 30 }, 1));
  }
});

Deno.test("repeated drafts are caught despite casing and punctuation", () => {
  assert(repeatsRecent("That charging cable only works at one angle!", ["that charging cable only works at one angle"]));
  assert(!repeatsRecent("Cable labels save a lot of guesswork", ["that charging cable only works at one angle"]));
  assert(!repeatsRecent("A new thought", []));
});

Deno.test("an agent sleeps outside its own waking hours", () => {
  assert(isAwake({ wake: 8, sleep: 24 }, 9.5));
  assert(!isAwake({ wake: 8, sleep: 24 }, 3));
  assert(isAwake({ wake: 9, sleep: 26 }, 1.5));
  assert(!isAwake({ wake: 9, sleep: 26 }, 2.5));
});

Deno.test("wake-up is measured in the agent's own timezone", () => {
  assertEquals(minutesUntilWake({ wake: 8 }, 6, 0), 120);
  assertEquals(minutesUntilWake({ wake: 8 }, 23, 0), 540);
  const at = new Date("2026-10-22T07:30:00Z");
  assertEquals(localClock("Europe/Lisbon", at), { hour: 8.5, day: "2026-10-22" });
  assertEquals(localClock("Asia/Tokyo", at).hour, 16.5);
});

Deno.test("drafts that read as generated are caught", () => {
  assert(soundsGenerated("Coffee isn't just a drink — it's a ritual."));
  assert(soundsGenerated("The beauty of a slow morning #coffee"));
  assert(soundsGenerated("It's not just about the music, it's the people"));
  assert(!soundsGenerated("ok who keeps putting the oat milk back empty"));
  assert(!soundsGenerated("third coffee. still no idea what the client wants"));
});

Deno.test("finishing keeps a lowercase typist lowercase", () => {
  assertEquals(finish("Honestly I think Lisbon trams are overrated", { lowercase: true }), "honestly i think lisbon trams are overrated");
  assertEquals(finish('"Never again."', { lowercase: false }).replace(/\.$/, ""), "Never again");
});

Deno.test("finishing drops the tacked-on emoji most of the time", () => {
  assertEquals(finish("listen at -3dB, not max 🔊", { lowercase: true }, 0), "listen at -3dB, not max");
  assertEquals(finish("new kerning 🖌️ looks right 👍🏽", { lowercase: false }, 0), "new kerning looks right");
  assertEquals(finish("listen at -3dB 🔊", { lowercase: true }, 1), "listen at -3dB 🔊");
});
