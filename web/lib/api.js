/**
 * API client — thin wrapper around fetch.
 * All requests go to /api/* (same origin in Next.js).
 */

const BASE = "/api";

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

export const api = {
  dashboard: {
    get: () => request("GET", "/dashboard"),
  },

  parts: {
    list:      ()      => request("GET",    "/parts"),
    create:    (data)  => request("POST",   "/parts", data),
    update:    (id, d) => request("PUT",    `/parts/${id}`, d),
    delete:    (id)    => request("DELETE", `/parts/${id}`),
    movements: (id)    => request("GET",    `/parts/${id}/movements`),
  },

  products: {
    list:   ()       => request("GET",    "/products"),
    get:    (id)     => request("GET",    `/products/${id}`),
    create: (data)   => request("POST",   "/products", data),
    update: (id, d)  => request("PUT",    `/products/${id}`, d),
    delete: (id)     => request("DELETE", `/products/${id}`),
  },

  orders: {
    list:        ()     => request("GET",  "/orders"),
    get:         (id)   => request("GET",  `/orders/${id}`),
    create:      (data) => request("POST", "/orders", data),
    start:       (id)   => request("POST", `/orders/${id}/start`),
    recalculate: (id)   => request("POST", `/orders/${id}/recalculate`),
    complete:    (id)   => request("POST", `/orders/${id}/complete`),
    cancel:      (id)   => request("POST", `/orders/${id}/cancel`),
    workOrderUrl:    (id) => `${BASE}/orders/${id}/work-order`,
    deliveryNoteUrl: (id) => `${BASE}/orders/${id}/delivery-note`,
    invoiceUrl:      (id) => `${BASE}/orders/${id}/invoice`,
  },

  customers: {
    list:   ()       => request("GET",    "/customers"),
    get:    (id)     => request("GET",    `/customers/${id}`),
    orders: (id)     => request("GET",    `/customers/${id}/orders`),
    create: (data)   => request("POST",   "/customers", data),
    update: (id, d)  => request("PUT",    `/customers/${id}`, d),
    delete: (id)     => request("DELETE", `/customers/${id}`),
  },

  suppliers: {
    list:       ()           => request("GET",    "/suppliers"),
    create:     (data)       => request("POST",   "/suppliers", data),
    update:     (id, d)      => request("PUT",    `/suppliers/${id}`, d),
    delete:     (id)         => request("DELETE", `/suppliers/${id}`),
    linkPart:   (id, data)   => request("POST",   `/suppliers/${id}/parts`, data),
    unlinkPart: (sid, pid)   => request("DELETE", `/suppliers/${sid}/parts/${pid}`),
  },

  purchaseOrders: {
    list:    ()       => request("GET",  "/purchase-orders"),
    get:     (id)     => request("GET",  `/purchase-orders/${id}`),
    create:  (data)   => request("POST", "/purchase-orders", data),
    update:  (id, d)  => request("PUT",  `/purchase-orders/${id}`, d),
    receive: (id, d)  => request("POST", `/purchase-orders/${id}/receive`, d),
  },

  locations: {
    list:             ()      => request("GET",    "/locations"),
    stock:            (id)    => request("GET",    `/locations/${id}/stock`),
    create:           (data)  => request("POST",   "/locations", data),
    update:           (id, d) => request("PUT",    `/locations/${id}`, d),
    delete:           (id)    => request("DELETE", `/locations/${id}`),
    transferParts:    (data)  => request("POST",   "/locations/transfer/parts", data),
    transferProducts: (data)  => request("POST",   "/locations/transfer/products", data),
  },
};
