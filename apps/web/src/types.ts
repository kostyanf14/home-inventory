export type InventoryItemType = "medicine" | "equipment" | "food" | "other";
export type ItemStatus = "active" | "used" | "disposed" | "missing";

export const ITEM_TYPES = ["other", "medicine", "food", "equipment"] as const;
export const ITEM_STATUSES: ItemStatus[] = ["active", "used", "disposed", "missing"];

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

export type MedicineDetails = {
  expiration_date: string;
  dosage?: string | null;
  form?: string | null;
  requires_prescription?: boolean;
  batch_number?: string | null;
};

export type EquipmentDetails = {
  serial_number?: string | null;
  buy_date?: string | null;
  warranty_expiration_date?: string | null;
  model_number?: string | null;
  vendor_name?: string | null;
  receipt_file_url?: string | null;
};

export type FoodDetails = {
  expiration_date: string;
  form?: string | null;
};

export type Item = {
  id: number;
  display_name: string;
  item_type: InventoryItemType;
  quantity: number;
  unit: string;
  site_id?: number;
  place_id: number;
  product_id?: number | null;
  barcode?: string | null;
  status: ItemStatus | string;
  notes?: string | null;
  photo_url?: string | null;
  medicine_details?: MedicineDetails | null;
  equipment_details?: EquipmentDetails | null;
  food_details?: FoodDetails | null;
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

export type ActiveView = "inventory" | "locations" | "medicines" | "foods" | "items";
export type AuthMode = "login" | "register";
