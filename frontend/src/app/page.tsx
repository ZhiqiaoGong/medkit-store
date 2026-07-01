import { KitConfigurator } from "@/components/kit-configurator";
import { getActiveProducts } from "@/lib/api";

export default async function Home() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  const products = await loadProducts();

  if (!products) {
    return (
      <main className="connection-state">
        <div className="connection-card">
          <span className="eyebrow">MedKit Studio</span>
          <h1>We could not reach the product service.</h1>
          <p>
            Start the Express API on port 4000, then refresh this page to build
            a kit.
          </p>
          <code>cd backend &amp;&amp; npm run dev</code>
        </div>
      </main>
    );
  }

  return <KitConfigurator products={products} apiBaseUrl={apiBaseUrl} />;
}

async function loadProducts() {
  try {
    return await getActiveProducts();
  } catch {
    return null;
  }
}
