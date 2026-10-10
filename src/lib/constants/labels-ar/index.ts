import type { AppLabels } from "@/lib/constants/labels";

import { AR_PART1 } from "./part1";
import { AR_PART2 } from "./part2";
import { AR_PART3 } from "./part3";
import { AR_PART4 } from "./part4";
import { AR_PART5 } from "./part5";
import { AR_PART6 } from "./part6";
import { AR_PART7 } from "./part7";
import { AR_PART8 } from "./part8";
import { AR_PART9 } from "./part9";

/** Libellés arabes (arabe standard) : même structure que les libellés français (vérifiée à la compilation). */
export const TEXTS_AR: AppLabels = {
  ...AR_PART1,
  ...AR_PART2,
  ...AR_PART3,
  ...AR_PART4,
  ...AR_PART5,
  ...AR_PART6,
  ...AR_PART7,
  ...AR_PART8,
  ...AR_PART9,
};
