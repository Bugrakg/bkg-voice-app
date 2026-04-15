import type { DeviceOption, VoiceMode } from "../types";
import { useEffect, useState } from "react";
import { CloseIcon } from "./icons/AppIcons";

type SettingsModalProps = {
  editableTag: string;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  inputDevices: DeviceOption[];
  outputDevices: DeviceOption[];
  inputSensitivity: number;
  supportsOutputRouting: boolean;
  isLocallySpeaking: boolean;
  isPushToTalkActive: boolean;
  diagnostics: string[];
  pushToTalkKey: string;
  socketError: string;
  socketStatus: string;
  voiceMode: VoiceMode;
  onEditableTagChange: (value: string) => void;
  onClose: () => void;
  onSaveTag: () => void | Promise<void>;
  onChangeInput: (value: string) => void | Promise<void>;
  onChangeOutput: (value: string) => void | Promise<void>;
  onTestOutput: () => void | Promise<void>;
  onChangeVoiceMode: (value: VoiceMode) => void;
  onChangePushToTalkKey: (value: string) => void;
  onChangeInputSensitivity: (value: number) => void;
};

function keyboardEventToShortcut(event: KeyboardEvent) {
  const shortcutMap = {
    Space: "Space",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/"
  };

  if (event.code.startsWith("Key")) {
    return event.code.replace("Key", "");
  }

  if (event.code.startsWith("Digit")) {
    return event.code.replace("Digit", "");
  }

  if (event.code.startsWith("F")) {
    return event.code;
  }

  return shortcutMap[event.code as keyof typeof shortcutMap] || "";
}

export function SettingsModal({
  editableTag,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  inputDevices,
  outputDevices,
  inputSensitivity,
  supportsOutputRouting,
  isLocallySpeaking,
  isPushToTalkActive,
  diagnostics,
  pushToTalkKey,
  socketError,
  socketStatus,
  voiceMode,
  onEditableTagChange,
  onClose,
  onSaveTag,
  onChangeInput,
  onChangeOutput,
  onTestOutput,
  onChangeVoiceMode,
  onChangePushToTalkKey,
  onChangeInputSensitivity
}: SettingsModalProps) {
  const [isListeningForShortcut, setIsListeningForShortcut] = useState(false);

  useEffect(() => {
    if (!isListeningForShortcut) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();

      if (event.key === "Escape") {
        setIsListeningForShortcut(false);
        return;
      }

      const shortcut = keyboardEventToShortcut(event);
      if (!shortcut) {
        return;
      }

      onChangePushToTalkKey(shortcut);
      setIsListeningForShortcut(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isListeningForShortcut, onChangePushToTalkKey]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Ses ayarlari"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal__header">
          <div>
            <p className="eyebrow">Ayarlar</p>
            <h2>Ses ve profil</h2>
          </div>
          <button
            type="button"
            className="modal-close modal-close--icon"
            onClick={onClose}
            aria-label="Ayarlar penceresini kapat"
            title="Kapat"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="settings-grid">
          <label className="settings-field">
            <span>Kullanici Adi</span>
            <div className="settings-inline">
              <input
                maxLength={24}
                value={editableTag}
                onChange={(event) => onEditableTagChange(event.target.value)}
                placeholder="Kullanici adini guncelle"
              />
              <button type="button" className="control-button" onClick={() => void onSaveTag()}>
                Kaydet
              </button>
            </div>
          </label>

          <label className="settings-field">
            <span>Input device</span>
            <select
              value={selectedInputDeviceId}
              onChange={(event) => void onChangeInput(event.target.value)}
            >
              <option value="">Varsayilan mikrofon</option>
              {inputDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>Output device</span>
            <select
              value={selectedOutputDeviceId}
              onChange={(event) => void onChangeOutput(event.target.value)}
              disabled={!supportsOutputRouting}
            >
              <option value="">Varsayilan cikis</option>
              {outputDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>

          <section className="settings-field">
            <span>Giris Hassasiyeti</span>
            <div className="settings-slider">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={inputSensitivity}
                onChange={(event) => onChangeInputSensitivity(Number(event.target.value))}
              />
              <strong>%{inputSensitivity}</strong>
            </div>
            <p className="muted settings-note">
              Dusuk seviyedeki nefes ve klavye seslerini bastirmak icin mikrofon esigini
              yukseltebilirsin. `0` kapali, yuksek deger daha sert filtre demek.
            </p>
          </section>

          <section className="settings-field">
            <span>Konusma Modu</span>
            <div className="voice-mode-options">
              <button
                type="button"
                className={`voice-mode-card ${voiceMode === "open-mic" ? "voice-mode-card--active" : ""}`}
                onClick={() => onChangeVoiceMode("open-mic")}
              >
                <span className="voice-mode-card__radio" aria-hidden="true" />
                <span className="voice-mode-card__content">
                  <strong>Surekli Acik</strong>
                  <small>Mikrofon aciksa ses her zaman iletilir.</small>
                </span>
              </button>

              <button
                type="button"
                className={`voice-mode-card ${voiceMode === "push-to-talk" ? "voice-mode-card--active" : ""}`}
                onClick={() => onChangeVoiceMode("push-to-talk")}
              >
                <span className="voice-mode-card__radio" aria-hidden="true" />
                <span className="voice-mode-card__content">
                  <strong>Bas-Konuş</strong>
                  <small>Secilen tusa basili tuttugun surece mikrofon iletilir.</small>
                </span>
              </button>
            </div>

            {voiceMode === "push-to-talk" ? (
              <div className="push-to-talk-picker">
                <span>Bas-Konuş Tusu</span>
                <button
                  type="button"
                  className={`push-to-talk-button ${isListeningForShortcut ? "push-to-talk-button--listening" : ""}`}
                  onClick={() => setIsListeningForShortcut(true)}
                >
                  {isListeningForShortcut ? "Tusa bas..." : pushToTalkKey}
                </button>
                <small className={`push-to-talk-status ${isPushToTalkActive ? "push-to-talk-status--active" : ""}`}>
                  {isPushToTalkActive ? "PTT aktif" : "PTT beklemede"}
                </small>
              </div>
            ) : null}
            <p className="muted settings-note">
              Uygulama arka plandayken de secilen tusa basili tuttugun surece mikrofon acik kalir.
            </p>
          </section>

          <section className="settings-test">
            <div>
              <span>Mic test</span>
              <p className="muted">Konustugunda algilama durumu burada gorunur.</p>
            </div>
            <div className={`mic-meter ${isLocallySpeaking ? "mic-meter--active" : ""}`}>
              <div className="mic-meter__bar" />
              <strong>{isLocallySpeaking ? "Konusma algilandi" : "Bekleniyor"}</strong>
            </div>
          </section>

          <section className="settings-test">
            <div>
              <span>Output test</span>
              <p className="muted">Secili cikis cihazinda kisa bir test tonu oynatir.</p>
            </div>
            <button type="button" className="control-button" onClick={() => void onTestOutput()}>
              Test Sesi Cal
            </button>
          </section>

          <section className="settings-test">
            <div>
              <span>Tani Bilgileri</span>
              <p className="muted">Socket durumu ve son uygulama loglari burada gorunur.</p>
            </div>
            <div className="diagnostics-panel">
              <div className="diagnostics-panel__meta">
                <strong>Socket: {socketStatus}</strong>
                {socketError ? <span>{socketError}</span> : null}
              </div>
              <pre className="diagnostics-panel__log">
                {diagnostics.length > 0 ? diagnostics.join("\n") : "Henuz tani logu yok."}
              </pre>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
