import type { RoomUser } from "../types";
import { HeadphoneOffIcon, MicOffIcon, ScreenShareIcon } from "./icons/AppIcons";

type UserRowProps = {
  user: RoomUser;
  isSelf: boolean;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
  onJoinScreenShare?: () => void;
};

export function UserRow({
  user,
  isSelf,
  onContextMenu,
  onJoinScreenShare
}: UserRowProps) {
  const nameClassName = [
    "user-row__name",
    isSelf ? "user-row__name--self" : "",
    user.speaking ? "user-row__name--speaking" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={`user-row ${user.speaking ? "user-row--speaking" : ""}`}
      onContextMenu={onContextMenu}
    >
      <div className="user-row__main">
        <strong className={nameClassName}>{user.tag}</strong>
      </div>

      <div className="user-row__icons" aria-label="user status">
        {user.screenSharing ? (
          <span className="status-icon status-icon--screen" title="Yayin acik">
            <ScreenShareIcon />
          </span>
        ) : null}
        {user.screenSharing && onJoinScreenShare ? (
          <button
            type="button"
            className="user-row__join-screen"
            onClick={() => void onJoinScreenShare()}
          >
            Yayina Katil
          </button>
        ) : null}
        {!user.micEnabled ? (
          <span className="status-icon status-icon--off" title="Mikrofon kapali">
            <MicOffIcon />
          </span>
        ) : null}
        {!user.audioOutputEnabled ? (
          <span className="status-icon status-icon--off" title="Ses cikisi kapali">
            <HeadphoneOffIcon />
          </span>
        ) : null}
      </div>
    </article>
  );
}
