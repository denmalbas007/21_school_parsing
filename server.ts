/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServer } from "node:http";
import next from "next";
import { Server as IOServer } from "socket.io";
import {
  createRoom,
  getRoom,
  joinRoom,
  listOpenRooms,
  markSocketDisconnected,
  publicRoom,
  startQuizForAction,
  submitAnswer,
} from "./lib/game/room";
import { maybeRefillRemotePool } from "./lib/game/quiz";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./lib/socket-events";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: { origin: "*" },
      path: "/api/socket.io",
      // Resilient to flaky mobile networks.
      pingInterval: 20_000,
      pingTimeout: 25_000,
    },
  );

  function broadcastLobby() {
    io.emit("lobby:rooms", listOpenRooms());
  }

  function broadcastRoom(roomId: string) {
    const r = getRoom(roomId);
    if (!r) return;
    io.to(roomId).emit("room:state", publicRoom(r));
  }

  io.on("connection", (socket) => {
    socket.emit("system:hello", { socketId: socket.id });
    socket.emit("lobby:rooms", listOpenRooms());

    socket.on("lobby:list", () => {
      socket.emit("lobby:rooms", listOpenRooms());
    });

    socket.on("lobby:create", (_payload, ack) => {
      const r = createRoom();
      ack({ roomId: r.id });
      broadcastLobby();
    });

    socket.on("room:join", ({ roomId, name, playerId }, ack) => {
      const res = joinRoom(roomId, playerId, socket.id, name);
      if ("error" in res) {
        ack({ error: res.error });
        return;
      }
      socket.join(roomId);
      ack({ ok: true, room: publicRoom(res.room) });
      broadcastRoom(roomId);
      broadcastLobby();
    });

    socket.on("room:leave", ({ roomId }) => {
      socket.leave(roomId);
      const affected = markSocketDisconnected(socket.id);
      for (const r of affected) broadcastRoom(r.id);
      broadcastLobby();
    });

    socket.on("game:action", ({ roomId, action }, ack) => {
      const res = startQuizForAction(
        roomId,
        socket.id,
        action,
        (room, outcome) => {
          io.to(room.id).emit("room:state", publicRoom(room));
          if (outcome) io.to(room.id).emit("quiz:outcome", outcome);
        },
      );
      if ("error" in res) {
        ack({ error: res.error });
        return;
      }
      ack({ ok: true });
      broadcastRoom(roomId);
    });

    socket.on("quiz:answer", ({ roomId, questionId, optionIndex }, ack) => {
      const res = submitAnswer(
        roomId,
        socket.id,
        questionId,
        optionIndex,
        (room, outcome) => {
          io.to(room.id).emit("room:state", publicRoom(room));
          if (outcome) io.to(room.id).emit("quiz:outcome", outcome);
        },
      );
      if ("error" in res) {
        ack({ error: res.error });
        return;
      }
      ack({ ok: true });
      broadcastRoom(roomId);
    });

    socket.on("disconnect", () => {
      const affected = markSocketDisconnected(socket.id);
      for (const r of affected) broadcastRoom(r.id);
      broadcastLobby();
    });
  });

  maybeRefillRemotePool();

  httpServer.listen(port, hostname, () => {
    console.log(
      `> Ready on http://${hostname}:${port} (${dev ? "dev" : "prod"})`,
    );
  });
}

main().catch((err) => {
  console.error("Server crashed:", err);
  process.exit(1);
});
