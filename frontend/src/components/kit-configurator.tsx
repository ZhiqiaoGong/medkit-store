"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthDialog } from "@/components/auth-dialog";
import { clearSession, useSession } from "@/lib/session";
import type { Product, Quote } from "@/lib/types";

interface KitConfiguratorProps {
  products: Product[];
  apiBaseUrl: string;
}

type Quantities = Record<string, number>;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function available(product: Product) {
  return product.stock.total - product.stock.reserved;
}

function productLabel(product: Product) {
  if (product.type === "BASE") return "Core kit";
  if (product.sku.includes("WOUND")) return "Wound care";
  if (product.sku.includes("BURN")) return "Burn care";
  if (product.sku.includes("OUTDOOR")) return "Outdoor";
  return "Accessory";
}

export function KitConfigurator({
  products,
  apiBaseUrl,
}: KitConfiguratorProps) {
  const bases = useMemo(
    () => products.filter((product) => product.type === "BASE"),
    [products],
  );
  const addons = useMemo(
    () => products.filter((product) => product.type === "ADDON"),
    [products],
  );
  const [quantities, setQuantities] = useState<Quantities>(() =>
    bases[0] ? { [bases[0].sku]: 1 } : {},
  );
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { token: authToken } = useSession();

  const selectedProducts = useMemo(
    () =>
      products.filter((product) => (quantities[product.sku] ?? 0) > 0),
    [products, quantities],
  );

  const orderPayload = useMemo(() => {
    const selected = selectedProducts.map((product) => ({
      sku: product.sku,
      quantity: quantities[product.sku],
      type: product.type,
    }));
    return {
      bases: selected
        .filter((item) => item.type === "BASE")
        .map(({ sku, quantity }) => ({ sku, quantity })),
      addons: selected
        .filter((item) => item.type === "ADDON")
        .map(({ sku, quantity }) => ({ sku, quantity })),
    };
  }, [quantities, selectedProducts]);

  useEffect(() => {
    if (selectedProducts.length === 0) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsQuoting(true);
      setQuoteError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/api/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderPayload),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Unable to calculate this kit");
        }
        setQuote(result as Quote);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setQuoteError(
          error instanceof Error ? error.message : "Unable to calculate this kit",
        );
      } finally {
        if (!controller.signal.aborted) setIsQuoting(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiBaseUrl, orderPayload, selectedProducts.length]);

  const beginCheckout = useCallback(
    async (token: string) => {
      if (!quote || selectedProducts.length === 0) return;
      setCheckoutError(null);
      setIsCheckingOut(true);

      try {
        const orderResponse = await fetch(`${apiBaseUrl}/api/orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(orderPayload),
        });
        const order = (await orderResponse.json()) as {
          _id?: string;
          error?: string;
        };
        if (!orderResponse.ok || !order._id) {
          if (orderResponse.status === 401) {
            clearSession();
            setIsAuthOpen(true);
          }
          throw new Error(order.error ?? "Unable to create your order");
        }

        const checkoutResponse = await fetch(
          `${apiBaseUrl}/api/orders/${order._id}/checkout`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const checkout = (await checkoutResponse.json()) as {
          url?: string;
          error?: string;
        };
        if (!checkoutResponse.ok || !checkout.url) {
          throw new Error(checkout.error ?? "Unable to start secure checkout");
        }

        window.location.assign(checkout.url);
      } catch (checkoutFailure) {
        setCheckoutError(
          checkoutFailure instanceof Error
            ? checkoutFailure.message
            : "Unable to start secure checkout",
        );
        setIsCheckingOut(false);
      }
    },
    [apiBaseUrl, orderPayload, quote, selectedProducts.length],
  );

  function handleCheckout() {
    if (!authToken) {
      setCheckoutError("Sign in or create an account to continue.");
      setIsAuthOpen(true);
      return;
    }
    void beginCheckout(authToken);
  }

  function handleSignOut() {
    clearSession();
    setCheckoutError(null);
  }

  function setQuantity(product: Product, nextQuantity: number) {
    const safeQuantity = Math.max(0, Math.min(nextQuantity, available(product)));
    setQuantities((current) => {
      if (safeQuantity === 0) {
        const next = { ...current };
        delete next[product.sku];
        return next;
      }
      return { ...current, [product.sku]: safeQuantity };
    });
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="MedKit Studio home">
          <span className="brand-mark">M+</span>
          <span>MedKit Studio</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#builder">Build a kit</a>
          <a href="#how-it-works">How it works</a>
          {authToken ? (
            <>
              <Link className="account-link" href="/orders">
                My orders
              </Link>
              <button className="text-button" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <button
              className="text-button"
              type="button"
              onClick={() => setIsAuthOpen(true)}
            >
              Sign in
            </button>
          )}
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow">Prepared around your life</span>
          <h1>Build a medical kit that fits your life.</h1>
          <p>
            Choose the essentials that make sense for your home, travels, daily
            routine, or next adventure.
          </p>
          <a className="primary-link" href="#builder">
            Start building <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="hero-visual" id="kit-preview" aria-hidden="true">
          <div className="pulse pulse-one" />
          <div className="pulse pulse-two" />
          <OpenMedKitIllustration />
          <div className="status-chip status-ready">
            <span /> Ready when needed
          </div>
          <div className="status-chip status-modular">
            Everyday essentials inside
          </div>
        </div>
      </section>

      <section className="builder-section" id="builder">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Kit builder</span>
            <h2>Build your kit</h2>
          </div>
          <p>Every selection is checked against live inventory and pricing.</p>
        </div>

        <div className="builder-grid">
          <div className="catalog-column">
            <ProductGroup
              number="01"
              title="Choose your core"
              description="A reliable starting point for everyday preparedness."
              products={bases}
              quantities={quantities}
              onQuantityChange={setQuantity}
            />
            <ProductGroup
              number="02"
              title="Add what fits your needs"
              description="Expand your kit for home, travel, and the unexpected."
              products={addons}
              quantities={quantities}
              onQuantityChange={setQuantity}
            />
          </div>

          <aside className="summary-card" aria-live="polite">
            <div className="summary-heading">
              <div>
                <span className="eyebrow">Live configuration</span>
                <h2>Your kit</h2>
              </div>
              <span className="item-count">{selectedProducts.length} items</span>
            </div>

            <div className="summary-lines">
              {selectedProducts.length === 0 ? (
                <p className="empty-summary">Select a product to begin.</p>
              ) : (
                selectedProducts.map((product) => (
                  <div className="summary-line" key={product.sku}>
                    <div>
                      <strong>{product.name}</strong>
                      <span>
                        {product.sku} · Qty {quantities[product.sku]}
                      </span>
                    </div>
                    <strong>
                      {money.format(
                        product.price * (quantities[product.sku] ?? 0),
                      )}
                    </strong>
                  </div>
                ))
              )}
            </div>

            {quoteError && selectedProducts.length > 0 ? (
              <p className="quote-error">{quoteError}</p>
            ) : null}
            {checkoutError ? (
              <p className="quote-error">{checkoutError}</p>
            ) : null}

            <div className="summary-total">
              <span>Estimated total</span>
              <strong className={isQuoting ? "is-updating" : ""}>
                {quote && selectedProducts.length > 0
                  ? money.format(quote.total)
                  : "—"}
              </strong>
            </div>
            <p className="summary-note">
              Taxes and shipping are calculated during secure checkout.
            </p>
            <button
              className="checkout-button"
              type="button"
              disabled={
                !quote ||
                isQuoting ||
                isCheckingOut ||
                selectedProducts.length === 0
              }
              onClick={handleCheckout}
            >
              {isCheckingOut
                ? "Opening secure checkout…"
                : isQuoting
                  ? "Updating quote…"
                  : "Continue to checkout"}
              <span aria-hidden="true">→</span>
            </button>
            <div className="secure-note">
              <span aria-hidden="true">◇</span>
              Secure payment is handled by Stripe
            </div>
          </aside>
        </div>
      </section>

      <section className="how-it-works" id="how-it-works">
        <span className="eyebrow">Prepared in three simple steps</span>
        <div className="process-grid">
          <ProcessStep number="01" title="Choose" text="Pick a core kit and add the essentials that fit your needs." />
          <ProcessStep number="02" title="Review" text="See live pricing and availability before placing your order." />
          <ProcessStep number="03" title="Be ready" text="Check out securely and keep your kit ready for the moments that matter." />
        </div>
      </section>
      <AuthDialog
        apiBaseUrl={apiBaseUrl}
        open={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthenticated={() => {
          setCheckoutError(null);
        }}
      />
    </main>
  );
}

interface ProductGroupProps {
  number: string;
  title: string;
  description: string;
  products: Product[];
  quantities: Quantities;
  onQuantityChange: (product: Product, quantity: number) => void;
}

function ProductGroup({
  number,
  title,
  description,
  products,
  quantities,
  onQuantityChange,
}: ProductGroupProps) {
  return (
    <section className="product-group">
      <div className="group-heading">
        <span>{number}</span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="product-grid">
        {products.map((product) => {
          const quantity = quantities[product.sku] ?? 0;
          const inStock = available(product) > 0;

          return (
            <article
              className={`product-card ${quantity > 0 ? "is-selected" : ""}`}
              key={product.sku}
            >
              <div className="product-topline">
                <span className="product-tag">{productLabel(product)}</span>
                <span className={inStock ? "stock in-stock" : "stock"}>
                  {inStock ? `${available(product)} available` : "Out of stock"}
                </span>
              </div>
              {product.imageUrl ? (
                <div className="product-media">
                  <Image
                    alt={`${product.name} contents`}
                    className="product-image"
                    fill
                    sizes="(max-width: 720px) calc(100vw - 76px), (max-width: 1050px) 46vw, 300px"
                    src={product.imageUrl}
                  />
                </div>
              ) : (
                <div className={`product-glyph glyph-${product.type.toLowerCase()}`}>
                  <span>{product.type === "BASE" ? "+" : "•"}</span>
                </div>
              )}
              <div className="product-copy">
                <span className="sku">{product.sku}</span>
                <h4>{product.name}</h4>
                <p>
                  {product.type === "BASE"
                    ? "A dependable foundation with room for the essentials you choose."
                    : "A practical addition designed to fit seamlessly into your kit."}
                </p>
              </div>
              <div className="product-actions">
                <strong>{money.format(product.price)}</strong>
                <QuantityControl
                  product={product}
                  quantity={quantity}
                  disabled={!inStock}
                  onChange={onQuantityChange}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function QuantityControl({
  product,
  quantity,
  disabled,
  onChange,
}: {
  product: Product;
  quantity: number;
  disabled: boolean;
  onChange: (product: Product, quantity: number) => void;
}) {
  if (quantity === 0) {
    return (
      <button
        aria-label={`Add ${product.name}`}
        className="add-button"
        type="button"
        disabled={disabled}
        onClick={() => onChange(product, 1)}
      >
        Add <span aria-hidden="true">+</span>
      </button>
    );
  }

  return (
    <div className="quantity-control" aria-label={`Quantity for ${product.name}`}>
      <button
        type="button"
        aria-label={`Remove one ${product.name}`}
        onClick={() => onChange(product, quantity - 1)}
      >
        −
      </button>
      <span>{quantity}</span>
      <button
        type="button"
        aria-label={`Add one ${product.name}`}
        disabled={quantity >= available(product)}
        onClick={() => onChange(product, quantity + 1)}
      >
        +
      </button>
    </div>
  );
}

function ProcessStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <article>
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function OpenMedKitIllustration() {
  return (
    <div className="kit-case">
      <svg
        className="kit-illustration"
        viewBox="0 0 560 400"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M205 77V43c0-17 14-30 30-30h90c17 0 30 13 30 30v34"
          fill="none"
          stroke="#143d3b"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <rect x="54" y="78" width="452" height="282" rx="34" fill="#073f3d" opacity=".22" transform="translate(16 16)" />
        <rect x="38" y="64" width="484" height="300" rx="34" fill="#e3e0d5" stroke="#143d3b" strokeWidth="14" />
        <rect x="62" y="88" width="436" height="244" rx="20" fill="#f8f5eb" stroke="#a7b9af" strokeWidth="2" />
        <path d="M216 88v244M374 88v244M62 211h436" stroke="#cfcec5" strokeWidth="3" />
        <rect x="94" y="55" width="52" height="20" rx="6" fill="#143d3b" />
        <rect x="414" y="55" width="52" height="20" rx="6" fill="#143d3b" />

        <g className="item-gauze">
          <rect x="82" y="112" width="114" height="72" rx="12" fill="#ffffff" stroke="#b8c7bf" strokeWidth="3" />
          <path d="M139 124v28M125 138h28" stroke="#ef6c35" strokeWidth="8" strokeLinecap="round" />
          <text x="139" y="174" textAnchor="middle" fill="#143d3b" fontSize="9" fontWeight="800" letterSpacing="1.5">GAUZE</text>
        </g>

        <g className="item-bandage" transform="rotate(-17 295 145)">
          <rect x="235" y="127" width="122" height="36" rx="18" fill="#e69b76" />
          <rect x="278" y="130" width="36" height="30" rx="8" fill="#f3c5a9" />
          <circle cx="253" cy="145" r="2.5" fill="#b66f52" />
          <circle cx="263" cy="145" r="2.5" fill="#b66f52" />
          <circle cx="329" cy="145" r="2.5" fill="#b66f52" />
          <circle cx="339" cy="145" r="2.5" fill="#b66f52" />
        </g>
        <g className="item-bandage" transform="rotate(24 292 153)">
          <rect x="244" y="138" width="102" height="31" rx="16" fill="#edb28f" />
          <rect x="280" y="141" width="31" height="25" rx="7" fill="#f7d2bb" />
        </g>

        <g className="item-bottle">
          <rect x="416" y="102" width="40" height="15" rx="5" fill="#143d3b" />
          <rect x="399" y="114" width="74" height="72" rx="15" fill="#ef6c35" />
          <rect x="409" y="135" width="54" height="32" rx="7" fill="#fff8eb" />
          <path d="M436 141v14M429 148h14" stroke="#0b6e69" strokeWidth="5" strokeLinecap="round" />
          <text x="436" y="178" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="800" letterSpacing="1">CLEAN</text>
        </g>

        <g className="item-tape">
          <circle cx="138" cy="272" r="32" fill="#7ec7b4" />
          <circle cx="138" cy="272" r="15" fill="#f8f5eb" stroke="#0b6e69" strokeWidth="4" />
          <path d="M110 255a32 32 0 0 1 42-10" fill="none" stroke="#dff3ec" strokeWidth="5" strokeLinecap="round" />
        </g>

        <g className="item-scissors" fill="none" stroke="#143d3b" strokeWidth="7" strokeLinecap="round">
          <circle cx="258" cy="280" r="16" />
          <circle cx="302" cy="280" r="16" />
          <path d="M270 268l57-35M290 268l-57-35" />
        </g>

        <g className="item-wipes">
          <rect x="397" y="247" width="74" height="47" rx="9" fill="#dcece7" stroke="#0b6e69" strokeWidth="3" transform="rotate(5 434 271)" />
          <rect x="386" y="256" width="74" height="47" rx="9" fill="#ffffff" stroke="#9bb7ac" strokeWidth="3" transform="rotate(-6 423 280)" />
          <text x="423" y="284" textAnchor="middle" fill="#0b6e69" fontSize="8" fontWeight="900" letterSpacing="1">WIPES</text>
        </g>

        <text x="280" y="352" textAnchor="middle" fill="#143d3b" fontSize="10" fontWeight="900" letterSpacing="2.3">PERSONAL KIT / 01</text>
      </svg>
    </div>
  );
}
