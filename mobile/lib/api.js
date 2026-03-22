const BASE = process.env.EXPO_PUBLIC_API_URL + "/api";

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  orders: {
    list:     ()      => request("GET",  "/orders"),
    complete: (id)    => request("POST", `/orders/${id}/complete`),
  },
  purchaseOrders: {
    list:    ()       => request("GET",  "/purchase-orders"),
    receive: (id, d)  => request("POST", `/purchase-orders/${id}/receive`, d),
  },
  locations: {
    list: () => request("GET", "/locations"),
  },
};
