export type RoomName = "Genel" | "Oyun" | "Muzik" | "AFK";

export type RoomUser = {
  id: string;
  tag: string;
  roomId: string | null;
  micEnabled: boolean;
  audioOutputEnabled: boolean;
  speaking: boolean;
  screenSharing: boolean;
};

export type DeviceOption = {
  deviceId: string;
  label: string;
};

export type RoomCounts = Record<string, number>;
export type RoomMembers = Record<string, RoomUser[]>;

export type RoomPresenceEvent = {
  user: {
    id: string;
    tag: string;
    roomId: string;
  };
  roomId: string;
  reason?: "leave" | "disconnect" | "switch";
};

export type VoiceMode = "open-mic" | "push-to-talk";
export type ScreenShareQuality = "auto" | "480p" | "720p";
export type SocketStatus = "idle" | "connecting" | "connected" | "error";
export type ChatMessage = {
  id: string;
  tag: string;
  text: string;
  createdAt: number;
};

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export type UpdaterState = {
  visible: boolean;
  status: UpdaterStatus;
  title: string;
  detail: string;
  progressPercent: number;
  bytesPerSecond: number;
  version: string;
};

export type DisplaySource = {
  id: string;
  name: string;
  kind: "screen" | "window";
  thumbnailDataUrl: string;
  appIconDataUrl: string;
};

declare global {
  interface Window {
    voiceApp?: {
      debugPtt: boolean;
      platform: string;
      nodeEnv: string;
      appVersion: string;
      serverUrl: string;
      onPushToTalkDown?: (callback: () => void) => () => void;
      onPushToTalkUp?: (callback: () => void) => () => void;
      setPushToTalkShortcut?: (shortcut: string) => Promise<{
        ok: boolean;
        shortcut: string;
      }>;
      openMicrophonePrivacySettings?: () => Promise<boolean>;
      getAppVersion?: () => Promise<string>;
      getUpdaterState?: () => Promise<UpdaterState>;
      onUpdaterState?: (callback: (state: UpdaterState) => void) => () => void;
      openExternalUrl?: (url: string) => Promise<boolean>;
      listDisplaySources?: () => Promise<DisplaySource[]>;
      selectDisplaySource?: (sourceId: string) => Promise<boolean>;
      onPushToTalkDebug?: (callback: (message: string) => void) => () => void;
      logPtt?: (message: string, extra?: unknown) => Promise<boolean>;
      getPttLogPath?: () => Promise<string>;
      getPushToTalkState?: () => Promise<{
        pressed: boolean;
        shortcut: string;
      }>;
      versions: {
        chrome: string;
        electron: string;
        node: string;
      };
    };
  }
}

export {};
