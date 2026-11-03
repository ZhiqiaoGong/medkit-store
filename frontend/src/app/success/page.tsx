import type { Metadata } from "next";
import { CheckoutResult } from "@/components/checkout-result";

export const metadata: Metadata = {
  title: "Order confirmation",
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

  return <CheckoutResult apiBaseUrl={apiBaseUrl} orderId={orderId} />;
}
