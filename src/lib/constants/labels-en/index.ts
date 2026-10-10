import type { AppLabels } from "@/lib/constants/labels";

import { EN_PART1 } from "./part1";
import { EN_PART2 } from "./part2";
import { EN_PART3 } from "./part3";
import { EN_PART4 } from "./part4";
import { EN_PART5 } from "./part5";
import { EN_PART6 } from "./part6";
import { EN_PART7 } from "./part7";
import { EN_PART8 } from "./part8";
import { EN_PART9 } from "./part9";

/** Libellés anglais : même structure que les libellés français (vérifiée à la compilation). */
export const TEXTS_EN: AppLabels = {
  ...EN_PART1,
  ...EN_PART2,
  ...EN_PART3,
  ...EN_PART4,
  ...EN_PART5,
  ...EN_PART6,
  ...EN_PART7,
  ...EN_PART8,
  ...EN_PART9,
};
