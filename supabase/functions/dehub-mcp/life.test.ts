import { assert, assertEquals } from "jsr:@std/assert@1";
import { finish, isAwake, localClock, minutesUntilWake, soundsGenerated } from "./life.ts";

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
