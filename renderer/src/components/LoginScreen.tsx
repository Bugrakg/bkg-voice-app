import type { FormEvent } from "react";

type LoginScreenProps = {
  loginTag: string;
  error: string;
  serverUrl: string;
  onTagChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export function LoginScreen({
  loginTag,
  error,
  serverUrl,
  onTagChange,
  onSubmit
}: LoginScreenProps) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Minimal Voice Room</p>
        <h1>Arkadas grubunuz icin sade sesli oda</h1>
        <p className="muted">
          Ilk surum sadece tag ve ses odakli. Kayit, mesajlasma ve ekstra paneller yok.
        </p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="tag-input">Tag</label>
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
        <p className="muted auth-footnote">Server: {serverUrl}</p>
      </section>
    </main>
  );
}
