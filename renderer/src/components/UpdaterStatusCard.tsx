import type { UpdaterState } from "../types";
import {
  BadgeCheck,
  Download,
  LoaderCircle,
  RefreshCw,
  TriangleAlert
} from "lucide-react";

type UpdaterStatusCardProps = {
  state: UpdaterState;
};

function formatSpeed(bytesPerSecond: number) {
  if (!bytesPerSecond) {
    return "";
  }

  const kilobytes = bytesPerSecond / 1024;
  if (kilobytes < 1024) {
    return `${Math.round(kilobytes)} KB/sn`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB/sn`;
}

function getStatusIcon(status: UpdaterState["status"]) {
  if (status === "checking") {
    return <RefreshCw className="updater-card__icon updater-card__icon--spin" />;
  }

  if (status === "available" || status === "downloading") {
    return <Download className="updater-card__icon" />;
  }

  if (status === "downloaded") {
    return <BadgeCheck className="updater-card__icon" />;
  }

  if (status === "error") {
    return <TriangleAlert className="updater-card__icon" />;
  }

  return <LoaderCircle className="updater-card__icon updater-card__icon--spin" />;
}

export function UpdaterStatusCard({ state }: UpdaterStatusCardProps) {
  if (!state.visible) {
    return null;
  }

  return (
    <aside className={`updater-card updater-card--${state.status}`}>
      <div className="updater-card__header">
        <span className="updater-card__badge">BKG Voice App</span>
        {getStatusIcon(state.status)}
      </div>

      <div className="updater-card__content">
        <strong>{state.title}</strong>
        <p>{state.detail}</p>
      </div>

      {state.status === "downloading" ? (
        <div className="updater-card__progress">
          <div className="updater-card__progress-meta">
            <span>%{state.progressPercent}</span>
            <span>{formatSpeed(state.bytesPerSecond)}</span>
          </div>
          <div className="updater-card__progress-track">
            <div
              className="updater-card__progress-fill"
              style={{ width: `${state.progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}

      {state.status === "downloaded" ? (
        <p className="updater-card__hint">
          Indirme tamamlandi. Acilan pencereden ne zaman guncelleyecegini secebilirsin.
        </p>
      ) : null}
    </aside>
  );
}
