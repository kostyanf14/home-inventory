import { FormEvent, useState } from "react";
import { Archive, ArrowRight, House } from "lucide-react";

import { apiUrl, readError } from "../api";
import type { TokenPair } from "../auth";
import type { AuthMode } from "../types";
import { useTranslation } from "../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

type WelcomeProps = {
  authOpen: boolean;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  onStart: () => void;
  onClose: () => void;
  onAuthenticated: (tokens: TokenPair) => void;
};

export function Welcome({
  authOpen,
  mode,
  setMode,
  onStart,
  onClose,
  onAuthenticated,
}: WelcomeProps) {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));

    setBusy(true);
    setError("");

    try {
      if (mode === "register") {
        const register = await fetch(apiUrl("/auth/register"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: data.get("name") }),
        });

        if (!register.ok) {
          throw new Error(await readError(register, t("unableToRegister")));
        }
      }

      const form = new URLSearchParams({ username: email, password });
      const login = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });

      if (!login.ok) {
        throw new Error(login.status === 429 ? t("tooManyAttempts") : t("incorrectCredentials"));
      }

      onAuthenticated((await login.json()) as TokenPair);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("unableToConnect"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="welcome">
      <header className="welcome-nav">
        <a className="brand" href="#top">
          <span className="brand-mark">
            <Archive size={22} />
          </span>
          <span>Storied</span>
        </a>
        <div className="welcome-actions">
          <LanguageSwitcher />
          <button className="text-button" onClick={onStart}>
            {t("signIn")} <ArrowRight size={17} />
          </button>
        </div>
      </header>
      <section className="welcome-content">
        <p className="eyebrow">{t("calmerWay")}</p>
        <h1>
          {t("knowWhat")}
          <br />
          <em>{t("knowWhere")}</em>
        </h1>
        <p className="intro">{t("welcomeIntro")}</p>
        <ul className="welcome-pills">
          <li>{t("medicines")}</li>
          <li>{t("food")}</li>
          <li>{t("equipment")}</li>
          <li>{t("scanLookup")}</li>
        </ul>
        <button className="welcome-cta" onClick={onStart}>
          {t("startInventory")} <ArrowRight size={18} />
        </button>
        <div className="welcome-index">
          <span>01</span>
          <span>{t("inventoryWithIntention")}</span>
        </div>
      </section>
      <div className="paper-stack">
        <div className="label-card">
          <span>HOME / 01</span>
          <strong>{t("aPlaceForEverything")}</strong>
          <i />
        </div>
        <div className="object-card">
          <House size={82} strokeWidth={1.2} />
        </div>
      </div>
      {authOpen && (
        <div className="modal-backdrop">
          <form className="auth-card" onSubmit={submit}>
            <button className="close" type="button" aria-label={t("closeSignIn")} onClick={onClose}>
              x
            </button>
            <p className="eyebrow">{t("privateInventory")}</p>
            <h2>{mode === "login" ? t("welcomeBack") : t("createAccount")}</h2>
            {mode === "register" && (
              <label>
                {t("name")}
                <input name="name" required />
              </label>
            )}
            <label>
              {t("email")}
              <input name="email" type="email" required />
            </label>
            <label>
              {t("password")}
              <input
                name="password"
                type="password"
                minLength={8}
                maxLength={72}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
              {mode === "register" && <small>{t("passwordHint")}</small>}
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-action" disabled={busy}>
              {busy ? t("working") : mode === "login" ? t("signIn") : t("createAccount")}
            </button>
            <button
              className="switch-auth"
              type="button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? t("needAccount") : t("alreadyRegistered")}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
