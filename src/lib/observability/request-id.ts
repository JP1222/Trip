import { randomUUID } from "node:crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function getRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id")?.trim();
  return incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

export function attachRequestId<T extends Response>(
  response: T,
  requestId: string,
): T {
  response.headers.set("X-Request-ID", requestId);
  return response;
}

