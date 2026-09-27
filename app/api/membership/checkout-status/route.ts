import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";

import {getActor} from "@/lib/auth/actor";
import {readMembershipCheckoutStatus} from "@/lib/billing/member-checkout-status";

export const dynamic = "force-dynamic";
const privateHeaders = {"Cache-Control": "private, no-store"};
const unavailable = () => NextResponse.json({status: "unavailable"}, {status: 404, headers: privateHeaders});

/** A read-only projection of the persisted membership, never of a Stripe query parameter. */
export async function GET(request: NextRequest) {
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get("membershipId"));
  if (!id.success) return unavailable();
  const actor = await getActor().catch(() => null);
  if (!actor) return unavailable();
  try {
    const status = await readMembershipCheckoutStatus(actor, id.data);
    return NextResponse.json({status}, {headers: privateHeaders});
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return unavailable();
    return NextResponse.json({status: "unavailable"}, {status: 503, headers: privateHeaders});
  }
}
