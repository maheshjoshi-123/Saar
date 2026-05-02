import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.SAAR_API_URL || "http://localhost:8000";
const API_TOKEN = process.env.SAAR_API_TOKEN || "";
const ADMIN_TOKEN = process.env.SAAR_ADMIN_TOKEN || "";
const ADMIN_UI_KEY = process.env.SAAR_ADMIN_UI_KEY || "";
const MAX_BODY_BYTES = Number(process.env.SAAR_PROXY_MAX_BODY_BYTES || 2_000_000);
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PATCH"]);

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const method = request.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ detail: "Method not allowed" }, { status: 405 });
  }

  const joined = path.join("/");
  if (!joined || joined.includes("..") || joined.includes("//") || joined.includes("\\")) {
    return NextResponse.json({ detail: "Invalid proxy path" }, { status: 400 });
  }
  const backendPath = joined === "health" || joined === "ready" ? `/${joined}` : joined.startsWith("api/") ? `/${joined}` : `/api/${joined}`;
  const isAdminPath = backendPath.startsWith("/api/admin");
  if (isAdminPath && (!ADMIN_UI_KEY || !ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-saar-admin-key") || "", ADMIN_UI_KEY))) {
    return NextResponse.json({ detail: "Admin proxy access denied" }, { status: 403 });
  }

  const target = new URL(backendPath, API_URL);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const scopedUser = request.headers.get("x-saar-user-id");
  const scopedToken = request.headers.get("x-saar-user-token");
  if (scopedUser) headers.set("x-saar-user-id", scopedUser);
  if (scopedToken) headers.set("x-saar-user-token", scopedToken);
  const token = isAdminPath ? ADMIN_TOKEN : API_TOKEN;
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ detail: "Request body too large" }, { status: 413 });
    }
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ detail: "Request body too large" }, { status: 413 });
    }
  }

  let response: Response;
  try {
    response = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
    });
  } catch (error) {
    return NextResponse.json(
      {
        detail: "Saar API is unavailable",
      },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  const responseContentType = response.headers.get("content-type");
  if (responseContentType) responseHeaders.set("content-type", responseContentType);
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");
  responseHeaders.set("referrer-policy", "no-referrer");
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length === rightBytes.length ? 0 : 1;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return diff === 0;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
