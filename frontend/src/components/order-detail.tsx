"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { clearSession, useSession } from "@/lib/session";
import type { Order } from "@/lib/types";

interface OrderDetailProps {
  apiBaseUrl: string;
  orderId: string;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function statusCopy(status: Order["status"]) {
  if (status === "paid") {
    return "Payment is confirmed. Your selected inventory is reserved for this order.";
  }
  if (status === "cancelled") {
    return "Checkout was cancelled or expired, so the reserved inventory was released.";
  }
  return "Payment is still being confirmed. If you already paid in Stripe, check again to reconcile this order.";
}

export function OrderDetail({ apiBaseUrl, orderId }: OrderDetailProps) {
  const { token } = useSession();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!token) {
      setOrder(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
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
  }, [apiBaseUrl, orderId, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOrder(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOrder]);

  async function refreshPayment() {
    if (!token) return;

    setIsRefreshing(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/orders/${orderId}/refresh-payment`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const result = (await response.json()) as Order & { error?: string };
      if (!response.ok) {
        if (response.status === 401) clearSession();
        throw new Error(result.error ?? "Unable to refresh this order");
      }
      setOrder(result);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh this order",
      );
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }

  return (
    <main className="orders-page">
      <header className="orders-header">
        <Link className="brand" href="/" aria-label="MedKit Studio home">
          <span className="brand-mark">M+</span>
          <span>MedKit Studio</span>
        </Link>
        <Link className="secondary-link" href="/orders">
          Back to orders
        </Link>
      </header>

      <section className="orders-shell">
        {!token ? (
          <div className="empty-orders">
            <h1>Sign in to view this order.</h1>
            <p>
              Return to the kit builder, sign in with the account that placed
              this order, then come back here.
            </p>
            <Link className="primary-link" href="/">
              Back to kit builder
            </Link>
          </div>
        ) : null}

        {token && isLoading ? <p className="result-status">Loading order…</p> : null}
        {error ? <p className="result-error">{error}</p> : null}

        {order ? (
          <article className="order-detail-card">
            <div className="order-card-header">
              <div>
                <span className="eyebrow">Order details</span>
                <h1>#{order._id.slice(-8).toUpperCase()}</h1>
              </div>
              <span className={`status-pill status-${order.status}`}>
                {order.status}
              </span>
            </div>

            <p className="order-status-copy">{statusCopy(order.status)}</p>

            <dl className="order-meta detail-meta">
              <div>
                <dt>Full order ID</dt>
                <dd>{order._id}</dd>
              </div>
              <div>
                <dt>Placed</dt>
                <dd>{dateTimeFormatter.format(new Date(order.createdAt))}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{money.format(order.total)}</dd>
              </div>
            </dl>

            <div className="detail-lines" aria-label="Order line items">
              <div className="detail-line detail-line-heading">
                <span>Item</span>
                <span>Unit</span>
                <span>Qty</span>
                <span>Subtotal</span>
              </div>
              {order.items.map((item) => (
                <div className="detail-line" key={item.sku}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.sku}</span>
                  </div>
                  <span>{money.format(item.price)}</span>
                  <span>{item.quantity}</span>
                  <strong>{money.format(item.subtotal)}</strong>
                </div>
              ))}
            </div>

            <div className="detail-total">
              <span>Order total</span>
              <strong>{money.format(order.total)}</strong>
            </div>

            <div className="order-actions">
              <Link className="primary-link" href="/">
                Build another kit
              </Link>
              <Link className="secondary-link" href="/orders">
                Back to my orders
              </Link>
              {order.status === "pending" ? (
                <button
                  className="text-button"
                  disabled={isRefreshing}
                  type="button"
                  onClick={() => void refreshPayment()}
                >
                  {isRefreshing ? "Checking…" : "Check again"}
                </button>
              ) : null}
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
