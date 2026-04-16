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
  const groupedSources = useMemo(
    () => ({
      screen: sources.filter((source) => source.kind === "screen"),
      window: sources.filter((source) => source.kind === "window")
    }),
    [sources]
  );
  const [activeTab, setActiveTab] = useState<"screen" | "window">("screen");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const preferredTab =
      groupedSources.screen.length > 0
        ? "screen"
        : groupedSources.window.length > 0
          ? "window"
          : "screen";
    const preferredSource =
      groupedSources[preferredTab][0] ||
      groupedSources.screen[0] ||
      groupedSources.window[0] ||
      null;

    setActiveTab(preferredTab);
    setSelectedSourceId(preferredSource?.id || "");
  }, [groupedSources]);

  const visibleSources = groupedSources[activeTab];
  const selectedSource = sources.find((source) => source.id === selectedSourceId) || null;

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
            <div className="display-picker__tabs" role="tablist" aria-label="Paylasim tipi">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "screen"}
                className={`display-picker__tab ${
                  activeTab === "screen" ? "display-picker__tab--active" : ""
                }`}
                onClick={() => setActiveTab("screen")}
              >
                Ekranlar
                <span>{groupedSources.screen.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "window"}
                className={`display-picker__tab ${
                  activeTab === "window" ? "display-picker__tab--active" : ""
                }`}
                onClick={() => setActiveTab("window")}
              >
                Pencereler
                <span>{groupedSources.window.length}</span>
              </button>
            </div>

            <div className="display-picker__grid">
              {visibleSources.length > 0 ? (
                visibleSources.map((source) => (
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
                  <p>
                    {activeTab === "screen"
                      ? "Paylasilabilir ekran bulunamadi."
                      : "Paylasilabilir pencere bulunamadi."}
                  </p>
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
