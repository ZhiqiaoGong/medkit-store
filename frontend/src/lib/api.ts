import type { Product } from "@/lib/types";

const serverApiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:4000";

export async function getActiveProducts(): Promise<Product[]> {
  const response = await fetch(`${serverApiBaseUrl}/api/products?active=true`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Product service returned ${response.status}`);
  }

  return response.json() as Promise<Product[]>;
}
