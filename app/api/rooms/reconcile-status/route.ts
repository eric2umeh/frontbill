import { ensureHotelOwnerFromAuthUser } from "@/lib/auth/ensure-hotel-owner-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileRoomStatusesForOrganization } from "@/lib/rooms/room-occupancy";
import { NextResponse } from "next/server";

/** Warm-instance coalesce — cuts repeat full rooms+bookings scans within a few minutes. */
const RECONCILE_SERVER_TTL_MS = 90_000
const lastReconcileByOrg = new Map<string, number>()

/** POST — sync rooms.status with active in-house folios (fixes stuck occupied after checkout). */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    let organizationId = profile?.organization_id ?? null;

    if (!organizationId) {
      const repaired = await ensureHotelOwnerFromAuthUser(user);
      organizationId = repaired.organizationId;
    }

    if (!organizationId) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "no_organization",
      });
    }

    const force =
      request.headers.get("x-frontbill-reconcile-force") === "1" ||
      new URL(request.url).searchParams.get("force") === "1"

    const lastAt = lastReconcileByOrg.get(organizationId) ?? 0
    if (!force && Date.now() - lastAt < RECONCILE_SERVER_TTL_MS) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "ttl",
      })
    }

    const admin = createAdminClient();
    const result = await reconcileRoomStatusesForOrganization(
      admin,
      organizationId,
    );
    lastReconcileByOrg.set(organizationId, Date.now())
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Reconcile failed";
    console.error("[rooms/reconcile-status]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
