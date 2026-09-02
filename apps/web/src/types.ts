export type InventoryItemType = "medicine" | "equipment" | "other";

export type Site = {
  id: number;
  name: string;
  type?: string;
};

export type Place = {
  id: number;
  site_id: number;
  name: string;
  type?: string;
};

export type Item = {
  id: number;
  display_name: string;
  item_type: InventoryItemType;
  quantity: number;
  unit: string;
  site_id?: number;
  place_id: number;
  barcode?: string | null;
  status: string;
  medicine_details?: {
    expiration_date: string;
  };
  equipment_details?: {
    buy_date?: string | null;
    warranty_expiration_date?: string | null;
  };
};

export type ProductPreview = {
  id: number | null;
  name: string;
  brand?: string | null;
  category?: string | null;
  barcode: string;
  default_unit?: string | null;
  source: string;
};

export type BarcodeLookupResponse = {
  found: boolean;
  source: string;
  product: ProductPreview | null;
  message: string | null;
};

export type ActiveView = "inventory" | "locations";
export type AuthMode = "login" | "register";
