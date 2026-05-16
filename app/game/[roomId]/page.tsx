"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionPanel, type ActionMode } from "@/components/ActionPanel";
import { GameLog } from "@/components/GameLog";
import { GoalCelebration } from "@/components/GoalCelebration";
import { QuizModal } from "@/components/QuizModal";
import { Scoreboard } from "@/components/Scoreboard";
import { useSocket } from "@/hooks/useSocket";
import {
  dribbleTargets as computeDribbleTargets,
  findPlayerById,
  passTargets as computePassTargets,
  relocateTargets as computeRelocateTargets,
  sprintTargets as computeSprintTargets,
} from "@/lib/game/engine";
import type {
  PendingAction,
  PlayerState,
  Position,
  PublicRoom,
  QuizOutcomeMessage,
  Team,
} from "@/lib/game/types";

// Pitch3D uses three.js — load it client-only to avoid SSR noise.
const Pitch3D = dynamic(
  () => import("@/components/Pitch3D").then((m) => m.Pitch3D),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto aspect-[16/10] w-full max-w-[760px] glass rounded-2xl flex items-center justify-center text-zinc-400">
        Загружаем 3D-поле…
      </div>
    ),
  },
);

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
      playOutcomeSound(msg);
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

  useEffect(() => {
    if (!state) return;
    const prev = prevScoreRef.current;
    const scoredTeam: Team | null =
      state.score.A > prev.A ? "A" : state.score.B > prev.B ? "B" : null;
    if (scoredTeam) {
      const winnerJust = state.winner === scoredTeam;
      playGoalSound();
      setGoalShow({
        team: scoredTeam,
        scorerLabel: winnerJust ? "Финальный счёт" : "",
        mode: winnerJust ? "win" : "goal",
      });
      setTimeout(
        () => setGoalShow(null),
        winnerJust ? 4500 : 2200,
      );
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
    if (!state || !carrier) return [];
    if (mode !== "pass" && mode !== "lob") return [];
    if (!iHaveBall) return [];
    return computePassTargets(state, carrier).map((p) => p.id);
  }, [state, carrier, mode, iHaveBall]);

  const dribbleTargets: Position[] = useMemo(() => {
    if (!state || !carrier || mode !== "dribble") return [];
    if (!iHaveBall) return [];
    return computeDribbleTargets(state, carrier);
  }, [state, carrier, mode, iHaveBall]);

  const sprintTargets: Position[] = useMemo(() => {
    if (!state || !carrier || mode !== "sprint") return [];
    if (!iHaveBall) return [];
    return computeSprintTargets(state, carrier);
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
      playActionSound(action.type);
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
      if (
        (mode === "pass" || mode === "lob") &&
        carrier &&
        target.team === carrier.team &&
        target.id !== carrier.id
      ) {
        submitAction({
          type: mode === "lob" ? "lob" : "pass",
          from: carrier.id,
          to: target.id,
        });
      } else if (
        mode === "relocate" &&
        target.team === mySeatTeam &&
        target.id !== state.ballCarrierId
      ) {
        setSelectedRelocateId(target.id);
      }
    },
    [state, carrier, mode, mySeatTeam, submitAction],
  );

  const handleSelectCell = useCallback(
    (pos: Position) => {
      if (mode === "dribble" && carrier) {
        submitAction({ type: "dribble", from: carrier.id, toPos: pos });
      } else if (mode === "sprint" && carrier) {
        submitAction({ type: "sprint", from: carrier.id, toPos: pos });
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
      playTickSound();
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
      if (iHaveBall) return "Ваш ход — у вас мяч";
      return "Ваш ход — без мяча, занимайте позицию";
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

        <Pitch3D
          state={state}
          mySeatTeam={mySeatTeam}
          selectedRelocatePlayerId={selectedRelocateId}
          passTargetIds={passTargets}
          dribbleTargets={dribbleTargets}
          sprintTargets={sprintTargets}
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

// ---- Tiny Web Audio sound effects -----------------------------------------

let audioCtx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function beep(freq: number, durMs: number, type: OscillatorType = "sine", gain = 0.08) {
  const ctx = ac();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = 0;
  osc.connect(g).connect(ctx.destination);
  const t0 = ctx.currentTime;
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

function playActionSound(kind: string) {
  switch (kind) {
    case "pass":
      beep(520, 80, "triangle");
      break;
    case "lob":
      beep(420, 140, "sine");
      setTimeout(() => beep(600, 140, "sine"), 100);
      break;
    case "dribble":
      beep(340, 70, "square", 0.05);
      break;
    case "sprint":
      beep(380, 90, "sawtooth", 0.06);
      setTimeout(() => beep(440, 80, "sawtooth", 0.05), 80);
      break;
    case "shoot":
      beep(220, 220, "sawtooth", 0.1);
      break;
    case "relocate":
      beep(260, 60, "sine", 0.04);
      break;
  }
}

function playTickSound() {
  beep(720, 50, "sine", 0.06);
}

function playGoalSound() {
  beep(523, 180, "triangle", 0.12);
  setTimeout(() => beep(659, 180, "triangle", 0.12), 150);
  setTimeout(() => beep(784, 280, "triangle", 0.12), 300);
}

function playOutcomeSound(msg: QuizOutcomeMessage) {
  if (msg.outcome === "actor_win" || msg.outcome === "tie_to_actor") {
    beep(660, 100, "sine", 0.07);
  } else if (msg.outcome === "defender_win") {
    beep(180, 220, "square", 0.07);
  } else {
    beep(120, 200, "triangle", 0.05);
  }
}
