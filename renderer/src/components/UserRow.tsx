import type { RoomUser } from "../types";
import { HeadphoneOffIcon, MicOffIcon } from "./icons/AppIcons";

type UserRowProps = {
  user: RoomUser;
  isSelf: boolean;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
};

export function UserRow({ user, isSelf, onContextMenu }: UserRowProps) {
  return (
    <article
      className={`user-row ${user.speaking ? "user-row--speaking" : ""}`}
      onContextMenu={onContextMenu}
    >
      <div className="user-row__main">
        <strong>{user.tag}</strong>
        {isSelf ? <span className="pill">Siz</span> : null}
      </div>

      <div className="user-row__icons" aria-label="user status">
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
