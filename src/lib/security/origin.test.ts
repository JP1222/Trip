import assert from "node:assert/strict";
import test from "node:test";
import { validateRequestOrigin } from "./origin";

test("accepts the configured same origin", () => {
  const request = new Request("https://trip.example.com/api/admin/login", {
    method: "POST",
    headers: {
      Origin: "https://trip.example.com",
      "Sec-Fetch-Site": "same-origin",
    },
  });
  assert.deepEqual(
    validateRequestOrigin(request, "https://trip.example.com"),
    { ok: true },
  );
});

test("rejects a different origin", () => {
  const request = new Request("https://trip.example.com/api/admin/login", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
  });
  assert.deepEqual(
    validateRequestOrigin(request, "https://trip.example.com"),
    { ok: false, reason: "cross-site" },
  );
});

test("rejects cross-site fetch metadata even when Origin is forged", () => {
  const request = new Request("https://trip.example.com/api/admin/login", {
    method: "POST",
    headers: {
      Origin: "https://trip.example.com",
      "Sec-Fetch-Site": "cross-site",
    },
  });
  assert.deepEqual(
    validateRequestOrigin(request, "https://trip.example.com"),
    { ok: false, reason: "cross-site" },
  );
});

