import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DisplaySourcePicker } from "./components/DisplaySourcePicker";
import { GlobalChatPanel } from "./components/GlobalChatPanel";
import { LoginScreen } from "./components/LoginScreen";
import { ScreenSharePanel } from "./components/ScreenSharePanel";
import { SettingsModal } from "./components/SettingsModal";
import { UpdaterStatusCard } from "./components/UpdaterStatusCard";
import { VoiceSidebar } from "./components/VoiceSidebar";
import { useVoiceRoom } from "./hooks/useVoiceRoom";
import type { DisplaySource, UpdaterState } from "./types";

const INITIAL_UPDATER_STATE: UpdaterState = {
  visible: false,
  status: "idle",
  title: "",
  detail: "",
  progressPercent: 0,
  bytesPerSecond: 0,
  version: ""
};

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
    startScreenShareWithSource,
    joinScreenShare,
    closeScreenShareView
  } = useVoiceRoom();

  const [loginTag, setLoginTag] = useState(tag);
  const [editableTag, setEditableTag] = useState(tag);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"chat" | "screen">("chat");
  const [updaterState, setUpdaterState] = useState<UpdaterState>(INITIAL_UPDATER_STATE);
  const [displaySources, setDisplaySources] = useState<DisplaySource[]>([]);
  const [displayPickerError, setDisplayPickerError] = useState("");
  const [isDisplayPickerOpen, setIsDisplayPickerOpen] = useState(false);
  const [isDisplayPickerLoading, setIsDisplayPickerLoading] = useState(false);
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

  const openChatPanel = () => {
    setActivePanel("chat");
  };

  const leaveScreenShareView = () => {
    closeScreenShareView();
    setActivePanel("chat");
  };

  const openDisplayPicker = async () => {
    if (!window.voiceApp?.listDisplaySources) {
      openActiveScreenPanel();
      await toggleScreenShare();
      return;
    }

    setDisplayPickerError("");
    setIsDisplayPickerLoading(true);
    setIsDisplayPickerOpen(true);

    try {
      const sources = await window.voiceApp.listDisplaySources();
      setDisplaySources(sources);

      if (!sources.length) {
        setDisplayPickerError("Paylasilabilir ekran veya pencere bulunamadi.");
      }
    } catch (error) {
      console.error(error);
      setDisplayPickerError(
        "Ekran paylasimi kaynaklari yuklenemedi. Lutfen tekrar dene."
      );
    } finally {
      setIsDisplayPickerLoading(false);
    }
  };

  const closeDisplayPicker = () => {
    setIsDisplayPickerOpen(false);
    setIsDisplayPickerLoading(false);
    setDisplayPickerError("");
    setDisplaySources([]);
  };

  const handleDisplaySourceSelect = async (sourceId: string) => {
    openActiveScreenPanel();
    closeDisplayPicker();
    await startScreenShareWithSource(sourceId);
  };

  useEffect(() => {
    void window.voiceApp?.getUpdaterState?.().then((state) => {
      if (state) {
        setUpdaterState(state);
      }
    });

    const unsubscribe = window.voiceApp?.onUpdaterState?.((state) => {
      setUpdaterState(state);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

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
      <>
        <LoginScreen
          loginTag={loginTag}
          error={error}
          onTagChange={(value) => {
            setLoginTag(value);
            setTagState(value);
          }}
          onSubmit={handleLogin}
        />
        <UpdaterStatusCard state={updaterState} />
      </>
    );
  }

  return (
    <>
      <main className="app-shell">
        <VoiceSidebar
        activePanel={activePanel}
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
        onJoinRoom={async (room) => {
          if (currentRoomId === room) {
            if (selectedScreenShareOwnerId && sharedScreenStream) {
              setActivePanel("screen");
              return;
            }

            if (isScreenSharing || activeScreenUsers.length > 0) {
              openActiveScreenPanel();
              return;
            }
          }

          setActivePanel("chat");
          await joinRoom(room);
        }}
        onOpenChat={openChatPanel}
        onToggleMic={toggleMic}
        onToggleOutput={toggleOutput}
        onToggleScreenShare={async () => {
          if (isScreenSharing) {
            await toggleScreenShare();
            return;
          }

          await openDisplayPicker();
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
          {activePanel === "screen" && sharedScreenStream && sharedScreenOwnerTag ? (
            <ScreenSharePanel
              stream={sharedScreenStream}
              ownerTag={sharedScreenOwnerTag}
              isSelf={sharedScreenOwnerId === socketId}
              onLeaveView={leaveScreenShareView}
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

        {isDisplayPickerOpen ? (
          <DisplaySourcePicker
            sources={displaySources}
            isLoading={isDisplayPickerLoading}
            error={displayPickerError}
            onClose={closeDisplayPicker}
            onSelect={handleDisplaySourceSelect}
          />
        ) : null}
      </main>
      <UpdaterStatusCard state={updaterState} />
    </>
  );
}
