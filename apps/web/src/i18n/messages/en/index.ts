import { inventory } from "./inventory";
import { locations } from "./locations";
import { shared } from "./shared";
import { welcome } from "./welcome";

export const enMessages = {
  ...shared,
  ...inventory,
  ...locations,
  ...welcome,
};

export type TranslationKey = keyof typeof enMessages;
export type MessageCatalog = Record<TranslationKey, string>;
