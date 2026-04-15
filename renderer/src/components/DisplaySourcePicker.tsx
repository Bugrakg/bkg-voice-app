import { CloseIcon, ScreenShareIcon } from "./icons/AppIcons";
import type { DisplaySource } from "../types";

type DisplaySourcePickerProps = {
  sources: DisplaySource[];
  isLoading: boolean;
  error: string;
  onClose: () => void;
  onSelect: (sourceId: string) => void | Promise<void>;
};

export function DisplaySourcePicker({
  sources,
  isLoading,
  error,
  onClose,
  onSelect
}: DisplaySourcePickerProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="display-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Ekran paylasimi kaynagi sec"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="display-picker__header">
          <div>
            <p className="eyebrow">Ekran Paylasimi</p>
            <h2>Ne paylasmak istiyorsun?</h2>
          </div>

          <button
            type="button"
            className="display-picker__close"
            onClick={onClose}
            aria-label="Kapat"
          >
            <CloseIcon />
          </button>
        </header>

        {isLoading ? (
          <div className="display-picker__state">
            <p>Kullanilabilir ekranlar ve pencereler yukleniyor...</p>
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="display-picker__state display-picker__state--error">
            <p>{error}</p>
          </div>
        ) : null}

        {!isLoading && !error ? (
          <div className="display-picker__grid">
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                className="display-picker__source"
                onClick={() => void onSelect(source.id)}
              >
                <div className="display-picker__preview">
                  {source.thumbnailDataUrl ? (
                    <img src={source.thumbnailDataUrl} alt={source.name} />
                  ) : (
                    <span className="display-picker__placeholder">
                      <ScreenShareIcon />
                    </span>
                  )}
                </div>

                <div className="display-picker__meta">
                  <div className="display-picker__title-row">
                    {source.appIconDataUrl ? (
                      <img
                        src={source.appIconDataUrl}
                        alt=""
                        className="display-picker__app-icon"
                      />
                    ) : null}
                    <strong>{source.name}</strong>
                  </div>
                  <span>{source.kind === "screen" ? "Tum ekran" : "Uygulama penceresi"}</span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
