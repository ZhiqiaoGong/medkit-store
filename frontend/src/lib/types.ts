export type ProductType = "BASE" | "ADDON";

export interface Product {
  _id: string;
  name: string;
  sku: string;
  type: ProductType;
  version: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  attributes: Record<string, unknown>;
  stock: {
    total: number;
    reserved: number;
  };
  active: boolean;
}

export interface QuoteLine {
  sku: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface Quote {
  bases: QuoteLine[];
  addons: QuoteLine[];
  total: number;
}
