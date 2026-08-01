import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthUrl, getOAuthConfig, isSafeReturnPath } from "../src/auth-config.js";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("APP_BASE_URL takes precedence over VERCEL_URL", () => {
  process.env.APP_BASE_URL = "https://app.example.com/";
  process.env.VERCEL_URL = "preview.vercel.app";
  assert.equal(getOAuthConfig().appBaseUrl, "https://app.example.com");
});

test("VERCEL_URL is normalized when APP_BASE_URL is absent", () => {
  delete process.env.APP_BASE_URL;
  process.env.VERCEL_URL = "preview.vercel.app";
  assert.equal(getOAuthConfig().appBaseUrl, "https://preview.vercel.app");
});

test("return paths reject protocol-relative and backslash paths", () => {
  assert.equal(isSafeReturnPath("/cockpit"), true);
  assert.equal(isSafeReturnPath("//evil.example"), false);
  assert.equal(isSafeReturnPath("/\\evil"), false);
  assert.equal(isSafeReturnPath("https://evil.example"), false);
});

test("authorization URL contains PKCE and exact redirect URI", () => {
  const config = {
    ...getOAuthConfig(),
    authorizationUrl: "https://provider.example/oauth/authorize",
    clientId: "client-1",
    redirectUri: "https://app.example.com/api/auth/gg/callback",
    scopes: "openid profile"
  };
  const url = new URL(buildAuthUrl(config, { state: "state", codeChallenge: "challenge" }));
  assert.equal(url.searchParams.get("client_id"), "client-1");
  assert.equal(url.searchParams.get("state"), "state");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
});
