import type { useTranslations } from "next-intl";
import type { Labels } from "./ics";

/** The words used inside calendar files, from the app's messages. */
export function calendarLabels(
  t: ReturnType<typeof useTranslations<"Cal">>,
  te: ReturnType<typeof useTranslations<"Effort">>,
): Labels {
  return {
    group: t("group"),
    effort: t("effort"),
    pace: t("pace"),
    distance: t("distance"),
    madeWith: t("madeWith"),
    effortNames: {
      easy: te("easy"),
      comfortable: te("comfortable"),
      hard: te("hard"),
      all_out: te("all_out"),
    },
  };
}
