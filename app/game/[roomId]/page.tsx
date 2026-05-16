"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionPanel, type ActionMode } from "@/components/ActionPanel";
import { GameLog } from "@/components/GameLog";
import { GoalCelebration } from "@/components/GoalCelebration";
import { Pitch } from "@/components/Pitch";
import { QuizModal } from "@/components/QuizModal";
import { Scoreboard } from "@/components/Scoreboard";
import { useSocket } from "@/hooks/useSocket";
import {
  dribbleTargets as computeDribbleTargets,
  findPlayerById,
  passTargets as computePassTargets,
  relocateTargets as computeRelocateTargets,
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
  const { socket, connected, playerId } = useSocket();

  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<QuizOutcomeMessage | null>(
    null,
  );
  const [mode, setMode] = useState<ActionMode>(null);
  const [selectedRelocateId, setSelectedRelocateId] = useState<string | null>(
    null,
  );
  const [goalShow, setGoalShow] = useState<{
    team: Team;
    scorerLabel: string;
    mode: "goal" | "win";
  } | null>(null);
  const prevScoreRef = useRef<{ A: number; B: number }>({ A: 0, B: 0 });
  const prevWinnerRef = useRef<Team | null>(null);

  // Join or rejoin the room every time we connect (handles reconnects).
  useEffect(() => {
    if (!socket || !connected) return;
    const name =
      (typeof window !== "undefined" &&
        window.localStorage.getItem("qb:name")) ||
      "Игрок";
    socket.emit(
      "room:join",
      { roomId, name, playerId },
      (res) => {
        if ("error" in res) {
          setError(res.error);
          return;
        }
        setRoom(res.room);
        setError(null);
      },
    );
  }, [socket, connected, roomId, playerId]);

  // Subscribe to room state + outcomes.
  useEffect(() => {
    if (!socket) return;
    const onRoomState = (r: PublicRoom) => {
      if (r.id !== roomId) return;
      setRoom(r);
      setMode(null);
      setSelectedRelocateId(null);
    };
    const onOutcome = (msg: QuizOutcomeMessage) => {
      setLastOutcome(msg);
      setTimeout(() => {
        setLastOutcome((cur) =>
          cur?.questionId === msg.questionId ? null : cur,
        );
      }, 3400);
    };
    socket.on("room:state", onRoomState);
    socket.on("quiz:outcome", onOutcome);
    return () => {
      socket.off("room:state", onRoomState);
      socket.off("quiz:outcome", onOutcome);
    };
  }, [socket, roomId]);

  const mySeatTeam: Team | null = useMemo(() => {
    if (!room) return null;
    return room.seats.find((s) => s.playerId === playerId)?.team ?? null;
  }, [room, playerId]);

  const state = room?.state ?? null;

  // Detect goal / win and trigger the celebration overlay.
  useEffect(() => {
    if (!state) return;
    const prev = prevScoreRef.current;
    const scoredTeam: Team | null =
      state.score.A > prev.A ? "A" : state.score.B > prev.B ? "B" : null;
    if (scoredTeam) {
      const isWin =
        state.winner === scoredTeam || prevWinnerRef.current !== state.winner;
      const winnerJust = state.winner === scoredTeam;
      setGoalShow({
        team: scoredTeam,
        scorerLabel: winnerJust ? "Финальный счёт" : "",
        mode: winnerJust ? "win" : "goal",
      });
      setTimeout(
        () => setGoalShow(null),
        winnerJust ? 4500 : 2200,
      );
      void isWin;
    }
    prevScoreRef.current = { ...state.score };
    prevWinnerRef.current = state.winner;
  }, [state]);

  const carrier: PlayerState | null = useMemo(() => {
    if (!state) return null;
    return state.ballCarrierId
      ? findPlayerById(state, state.ballCarrierId)
      : null;
  }, [state]);

  const iHaveBall =
    !!carrier && mySeatTeam !== null && carrier.team === mySeatTeam;
  const myTurn = state !== null && mySeatTeam !== null && state.turn === mySeatTeam;

  const passTargets = useMemo(() => {
    if (!state || !carrier || mode !== "pass") return [];
    if (!iHaveBall) return [];
    return computePassTargets(state, carrier).map((p) => p.id);
  }, [state, carrier, mode, iHaveBall]);

  const dribbleTargets: Position[] = useMemo(() => {
    if (!state || !carrier || mode !== "dribble") return [];
    if (!iHaveBall) return [];
    return computeDribbleTargets(state, carrier);
  }, [state, carrier, mode, iHaveBall]);

  const relocateTargets: Position[] = useMemo(() => {
    if (!state || mode !== "relocate" || !selectedRelocateId) return [];
    const p = findPlayerById(state, selectedRelocateId);
    if (!p) return [];
    return computeRelocateTargets(state, p);
  }, [state, mode, selectedRelocateId]);

  const submitAction = useCallback(
    (action: PendingAction) => {
      if (!socket) return;
      socket.emit("game:action", { roomId, action }, (res) => {
        if ("error" in res) setError(res.error);
        else setError(null);
      });
      setMode(null);
      setSelectedRelocateId(null);
    },
    [socket, roomId],
  );

  const handleSelectPlayer = useCallback(
    (target: PlayerState) => {
      if (!state || !mySeatTeam) return;
      if (mode === "pass" && carrier && target.team === carrier.team && target.id !== carrier.id) {
        submitAction({ type: "pass", from: carrier.id, to: target.id });
      } else if (mode === "relocate" && target.team === mySeatTeam) {
        setSelectedRelocateId(target.id);
      }
    },
    [state, carrier, mode, mySeatTeam, submitAction],
  );

  const handleSelectCell = useCallback(
    (pos: Position) => {
      if (mode === "dribble" && carrier) {
        submitAction({ type: "dribble", from: carrier.id, toPos: pos });
      } else if (mode === "relocate" && selectedRelocateId) {
        submitAction({
          type: "relocate",
          from: selectedRelocateId,
          toPos: pos,
        });
      }
    },
    [mode, carrier, selectedRelocateId, submitAction],
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

  const turnLabel = (() => {
    if (state.status === "ended" && state.winner)
      return `Команда ${state.winner} победила!`;
    if (waitingForOpponent) return "Ждём второго игрока";
    if (state.status === "quiz") return "Идёт викторина";
    if (state.status === "goal") return "ГОЛ! Розыгрыш с центра…";
    if (myTurn) {
      if (iHaveBall) return "Ваш ход — атакуйте с мячом";
      return "Ваш ход — переместите игрока в защиту";
    }
    return `Ход соперника (${state.turn})`;
  })();

  const turnAccent = myTurn ? "emerald" : "zinc";

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
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${
                connected
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-rose-500/15 text-rose-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? "bg-emerald-400" : "bg-rose-400 animate-pulse"
                }`}
              />
              {connected ? "онлайн" : "переподключаемся…"}
            </span>
            <span>
              комната{" "}
              <span className="font-mono text-zinc-200">#{room.id}</span>
            </span>
          </div>
        </header>

        <Scoreboard state={state} seats={room.seats} mySeatTeam={mySeatTeam} />

        <AnimatePresence>
          <motion.div
            key={turnLabel}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`rounded-2xl px-4 py-2 text-center text-sm font-medium ${
              turnAccent === "emerald"
                ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
                : "glass text-zinc-300"
            }`}
          >
            {turnLabel}
          </motion.div>
        </AnimatePresence>

        {waitingForOpponent && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl px-4 py-3 text-sm text-zinc-200"
          >
            Поделитесь ссылкой со вторым игроком:&nbsp;
            <code className="rounded bg-white/10 px-2 py-0.5 break-all">
              {typeof window !== "undefined" ? window.location.href : ""}
            </code>
          </motion.div>
        )}

        <Pitch
          state={state}
          mySeatTeam={mySeatTeam}
          selectedRelocatePlayerId={selectedRelocateId}
          passTargetIds={passTargets}
          dribbleTargets={dribbleTargets}
          relocateTargets={relocateTargets}
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
            onSetMode={(m) => {
              setMode(m);
              setSelectedRelocateId(null);
            }}
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

      <GoalCelebration
        show={!!goalShow}
        team={goalShow?.team ?? null}
        scorerLabel={goalShow?.scorerLabel}
        mode={goalShow?.mode ?? null}
      />
    </main>
  );
}
