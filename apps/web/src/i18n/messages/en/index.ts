import { foods } from "./foods";
import { inventory } from "./inventory";
import { items } from "./items";
import { locations } from "./locations";
import { medicines } from "./medicines";
import { shared } from "./shared";
import { welcome } from "./welcome";

export const enMessages = {
  ...shared,
  ...inventory,
  ...items,
  ...locations,
  ...medicines,
  ...foods,
  ...welcome,
};

export type TranslationKey = keyof typeof enMessages;
export type MessageCatalog = Record<TranslationKey, string>;
