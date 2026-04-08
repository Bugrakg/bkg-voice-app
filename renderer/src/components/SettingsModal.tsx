import type { DeviceOption } from "../types";
import { CloseIcon } from "./icons/AppIcons";

type SettingsModalProps = {
  editableTag: string;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  inputDevices: DeviceOption[];
  outputDevices: DeviceOption[];
  supportsOutputRouting: boolean;
  isLocallySpeaking: boolean;
  onEditableTagChange: (value: string) => void;
  onClose: () => void;
  onSaveTag: () => void | Promise<void>;
  onChangeInput: (value: string) => void | Promise<void>;
  onChangeOutput: (value: string) => void | Promise<void>;
  onTestOutput: () => void | Promise<void>;
};

export function SettingsModal({
  editableTag,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  inputDevices,
  outputDevices,
  supportsOutputRouting,
  isLocallySpeaking,
  onEditableTagChange,
  onClose,
  onSaveTag,
  onChangeInput,
  onChangeOutput,
  onTestOutput
}: SettingsModalProps) {
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
        </div>
      </section>
    </div>
  );
}
