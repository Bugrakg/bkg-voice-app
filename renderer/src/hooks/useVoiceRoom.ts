import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { ROOMS, RTC_CONFIG, STORAGE_KEYS } from "../constants";
import { createSpeakingMonitor } from "../lib/audio";
import { getSignalingServerUrl } from "../lib/config";
import type {
  DeviceOption,
  RoomCounts,
  RoomMembers,
  RoomPresenceEvent,
  RoomUser,
  SocketStatus,
  VoiceMode
} from "../types";

type PeerMap = Map<string, RTCPeerConnection>;
type AudioMap = Map<string, HTMLAudioElement>;

function createInitialRoomCounts() {
  return ROOMS.reduce<RoomCounts>((counts, roomId) => {
    counts[roomId] = 0;
    return counts;
  }, {});
}

function createInitialRoomMembers() {
  return ROOMS.reduce<RoomMembers>((rooms, roomId) => {
    rooms[roomId] = [];
    return rooms;
  }, {});
}

function getStoredValue(key: string) {
  return window.localStorage.getItem(key) || "";
}

function readLabel(device: MediaDeviceInfo, fallback: string) {
  return device.label || `${fallback} ${device.deviceId.slice(0, 4)}`;
}

function hasDevice(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceKind,
  deviceId: string
) {
  return devices.some(
    (device) => device.kind === kind && device.deviceId === deviceId
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

function logPtt(message: string, extra?: unknown) {
  if (!window.voiceApp?.debugPtt) {
    return;
  }

  if (typeof extra === "undefined") {
    console.log(`[ptt] ${message}`);
    return;
  }

  console.log(`[ptt] ${message}`, extra);
}

function getAppliedRemoteVolume(volume: number) {
  if (volume <= 0) {
    return 0;
  }

  const clampedVolume = Math.max(0, Math.min(1, volume));
  return Math.min(1, 0.12 + Math.pow(clampedVolume, 0.72) * 0.88);
}

function getFriendlyMicrophoneError(error: unknown) {
  if (!(error instanceof DOMException)) {
    return null;
  }

  if (
    error.name === "NotAllowedError" ||
    error.name === "PermissionDeniedError" ||
    error.name === "SecurityError"
  ) {
    return {
      message:
        "Mikrofon izni kapali görünüyor. Windows ayarlarından mikrofon erişimini açıp tekrar dene.",
      canOpenSettings: true
    };
  }

  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    return {
      message: "Kullanılabilir bir mikrofon bulunamadı. Mikrofonunu takıp tekrar dene.",
      canOpenSettings: false
    };
  }

  if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    return {
      message:
        "Mikrofon şu anda başka bir uygulama tarafından kullanılıyor olabilir. Diğer ses uygulamalarını kapatıp tekrar dene.",
      canOpenSettings: false
    };
  }

  return null;
}

function createAudioConstraints(deviceId?: string): MediaTrackConstraints {
  const baseConstraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };

  if (!deviceId) {
    return baseConstraints;
  }

  return {
    ...baseConstraints,
    deviceId: { exact: deviceId }
  };
}

