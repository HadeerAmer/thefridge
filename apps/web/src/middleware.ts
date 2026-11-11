import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/** Admin pages need an admin session; everything else is open (guests can browse). */

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "dev-only-change-me-0f3c9a7e5b2d4c18a6e7f9b1c2d3e4f5",
);

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("tf_session")?.value;
  let role: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
      role = typeof payload.role === "string" ? payload.role : null;
    } catch {
      role = null;
    }
  }
  if (role !== "admin") {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}&admin=1`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
