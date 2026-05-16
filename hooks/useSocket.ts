"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/lib/socket-events";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let sharedSocket: GameSocket | null = null;
let cachedPlayerId: string | null = null;

function getPlayerId(): string {
  if (cachedPlayerId) return cachedPlayerId;
  if (typeof window === "undefined") return "";
  const KEY = "qb:playerId";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pid-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    window.localStorage.setItem(KEY, id);
  }
  cachedPlayerId = id;
  return id;
}

function getSharedSocket(): GameSocket {
  if (sharedSocket) return sharedSocket;
  sharedSocket = io({
    path: "/api/socket.io",
    autoConnect: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5_000,
  });
  return sharedSocket;
}

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [playerId] = useState<string>(() => getPlayerId());
  const socketRef = useRef<GameSocket | null>(null);

  useEffect(() => {
    const s = getSharedSocket();
    socketRef.current = s;

    const onConnect = () => {
      setConnected(true);
      setSocketId(s.id ?? null);
    };
    const onDisconnect = () => setConnected(false);
    const onHello = (msg: { socketId: string }) => setSocketId(msg.socketId);

    if (s.connected) onConnect();
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("system:hello", onHello);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("system:hello", onHello);
    };
  }, []);

  return { socket: socketRef.current, connected, socketId, playerId };
}
