import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  expectedAdminToken,
  verifyCredentials,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      {
        error:
          "ADMIN_PASSWORD is not set. Add it to .env.local (or server env) and restart.",
      },
      { status: 500 },
    );
  }

  let username = "";
  let password = "";
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
    };
    username = String(body.username || "");
    password = String(body.password || "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!verifyCredentials(username, password)) {
    return NextResponse.json(
      { error: "Wrong username or password" },
      { status: 401 },
    );
  }

  const token = expectedAdminToken();
  if (!token) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions());
  return res;
}
