import { useEffect, useMemo, useState } from "react";
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
  const screenSources = useMemo(
    () => sources.filter((source) => source.kind === "screen"),
    [sources]
  );
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedSourceId(screenSources[0]?.id || "");
  }, [screenSources]);

  const selectedSource =
    screenSources.find((source) => source.id === selectedSourceId) || null;

  const handleShare = async () => {
    if (!selectedSource || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSelect(selectedSource.id);
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <div className="display-picker__layout">
            <p className="display-picker__hint">
              Tam ekran oyun paylasmak icin monitor secmek en guvenli yoldur.
            </p>

            <div className="display-picker__grid">
              {screenSources.length > 0 ? (
                screenSources.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className={`display-picker__source ${
                      source.id === selectedSource?.id
                        ? "display-picker__source--selected"
                        : ""
                    }`}
                    onClick={() => setSelectedSourceId(source.id)}
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
                      <span>
                        {source.kind === "screen" ? "Tum ekran" : "Uygulama penceresi"}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="display-picker__state">
                  <p>Paylasilabilir ekran bulunamadi.</p>
                </div>
              )}
            </div>

            <div className="display-picker__actions display-picker__actions--footer">
              <button
                type="button"
                className="control-button control-button--ghost"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Vazgec
              </button>
              <button
                type="button"
                className={`control-button display-picker__submit ${
                  selectedSource ? "display-picker__submit--ready" : ""
                }`}
                onClick={() => void handleShare()}
                disabled={!selectedSource || isSubmitting}
              >
                {isSubmitting ? "Hazirlaniyor..." : "Ekran Paylas"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
