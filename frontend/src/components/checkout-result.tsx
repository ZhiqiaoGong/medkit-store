"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { clearSession, TOKEN_KEY } from "@/lib/session";
import type { Order } from "@/lib/types";

interface CheckoutResultProps {
  apiBaseUrl: string;
  cancelled?: boolean;
  orderId?: string;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function CheckoutResult({
  apiBaseUrl,
  cancelled = false,
  orderId,
}: CheckoutResultProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadOrder = useCallback(async () => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!orderId) {
      setError("This checkout link does not include an order ID.");
      setIsLoading(false);
      return;
    }
    if (!token) {
      setError("Sign in again from the builder to view this order.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as Order & { error?: string };
      if (!response.ok) {
        if (response.status === 401) clearSession();
        throw new Error(result.error ?? "Unable to load this order");
      }
      setOrder(result);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load this order",
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, orderId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadOrder(), 0);
    if (cancelled) return () => window.clearTimeout(initialLoad);

    const interval = window.setInterval(() => {
      void loadOrder();
    }, 2000);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 16000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [cancelled, loadOrder]);

  const paid = order?.status === "paid";
  const title = cancelled
    ? "Checkout paused."
    : paid
      ? "Your kit is confirmed."
      : "Confirming your payment…";

  return (
    <main className="checkout-result-page">
      <section className="checkout-result-card">
        <span className="result-mark" aria-hidden="true">
          {cancelled ? "←" : paid ? "✓" : "…"}
        </span>
        <span className="eyebrow">MedKit Studio order</span>
        <h1>{title}</h1>
        <p>
          {cancelled
            ? "No new payment was submitted. You can return to the builder whenever you are ready."
            : paid
              ? "Payment is complete and your inventory has been reserved."
              : "Stripe has returned you to the store. We are waiting for the signed payment confirmation."}
        </p>

        {isLoading ? <p className="result-status">Loading order…</p> : null}
        {error ? <p className="result-error">{error}</p> : null}
        {order ? (
          <div className="result-order">
            <div>
              <span>Order</span>
              <strong>#{order._id.slice(-8).toUpperCase()}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{order.status}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{money.format(order.total)}</strong>
            </div>
          </div>
        ) : null}

        <div className="result-actions">
          <Link className="primary-link" href="/">
            Back to kit builder
          </Link>
          {!cancelled && order?.status === "pending" ? (
            <button className="text-button" type="button" onClick={() => void loadOrder()}>
              Check again
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
