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
  RoomUser
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
  const [error, setError] = useState("");

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
  const speakingMonitorRef = useRef<Awaited<
    ReturnType<typeof createSpeakingMonitor>
  > | null>(null);

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

  const connectedUsers = useMemo(
    () => roomUsers.filter((user) => user.roomId === currentRoomId),
    [currentRoomId, roomUsers]
  );

  async function refreshDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setInputDevices(
      devices
        .filter((device) => device.kind === "audioinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: readLabel(device, "Mic")
        }))
    );
    setOutputDevices(
      devices
        .filter((device) => device.kind === "audiooutput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: readLabel(device, "Output")
        }))
    );
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
    const parsedValue = Number(storedValue);
    if (Number.isFinite(parsedValue)) {
      return Math.max(0, Math.min(1, parsedValue));
    }

    return 1;
  }

  function getSocket() {
    if (socketRef.current) {
      return socketRef.current;
    }

    const socket = io(getSignalingServerUrl(), {
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {
      setSocketId(socket.id || "");
      if (tagRef.current) {
        socket.emit("set-tag", tagRef.current);
      }
      if (roomIdRef.current) {
        socket.emit("join-room", roomIdRef.current);
      }
    });

    socket.on("disconnect", () => {
      setSocketId("");
      setRoomUsers([]);
      setRoomCounts(createInitialRoomCounts());
      setRoomMembers(createInitialRoomMembers());
    });

    socket.on("room-counts", (counts: RoomCounts) => {
      setRoomCounts((currentCounts) => ({
        ...currentCounts,
        ...counts
      }));
    });

    socket.on("room-members", (members: RoomMembers) => {
      setRoomMembers((currentMembers) => ({
        ...currentMembers,
        ...members
      }));
    });

    socket.on("user-list", (users: RoomUser[]) => {
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

  async function ensureLocalStream(preferredDeviceId = selectedInputDeviceId) {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const targetDeviceId = preferredDeviceId || selectedInputDeviceIdRef.current;
    const constraints: MediaStreamConstraints = {
      audio: targetDeviceId
        ? {
            deviceId: { exact: targetDeviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const [track] = stream.getAudioTracks();
    if (track) {
      track.enabled = micEnabledRef.current;
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
    gainNode.gain.exponentialRampToValueAtTime(0.045, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    oscillator.start(now);
    oscillator.stop(now + 0.18);

    window.setTimeout(() => {
      void context.close();
    }, 250);
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
      audioElement.volume = outputEnabledRef.current ? getRemoteUserVolume(remoteUserId) : 0;
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
      audioElement.volume = outputEnabledRef.current ? getRemoteUserVolume(peerId) : 0;
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
      audioElement.volume = outputEnabledRef.current ? normalizedVolume : 0;
    }
  }

  async function toggleRemoteUserMute(userId: string) {
    const currentVolume = getRemoteUserVolume(userId);

    if (currentVolume <= 0.001) {
      const storedBackup = Number(
        window.localStorage.getItem(getRemoteVolumeBackupStorageKey(userId))
      );
      const nextVolume =
        Number.isFinite(storedBackup) && storedBackup > 0 ? storedBackup : 1;
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
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.tag, trimmedTag);
    setTagState(trimmedTag);
    setHasEntered(true);
    setError("");

    getSocket().emit("set-tag", trimmedTag);
    await refreshDevices();
  }

  async function joinRoom(roomId: string) {
    try {
      setIsJoining(true);
      setError("");
      getSocket();
      await ensureLocalStream();
      socketRef.current?.emit("join-room", roomId);
      socketRef.current?.emit("mic-state", isMicEnabled);
      socketRef.current?.emit("audio-output-state", isOutputEnabled);
      setCurrentRoomId(roomId);
    } catch (joinError) {
      console.error(joinError);
      setError("Mikrofon izni alinmadi veya baglanti kurulurken hata oldu.");
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
    setIsMicEnabled(nextValue);

    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = nextValue;
    }

    socketRef.current?.emit("mic-state", nextValue);
  }

  async function toggleOutput() {
    const nextValue = !isOutputEnabled;
    setIsOutputEnabled(nextValue);
    socketRef.current?.emit("audio-output-state", nextValue);
  }

  async function changeInputDevice(deviceId: string) {
    setSelectedInputDeviceId(deviceId);
    window.localStorage.setItem(STORAGE_KEYS.inputDeviceId, deviceId);

    if (currentRoomId) {
      await replaceInputTrack(deviceId);
    }
  }

  async function changeOutputDevice(deviceId: string) {
    setSelectedOutputDeviceId(deviceId);
    window.localStorage.setItem(STORAGE_KEYS.outputDeviceId, deviceId);
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
    enterApp,
    error,
    hasEntered,
    inputDevices,
    isJoining,
    isLocallySpeaking,
    isMicEnabled,
    isOutputEnabled,
    joinRoom,
    leaveRoom,
    outputDevices,
    roomCounts,
    roomMembers,
    roomUsers,
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
    setRemoteUserVolume,
    toggleRemoteUserMute
  };
}
