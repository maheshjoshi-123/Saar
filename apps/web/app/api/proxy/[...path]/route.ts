import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.SAAR_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_TOKEN = process.env.SAAR_API_TOKEN || "";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const target = new URL(`/api/${path.join("/")}`, API_URL);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));

  const headers = new Headers(request.headers);
  headers.delete("host");
  if (API_TOKEN) {
    headers.set("authorization", `Bearer ${API_TOKEN}`);
  }

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const response = await fetch(target, {
    method,
    headers,
    body,
    cache: "no-store",
  });

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
