import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.SAAR_API_URL || "http://localhost:8000";
const API_TOKEN = process.env.SAAR_API_TOKEN || "";
const ADMIN_TOKEN = process.env.SAAR_ADMIN_TOKEN || API_TOKEN;
const ADMIN_UI_KEY = process.env.SAAR_ADMIN_UI_KEY || "";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const joined = path.join("/");
  const backendPath = joined === "health" || joined === "ready" ? `/${joined}` : joined.startsWith("api/") ? `/${joined}` : `/api/${joined}`;
  const target = new URL(backendPath, API_URL);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const scopedUser = request.headers.get("x-saar-user-id");
  const scopedToken = request.headers.get("x-saar-user-token");
  if (scopedUser) headers.set("x-saar-user-id", scopedUser);
  if (scopedToken) headers.set("x-saar-user-token", scopedToken);
  const isAdminPath = backendPath.startsWith("/api/admin");
  const suppliedAdminKey = request.headers.get("x-saar-admin-key") || "";
  const token = isAdminPath && ADMIN_UI_KEY && suppliedAdminKey === ADMIN_UI_KEY ? ADMIN_TOKEN : API_TOKEN;
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

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
        target: target.origin,
        error: error instanceof Error ? error.message : "Unknown proxy error",
      },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
