import { LoaderCircle, PackagePlus } from "lucide-react";
import { useTranslation } from "../i18n";

export function Loading() {
  const { t } = useTranslation();

  return (
    <div className="loading">
      <LoaderCircle size={24} /> {t("loadingInventory")}
    </div>
  );
}

type EmptyProps = {
  title: string;
  detail: string;
};

export function Empty({ title, detail }: EmptyProps) {
  return (
    <div className="empty">
      <PackagePlus size={30} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
