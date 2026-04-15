type ScreenSharePanelProps = {
  stream: MediaStream;
  ownerTag: string;
  isSelf: boolean;
  onStopSharing?: () => void | Promise<void>;
};

export function ScreenSharePanel({
  stream,
  ownerTag,
  isSelf,
  onStopSharing
}: ScreenSharePanelProps) {
  return (
    <aside className="screen-panel">
      <div className="screen-panel__header">
        <div>
          <p className="eyebrow">Ekran Paylasimi</p>
          <h2>{isSelf ? "Paylasimin Acik" : `${ownerTag} ekran paylasiyor`}</h2>
        </div>
        {isSelf ? (
          <button
            type="button"
            className="control-button control-button--danger"
            onClick={() => void onStopSharing?.()}
          >
            Paylasimi Durdur
          </button>
        ) : null}
      </div>

      <div className="screen-panel__surface">
        <video
          key={`${ownerTag}-${stream.id}`}
          className="screen-panel__video"
          autoPlay
          playsInline
          muted={isSelf}
          ref={(element) => {
            if (!element || element.srcObject === stream) {
              return;
            }

            element.srcObject = stream;
          }}
        />
      </div>
    </aside>
  );
}
