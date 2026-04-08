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

declare global {
  interface HTMLMediaElement {
    setSinkId?: (sinkId: string) => Promise<void>;
  }

  interface Window {
    voiceApp?: {
    platform: string;
    nodeEnv: string;
    serverUrl: string;
    versions: {
      chrome: string;
        electron: string;
        node: string;
      };
    };
  }
}

export {};
