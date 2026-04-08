import type { RoomCounts, RoomMembers, RoomUser } from "../types";
import { IconButton } from "./IconButton";
import {
  ExitIcon,
  HeadphoneIcon,
  HeadphoneOffIcon,
  MicIcon,
  MicOffIcon,
  SettingsIcon
} from "./icons/AppIcons";
import { UserRow } from "./UserRow";
import { ROOMS } from "../constants";

type VoiceSidebarProps = {
  roomSummary: string;
  currentRoomId: string | null;
  connectedUsers: RoomUser[];
  roomCounts: RoomCounts;
  roomMembers: RoomMembers;
  socketId: string;
  isJoining: boolean;
  tag: string;
  isMicEnabled: boolean;
  isOutputEnabled: boolean;
  error: string;
  supportsOutputRouting: boolean;
  onJoinRoom: (room: string) => void | Promise<void>;
  onToggleMic: () => void | Promise<void>;
  onToggleOutput: () => void | Promise<void>;
  onOpenSettings: () => void;
  onLeaveRoom: () => void | Promise<void>;
};

export function VoiceSidebar({
  roomSummary,
  currentRoomId,
  connectedUsers,
  roomCounts,
  roomMembers,
  socketId,
  isJoining,
  tag,
  isMicEnabled,
  isOutputEnabled,
  error,
  supportsOutputRouting,
  onJoinRoom,
  onToggleMic,
  onToggleOutput,
  onOpenSettings,
  onLeaveRoom
}: VoiceSidebarProps) {
  return (
    <section className="sidebar sidebar--full">
      <div className="panel-heading">
        <div className="sidebar-brand">
          <div className="brand-mark brand-mark--sidebar" aria-hidden="true">
            <div className="brand-mark__glyph">B</div>
          </div>
          <div className="sidebar-brand__text">
            <strong>BKG Voice App</strong>
            <p className="eyebrow">Odalar</p>
          </div>
        </div>
        {roomSummary ? <p className="muted sidebar-summary">{roomSummary}</p> : null}
      </div>

      <div className="room-list">
        {ROOMS.map((room) => (
          <section
            key={room}
            className={`room-group ${currentRoomId === room ? "room-group--active" : ""}`}
          >
            <button
              type="button"
              className={`room-button ${currentRoomId === room ? "room-button--active" : ""}`}
              onClick={() => void onJoinRoom(room)}
              disabled={isJoining}
            >
              <span>{room}</span>
              <small>{roomCounts[room] ?? 0}</small>
            </button>

            <div className="room-members">
              {(roomMembers[room] || []).length > 0 ? (
                (roomMembers[room] || []).map((user) => (
                  <UserRow key={user.id} user={user} isSelf={user.id === socketId} />
                ))
              ) : (
                <p className="room-members__empty">Bos</p>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-profile">
          <strong>{tag}</strong>
          <span>{currentRoomId || "Bagli degil"}</span>
        </div>

        <div className="sidebar-actions">
          <IconButton
            label={isMicEnabled ? "Mikrofonu kapat" : "Mikrofonu ac"}
            onClick={onToggleMic}
            danger={!isMicEnabled}
          >
            {isMicEnabled ? <MicIcon /> : <MicOffIcon />}
          </IconButton>

          <IconButton
            label={isOutputEnabled ? "Sesi kapat" : "Sesi ac"}
            onClick={onToggleOutput}
            danger={!isOutputEnabled}
          >
            {isOutputEnabled ? <HeadphoneIcon /> : <HeadphoneOffIcon />}
          </IconButton>

          <IconButton label="Ayarlar" onClick={onOpenSettings}>
            <SettingsIcon />
          </IconButton>

          <IconButton
            label="Odadan ayril"
            onClick={onLeaveRoom}
            danger
            disabled={!currentRoomId}
          >
            <ExitIcon />
          </IconButton>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {!supportsOutputRouting ? (
        <p className="muted help-text">
          Output device secimi bu platform/browser kombinasyonunda kisitli olabilir.
          Ses ac/kapat yine calisir.
        </p>
      ) : null}
    </section>
  );
}
