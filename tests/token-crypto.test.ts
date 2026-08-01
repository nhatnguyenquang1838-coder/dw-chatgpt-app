import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret } from "../src/gg-oauth-store.js";
import { getOAuthConfig } from "../src/auth-config.js";

function config() {
  return {
    ...getOAuthConfig(),
    authorizationUrl: "https://provider.example/authorize",
    tokenUrl: "https://provider.example/token",
    clientId: "client",
    clientSecret: "secret",
    supabaseUrl: "https://project.supabase.co",
    supabaseServiceRoleKey: "service-role",
    sessionSecret: "01234567890123456789012345678901",
    tokenEncryptionKey: Buffer.alloc(32, 7).toString("base64")
  };
}

test("provider tokens are encrypted with authenticated encryption", () => {
  const encrypted = encryptSecret("token-value", config());
  assert.notEqual(encrypted, "token-value");
  assert.equal(decryptSecret(encrypted, config()), "token-value");
});

test("tampered ciphertext is rejected", () => {
  const encrypted = encryptSecret("token-value", config());
  assert.throws(() => decryptSecret(`${encrypted.slice(0, -1)}A`, config()));
});
