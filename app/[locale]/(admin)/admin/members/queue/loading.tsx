import {getTranslations} from "next-intl/server";
export default async function ApplicationQueueLoading() {
  const t = await getTranslations("Admin.applicationQueue");
  return <p aria-live="polite" role="status">{t("loading")}</p>;
}
