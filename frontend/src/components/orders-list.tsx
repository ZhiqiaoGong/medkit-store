"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { clearSession, useSession } from "@/lib/session";
import type { Order } from "@/lib/types";

interface OrdersListProps {
  apiBaseUrl: string;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function OrdersList({ apiBaseUrl }: OrdersListProps) {
  const { token, email } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    if (!token) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as Order[] | { error?: string };
      if (!response.ok) {
        if (response.status === 401) clearSession();
        throw new Error(
          !Array.isArray(result) && result.error
            ? result.error
            : "Unable to load your orders",
        );
      }
      if (!Array.isArray(result)) {
        throw new Error("Unable to load your orders");
      }
      setOrders(result);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your orders",
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOrders(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOrders]);

  return (
    <main className="orders-page">
      <header className="orders-header">
        <Link className="brand" href="/" aria-label="MedKit Studio home">
          <span className="brand-mark">M+</span>
          <span>MedKit Studio</span>
        </Link>
        <Link className="secondary-link" href="/">
          Build another kit
        </Link>
      </header>

      <section className="orders-shell">
        <div className="orders-title">
          <span className="eyebrow">Account history</span>
          <h1>My orders</h1>
          <p>
            {email
              ? `Signed in as ${email}.`
              : "Sign in from the kit builder to view your order history."}
          </p>
        </div>

        {!token ? (
          <div className="empty-orders">
            <h2>No account loaded here yet.</h2>
            <p>
              Return to the builder, sign in or create an account, then your
              orders will appear here.
            </p>
            <Link className="primary-link" href="/">
              Back to kit builder
            </Link>
          </div>
        ) : null}

        {token && isLoading ? <p className="result-status">Loading orders…</p> : null}
        {error ? <p className="result-error">{error}</p> : null}

        {token && !isLoading && orders.length === 0 ? (
          <div className="empty-orders">
            <h2>No orders yet.</h2>
            <p>Your first kit order will show up here after checkout starts.</p>
            <Link className="primary-link" href="/">
              Build a kit
            </Link>
          </div>
        ) : null}

        {orders.length > 0 ? (
          <div className="orders-list" aria-live="polite">
            {orders.map((order) => (
              <article className="order-card" key={order._id}>
                <div className="order-card-header">
                  <div>
                    <span className="eyebrow">Order</span>
                    <h2>#{order._id.slice(-8).toUpperCase()}</h2>
                  </div>
                  <span className={`status-pill status-${order.status}`}>
                    {order.status}
                  </span>
                </div>

                <dl className="order-meta order-summary-meta">
                  <div>
                    <dt>Date</dt>
                    <dd>{dateFormatter.format(new Date(order.createdAt))}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{money.format(order.total)}</dd>
                  </div>
                  <div>
                    <dt>Items</dt>
                    <dd>{order.items.length}</dd>
                  </div>
                </dl>

                <p className="order-card-summary">
                  {order.items.length === 1
                    ? order.items[0].name
                    : `${order.items[0].name} + ${order.items.length - 1} more`}
                </p>

                <div className="order-actions">
                  <Link className="secondary-link" href={`/orders/${order._id}`}>
                    View details
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
