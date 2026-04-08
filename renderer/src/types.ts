export type RoomName = "Genel" | "Oyun" | "Muzik" | "AFK";

export type RoomUser = {
  id: string;
  tag: string;
  roomId: string | null;
  micEnabled: boolean;
  audioOutputEnabled: boolean;
  speaking: boolean;
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
      versions: {
        chrome: string;
        electron: string;
        node: string;
      };
    };
  }
}

export {};
