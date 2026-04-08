import type { RoomCounts, RoomMembers, RoomUser, VoiceMode } from "../types";
import { useEffect, useState } from "react";
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
  isPushToTalkActive: boolean;
  pushToTalkKey: string;
  voiceMode: VoiceMode;
  error: string;
  canOpenMicrophoneSettings: boolean;
  supportsOutputRouting: boolean;
  remoteUserVolumes: Record<string, number>;
  onJoinRoom: (room: string) => void | Promise<void>;
  onToggleMic: () => void | Promise<void>;
  onToggleOutput: () => void | Promise<void>;
  onOpenSettings: () => void;
  onOpenMicrophoneSettings: () => void | Promise<void>;
  onLeaveRoom: () => void | Promise<void>;
  onRemoteUserVolumeChange: (userId: string, volume: number) => void | Promise<void>;
  onToggleRemoteUserMute: (userId: string) => void | Promise<void>;
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
  isPushToTalkActive,
  pushToTalkKey,
  voiceMode,
  error,
  canOpenMicrophoneSettings,
  supportsOutputRouting,
  remoteUserVolumes,
  onJoinRoom,
  onToggleMic,
  onToggleOutput,
  onOpenSettings,
  onOpenMicrophoneSettings,
  onLeaveRoom,
  onRemoteUserVolumeChange,
  onToggleRemoteUserMute
}: VoiceSidebarProps) {
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`;
  const [appVersion, setAppVersion] = useState(window.voiceApp?.appVersion || "0.0.0");
  const [contextMenu, setContextMenu] = useState<{
    userId: string;
    tag: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu);
    };
  }, []);

  useEffect(() => {
    void window.voiceApp?.getAppVersion?.().then((version) => {
      if (version) {
        setAppVersion(version);
      }
    });
  }, []);

  return (
    <section className="sidebar sidebar--full">
      <div className="panel-heading">
        <div className="sidebar-brand">
          <div className="brand-mark brand-mark--sidebar" aria-hidden="true">
            <img src={logoSrc} alt="" className="brand-mark__image" />
          </div>
          <div className="sidebar-brand__text">
            <strong>BKG Voice App</strong>
            <p className="eyebrow">Odalar</p>
          </div>
        </div>
        {roomSummary ? <p className="muted sidebar-summary">{roomSummary}</p> : null}
      </div>

      <div className="room-list">
        {ROOMS.map((room) => {
          const displayedUsers = (currentRoomId === room ? connectedUsers : roomMembers[room] || [])
            .map((user) =>
              user.id === socketId
                ? {
                    ...user,
                    micEnabled: isMicEnabled,
                    audioOutputEnabled: isOutputEnabled
                  }
                : user
            );

          return (
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
                {displayedUsers.length > 0 ? (
                  displayedUsers.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      isSelf={user.id === socketId}
                      onContextMenu={
                        user.id === socketId
                          ? undefined
                          : (event) => {
                              event.preventDefault();
                              setContextMenu({
                                userId: user.id,
                                tag: user.tag,
                                x: event.clientX,
                                y: event.clientY
                              });
                            }
                      }
                    />
                  ))
                ) : (
                  <p className="room-members__empty">Bos</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-profile">
          <strong>{tag}</strong>
          <span className={voiceMode === "push-to-talk" && isPushToTalkActive ? "sidebar-profile__ptt" : ""}>
            {voiceMode === "push-to-talk"
              ? isPushToTalkActive
                ? "PTT aktif"
                : `Bas-Konuş: ${pushToTalkKey}`
              : currentRoomId || "Bagli degil"}
          </span>
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

      {error ? (
        <div className="error-panel">
          <p className="error-text">{error}</p>
          {canOpenMicrophoneSettings ? (
            <button
              type="button"
              className="control-button error-panel__button"
              onClick={() => void onOpenMicrophoneSettings()}
            >
              Mikrofon iznini ac
            </button>
          ) : null}
        </div>
      ) : null}
      {!supportsOutputRouting ? (
        <p className="muted help-text">
          Output device secimi bu platform/browser kombinasyonunda kisitli olabilir.
          Ses ac/kapat yine calisir.
        </p>
      ) : null}

      <p className="app-version">v{appVersion}</p>

      {contextMenu ? (
        <div
          className="user-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="user-context-menu__title">{contextMenu.tag}</p>
          <label className="user-context-menu__field">
            <span>
              Ses Duzeyi
              <strong className="user-context-menu__value">
                %{Math.round((remoteUserVolumes[contextMenu.userId] ?? 1) * 100)}
              </strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round((remoteUserVolumes[contextMenu.userId] ?? 1) * 100)}
              onChange={(event) =>
                void onRemoteUserVolumeChange(
                  contextMenu.userId,
                  Number(event.target.value) / 100
                )
              }
            />
          </label>
          <button
            type="button"
            className="user-context-menu__button"
            onClick={() => void onToggleRemoteUserMute(contextMenu.userId)}
          >
            {(remoteUserVolumes[contextMenu.userId] ?? 1) <= 0.001
              ? "Sesi Geri Ac"
              : "Sessize Al"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
