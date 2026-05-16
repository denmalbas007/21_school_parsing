"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/lib/socket-events";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let sharedSocket: GameSocket | null = null;

function getSharedSocket(): GameSocket {
  if (sharedSocket) return sharedSocket;
  sharedSocket = io({
    path: "/api/socket.io",
    autoConnect: true,
    transports: ["websocket", "polling"],
  });
  return sharedSocket;
}

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
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

  return { socket: socketRef.current, connected, socketId };
}
