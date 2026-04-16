import { useEffect, useRef, useState } from "react";
import {
  ExitIcon,
  FullscreenIcon,
  SharedAudioIcon,
  SharedAudioOffIcon
} from "./icons/AppIcons";

type ScreenSharePanelProps = {
  stream: MediaStream;
  ownerTag: string;
  isSelf: boolean;
  onLeaveView?: () => void;
};

export function ScreenSharePanel({
  stream,
  ownerTag,
  isSelf,
  onLeaveView
}: ScreenSharePanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [screenVolume, setScreenVolume] = useState(100);
  const [previousVolume, setPreviousVolume] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hasAudioTrack = stream.getAudioTracks().length > 0;

  useEffect(() => {
    const element = videoRef.current;
    if (!element || element.srcObject === stream) {
      return;
    }

    element.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    element.volume = isSelf ? 0 : screenVolume / 100;
    element.muted = isSelf || screenVolume === 0;
  }, [isSelf, screenVolume, stream]);

  useEffect(() => {
    const updateFullscreenState = () => {
      const target = surfaceRef.current;
      setIsFullscreen(Boolean(target && document.fullscreenElement === target));
    };

    document.addEventListener("fullscreenchange", updateFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
    };
  }, []);

  const toggleScreenAudio = () => {
    if (screenVolume === 0) {
      setScreenVolume(previousVolume > 0 ? previousVolume : 100);
      return;
    }

    setPreviousVolume(screenVolume);
    setScreenVolume(0);
  };

  const toggleFullscreen = async () => {
    const target = surfaceRef.current;
    if (!target) {
      return;
    }

    if (document.fullscreenElement === target) {
      await document.exitFullscreen?.();
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    }

    await target.requestFullscreen?.({ navigationUI: "hide" }).catch(async () => {
      await target.requestFullscreen?.();
    });
  };

  return (
    <aside className="screen-panel">
      {!isSelf ? (
        <div className="screen-panel__header">
          <div>
            <p className="eyebrow">Ekran Paylasimi</p>
            <h2>{`${ownerTag} ekran paylasiyor`}</h2>
          </div>
        </div>
      ) : null}

      <div
        className={`screen-panel__surface ${
          isFullscreen ? "screen-panel__surface--fullscreen" : ""
        }`}
        ref={surfaceRef}
      >
        <video
          key={`${ownerTag}-${stream.id}`}
          ref={videoRef}
          className="screen-panel__video"
          autoPlay
          playsInline
          muted={isSelf}
          onDoubleClick={() => void toggleFullscreen()}
        />

        {!isSelf ? (
          <div className="screen-panel__controls">
            <button
              type="button"
              className="screen-panel__control-button"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? "Tam ekrandan cik" : "Tam ekran"}
              title={isFullscreen ? "Tam ekrandan cik" : "Tam ekran"}
            >
              <FullscreenIcon />
            </button>

            <div
              className={`screen-panel__audio ${!hasAudioTrack ? "screen-panel__audio--disabled" : ""}`}
            >
              <button
                type="button"
                className="screen-panel__control-button"
                onClick={toggleScreenAudio}
                aria-label={screenVolume === 0 ? "Yayin sesini ac" : "Yayin sesini kapat"}
                title={screenVolume === 0 ? "Yayin sesini ac" : "Yayin sesini kapat"}
                disabled={!hasAudioTrack}
              >
                {screenVolume === 0 || !hasAudioTrack ? (
                  <SharedAudioOffIcon />
                ) : (
                  <SharedAudioIcon />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={screenVolume}
                disabled={!hasAudioTrack}
                onChange={(event) => setScreenVolume(Number(event.target.value))}
                aria-label="Yayin sesi"
                title={hasAudioTrack ? `Yayin sesi %${screenVolume}` : "Bu yayinda ses yok"}
              />
            </div>

            <button
              type="button"
              className="screen-panel__control-button screen-panel__control-button--danger"
              onClick={() => void onLeaveView?.()}
              aria-label="Yayindan ayril"
              title="Yayindan ayril"
            >
              <ExitIcon />
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
