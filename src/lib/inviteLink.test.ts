import { describe, expect, it } from "vitest";
import { buildInviteUrl, inviteLinkTag } from "./inviteLink";

describe("invite link tag", () => {
  it("is stable for the same name, ignoring case, spaces and @", () => {
    expect(inviteLinkTag("Mart Vader")).toBe(inviteLinkTag("  mart vader "));
    expect(inviteLinkTag("@martvader")).toBe(inviteLinkTag("martvader"));
    expect(inviteLinkTag("Mart Vader")).toMatch(/^[0-9a-z]{4}$/);
  });

  it("changes when the name changes", () => {
    expect(inviteLinkTag("Mart Vader")).not.toBe(inviteLinkTag("Brave Mercury"));
  });

  it("matches the app's copy of the hash", () => {
    // riftn-mobile libs/affiliate.ts uses the same function; this pins its output.
    expect(inviteLinkTag("Mart Vader")).toBe("z95t");
  });

  it("builds the tagged link, or the bare one without a name", () => {
    expect(buildInviteUrl("https://riftn.com/", "YWXRY67Q", "Mart Vader")).toBe(`https://riftn.com/r/YWXRY67Q?n=${inviteLinkTag("Mart Vader")}`);
    expect(buildInviteUrl("https://riftn.com", "YWXRY67Q", null)).toBe("https://riftn.com/r/YWXRY67Q");
  });
});
