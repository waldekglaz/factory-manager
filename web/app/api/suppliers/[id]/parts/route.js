import prisma from "@/lib/prisma";
import { requireAuth, MANAGER_ONLY } from "@/lib/auth";

export async function POST(request, { params }) {
  const auth = await requireAuth(request, MANAGER_ONLY);
  if (auth.error) return auth.error;
  const { id } = await params;
  const supplierId = Number(id);
  const { partId, unitCost, leadTimeOverride, minimumOrderQty } = await request.json();
  if (!partId) return Response.json({ error: "partId is required" }, { status: 400 });

  const sp = await prisma.supplierPart.upsert({
    where:  { supplierId_partId: { supplierId, partId: Number(partId) } },
    update: {
      unitCost:         unitCost         != null ? Number(unitCost)         : null,
      leadTimeOverride: leadTimeOverride != null ? Number(leadTimeOverride) : null,
      minimumOrderQty:  minimumOrderQty  != null ? Number(minimumOrderQty)  : null,
    },
    create: {
      supplierId,
      partId:           Number(partId),
      unitCost:         unitCost         != null ? Number(unitCost)         : null,
      leadTimeOverride: leadTimeOverride != null ? Number(leadTimeOverride) : null,
      minimumOrderQty:  minimumOrderQty  != null ? Number(minimumOrderQty)  : null,
    },
    include: { part: true, supplier: true },
  });
  return Response.json(sp);
}
