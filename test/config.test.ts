import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HOW_TO_GET_PRO_URL } from "../src/config";

describe("How to get Pro link", () => {
  it("points at the Gumroad product with the settings utm tag", () => {
    expect(HOW_TO_GET_PRO_URL).toBe("https://xparhyx.gumroad.com/l/bpfqja?utm_source=obsidian_plugin&utm_medium=settings");
  });
  it("is rendered once in the settings tab and says it is a Gumroad purchase", () => {
    const src = readFileSync("src/main.ts", "utf8");
    expect(src.match(/How to get Pro/g)?.length).toBe(1);
    expect(src).toContain("one-time purchase on Gumroad");
    expect(src).toContain("href: HOW_TO_GET_PRO_URL");
  });
});
