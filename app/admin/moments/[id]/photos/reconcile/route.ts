import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { reconcileMomentProcessingResults } from "@/database/photo-processing";
import { AdminInputError, parseRecordId } from "@/lib/admin-validation";
import { adminMutationGuard } from "@/lib/admin-session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await adminMutationGuard(request);
  if (denied) return denied;
  try {
    const { id: rawId } = await params;
    const momentId = parseRecordId(rawId);
    const photos = await reconcileMomentProcessingResults(momentId);
    return NextResponse.json({ photos });
  } catch (error) {
    if (error instanceof AdminInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Moment reconciliation failed", error);
    return NextResponse.json({ error: "Could not refresh processing status." }, { status: 502 });
  }
}
