import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { GlobalChatPanel } from "./components/GlobalChatPanel";
import { LoginScreen } from "./components/LoginScreen";
import { ScreenSharePanel } from "./components/ScreenSharePanel";
import { SettingsModal } from "./components/SettingsModal";
import { VoiceSidebar } from "./components/VoiceSidebar";
import { useVoiceRoom } from "./hooks/useVoiceRoom";

export default function App() {
  const {
    connectedUsers,
    canOpenMicrophoneSettings,
    currentRoomId,
    diagnostics,
    enterApp,
    error,
    hasEntered,
    inputDevices,
    inputSensitivity,
    isJoining,
    isLocallySpeaking,
    isMicEnabled,
    isOutputEnabled,
    isScreenSharing,
    isPushToTalkActive,
    pushToTalkKey,
    voiceMode,
    joinRoom,
    leaveRoom,
    outputDevices,
    roomCounts,
    roomMembers,
    socketError,
    socketStatus,
    chatMessages,
    remoteUserVolumes,
    selectedScreenShareOwnerId,
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
    changeInputSensitivity,
    openMicrophoneSettings,
    sharedScreenOwnerId,
    sharedScreenOwnerTag,
    sharedScreenStream,
    startMicTest,
    stopMicTest,
    setRemoteUserVolume,
    toggleRemoteUserMute,
    changeVoiceMode,
    changePushToTalkKey,
    sendChatMessage,
    toggleScreenShare,
    joinScreenShare,
    closeScreenShareView
  } = useVoiceRoom();

  const [loginTag, setLoginTag] = useState(tag);
  const [editableTag, setEditableTag] = useState(tag);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"chat" | "screen">("chat");
  const outputTestAudioRef = useRef<HTMLAudioElement | null>(null);

  const roomSummary = useMemo(
    () => (currentRoomId ? `${connectedUsers.length} kisi bagli` : ""),
    [connectedUsers.length, currentRoomId]
  );
  const activeScreenUsers = useMemo(
    () => connectedUsers.filter((user) => user.screenSharing),
    [connectedUsers]
  );
  const hasVisibleScreenShare =
    isScreenSharing || activeScreenUsers.length > 0 || Boolean(sharedScreenStream);
  const screenTabLabel =
    sharedScreenOwnerTag || activeScreenUsers[0]?.tag || (isScreenSharing ? "Yayin" : "");

  const openActiveScreenPanel = () => {
    const preferredScreenUser =
      activeScreenUsers.find((user) => user.id === socketId && user.screenSharing) ||
      activeScreenUsers[0];

    if (preferredScreenUser) {
      joinScreenShare(preferredScreenUser.id);
    }

    setActivePanel("screen");
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!selectedScreenShareOwnerId && !isScreenSharing && activePanel === "screen") {
      setActivePanel("chat");
    }
  }, [activePanel, isScreenSharing, selectedScreenShareOwnerId]);

  useEffect(() => {
    if (!isSettingsOpen) {
      void stopMicTest();
      return;
    }

    void startMicTest();
  }, [isSettingsOpen]);

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
        roomCounts={roomCounts}
        roomMembers={roomMembers}
        socketId={socketId}
        isJoining={isJoining}
        tag={tag}
        isMicEnabled={isMicEnabled}
        isOutputEnabled={isOutputEnabled}
        isScreenSharing={isScreenSharing}
        isPushToTalkActive={isPushToTalkActive}
        pushToTalkKey={pushToTalkKey}
        voiceMode={voiceMode}
        error={error}
        canOpenMicrophoneSettings={canOpenMicrophoneSettings}
        supportsOutputRouting={supportsOutputRouting}
        remoteUserVolumes={remoteUserVolumes}
        onJoinRoom={joinRoom}
        onToggleMic={toggleMic}
        onToggleOutput={toggleOutput}
        onToggleScreenShare={async () => {
          if (!isScreenSharing) {
            openActiveScreenPanel();
          }
          await toggleScreenShare();
        }}
        onJoinScreenShare={(userId) => {
          joinScreenShare(userId);
          setActivePanel("screen");
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenMicrophoneSettings={openMicrophoneSettings}
        onLeaveRoom={leaveRoom}
        onRemoteUserVolumeChange={setRemoteUserVolume}
        onToggleRemoteUserMute={toggleRemoteUserMute}
      />

      <section className="content-panel">
        <div className="content-panel__tabs">
          <button
            type="button"
            className={`content-panel__tab ${activePanel === "chat" ? "content-panel__tab--active" : ""}`}
            onClick={() => {
              setActivePanel("chat");
              closeScreenShareView();
            }}
          >
            Genel Chat
          </button>
          {hasVisibleScreenShare ? (
            <button
              type="button"
              className={`content-panel__tab ${activePanel === "screen" ? "content-panel__tab--active" : ""}`}
              onClick={openActiveScreenPanel}
            >
              {screenTabLabel ? `${screenTabLabel} yayini` : "Yayin"}
            </button>
          ) : null}
        </div>

        {activePanel === "screen" && sharedScreenStream && sharedScreenOwnerTag ? (
          <ScreenSharePanel
            stream={sharedScreenStream}
            ownerTag={sharedScreenOwnerTag}
            isSelf={sharedScreenOwnerId === socketId}
            onStopSharing={sharedScreenOwnerId === socketId ? toggleScreenShare : undefined}
          />
        ) : (
          <GlobalChatPanel
            messages={chatMessages}
            onSendMessage={sendChatMessage}
          />
        )}
      </section>

      {isSettingsOpen ? (
        <SettingsModal
          editableTag={editableTag}
          selectedInputDeviceId={selectedInputDeviceId}
          selectedOutputDeviceId={selectedOutputDeviceId}
          inputDevices={inputDevices}
          outputDevices={outputDevices}
          inputSensitivity={inputSensitivity}
          supportsOutputRouting={supportsOutputRouting}
          isLocallySpeaking={isLocallySpeaking}
          isPushToTalkActive={isPushToTalkActive}
          diagnostics={diagnostics}
          pushToTalkKey={pushToTalkKey}
          socketError={socketError}
          socketStatus={socketStatus}
          voiceMode={voiceMode}
          onEditableTagChange={setEditableTag}
          onClose={() => setIsSettingsOpen(false)}
          onSaveTag={() => updateTag(editableTag)}
          onChangeInput={changeInputDevice}
          onChangeOutput={changeOutputDevice}
          onTestOutput={playOutputTest}
          onChangeVoiceMode={changeVoiceMode}
          onChangePushToTalkKey={changePushToTalkKey}
          onChangeInputSensitivity={changeInputSensitivity}
        />
      ) : null}
    </main>
  );
}
