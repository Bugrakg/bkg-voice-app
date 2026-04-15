export const ROOMS = ["Genel", "Oyun", "Muzik", "AFK"] as const;
export const STORAGE_KEYS = {
  clientId: "voice-app-client-id",
  tag: "voice-app-tag",
  inputDeviceId: "voice-app-input-device-id",
  inputSensitivity: "voice-app-input-sensitivity",
  outputDeviceId: "voice-app-output-device-id",
  remoteVolumePrefix: "voice-app-remote-volume",
  remoteVolumeBackupPrefix: "voice-app-remote-volume-backup",
  voiceMode: "voice-app-voice-mode",
  pushToTalkKey: "voice-app-push-to-talk-key"
} as const;

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: "stun:stun.l.google.com:19302"
  }
];

export const SPEAKING_THRESHOLD = 0.035;
