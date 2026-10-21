import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CENTRAL_BILLING_URL = (process.env.SALVIAN_AI_BILLING_URL || "https://salvianai.sovira.id/api/billing/creator").replace(/\/$/, "");
const COOKIE_NAME = "salvian_sso";

export async function POST(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value || "";
  if (!token) return NextResponse.json({ error: "Sesi SALVIAN AI tidak ditemukan.", code: "UNAUTHENTICATED" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const response = await fetch(CENTRAL_BILLING_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({ error: "Billing SALVIAN AI tidak memberikan respons JSON." }));
  return NextResponse.json(data, {
    status: response.status,
    headers: { "Cache-Control": "no-store", "X-Salvian-Billing-Owner": "SALVIAN_AI" },
  });
}
