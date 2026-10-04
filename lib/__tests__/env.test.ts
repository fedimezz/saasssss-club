import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv } from "../env";

const REQUIRED = { DATABASE_URL: "postgres://u:p@host/db", JWT_SECRET: "x".repeat(32), APP_URL: "https://yoursaas.test" };
const savedEnv = { ...process.env };

beforeEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, REQUIRED);
});
afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
});

describe("validateEnv", () => {
  it("passes with all required vars set correctly", () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws listing every missing required var", () => {
    delete process.env.JWT_SECRET;
    delete process.env.APP_URL;
    expect(() => validateEnv()).toThrow(/(JWT_SECRET[\s\S]*APP_URL|APP_URL[\s\S]*JWT_SECRET)/);
  });

  it("rejects a JWT_SECRET that's too short", () => {
    process.env.JWT_SECRET = "short";
    expect(() => validateEnv()).toThrow(/JWT_SECRET/);
  });

  it("rejects an APP_URL that isn't a valid URL", () => {
    process.env.APP_URL = "not-a-url";
    expect(() => validateEnv()).toThrow(/APP_URL/);
  });

  it("never throws over a missing optional var (BREVO_API_KEY, etc.)", () => {
    delete process.env.BREVO_API_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    expect(() => validateEnv()).not.toThrow();
  });
});
