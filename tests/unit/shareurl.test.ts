import { describe, it, expect } from "vitest";
import {
  encodeFlowerHash,
  decodeFlowerFromLocation,
} from "../../src/io/ShareUrl";
import { INCLUDED_FLOWERS } from "../../src/data/includedFlowers";

describe("ShareUrl", () => {
  it("round-trips every built-in flower through the hash form", () => {
    for (const desc of INCLUDED_FLOWERS) {
      const hash = encodeFlowerHash(desc);
      expect(hash.startsWith("#/f/")).toBe(true);
      const decoded = decodeFlowerFromLocation(hash, "");
      expect(decoded).toBe(desc);
    }
  });

  it("reads the ?flower= query fallback", () => {
    const desc = "helloflower1.3#name_Test";
    const decoded = decodeFlowerFromLocation(
      "",
      "?flower=" + encodeURIComponent(desc),
    );
    expect(decoded).toBe(desc);
  });

  it("returns null when no flower is present", () => {
    expect(decodeFlowerFromLocation("", "")).toBeNull();
    expect(decodeFlowerFromLocation("#/other", "?x=1")).toBeNull();
  });
});
