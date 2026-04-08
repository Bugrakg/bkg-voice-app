function readRendererEnv(name: string) {
  const env = import.meta.env as Record<string, string | undefined>;
  return typeof env[name] === "string" ? env[name] : "";
}

export function getSignalingServerUrl() {
  if (window.voiceApp?.serverUrl) {
    return window.voiceApp.serverUrl;
  }

  return readRendererEnv("VITE_SIGNALING_SERVER_URL") || "http://localhost:3001";
}

export function getNodeEnv() {
  if (window.voiceApp?.nodeEnv) {
    return window.voiceApp.nodeEnv;
  }

  return readRendererEnv("VITE_NODE_ENV") || "development";
}
