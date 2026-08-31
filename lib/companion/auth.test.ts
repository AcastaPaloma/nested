import assert from "node:assert/strict";
import test from "node:test";
import {
  companionIsOnline,
  createCompanionToken,
  hashCompanionToken,
  readCompanionToken,
} from "./auth";

test("companion tokens are high-entropy, prefixed, and stored as hashes", () => {
  const first = createCompanionToken();
  const second = createCompanionToken();
  assert.match(first, /^nested_companion_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(hashCompanionToken(first), /^[0-9a-f]{64}$/);
  assert.notEqual(hashCompanionToken(first), first);
});

test("bearer parsing accepts only companion tokens", () => {
  const token = createCompanionToken();
  assert.equal(readCompanionToken(new Request("https://nested.test", {
    headers: { authorization: `Bearer ${token}` },
  })), token);
  assert.equal(readCompanionToken(new Request("https://nested.test", {
    headers: { authorization: "Bearer wrong" },
  })), null);
});

test("online status expires after thirty seconds", () => {
  const now = Date.now();
  assert.equal(companionIsOnline(new Date(now - 29_999).toISOString(), now), true);
  assert.equal(companionIsOnline(new Date(now - 30_000).toISOString(), now), false);
  assert.equal(companionIsOnline(null, now), false);
});
