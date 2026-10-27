import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

// POST /api/auth/logout — sessie beëindigen
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  return clearSessionCookie(res);
}
