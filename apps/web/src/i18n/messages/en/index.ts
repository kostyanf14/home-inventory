import { inventory } from "./inventory";
import { locations } from "./locations";
import { medicines } from "./medicines";
import { shared } from "./shared";
import { welcome } from "./welcome";

export const enMessages = {
  ...shared,
  ...inventory,
  ...locations,
  ...medicines,
  ...welcome,
};

export type TranslationKey = keyof typeof enMessages;
export type MessageCatalog = Record<TranslationKey, string>;