export function useVoiceRoom() {
  const [hasEntered, setHasEntered] = useState(false);
  const [tag, setTagState] = useState(() => getStoredValue(STORAGE_KEYS.tag));
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [roomCounts, setRoomCounts] = useState<RoomCounts>(() =>
    createInitialRoomCounts()
  );
  const [roomMembers, setRoomMembers] = useState<RoomMembers>(() =>
    createInitialRoomMembers()
  );
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [socketId, setSocketId] = useState("");
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isOutputEnabled, setIsOutputEnabled] = useState(true);
  const [inputDevices, setInputDevices] = useState<DeviceOption[]>([]);
  const [outputDevices, setOutputDevices] = useState<DeviceOption[]>([]);
  const [remoteUserVolumes, setRemoteUserVolumes] = useState<Record<string, number>>({});
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState(() =>
    getStoredValue(STORAGE_KEYS.inputDeviceId)
  );
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState(() =>
    getStoredValue(STORAGE_KEYS.outputDeviceId)
  );
  const [isJoining, setIsJoining] = useState(false);
  const [supportsOutputRouting, setSupportsOutputRouting] = useState(false);
  const [isLocallySpeaking, setIsLocallySpeaking] = useState(false);
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>(() => {
    const storedVoiceMode = getStoredValue(STORAGE_KEYS.voiceMode);
    return storedVoiceMode === "push-to-talk" ? "push-to-talk" : "open-mic";
  });
  const [pushToTalkKey, setPushToTalkKeyState] = useState(
    () => getStoredValue(STORAGE_KEYS.pushToTalkKey) || "V"
  );
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [error, setError] = useState("");
  const [canOpenMicrophoneSettings, setCanOpenMicrophoneSettings] = useState(false);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("idle");
  const [socketError, setSocketError] = useState("");
  const [diagnostics, setDiagnostics] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<PeerMap>(new Map());
  const audioElementsRef = useRef<AudioMap>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const tagRef = useRef(tag);
  const roomIdRef = useRef<string | null>(currentRoomId);
  const socketIdRef = useRef(socketId);
  const outputEnabledRef = useRef(isOutputEnabled);
  const selectedOutputDeviceIdRef = useRef(selectedOutputDeviceId);
  const micEnabledRef = useRef(isMicEnabled);
  const selectedInputDeviceIdRef = useRef(selectedInputDeviceId);
  const remoteUserVolumesRef = useRef<Record<string, number>>({});
  const voiceModeRef = useRef<VoiceMode>(voiceMode);
  const pushToTalkActiveRef = useRef(isPushToTalkActive);
  const speakingMonitorRef = useRef<Awaited<
    ReturnType<typeof createSpeakingMonitor>
  > | null>(null);

  function addDiagnosticLog(message: string) {
    const timestamp = new Date().toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    setDiagnostics((currentLogs) => {
      const nextLogs = [`[${timestamp}] ${message}`, ...currentLogs];
      return nextLogs.slice(0, 40);
    });
  }

  useEffect(() => {
    setSupportsOutputRouting(
      typeof HTMLMediaElement !== "undefined" &&
        typeof HTMLMediaElement.prototype.setSinkId === "function"
    );
  }, []);

  useEffect(() => {
    return () => {
      void cleanupRoomResources();
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    void applyOutputPreferences();
  }, [selectedOutputDeviceId, isOutputEnabled]);

  useEffect(() => {
    tagRef.current = tag;
  }, [tag]);

  useEffect(() => {
    roomIdRef.current = currentRoomId;
  }, [currentRoomId]);

  useEffect(() => {
    socketIdRef.current = socketId;
  }, [socketId]);

  useEffect(() => {
    outputEnabledRef.current = isOutputEnabled;
  }, [isOutputEnabled]);

  useEffect(() => {
    selectedOutputDeviceIdRef.current = selectedOutputDeviceId;
  }, [selectedOutputDeviceId]);

  useEffect(() => {
    micEnabledRef.current = isMicEnabled;
  }, [isMicEnabled]);

  useEffect(() => {
    selectedInputDeviceIdRef.current = selectedInputDeviceId;
  }, [selectedInputDeviceId]);

  useEffect(() => {
    remoteUserVolumesRef.current = remoteUserVolumes;
  }, [remoteUserVolumes]);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    pushToTalkActiveRef.current = isPushToTalkActive;
  }, [isPushToTalkActive]);

  useEffect(() => {
    void window.voiceApp?.setPushToTalkShortcut?.(pushToTalkKey);
  }, [pushToTalkKey]);

  useEffect(() => {
    const handlePushToTalkDown = () => {
      if (
        voiceModeRef.current !== "push-to-talk" ||
        isEditableTarget(document.activeElement)
      ) {
        return;
      }

      logPtt("renderer received ptt-down", { shortcut: pushToTalkKey });
      setIsPushToTalkActive(true);
    };

    const handlePushToTalkUp = () => {
      logPtt("renderer received ptt-up", { shortcut: pushToTalkKey });
      setIsPushToTalkActive(false);
    };

    const unsubscribeDown = window.voiceApp?.onPushToTalkDown?.(handlePushToTalkDown);
    const unsubscribeUp = window.voiceApp?.onPushToTalkUp?.(handlePushToTalkUp);

    return () => {
      unsubscribeDown?.();
      unsubscribeUp?.();
    };
  }, [pushToTalkKey]);

  useEffect(() => {
    if (voiceMode !== "push-to-talk") {
      return;
    }

    if (isPushToTalkActive) {
      logPtt("mic opened by ptt");
      return;
    }

    logPtt("mic closed by ptt");
  }, [isPushToTalkActive, voiceMode]);

  const connectedUsers = useMemo(
    () => roomUsers.filter((user) => user.roomId === currentRoomId),
    [currentRoomId, roomUsers]
  );

  function shouldTransmitMic() {
    if (!isMicEnabled) {
      return false;
    }

    if (voiceModeRef.current === "push-to-talk") {
      return pushToTalkActiveRef.current;
    }

    return true;
  }

  function applyMicTransmissionState() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = shouldTransmitMic();
    }
  }

  function patchSelfStateLocally(nextState: Partial<RoomUser>) {
    const currentSocketId = socketIdRef.current;
    if (!currentSocketId) {
      return;
    }

    setRoomUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === currentSocketId ? { ...user, ...nextState } : user
      )
    );

    setRoomMembers((currentMembers) =>
      Object.fromEntries(
        Object.entries(currentMembers).map(([roomId, members]) => [
          roomId,
          members.map((user) =>
            user.id === currentSocketId ? { ...user, ...nextState } : user
          )
        ])
      ) as RoomMembers
    );
  }

  async function refreshDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextInputDevices = devices
      .filter((device) => device.kind === "audioinput")
      .map((device) => ({
        deviceId: device.deviceId,
        label: readLabel(device, "Mic")
      }));
    const nextOutputDevices = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device) => ({
        deviceId: device.deviceId,
        label: readLabel(device, "Output")
      }));

    setInputDevices(nextInputDevices);
    setOutputDevices(nextOutputDevices);

  }

  function getRemoteVolumeStorageKey(userId: string) {
    return `${STORAGE_KEYS.remoteVolumePrefix}:${userId}`;
  }

  function getRemoteVolumeBackupStorageKey(userId: string) {
    return `${STORAGE_KEYS.remoteVolumeBackupPrefix}:${userId}`;
  }

  function getRemoteUserVolume(userId: string) {
    const stateValue = remoteUserVolumesRef.current[userId];
    if (typeof stateValue === "number") {
      return stateValue;
    }

    const storedValue = window.localStorage.getItem(getRemoteVolumeStorageKey(userId));
    if (storedValue !== null) {
      const parsedValue = Number(storedValue);
      if (Number.isFinite(parsedValue)) {
        return Math.max(0, Math.min(1, parsedValue));
      }
    }

    return 1;
  }

  function getRemoteUserVolumeBackup(userId: string) {
    const storedValue = window.localStorage.getItem(getRemoteVolumeBackupStorageKey(userId));
    if (storedValue !== null) {
      const parsedValue = Number(storedValue);
      if (Number.isFinite(parsedValue)) {
        return Math.max(0, Math.min(1, parsedValue));
      }
    }

    return null;
  }

  function getSocket() {
    if (socketRef.current) {
      return socketRef.current;
    }

    const signalingUrl = getSignalingServerUrl();
    setSocketStatus("connecting");
    addDiagnosticLog(`Socket baglantisi baslatildi: ${signalingUrl}`);

    const socket = io(signalingUrl, {
      transports: ["polling", "websocket"],
      upgrade: true,
      rememberUpgrade: false,
      timeout: 10000
    });

    socket.on("connect", () => {
      setSocketStatus("connected");
      setSocketError("");
      addDiagnosticLog(`Socket baglandi: ${socket.id}`);
      setSocketId(socket.id || "");
      if (tagRef.current) {
        socket.emit("set-tag", tagRef.current);
      }
      if (roomIdRef.current) {
        socket.emit("join-room", roomIdRef.current);
      }
    });

    socket.on("disconnect", () => {
      setSocketStatus("idle");
      addDiagnosticLog("Socket baglantisi koptu");
      setSocketId("");
      setRoomUsers([]);
      setRoomCounts(createInitialRoomCounts());
      setRoomMembers(createInitialRoomMembers());
    });

    socket.on("connect_error", (connectError) => {
      setSocketStatus("error");
      setSocketError(connectError.message || "Socket baglantisi kurulamadi.");
      addDiagnosticLog(
        `Socket hata: ${connectError.message || "bilinmeyen baglanti hatasi"}`
      );
    });

    socket.on("room-counts", (counts: RoomCounts) => {
      addDiagnosticLog("Oda sayilari alindi");
      setRoomCounts((currentCounts) => ({
        ...currentCounts,
        ...counts
      }));
    });

    socket.on("room-members", (members: RoomMembers) => {
      addDiagnosticLog("Oda uyeleri alindi");
      setRoomMembers((currentMembers) => ({
        ...currentMembers,
        ...members
      }));
    });

    socket.on("user-list", (users: RoomUser[]) => {
      addDiagnosticLog(`Aktif oda kullanici listesi geldi: ${users.length} kisi`);
      setRoomUsers(users);
      void syncPeerConnections(users);
    });

    socket.on("room-user-joined", (payload: RoomPresenceEvent) => {
      if (
        payload.roomId === roomIdRef.current &&
        payload.user.id !== socketIdRef.current
      ) {
        void playNotificationTone("join");
      }
    });

    socket.on("room-user-left", (payload: RoomPresenceEvent) => {
      if (
        payload.roomId === roomIdRef.current &&
        payload.user.id !== socketIdRef.current
      ) {
        void playNotificationTone("leave");
      }
    });

    socket.on("webrtc-offer", async (payload) => {
      await ensureLocalStream();
      const peer = createPeerConnection(payload.from);

      await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit("webrtc-answer", {
        to: payload.from,
        sdp: answer
      });
    });

    socket.on("webrtc-answer", async (payload) => {
      const peer = peersRef.current.get(payload.from);
      if (!peer) {
        return;
      }

      await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });

    socket.on("webrtc-ice-candidate", async (payload) => {
      const peer = peersRef.current.get(payload.from);
      if (!peer || !payload.candidate) {
        return;
      }

      await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
    });

    socketRef.current = socket;
    return socket;
  }

  async function waitForSocketConnection(timeoutMs = 12000) {
    const socket = getSocket();

    if (socket.connected) {
      return socket;
    }

    addDiagnosticLog("Socket baglantisi bekleniyor");

    return new Promise<Socket>((resolve, reject) => {
      let finished = false;

      const handleConnect = () => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        resolve(socket);
      };

      const handleError = (connectError: Error) => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        reject(connectError);
      };

      const cleanup = () => {
        window.clearTimeout(timerId);
        socket.off("connect", handleConnect);
        socket.off("connect_error", handleError);
      };

      const timerId = window.setTimeout(() => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        reject(new Error("Socket connection timeout"));
      }, timeoutMs);

      socket.on("connect", handleConnect);
      socket.on("connect_error", handleError);
    });
  }

  async function ensureLocalStream(preferredDeviceId = selectedInputDeviceId) {
    if (localStreamRef.current) {
      addDiagnosticLog("Mevcut mikrofon stream'i tekrar kullanildi");
      return localStreamRef.current;
    }

    const availableDevices = await navigator.mediaDevices.enumerateDevices();
    const requestedDeviceId = preferredDeviceId || selectedInputDeviceIdRef.current;
    const targetDeviceId =
      requestedDeviceId && hasDevice(availableDevices, "audioinput", requestedDeviceId)
        ? requestedDeviceId
        : "";

    if (requestedDeviceId && !targetDeviceId) {
      addDiagnosticLog("Secili mikrofon bulunamadi, varsayilan mikrofona donuldu");
      window.localStorage.removeItem(STORAGE_KEYS.inputDeviceId);
      setSelectedInputDeviceId("");
      selectedInputDeviceIdRef.current = "";
    }

    let stream: MediaStream;

    try {
      addDiagnosticLog(
        targetDeviceId
          ? "Secili mikrofon ile local stream aciliyor"
          : "Varsayilan mikrofon ile local stream aciliyor"
      );
      stream = await navigator.mediaDevices.getUserMedia({
        audio: createAudioConstraints(targetDeviceId)
      });
    } catch (error) {
      const canRetryWithDefaultMic =
        Boolean(targetDeviceId) &&
        error instanceof DOMException &&
        (error.name === "NotFoundError" ||
          error.name === "DevicesNotFoundError" ||
          error.name === "OverconstrainedError");

      if (!canRetryWithDefaultMic) {
        throw error;
      }

      console.warn(
        "[audio] selected input device is no longer available, retrying with default microphone"
      );
      addDiagnosticLog("Secili mikrofon acilamadi, varsayilan mikrofon ile tekrar deneniyor");

      window.localStorage.removeItem(STORAGE_KEYS.inputDeviceId);
      setSelectedInputDeviceId("");
      selectedInputDeviceIdRef.current = "";

      stream = await navigator.mediaDevices.getUserMedia({
        audio: createAudioConstraints()
      });
    }

    addDiagnosticLog("Local mikrofon stream'i hazir");

    const [track] = stream.getAudioTracks();
    if (track) {
      track.enabled = shouldTransmitMic();
    }

    localStreamRef.current = stream;
    await refreshDevices();
    startSpeakingMonitor(stream);
    return stream;
  }

  function startSpeakingMonitor(stream: MediaStream) {
    void speakingMonitorRef.current?.stop?.();

    speakingMonitorRef.current = createSpeakingMonitor({
      stream,
      onSpeakingChange: (speaking) => {
        setIsLocallySpeaking(speaking);
        socketRef.current?.emit("speaking-state", speaking);
      }
    });
  }

  useEffect(() => {
    applyMicTransmissionState();
  }, [isMicEnabled, voiceMode, isPushToTalkActive]);

  async function playNotificationTone(type: "join" | "leave") {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = type === "join" ? 820 : 520;
    gainNode.gain.value = 0.0001;

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    const now = context.currentTime;
    gainNode.gain.exponentialRampToValueAtTime(type === "join" ? 0.08 : 0.07, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    oscillator.start(now);
    oscillator.stop(now + 0.24);

    window.setTimeout(() => {
      void context.close();
    }, 320);
  }

  function createPeerConnection(remoteUserId: string) {
    const existing = peersRef.current.get(remoteUserId);
    if (existing) {
      return existing;
    }

    const peer = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(remoteUserId, peer);

    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        peer.addTrack(track, stream);
      }
    }

    peer.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      socketRef.current?.emit("webrtc-ice-candidate", {
        to: remoteUserId,
        candidate: event.candidate
      });
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) {
        return;
      }

      remoteStreamsRef.current.set(remoteUserId, stream);
      const audioElement = getOrCreateAudioElement(remoteUserId);
      audioElement.srcObject = stream;
      audioElement.muted = false;
      audioElement.volume = outputEnabledRef.current
        ? getAppliedRemoteVolume(getRemoteUserVolume(remoteUserId))
        : 0;
      void audioElement.play().catch(() => undefined);
      void applySinkId(audioElement);
    };

    peer.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(peer.connectionState)) {
        destroyPeer(remoteUserId);
      }
    };

    return peer;
  }

  async function syncPeerConnections(users: RoomUser[]) {
    if (!roomIdRef.current || !socketIdRef.current) {
      return;
    }

    const remoteUsers = users.filter((user) => user.id !== socketIdRef.current);
    const activeRemoteIds = new Set(remoteUsers.map((user) => user.id));

    for (const peerId of peersRef.current.keys()) {
      if (!activeRemoteIds.has(peerId)) {
        destroyPeer(peerId);
      }
    }

    for (const user of remoteUsers) {
      if (peersRef.current.has(user.id)) {
        continue;
      }

      if (socketIdRef.current > user.id) {
        await createOffer(user.id);
      }
    }
  }

  async function createOffer(remoteUserId: string) {
    await ensureLocalStream();
    const peer = createPeerConnection(remoteUserId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socketRef.current?.emit("webrtc-offer", {
      to: remoteUserId,
      sdp: offer
    });
  }

  function getOrCreateAudioElement(remoteUserId: string) {
    const existing = audioElementsRef.current.get(remoteUserId);
    if (existing) {
      return existing;
    }

    const element = document.createElement("audio");
    element.autoplay = true;
    element.dataset.peerId = remoteUserId;
    element.style.display = "none";
    document.body.appendChild(element);
    audioElementsRef.current.set(remoteUserId, element);
    return element;
  }

  async function applySinkId(audioElement: HTMLAudioElement) {
    if (
      !selectedOutputDeviceIdRef.current ||
      typeof audioElement.setSinkId !== "function"
    ) {
      return;
    }

    try {
      await audioElement.setSinkId(selectedOutputDeviceIdRef.current);
    } catch {
      setError("Output device routing bu ortamda desteklenmiyor.");
    }
  }

  async function applyOutputPreferences() {
    for (const [peerId, audioElement] of audioElementsRef.current.entries()) {
      audioElement.volume = outputEnabledRef.current
        ? getAppliedRemoteVolume(getRemoteUserVolume(peerId))
        : 0;
      await applySinkId(audioElement);
    }
  }

  async function setRemoteUserVolume(userId: string, volume: number) {
    const normalizedVolume = Math.max(0, Math.min(1, volume));

    setRemoteUserVolumes((currentVolumes) => ({
      ...currentVolumes,
      [userId]: normalizedVolume
    }));

    window.localStorage.setItem(
      getRemoteVolumeStorageKey(userId),
      String(normalizedVolume)
    );

    const audioElement = audioElementsRef.current.get(userId);
    if (audioElement) {
      audioElement.volume = outputEnabledRef.current
        ? getAppliedRemoteVolume(normalizedVolume)
        : 0;
    }
  }

  async function toggleRemoteUserMute(userId: string) {
    const currentVolume = getRemoteUserVolume(userId);

    if (currentVolume <= 0.001) {
      const storedBackup = getRemoteUserVolumeBackup(userId);
      const nextVolume = storedBackup && storedBackup > 0 ? storedBackup : 1;
      await setRemoteUserVolume(userId, nextVolume);
      return;
    }

    window.localStorage.setItem(
      getRemoteVolumeBackupStorageKey(userId),
      String(currentVolume)
    );
    await setRemoteUserVolume(userId, 0);
  }

  function destroyPeer(remoteUserId: string) {
    const peer = peersRef.current.get(remoteUserId);
    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.close();
    }
    peersRef.current.delete(remoteUserId);
    remoteStreamsRef.current.delete(remoteUserId);

    const audioElement = audioElementsRef.current.get(remoteUserId);
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      audioElement.remove();
    }
    audioElementsRef.current.delete(remoteUserId);
  }

  async function cleanupRoomResources() {
    setIsLocallySpeaking(false);
    socketRef.current?.emit("speaking-state", false);

    for (const peerId of [...peersRef.current.keys()]) {
      destroyPeer(peerId);
    }

    if (speakingMonitorRef.current) {
      await speakingMonitorRef.current.stop();
      speakingMonitorRef.current = null;
    }

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
  }

  async function replaceInputTrack(deviceId: string) {
    await cleanupLocalStreamOnly();
    await ensureLocalStream(deviceId);

    const newTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!newTrack) {
      return;
    }

    for (const peer of peersRef.current.values()) {
      const sender = peer
        .getSenders()
        .find((candidateSender) => candidateSender.track?.kind === "audio");

      await sender?.replaceTrack(newTrack);
    }
  }

  async function cleanupLocalStreamOnly() {
    setIsLocallySpeaking(false);
    if (speakingMonitorRef.current) {
      await speakingMonitorRef.current.stop();
      speakingMonitorRef.current = null;
    }

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
  }

  async function enterApp(nextTag: string) {
    const trimmedTag = nextTag.trim().slice(0, 24);
    if (!trimmedTag) {
      setError("Kullanici adi bos olamaz.");
      setCanOpenMicrophoneSettings(false);
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.tag, trimmedTag);
    setTagState(trimmedTag);
    setHasEntered(true);
    setError("");
    setCanOpenMicrophoneSettings(false);
    addDiagnosticLog(`Kullanici adi girildi: ${trimmedTag}`);

    getSocket().emit("set-tag", trimmedTag);
    await refreshDevices();
  }

  async function joinRoom(roomId: string) {
    try {
      setIsJoining(true);
      setError("");
      setCanOpenMicrophoneSettings(false);
      addDiagnosticLog(`Odaya katilma denemesi: ${roomId}`);
      await waitForSocketConnection();
      await ensureLocalStream();
      addDiagnosticLog(`join-room emit edildi: ${roomId}`);
      socketRef.current?.emit("join-room", roomId);
      socketRef.current?.emit("mic-state", isMicEnabled);
      socketRef.current?.emit("audio-output-state", isOutputEnabled);
      setCurrentRoomId(roomId);
      addDiagnosticLog(`Aktif oda secildi: ${roomId}`);
    } catch (joinError) {
      console.error(joinError);
      const friendlyError = getFriendlyMicrophoneError(joinError);
      const joinErrorMessage =
        joinError instanceof Error ? joinError.message : "Bilinmeyen hata";
      addDiagnosticLog(`Odaya katilma hatasi: ${joinErrorMessage}`);
      setError(
        friendlyError?.message ||
          joinErrorMessage === "Socket connection timeout" || socketStatus === "error"
            ? "Sunucuya baglanilamadi. Baglantini kontrol edip tekrar dene."
            : "Odaya katilirken bir sorun oldu. Mikrofon iznini ve baglantini kontrol edip tekrar dene."
      );
      setCanOpenMicrophoneSettings(Boolean(friendlyError?.canOpenSettings));
    } finally {
      setIsJoining(false);
    }
  }

  async function leaveRoom() {
    socketRef.current?.emit("leave-room");
    setCurrentRoomId(null);
    setRoomUsers([]);
    await cleanupRoomResources();
  }

  async function updateTag(nextTag: string) {
    const trimmedTag = nextTag.trim().slice(0, 24);
    if (!trimmedTag) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.tag, trimmedTag);
    setTagState(trimmedTag);
    socketRef.current?.emit("set-tag", trimmedTag);
  }

  async function toggleMic() {
    const nextValue = !isMicEnabled;
    micEnabledRef.current = nextValue;
    setIsMicEnabled(nextValue);
    applyMicTransmissionState();
    patchSelfStateLocally({ micEnabled: nextValue });
    socketRef.current?.emit("mic-state", nextValue);
  }

  async function toggleOutput() {
    const nextValue = !isOutputEnabled;
    outputEnabledRef.current = nextValue;
    setIsOutputEnabled(nextValue);
    await applyOutputPreferences();
    patchSelfStateLocally({ audioOutputEnabled: nextValue });
    socketRef.current?.emit("audio-output-state", nextValue);
  }

  async function changeInputDevice(deviceId: string) {
    selectedInputDeviceIdRef.current = deviceId;
    setSelectedInputDeviceId(deviceId);
    window.localStorage.setItem(STORAGE_KEYS.inputDeviceId, deviceId);
    addDiagnosticLog(
      deviceId ? `Input cihaz secildi: ${deviceId}` : "Varsayilan input cihaza donuldu"
    );

    if (localStreamRef.current) {
      await replaceInputTrack(deviceId);
    }
  }

  async function changeOutputDevice(deviceId: string) {
    selectedOutputDeviceIdRef.current = deviceId;
    setSelectedOutputDeviceId(deviceId);
    window.localStorage.setItem(STORAGE_KEYS.outputDeviceId, deviceId);
    addDiagnosticLog(
      deviceId ? `Output cihaz secildi: ${deviceId}` : "Varsayilan output cihaza donuldu"
    );
    await applyOutputPreferences();
  }

  async function startMicTest() {
    setError("");
    setCanOpenMicrophoneSettings(false);

    try {
      await ensureLocalStream();
    } catch (micError) {
      console.error(micError);
      const friendlyError = getFriendlyMicrophoneError(micError);
      setError(
        friendlyError?.message ||
          "Mikrofon testi baslatilamadi. Mikrofon iznini ve cihaz baglantini kontrol et."
      );
      setCanOpenMicrophoneSettings(Boolean(friendlyError?.canOpenSettings));
    }
  }

  async function stopMicTest() {
    if (currentRoomId) {
      return;
    }

    await cleanupLocalStreamOnly();
  }

  async function openMicrophoneSettings() {
    await window.voiceApp?.openMicrophonePrivacySettings?.();
  }

  function changeVoiceMode(nextVoiceMode: VoiceMode) {
    setVoiceModeState(nextVoiceMode);
    window.localStorage.setItem(STORAGE_KEYS.voiceMode, nextVoiceMode);

    if (nextVoiceMode === "open-mic") {
      setIsPushToTalkActive(false);
    }
  }

  function changePushToTalkKey(nextKey: string) {
    setPushToTalkKeyState(nextKey);
    window.localStorage.setItem(STORAGE_KEYS.pushToTalkKey, nextKey);
    setIsPushToTalkActive(false);
  }

  useEffect(() => {
    const handleDeviceChange = () => {
      void refreshDevices();
    };

    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices
        ?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, []);

  return {
    connectedUsers,
    currentRoomId,
    canOpenMicrophoneSettings,
    diagnostics,
    enterApp,
    error,
    hasEntered,
    inputDevices,
    isJoining,
    isLocallySpeaking,
    isMicEnabled,
    isOutputEnabled,
    isPushToTalkActive,
    pushToTalkKey,
    voiceMode,
    joinRoom,
    leaveRoom,
    outputDevices,
    roomCounts,
    roomMembers,
    roomUsers,
    socketError,
    socketStatus,
    remoteUserVolumes,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    setTagState,
    socketId,
    supportsOutputRouting,
    tag,
    toggleMic,
    toggleOutput,
    updateTag,
    changeInputDevice,
    changeOutputDevice,
    openMicrophoneSettings,
    startMicTest,
    stopMicTest,
    setRemoteUserVolume,
    toggleRemoteUserMute,
    changeVoiceMode,
    changePushToTalkKey
  };
}
