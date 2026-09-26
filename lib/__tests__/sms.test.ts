import { describe, it, expect, vi, afterEach } from "vitest";
import { toE164, isSmsDestinationAllowed, sendSms, verificationCodeSms } from "../sms";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("toE164", () => {
  it.each([
    ["+216 20 123 456", "+21620123456"],
    ["00216 20-123-456", "+21620123456"],
    ["20 123 456", "+21620123456"],
    ["(+33) 6 12 34 56 78", "+33612345678"],
  ])("%s → %s", (input, expected) => expect(toE164(input)).toBe(expected));

  it.each(["", "abc", "123", "+0123456789", "+216", "20123456789012345678"])("rejects %j", (input) =>
    expect(toE164(input)).toBeNull()
  );
});

describe("destination allow-list (anti SMS-pumping)", () => {
  it("allows Tunisia by default and nothing else", () => {
    expect(isSmsDestinationAllowed("+21620123456")).toBe(true);
    expect(isSmsDestinationAllowed("+33612345678")).toBe(false);
    expect(isSmsDestinationAllowed("+882345678901")).toBe(false); // international premium-style
  });

  it("is widened explicitly through SMS_ALLOWED_COUNTRY_CODES", () => {
    vi.stubEnv("SMS_ALLOWED_COUNTRY_CODES", "+216, +33");
    expect(isSmsDestinationAllowed("+33612345678")).toBe(true);
  });

  it("sendSms refuses a disallowed destination", async () => {
    await expect(sendSms({ to: "+33612345678", body: "x" })).rejects.toThrow(/rejected/);
  });

  it("the rejection message never contains the phone number", async () => {
    await expect(sendSms({ to: "+33612345678", body: "x" })).rejects.not.toThrow(/612345678/);
  });
});

describe("no secrets in logs", () => {
  it("production without Twilio: sends nothing and logs neither the OTP nor the number", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await sendSms({ to: "+21620123456", body: verificationCodeSms("424242", "Club A") });

    const everything = [...log.mock.calls, ...err.mock.calls].flat().join(" ");
    expect(everything).not.toContain("424242");
    expect(everything).not.toContain("20123456");
  });

  it("development without Twilio: still prints the message so OTP flows are testable", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendSms({ to: "+21620123456", body: "code 111111" });
    expect(log.mock.calls.flat().join(" ")).toContain("111111");
  });
});

describe("branding", () => {
  it("uses the club's name, not a hardcoded one", () => {
    expect(verificationCodeSms("123456", "Fit Club Sousse")).toContain("Fit Club Sousse");
    expect(verificationCodeSms("123456", "Fit Club Sousse")).not.toContain("Gammarth");
  });
});
