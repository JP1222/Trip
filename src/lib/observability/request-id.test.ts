import assert from "node:assert/strict";
import test from "node:test";
import { attachRequestId, getRequestId } from "./request-id";

test("preserves a safe upstream request id", () => {
  const request = new Request("https://trip.example.com", {
    headers: { "X-Request-ID": "traefik-12345678" },
  });
  assert.equal(getRequestId(request), "traefik-12345678");
});

test("replaces malformed request ids", () => {
  const request = new Request("https://trip.example.com", {
    headers: { "X-Request-ID": "short" },
  });
  assert.match(getRequestId(request), /^[0-9a-f-]{36}$/);
});

test("attaches the request id to a response", () => {
  const response = attachRequestId(new Response("ok"), "request-12345678");
  assert.equal(response.headers.get("x-request-id"), "request-12345678");
});
