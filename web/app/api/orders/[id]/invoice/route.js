import prisma from "@/lib/prisma";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(n) {
  return n == null ? "—" : `£${Number(n).toFixed(2)}`;
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
  .bill-to { padding: 12px 16px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f0f0f0; text-align: left; padding: 6px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #ddd; }
  th.right, td.right { text-align: right; }
  td { padding: 6px 10px; border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .totals { width: 280px; margin-left: auto; border-collapse: collapse; }
  .totals td { padding: 6px 10px; border: none; }
  .totals .total-row td { border-top: 2px solid #111; font-weight: 700; font-size: 15px; padding-top: 8px; }
  .notes { padding: 12px; border: 1px solid #ddd; border-radius: 4px; min-height: 40px; font-size: 12px; color: #444; }
  .footer { margin-top: 40px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
  @media print { body { padding: 15px 20px; } @page { margin: 1cm; size: A4 portrait; } .no-print { display: none !important; } }
`;

export async function GET(request, { params }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where:   { id: Number(id) },
    include: {
      product:  true,
      customer: true,
    },
  });
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

  const unitPrice    = order.product.sellingPrice;
  const qty          = order.quantity;
  const subtotal     = unitPrice != null ? unitPrice * qty : null;
  const invoiceDate  = fmtDate(order.productionEndDate ?? new Date());
  const invoiceNo    = `INV-${String(order.id).padStart(5, "0")}`;

  const priceRow = unitPrice != null
    ? `<tr>
        <td>${order.product.name}</td>
        <td class="right">${qty}</td>
        <td class="right">${fmtMoney(unitPrice)}</td>
        <td class="right"><strong>${fmtMoney(subtotal)}</strong></td>
      </tr>`
    : `<tr>
        <td>${order.product.name}</td>
        <td class="right">${qty}</td>
        <td class="right" style="color:#999">No price set</td>
        <td class="right" style="color:#999">—</td>
      </tr>`;

  const totalsBlock = unitPrice != null
    ? `<table class="totals">
        <tr><td>Subtotal</td><td class="right">${fmtMoney(subtotal)}</td></tr>
        <tr class="total-row"><td>Total</td><td class="right">${fmtMoney(subtotal)}</td></tr>
      </table>`
    : "";

  const billTo = order.customer
    ? `<div class="bill-to">
        <div class="label" style="margin-bottom:6px">Bill To</div>
        <div style="font-weight:600">${order.customer.name}</div>
        ${order.customer.email  ? `<div>${order.customer.email}</div>` : ""}
        ${order.customer.phone  ? `<div>${order.customer.phone}</div>` : ""}
        ${order.customer.address ? `<div style="margin-top:4px;color:#555">${order.customer.address}</div>` : ""}
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Invoice ${invoiceNo}</title><style>${BASE_CSS}</style></head>
<body>
<div class="no-print" style="position:fixed;top:16px;right:16px;z-index:999">
  <button onclick="window.print()" style="background:#111;color:#fff;border:none;padding:8px 18px;border-radius:4px;cursor:pointer;font-size:13px;">Print / Save PDF</button>
</div>
<div class="header">
  <div>
    <img src="https://dtsolutionsltd.co.uk/wp-content/uploads/2023/03/DTS_logo_inc_ltd.png" alt="DTS Solutions" style="height:55px;margin-bottom:12px;display:block;">
    <div class="label">Invoice</div>
    <h1>${invoiceNo}</h1>
    <div style="margin-top:4px;color:#555;">Date: ${invoiceDate}</div>
  </div>
  <div class="header-right">
    <div class="label">Order</div>
    <div class="value">#${order.id}</div>
    <div style="margin-top:8px;"><div class="label">Status</div><div class="value">${order.status.replace("_", " ").toUpperCase()}</div></div>
  </div>
</div>
${billTo}
<div class="meta-grid">
  <div><div class="label">Product</div><div class="value">${order.product.name}</div></div>
  <div><div class="label">Quantity</div><div class="value">${qty} units</div></div>
  <div><div class="label">Completed</div><div class="value">${fmtDate(order.productionEndDate)}</div></div>
</div>
<h2>Line Items</h2>
<table>
  <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Amount</th></tr></thead>
  <tbody>${priceRow}</tbody>
</table>
${totalsBlock}
${order.notes ? `<h2>Notes</h2><div class="notes">${order.notes}</div>` : ""}
<div class="footer">Thank you for your business.</div>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
