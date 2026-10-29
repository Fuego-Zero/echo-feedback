import brandMark from "../../../assets/brand/echo-mark.svg";
import { useI18n } from "./LanguageProvider.js";

export default function Brand() {
  const { t } = useI18n();
  return (
    <span className="brand">
      <img alt="" className="brand-mark" height="40" src={brandMark} width="40" aria-hidden="true" />
      <span>
        {t("brand.name")}
        <small>ECHO FEEDBACK</small>
      </span>
    </span>
  );
}
