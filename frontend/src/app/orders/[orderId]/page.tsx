import { OrderDetail } from "@/components/order-detail";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

  return <OrderDetail apiBaseUrl={apiBaseUrl} orderId={orderId} />;
}
