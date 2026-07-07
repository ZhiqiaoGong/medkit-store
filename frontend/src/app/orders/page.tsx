import { OrdersList } from "@/components/orders-list";

export default function OrdersPage() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

  return <OrdersList apiBaseUrl={apiBaseUrl} />;
}
