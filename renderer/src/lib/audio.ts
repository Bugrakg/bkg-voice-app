import { SPEAKING_THRESHOLD } from "../constants";

type SpeakingMonitorOptions = {
  stream: MediaStream;
  onSpeakingChange: (speaking: boolean) => void;
};

export function createSpeakingMonitor({
  stream,
  onSpeakingChange
}: SpeakingMonitorOptions) {
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

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
  let timer = window.setInterval(() => {
    analyser.getByteTimeDomainData(sampleBuffer);

    let sumSquares = 0;
    for (const sample of sampleBuffer) {
      const normalized = sample / 128 - 1;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / sampleBuffer.length);
    const nextSpeaking = rms > SPEAKING_THRESHOLD;

    if (nextSpeaking !== speaking) {
      speaking = nextSpeaking;
      onSpeakingChange(speaking);
    }
  }, 150);

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
