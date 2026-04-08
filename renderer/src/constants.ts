export const ROOMS = ["Genel", "Oyun", "Muzik", "AFK"] as const;
export const STORAGE_KEYS = {
  tag: "voice-app-tag",
  inputDeviceId: "voice-app-input-device-id",
  outputDeviceId: "voice-app-output-device-id",
  remoteVolumePrefix: "voice-app-remote-volume",
  remoteVolumeBackupPrefix: "voice-app-remote-volume-backup"
} as const;

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

export const SPEAKING_THRESHOLD = 0.035;
