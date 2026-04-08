import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { SettingsModal } from "./components/SettingsModal";
import { VoiceSidebar } from "./components/VoiceSidebar";
import { useVoiceRoom } from "./hooks/useVoiceRoom";

export default function App() {
  const {
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
    changeOutputDevice
  } = useVoiceRoom();

  const [loginTag, setLoginTag] = useState(tag);
  const [editableTag, setEditableTag] = useState(tag);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const outputTestAudioRef = useRef<HTMLAudioElement | null>(null);

  const roomSummary = useMemo(
    () => (currentRoomId ? `${connectedUsers.length} kisi bagli` : "Oda secilmedi"),
    [connectedUsers.length, currentRoomId]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await enterApp(loginTag);
    setEditableTag(loginTag.trim());
  };

  const playOutputTest = async () => {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const audioContext = new AudioContextClass();
    const destination = audioContext.createMediaStreamDestination();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gainNode.gain.value = 0.05;

    oscillator.connect(gainNode);
    gainNode.connect(destination);

    let audioElement = outputTestAudioRef.current;
    if (!audioElement) {
      audioElement = new Audio();
      audioElement.autoplay = true;
      outputTestAudioRef.current = audioElement;
    }

    audioElement.srcObject = destination.stream;

    if (
      supportsOutputRouting &&
      selectedOutputDeviceId &&
      typeof audioElement.setSinkId === "function"
    ) {
      await audioElement.setSinkId(selectedOutputDeviceId);
    }

    await audioElement.play();
    oscillator.start();

    window.setTimeout(() => {
      oscillator.stop();
      void audioContext.close();
    }, 900);
  };

  if (!hasEntered) {
    return (
      <LoginScreen
        loginTag={loginTag}
        error={error}
        serverUrl={window.voiceApp?.serverUrl || "http://localhost:3001"}
        onTagChange={(value) => {
          setLoginTag(value);
          setTagState(value);
        }}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <main className="app-shell">
      <VoiceSidebar
        roomSummary={roomSummary}
        currentRoomId={currentRoomId}
        connectedUsers={connectedUsers}
        socketId={socketId}
        isJoining={isJoining}
        tag={tag}
        isMicEnabled={isMicEnabled}
        isOutputEnabled={isOutputEnabled}
        error={error}
        supportsOutputRouting={supportsOutputRouting}
        onJoinRoom={joinRoom}
        onToggleMic={toggleMic}
        onToggleOutput={toggleOutput}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLeaveRoom={leaveRoom}
      />

      {isSettingsOpen ? (
        <SettingsModal
          editableTag={editableTag}
          selectedInputDeviceId={selectedInputDeviceId}
          selectedOutputDeviceId={selectedOutputDeviceId}
          inputDevices={inputDevices}
          outputDevices={outputDevices}
          supportsOutputRouting={supportsOutputRouting}
          isLocallySpeaking={isLocallySpeaking}
          onEditableTagChange={setEditableTag}
          onClose={() => setIsSettingsOpen(false)}
          onSaveTag={() => updateTag(editableTag)}
          onChangeInput={changeInputDevice}
          onChangeOutput={changeOutputDevice}
          onTestOutput={playOutputTest}
        />
      ) : null}
    </main>
  );
}
