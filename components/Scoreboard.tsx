"use client";

import { motion } from "framer-motion";
import type { GameState, SeatInfo, Team } from "@/lib/game/types";
import { cn } from "@/lib/utils";

interface ScoreboardProps {
  state: GameState;
  seats: SeatInfo[];
  mySeatTeam: Team | null;
}

export function Scoreboard({ state, seats, mySeatTeam }: ScoreboardProps) {
  const teamA = seats.find((s) => s.team === "A");
  const teamB = seats.find((s) => s.team === "B");

  return (
    <div className="glass flex items-center justify-between gap-4 rounded-2xl px-5 py-4">
      <TeamPanel
        team="A"
        name={teamA?.name ?? "Свободно"}
        connected={!!teamA?.connected}
        active={state.turn === "A" && state.status === "play"}
        isMe={mySeatTeam === "A"}
      />
      <div className="flex flex-col items-center">
        <motion.div
          key={`${state.score.A}-${state.score.B}`}
          initial={{ scale: 0.9, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          className="font-mono text-3xl font-bold tracking-tight"
        >
          <span className="text-cyan-300">{state.score.A}</span>
          <span className="mx-2 text-zinc-500">:</span>
          <span className="text-rose-300">{state.score.B}</span>
        </motion.div>
        <span className="text-[10px] uppercase tracking-widest text-zinc-400">
          до {state.goalTarget} голов
        </span>
        {state.status === "ended" && state.winner && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "mt-1 rounded-full px-3 py-0.5 text-xs font-semibold",
              state.winner === "A"
                ? "bg-cyan-400/20 text-cyan-200"
                : "bg-rose-400/20 text-rose-200",
            )}
          >
            Победила команда {state.winner}
          </motion.span>
        )}
      </div>
      <TeamPanel
        team="B"
        name={teamB?.name ?? "Свободно"}
        connected={!!teamB?.connected}
        active={state.turn === "B" && state.status === "play"}
        isMe={mySeatTeam === "B"}
        align="right"
      />
    </div>
  );
}

function TeamPanel({
  team,
  name,
  connected,
  active,
  isMe,
  align = "left",
}: {
  team: Team;
  name: string;
  connected: boolean;
  active: boolean;
  isMe: boolean;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-1",
        align === "right" && "items-end text-right",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          align === "right" && "flex-row-reverse",
        )}
      >
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
            team === "A"
              ? "bg-cyan-400 text-zinc-900"
              : "bg-rose-400 text-zinc-900",
          )}
        >
          {team}
        </span>
        <span className={cn("text-sm font-medium", !connected && "opacity-50")}>
          {name}
          {isMe && (
            <span className="ml-1 text-[10px] text-emerald-300">(вы)</span>
          )}
        </span>
      </div>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
          active
            ? "bg-amber-400/20 text-amber-200"
            : "bg-white/5 text-zinc-400",
        )}
      >
        {active ? "ход" : connected ? "ждёт" : "отключён"}
      </span>
    </div>
  );
}
