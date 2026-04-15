require("dotenv").config();

const fs = require("fs");
const https = require("https");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = Number(process.env.PORT || 3001);
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

function parseAllowedOrigins(value) {
  if (!value) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const ROOM_IDS = ["Genel", "Oyun", "Muzik", "AFK"];
const MAX_CHAT_MESSAGES = 50;
const DATA_DIR = path.join(__dirname, "data");
const CHAT_MESSAGES_FILE = path.join(DATA_DIR, "chat-messages.json");
const DEFAULT_ICE_SERVERS = [
  {
    urls: "stun:stun.l.google.com:19302"
  }
];
const METERED_TURN_API_KEY = process.env.METERED_TURN_API_KEY || "";
const METERED_TURN_API_URL = process.env.METERED_TURN_API_URL || "";

function isOriginAllowed(origin) {
  // Electron file:// and some desktop contexts may send no Origin header.
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function corsOriginHandler(origin, callback) {
  if (isOriginAllowed(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin not allowed: ${origin}`));
}

const app = express();
const server = http.createServer(app);

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;

  if (isOriginAllowed(requestOrigin)) {
    if (requestOrigin) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    }
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

const io = new Server(server, {
  cors: {
    origin: corsOriginHandler,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

const users = new Map();
const chatMessages = loadChatMessages();
let cachedIceServers = DEFAULT_ICE_SERVERS;
let cachedIceServersAt = 0;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadChatMessages() {
  try {
    if (!fs.existsSync(CHAT_MESSAGES_FILE)) {
      return [];
    }

    const raw = fs.readFileSync(CHAT_MESSAGES_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((message) => {
        return (
          message &&
          typeof message.id === "string" &&
          typeof message.tag === "string" &&
          typeof message.text === "string" &&
          typeof message.createdAt === "number"
        );
      })
      .slice(-MAX_CHAT_MESSAGES);
  } catch (error) {
    console.error("[chat] failed to load chat messages", error);
    return [];
  }
}

function saveChatMessages() {
  try {
    ensureDataDir();
    fs.writeFileSync(
      CHAT_MESSAGES_FILE,
      JSON.stringify(chatMessages.slice(-MAX_CHAT_MESSAGES), null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("[chat] failed to save chat messages", error);
  }
}

function getMeteredTurnCredentialsUrl() {
  if (!METERED_TURN_API_URL || !METERED_TURN_API_KEY) {
    return "";
  }

  const separator = METERED_TURN_API_URL.includes("?") ? "&" : "?";
  return `${METERED_TURN_API_URL}${separator}apiKey=${encodeURIComponent(
    METERED_TURN_API_KEY
  )}`;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let raw = "";

        response.on("data", (chunk) => {
          raw += chunk;
        });

        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(
              new Error(`TURN credentials request failed with status ${response.statusCode}`)
            );
            return;
          }

          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function getIceServers() {
  const now = Date.now();
  if (cachedIceServersAt && now - cachedIceServersAt < 5 * 60 * 1000) {
    return cachedIceServers;
  }

  const credentialsUrl = getMeteredTurnCredentialsUrl();
  if (!credentialsUrl) {
    return DEFAULT_ICE_SERVERS;
  }

  try {
    const iceServers = await fetchJson(credentialsUrl);

    if (!Array.isArray(iceServers) || iceServers.length === 0) {
      return DEFAULT_ICE_SERVERS;
    }

    cachedIceServers = iceServers;
    cachedIceServersAt = now;
    return cachedIceServers;
  } catch (error) {
    console.error("[turn] failed to fetch Metered iceServers", error);
    return cachedIceServersAt ? cachedIceServers : DEFAULT_ICE_SERVERS;
  }
}

function createDefaultUser(id) {
  return {
    id,
    tag: `guest-${id.slice(0, 4)}`,
    roomId: null,
    micEnabled: true,
    audioOutputEnabled: true,
    speaking: false,
    screenSharing: false
  };
}

function getRoomUsers(roomId) {
  return [...users.values()]
    .filter((user) => user.roomId === roomId)
    .map((user) => ({
      id: user.id,
      tag: user.tag,
      roomId: user.roomId,
      micEnabled: user.micEnabled,
      audioOutputEnabled: user.audioOutputEnabled,
      speaking: user.speaking,
      screenSharing: user.screenSharing
    }));
}

function getRoomCounts() {
  return ROOM_IDS.reduce((counts, roomId) => {
    counts[roomId] = [...users.values()].filter((user) => user.roomId === roomId).length;
    return counts;
  }, {});
}

function getRoomMembers() {
  return ROOM_IDS.reduce((rooms, roomId) => {
    rooms[roomId] = getRoomUsers(roomId);
    return rooms;
  }, {});
}

function emitRoomCounts() {
  io.emit("room-counts", getRoomCounts());
}

function emitRoomMembers() {
  io.emit("room-members", getRoomMembers());
}

function emitUserList(roomId) {
  if (!roomId) {
    return;
  }

  io.to(roomId).emit("user-list", getRoomUsers(roomId));
}

function createChatMessage(user, text) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    tag: user.tag,
    text,
    createdAt: Date.now()
  };
}

function pushChatMessage(message) {
  chatMessages.push(message);

  if (chatMessages.length > MAX_CHAT_MESSAGES) {
    chatMessages.splice(0, chatMessages.length - MAX_CHAT_MESSAGES);
  }

  saveChatMessages();
}

function leaveRoom(socket, reason = "leave") {
  const user = users.get(socket.id);

  if (!user?.roomId) {
    return null;
  }

  const oldRoomId = user.roomId;
  const leavingUser = {
    id: user.id,
    tag: user.tag,
    roomId: oldRoomId
  };

  socket.to(oldRoomId).emit("room-user-left", {
    user: leavingUser,
    roomId: oldRoomId,
    reason
  });

  socket.leave(oldRoomId);
  user.roomId = null;
  user.speaking = false;
  user.screenSharing = false;
  emitUserList(oldRoomId);
  emitRoomCounts();
  emitRoomMembers();
  return oldRoomId;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "minimal-voice-room-signaling",
    environment: NODE_ENV,
    port: PORT,
    rooms: ROOM_IDS,
    roomCounts: getRoomCounts(),
    connectedUsers: users.size
  });
});

app.get("/ice-servers", async (_req, res) => {
  const iceServers = await getIceServers();
  res.json({
    iceServers
  });
});

io.on("connection", (socket) => {
  console.log(`[socket] connected ${socket.id}`);
  users.set(socket.id, createDefaultUser(socket.id));
  socket.emit("room-counts", getRoomCounts());
  socket.emit("room-members", getRoomMembers());
  socket.emit("chat-history", chatMessages);

  socket.on("set-tag", (tag) => {
    const user = users.get(socket.id);
    if (!user) {
      return;
    }

    user.tag = String(tag || "").trim().slice(0, 24) || user.tag;
    emitUserList(user.roomId);
    emitRoomMembers();
  });

  socket.on("send-message", (text) => {
    const user = users.get(socket.id);
    if (!user) {
      return;
    }

    const normalizedText = String(text || "").trim().slice(0, 500);
    if (!normalizedText) {
      return;
    }

    const message = createChatMessage(user, normalizedText);
    pushChatMessage(message);
    io.emit("new-message", message);
  });

  socket.on("join-room", (roomId) => {
    const user = users.get(socket.id);
    if (!user || !roomId) {
      return;
    }

    if (user.roomId === roomId) {
      emitUserList(roomId);
      emitRoomCounts();
      return;
    }

    leaveRoom(socket, "switch");
    user.roomId = roomId;
    user.speaking = false;
    socket.join(roomId);
    console.log(`[room] ${socket.id} joined ${roomId}`);
    socket.to(roomId).emit("room-user-joined", {
      user: {
        id: user.id,
        tag: user.tag,
        roomId
      },
      roomId
    });
    emitUserList(roomId);
    emitRoomCounts();
    emitRoomMembers();
  });

  socket.on("leave-room", () => {
    console.log(`[room] ${socket.id} left room`);
    leaveRoom(socket, "leave");
  });

  socket.on("mic-state", (micEnabled) => {
    const user = users.get(socket.id);
    if (!user) {
      return;
    }

    user.micEnabled = Boolean(micEnabled);
    emitUserList(user.roomId);
    emitRoomMembers();
  });

  socket.on("audio-output-state", (audioOutputEnabled) => {
    const user = users.get(socket.id);
    if (!user) {
      return;
    }

    user.audioOutputEnabled = Boolean(audioOutputEnabled);
    emitUserList(user.roomId);
    emitRoomMembers();
  });

  socket.on("speaking-state", (speaking) => {
    const user = users.get(socket.id);
    if (!user) {
      return;
    }

    user.speaking = Boolean(speaking);
    emitUserList(user.roomId);
    emitRoomMembers();
  });

  socket.on("screen-share-state", (screenSharing) => {
    const user = users.get(socket.id);
    if (!user) {
      return;
    }

    user.screenSharing = Boolean(screenSharing);
    emitUserList(user.roomId);
    emitRoomMembers();
  });

  socket.on("webrtc-offer", (payload) => {
    console.log(`[signal] offer ${socket.id} -> ${payload.to}`);
    io.to(payload.to).emit("webrtc-offer", {
      from: socket.id,
      sdp: payload.sdp
    });
  });

  socket.on("webrtc-answer", (payload) => {
    console.log(`[signal] answer ${socket.id} -> ${payload.to}`);
    io.to(payload.to).emit("webrtc-answer", {
      from: socket.id,
      sdp: payload.sdp
    });
  });

  socket.on("webrtc-ice-candidate", (payload) => {
    io.to(payload.to).emit("webrtc-ice-candidate", {
      from: socket.id,
      candidate: payload.candidate
    });
  });

  socket.on("disconnect", () => {
    console.log(`[socket] disconnected ${socket.id}`);
    const roomId = leaveRoom(socket, "disconnect");
    users.delete(socket.id);
    if (roomId) {
      emitUserList(roomId);
    }
    emitRoomCounts();
    emitRoomMembers();
  });
});

server.listen(PORT, () => {
  console.log(
    `[server] signaling server listening on port ${PORT} (${NODE_ENV})`
  );
  console.log(`[server] allowed origins: ${allowedOrigins.join(", ")}`);
});
