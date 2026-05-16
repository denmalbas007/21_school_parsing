"use client";

import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { GameLog } from "@/components/GameLog";
import { Pitch } from "@/components/Pitch";
import { QuizModal } from "@/components/QuizModal";
import { Scoreboard } from "@/components/Scoreboard";
import { useSocket } from "@/hooks/useSocket";
import {
  dribbleTargets as computeDribbleTargets,
  findPlayerById,
  passTargets as computePassTargets,
} from "@/lib/game/engine";
import type {
  PendingAction,
  PlayerState,
  Position,
  PublicRoom,
  QuizOutcomeMessage,
  Team,
} from "@/lib/game/types";

export default function GamePage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const router = useRouter();
  const { socket, connected, socketId } = useSocket();

  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<QuizOutcomeMessage | null>(
    null,
  );
  const [mode, setMode] = useState<"pass" | "dribble" | "shoot" | null>(null);

  // Join room on mount.
  useEffect(() => {
    if (!socket || !connected) return;
    const name =
      (typeof window !== "undefined" &&
        window.localStorage.getItem("qb:name")) ||
      "Игрок";
    socket.emit("room:join", { roomId, name }, (res) => {
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setRoom(res.room);
    });
  }, [socket, connected, roomId]);

  // Subscribe to room state + outcomes.
  useEffect(() => {
    if (!socket) return;
    const onRoomState = (r: PublicRoom) => {
      if (r.id !== roomId) return;
      setRoom(r);
      // Reset mode when quiz starts or carrier changes.
      setMode(null);
    };
    const onOutcome = (msg: QuizOutcomeMessage) => {
      setLastOutcome(msg);
      // auto-clear notice after 3s
      setTimeout(() => {
        setLastOutcome((cur) =>
          cur?.questionId === msg.questionId ? null : cur,
        );
      }, 3500);
    };
    const onError = (msg: { message: string }) => setError(msg.message);
    socket.on("room:state", onRoomState);
    socket.on("quiz:outcome", onOutcome);
    socket.on("system:error", onError);
    return () => {
      socket.off("room:state", onRoomState);
      socket.off("quiz:outcome", onOutcome);
      socket.off("system:error", onError);
    };
  }, [socket, roomId]);

  const mySeatTeam: Team | null = useMemo(() => {
    if (!room || !socketId) return null;
    return room.seats.find((s) => s.socketId === socketId)?.team ?? null;
  }, [room, socketId]);

  const state = room?.state ?? null;

  const carrier: PlayerState | null = useMemo(() => {
    if (!state) return null;
    return state.ballCarrierId
      ? findPlayerById(state, state.ballCarrierId)
      : null;
  }, [state]);

  const passTargets = useMemo(() => {
    if (!state || !carrier || mode !== "pass") return [];
    if (carrier.team !== mySeatTeam) return [];
    return computePassTargets(state, carrier).map((p) => p.id);
  }, [state, carrier, mode, mySeatTeam]);

  const dribbleTargets: Position[] = useMemo(() => {
    if (!state || !carrier || mode !== "dribble") return [];
    if (carrier.team !== mySeatTeam) return [];
    return computeDribbleTargets(state, carrier);
  }, [state, carrier, mode, mySeatTeam]);

  const submitAction = useCallback(
    (action: PendingAction) => {
      if (!socket) return;
      socket.emit("game:action", { roomId, action }, (res) => {
        if ("error" in res) setError(res.error);
        else setError(null);
      });
      setMode(null);
    },
    [socket, roomId],
  );

  const handleSelectPlayer = useCallback(
    (target: PlayerState) => {
      if (!state || !carrier) return;
      if (mode === "pass" && target.team === carrier.team && target.id !== carrier.id) {
        submitAction({ type: "pass", from: carrier.id, to: target.id });
      }
    },
    [state, carrier, mode, submitAction],
  );

  const handleSelectCell = useCallback(
    (pos: Position) => {
      if (!carrier) return;
      if (mode === "dribble") {
        submitAction({ type: "dribble", from: carrier.id, toPos: pos });
      }
    },
    [carrier, mode, submitAction],
  );

  const handleShoot = useCallback(() => {
    if (!carrier) return;
    if (mode === "shoot") {
      submitAction({ type: "shoot", from: carrier.id });
    }
  }, [carrier, mode, submitAction]);

  const handleAnswer = useCallback(
    (questionId: string, optionIndex: number) => {
      if (!socket) return;
      socket.emit(
        "quiz:answer",
        { roomId, questionId, optionIndex },
        (res) => {
          if ("error" in res) setError(res.error);
        },
      );
    },
    [socket, roomId],
  );

  if (!state || !room) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="glass rounded-2xl px-6 py-4 text-zinc-200">
          {error ?? "Подключаемся к комнате…"}
          {error && (
            <button
              onClick={() => router.push("/")}
              className="ml-3 rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
            >
              в лобби
            </button>
          )}
        </div>
      </main>
    );
  }

  const waitingForOpponent = room.seats.length < 2;

  return (
    <main className="flex-1 px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <button
            onClick={() => router.push("/")}
            className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
          >
            ← в лобби
          </button>
          <div className="text-xs text-zinc-400">
            комната <span className="font-mono text-zinc-200">#{room.id}</span>
          </div>
        </header>

        <Scoreboard state={state} seats={room.seats} mySeatTeam={mySeatTeam} />

        {waitingForOpponent && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl px-4 py-3 text-sm text-zinc-200"
          >
            Ждём второго игрока. Поделитесь этой ссылкой:&nbsp;
            <code className="rounded bg-white/10 px-2 py-0.5">
              {typeof window !== "undefined" ? window.location.href : ""}
            </code>
          </motion.div>
        )}

        <Pitch
          state={state}
          mySocketId={socketId}
          mySeatTeam={mySeatTeam}
          passTargetIds={passTargets}
          dribbleTargets={dribbleTargets}
          canShoot={mode === "shoot"}
          highlightActionMode={mode}
          onSelectPlayer={handleSelectPlayer}
          onSelectCell={handleSelectCell}
          onShoot={handleShoot}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <ActionPanel
            state={state}
            mySeatTeam={mySeatTeam}
            mode={mode}
            onSetMode={setMode}
          />
          <GameLog entries={state.log} />
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl bg-rose-500/15 px-4 py-2 text-sm text-rose-200"
          >
            {error}
          </motion.div>
        )}
      </div>

      <QuizModal
        quiz={state.quiz}
        mySeatTeam={mySeatTeam}
        lastOutcome={lastOutcome}
        onAnswer={handleAnswer}
      />
    </main>
  );
}
