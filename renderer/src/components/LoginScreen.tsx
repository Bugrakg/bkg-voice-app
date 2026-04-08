import type { FormEvent } from "react";

type LoginScreenProps = {
  loginTag: string;
  error: string;
  onTagChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export function LoginScreen({
  loginTag,
  error,
  onTagChange,
  onSubmit
}: LoginScreenProps) {
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-hero">
          <div className="brand-mark brand-mark--hero" aria-hidden="true">
            <img src={logoSrc} alt="" className="brand-mark__image" />
          </div>
        </div>
        <p className="auth-brand-name">BKG Voice App</p>
        <h1>Gardaslarim icin sesli oda hayrati</h1>
        <p className="muted">
          Ilk surum sadece tag ve ses odakli. Kayit, mesajlasma ve ekstra paneller yok.
        </p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="tag-input">Kullanici Adi</label>
          <input
            id="tag-input"
            autoFocus
            maxLength={24}
            value={loginTag}
            onChange={(event) => onTagChange(event.target.value)}
            placeholder="ornek: bugra"
          />
          <button type="submit">Gir</button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
