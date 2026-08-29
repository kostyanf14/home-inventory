import type { MessageCatalog } from "../en";

import { inventory } from "./inventory";
import { locations } from "./locations";
import { shared } from "./shared";
import { welcome } from "./welcome";

export const uaMessages = {
  ...shared,
  ...inventory,
  ...locations,
  ...welcome,
} satisfies MessageCatalog;
