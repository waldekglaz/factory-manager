import prisma from "@/lib/prisma";

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
  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px; padding: 12px 16px; background: #f5f5f5; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f0f0f0; text-align: left; padding: 6px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #ddd; }
  td { padding: 6px 10px; border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .notes { padding: 12px; border: 1px solid #ddd; border-radius: 4px; min-height: 60px; font-size: 12px; color: #444; margin-bottom: 20px; }
  .signature-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 40px; }
  .sig-box { border-top: 1px solid #999; padding-top: 8px; font-size: 11px; color: #666; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; }
  .badge-missing { background: #fee2e2; color: #b91c1c; }
  .badge-ok { background: #dcfce7; color: #15803d; }
  @media print { body { padding: 15px 20px; } @page { margin: 1cm; } .no-print { display: none !important; } }
`;

export async function GET(request, { params }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where:   { id: Number(id) },
    include: {
      product:    { include: { productParts: { include: { part: true } } } },
      customer:   true,
      orderParts: { include: { part: true } },
    },
  });
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

  const rows = order.orderParts.map((op) => `
    <tr>
      <td><strong>${op.part.name}</strong></td>
      <td>${op.part.unit}</td>
      <td>${op.quantityNeeded}</td>
      <td>${op.quantityInStock}</td>
      <td>${op.quantityMissing > 0 ? `<span class="badge badge-missing">Missing: ${op.quantityMissing}</span>` : `<span class="badge badge-ok">Ready</span>`}</td>
    </tr>
  `).join("");

  const fromStock = order.fulfilledFromStock > 0
    ? `<p style="margin-bottom:8px;"><strong>${order.fulfilledFromStock} unit(s)</strong> fulfilled from finished goods stock.</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Work Order #${order.id}</title><style>${BASE_CSS}</style></head>
<body>
<div class="no-print" style="position:fixed;top:16px;right:16px;z-index:999">
  <button onclick="window.print()" style="background:#111;color:#fff;border:none;padding:8px 18px;border-radius:4px;cursor:pointer;font-size:13px;">Print / Save PDF</button>
</div>
<div class="header">
  <div><div class="label">Work Order</div><h1>#${order.id} — ${order.product.name}</h1><div style="margin-top:4px;color:#555;">Issued: ${fmtDate(new Date())}</div></div>
  <div class="header-right">
    <div class="label">Status</div><div class="value">${order.status.replace("_", " ").toUpperCase()}</div>
    ${order.customer ? `<div style="margin-top:8px;"><div class="label">Customer</div><div class="value">${order.customer.name}</div></div>` : ""}
  </div>
</div>
<div class="meta-grid">
  <div><div class="label">Product</div><div class="value">${order.product.name}</div></div>
  <div><div class="label">Quantity to Produce</div><div class="value">${order.quantity - order.fulfilledFromStock} units</div></div>
  <div><div class="label">Total Order Qty</div><div class="value">${order.quantity} units</div></div>
  <div><div class="label">Production Start</div><div class="value">${fmtDate(order.productionStartDate)}</div></div>
  <div><div class="label">Production End</div><div class="value">${fmtDate(order.productionEndDate)}</div></div>
  <div><div class="label">Deadline</div><div class="value" style="color:${order.isOnTime === false ? "#dc2626" : "inherit"}">${fmtDate(order.desiredDeadline)}${order.isOnTime === false ? " ⚠" : ""}</div></div>
</div>
${fromStock}
<h2>Materials Required</h2>
<table><thead><tr><th>Material</th><th>Unit</th><th>Required</th><th>Allocated</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
${order.product.description ? `<h2>Product Notes</h2><div class="notes">${order.product.description}</div>` : ""}
<h2>Work Order Notes</h2><div class="notes">${order.notes || "—"}</div>
<div class="signature-row"><div class="sig-box">Production Manager</div><div class="sig-box">Operator / Worker</div><div class="sig-box">QC Check</div></div>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
