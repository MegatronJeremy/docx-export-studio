import { describe, it, expect } from "vitest";
import { verifyLicense, applyLicenseResult, type HttpPost } from "../src/license";

const KEY = "ABCD1234-EFGH5678-IJKL9012-MNOP3456";
const ok: HttpPost = async (_u, init) => {
  const k = new URLSearchParams(init.body).get("license_key");
  return k === KEY
    ? { status: 200, json: async () => ({ success: true, purchase: {} }) }
    : { status: 404, json: async () => ({ success: false }) };
};
const offline: HttpPost = async () => { throw new TypeError("net::ERR_INTERNET_DISCONNECTED"); };
const free = { proActive: false, licenseKey: "" };

describe("Pro unlock path", () => {
  it("good key", async () => {
    const r = await verifyLicense(KEY, ok);
    expect(r).toEqual({ status: "valid", message: "Pro unlocked. Thank you!" });
    expect(applyLicenseResult(free, r, KEY)).toEqual({ proActive: true, licenseKey: KEY });
  });
  it("wrong key", async () => {
    const r = await verifyLicense("ZZZZ1111-ZZZZ2222-ZZZZ3333-ZZZZ4444", ok);
    expect(r.status).toBe("invalid");
    expect(r.message).toBe("Gumroad does not recognise this licence key.");
    expect(applyLicenseResult(free, r, "x")).toEqual(free);
  });
  it("leading/trailing spaces, tabs, newlines", async () => {
    const r = await verifyLicense(`  \n\t${KEY}\r\n `, ok);
    expect(r.status).toBe("valid");
    expect(applyLicenseResult(free, r, ` ${KEY}\n`).licenseKey).toBe(KEY);
  });
  it("inner whitespace is refused readably", async () => {
    const r = await verifyLicense("ABCD1234-EFGH5678 IJKL9012-MNOP3456", ok);
    expect(r).toEqual({ status: "invalid", message: "That does not look like a licence key." });
  });
  it("lowercase key (as typed; Gumroad decides)", async () => {
    const r = await verifyLicense(KEY.toLowerCase(), ok);
    expect(r.status).toBe("invalid"); // our mock is case-sensitive; real Gumroad behaviour not tested
  });
  it("empty / whitespace-only", async () => {
    for (const v of ["", "   ", "\n"]) expect((await verifyLicense(v, ok)).status).toBe("invalid");
  });
  it("offline: no crash, readable message", async () => {
    const r = await verifyLicense(KEY, offline);
    expect(r.status).toBe("error");
    expect(r.message).toBe("Could not reach Gumroad. Check your connection and try again.");
  });
  it("offline Re-check keeps Pro and key for a paying user", async () => {
    const r = await verifyLicense(KEY, offline);
    const paid = { proActive: true, licenseKey: KEY };
    expect(applyLicenseResult(paid, r, KEY)).toEqual(paid);
  });
  it("garbage reply / 500 is an error, not a crash", async () => {
    const bad: HttpPost = async () => ({ status: 500, json: async () => { throw new Error("not json"); } });
    expect((await verifyLicense(KEY, bad)).status).toBe("error");
  });
  it("refunded Re-check switches Pro off", async () => {
    const ref: HttpPost = async () => ({ status: 200, json: async () => ({ success: true, purchase: { refunded: true } }) });
    const r = await verifyLicense(KEY, ref);
    expect(applyLicenseResult({ proActive: true, licenseKey: KEY }, r, KEY).proActive).toBe(false);
  });
});
