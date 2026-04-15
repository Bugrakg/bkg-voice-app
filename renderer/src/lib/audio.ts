import { SPEAKING_THRESHOLD } from "../constants";

type SpeakingMonitorOptions = {
  stream: MediaStream;
  onSpeakingChange: (speaking: boolean) => void;
};

type MicrophoneProcessorOptions = {
  stream: MediaStream;
  thresholdPercent: number;
};

function getAudioContextClass() {
  return (
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

function calculateRms(
  analyser: AnalyserNode,
  sampleBuffer: Uint8Array<ArrayBufferLike>
) {
  analyser.getByteTimeDomainData(sampleBuffer as unknown as Uint8Array<ArrayBuffer>);

  let sumSquares = 0;
  for (const sample of sampleBuffer) {
    const normalized = sample / 128 - 1;
    sumSquares += normalized * normalized;
  }

  return Math.sqrt(sumSquares / sampleBuffer.length);
}

function getGateThreshold(thresholdPercent: number) {
  if (thresholdPercent <= 0) {
    return 0;
  }

  const normalizedPercent = Math.max(0, Math.min(100, thresholdPercent)) / 100;
  return 0.004 + Math.pow(normalizedPercent, 1.55) * 0.11;
}

export function createSpeakingMonitor({
  stream,
  onSpeakingChange
}: SpeakingMonitorOptions) {
  const AudioContextClass = getAudioContextClass();

  if (!AudioContextClass) {
    return {
      stop() {}
    };
  }

  const context = new AudioContextClass();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;

  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);

  const sampleBuffer = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;
  let smoothedRms = 0;
  let speakingHoldUntil = 0;
  let timer = window.setInterval(() => {
    const rms = calculateRms(analyser, sampleBuffer);
    smoothedRms = smoothedRms * 0.6 + rms * 0.4;
    const now = performance.now();

    if (smoothedRms >= SPEAKING_THRESHOLD) {
      speakingHoldUntil = now + 180;
    }

    const nextSpeaking =
      smoothedRms >= SPEAKING_THRESHOLD || now <= speakingHoldUntil;

    if (nextSpeaking !== speaking) {
      speaking = nextSpeaking;
      onSpeakingChange(speaking);
    }
  }, 90);

  return {
    async stop() {
      window.clearInterval(timer);
      timer = 0;
      source.disconnect();
      analyser.disconnect();
      await context.close();
    }
  };
}

export function createMicrophoneProcessor({
  stream,
  thresholdPercent
}: MicrophoneProcessorOptions) {
  const AudioContextClass = getAudioContextClass();

  if (!AudioContextClass) {
    return {
      stream,
      setMuted() {},
      setThresholdPercent() {},
      async stop() {}
    };
  }

  const context = new AudioContextClass();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  const gainNode = context.createGain();
  const destination = context.createMediaStreamDestination();
  const sampleBuffer = new Uint8Array(512);
  let activeThresholdPercent = thresholdPercent;
  let holdUntil = 0;
  let muted = false;

  analyser.fftSize = 512;
  gainNode.gain.value = 1;

  source.connect(analyser);
  source.connect(gainNode);
  gainNode.connect(destination);

  const timer = window.setInterval(() => {
    if (muted) {
      gainNode.gain.setTargetAtTime(0.00001, context.currentTime, 0.008);
      return;
    }

    const gateThreshold = getGateThreshold(activeThresholdPercent);

    if (gateThreshold <= 0) {
      gainNode.gain.setTargetAtTime(1, context.currentTime, 0.02);
      return;
    }

    const rms = calculateRms(analyser, sampleBuffer);
    const now = performance.now();

    if (rms >= gateThreshold) {
      holdUntil = now + 180;
      gainNode.gain.setTargetAtTime(1, context.currentTime, 0.01);
      return;
    }

    if (now <= holdUntil) {
      return;
    }

    gainNode.gain.setTargetAtTime(0.00001, context.currentTime, 0.018);
  }, 80);

  return {
    stream: destination.stream,
    setMuted(nextMuted: boolean) {
      muted = nextMuted;
      gainNode.gain.setTargetAtTime(nextMuted ? 0.00001 : 1, context.currentTime, 0.01);
    },
    setThresholdPercent(nextThresholdPercent: number) {
      activeThresholdPercent = nextThresholdPercent;
    },
    async stop() {
      window.clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      gainNode.disconnect();
      await context.close();
    }
  };
}
