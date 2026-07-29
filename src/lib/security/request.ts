import { createHmac } from "node:crypto";
import { getSecurityEnvironment } from "./env";

const MAX_USER_AGENT_LENGTH = 512;

function normalizeIp(value: string): string | null {
  let ip = value.trim();
  if (!ip || ip.length > 64 || /[\r\n]/.test(ip)) return null;

  // Traefik may forward an IPv4 address with a port. IPv6 values are left as-is.
  const ipv4WithPort = ip.match(/^([^:]+):\d+$/);
  if (ipv4WithPort) ip = ipv4WithPort[1];
  return ip;
}

/**
 * Resolve the client address from a trusted reverse-proxy chain. The app must
 * not be exposed directly when TRUST_PROXY_HOPS is greater than zero.
 */
export function getClientIp(request: Request): string | null {
  const { trustProxyHops } = getSecurityEnvironment();
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (trustProxyHops > 0 && forwarded?.length) {
    const index = forwarded.length - trustProxyHops;
    if (index >= 0) return normalizeIp(forwarded[index]);
  }

  if (trustProxyHops > 0) {
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return normalizeIp(realIp);
  }

  return null;
}

export function hashSensitiveValue(value: string): string {
  return createHmac("sha256", getSecurityEnvironment().appSecret)
    .update(value)
    .digest("hex");
}

export function getClientIpHash(request: Request): string | null {
  const ip = getClientIp(request);
  return ip ? hashSensitiveValue(`ip:${ip}`) : null;
}

export function getSafeUserAgent(request: Request): string | null {
  const value = request.headers.get("user-agent")?.trim();
  if (!value) return null;
  return value.slice(0, MAX_USER_AGENT_LENGTH);
}
