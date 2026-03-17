/**
 * API client — thin wrapper around fetch.
 * All requests go to /api/* (proxied to localhost:3001 by Vite).
 */

const BASE = "/api";

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
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
  },
};
