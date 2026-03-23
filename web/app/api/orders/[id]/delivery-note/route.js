import prisma from "@/lib/prisma";
import { requireAuth, ALL_ROLES } from "@/lib/auth";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 30px 40px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 14px; font-weight: 600; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #111; padding-bottom: 16px; }
  .header-right { text-align: right; }
  .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .value { font-size: 14px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f0f0f0; text-align: left; padding: 6px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #ddd; }
  td { padding: 6px 10px; border: 1px solid #ddd; vertical-align: top; }
  .notes { padding: 12px; border: 1px solid #ddd; border-radius: 4px; min-height: 60px; font-size: 12px; color: #444; margin-bottom: 20px; }
  .signature-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 40px; }
  .sig-box { border-top: 1px solid #999; padding-top: 8px; font-size: 11px; color: #666; }
  @media print { body { padding: 15px 20px; } @page { margin: 1cm; size: A4 portrait; } .no-print { display: none !important; } }
`;

export async function GET(request, { params }) {
  const auth = await requireAuth(request, ALL_ROLES);
  if (auth.error) return auth.error;

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where:   { id: Number(id) },
    include: { product: true, customer: true },
  });
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Delivery Note #${order.id}</title><style>${BASE_CSS}</style></head>
<body>
<div class="no-print" style="position:fixed;top:16px;right:16px;z-index:999">
  <button onclick="window.print()" style="background:#111;color:#fff;border:none;padding:8px 18px;border-radius:4px;cursor:pointer;font-size:13px;">Print / Save PDF</button>
</div>
<div class="header">
  <div>
    <img src="https://dtsolutionsltd.co.uk/wp-content/uploads/2023/03/DTS_logo_inc_ltd.png" alt="DTS Solutions" style="height:55px;margin-bottom:12px;display:block;">
    <div class="label">Delivery Note</div><h1>#${order.id}</h1><div style="margin-top:4px;color:#555;">Date: ${fmtDate(new Date())}</div></div>
  <div class="header-right"><div class="label">Reference</div><div class="value">ORDER-${String(order.id).padStart(4, "0")}</div></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:24px;">
  <div>
    <h2 style="margin-top:0">Deliver To</h2>
    ${order.customer
      ? `<div><strong>${order.customer.name}</strong></div>${order.customer.address ? `<div style="white-space:pre-line;color:#444;margin-top:4px">${order.customer.address}</div>` : ""}${order.customer.phone ? `<div style="margin-top:4px">Tel: ${order.customer.phone}</div>` : ""}${order.customer.email ? `<div>Email: ${order.customer.email}</div>` : ""}`
      : "<div style='color:#999'>No customer linked to this order.</div>"}
  </div>
  <div>
    <h2 style="margin-top:0">Order Details</h2>
    <table><tbody>
      <tr><td class="label" style="border:none;padding:3px 8px 3px 0">Product</td><td style="border:none;padding:3px 0"><strong>${order.product.name}</strong></td></tr>
      <tr><td class="label" style="border:none;padding:3px 8px 3px 0">Quantity</td><td style="border:none;padding:3px 0"><strong>${order.quantity} units</strong></td></tr>
      <tr><td class="label" style="border:none;padding:3px 8px 3px 0">Order Date</td><td style="border:none;padding:3px 0">${fmtDate(order.createdAt)}</td></tr>
      ${order.desiredDeadline ? `<tr><td class="label" style="border:none;padding:3px 8px 3px 0">Deadline</td><td style="border:none;padding:3px 0">${fmtDate(order.desiredDeadline)}</td></tr>` : ""}
    </tbody></table>
  </div>
</div>
<h2>Items Delivered</h2>
<table><thead><tr><th style="width:60px">No.</th><th>Description</th><th style="width:120px">Quantity</th><th style="width:120px">Notes</th></tr></thead>
<tbody><tr>
  <td>1</td>
  <td><strong>${order.product.name}</strong>${order.product.description ? `<div style="color:#666;font-size:12px;margin-top:2px">${order.product.description}</div>` : ""}</td>
  <td>${order.quantity} units</td>
  <td></td>
</tr></tbody></table>
${order.notes ? `<h2>Notes</h2><div class="notes">${order.notes}</div>` : ""}
<div class="signature-row"><div class="sig-box">Dispatched by</div><div class="sig-box">Received by (customer)</div><div class="sig-box">Date received</div></div>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
