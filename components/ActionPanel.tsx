"use client";

import { motion } from "framer-motion";
import type { GameState, PlayerState, Team } from "@/lib/game/types";
import { canShoot } from "@/lib/game/engine";
import { cn } from "@/lib/utils";

interface ActionPanelProps {
  state: GameState;
  mySeatTeam: Team | null;
  mode: "pass" | "dribble" | "shoot" | null;
  onSetMode: (mode: "pass" | "dribble" | "shoot" | null) => void;
}

export function ActionPanel({
  state,
  mySeatTeam,
  mode,
  onSetMode,
}: ActionPanelProps) {
  const myTurn = mySeatTeam !== null && state.turn === mySeatTeam;
  const carrier: PlayerState | undefined = state.players.find(
    (p) => p.id === state.ballCarrierId,
  );
  const myCarrier =
    myTurn && carrier && carrier.team === mySeatTeam ? carrier : null;
  const shootAvailable = !!(myCarrier && canShoot(state, myCarrier));

  const disabled =
    state.status !== "play" || !myTurn || !myCarrier || state.winner !== null;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">
          Ход:{" "}
          <span
            className={cn(
              "font-semibold",
              state.turn === "A" ? "text-cyan-300" : "text-rose-300",
            )}
          >
            команда {state.turn}
          </span>
        </span>
        {state.status === "quiz" && (
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">
            викторина в игре
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ActionButton
          label="Пас"
          subtitle="выберите партнёра"
          accent="emerald"
          active={mode === "pass"}
          disabled={disabled}
          onClick={() => onSetMode(mode === "pass" ? null : "pass")}
        />
        <ActionButton
          label="Дриблинг"
          subtitle="на 1 клетку"
          accent="amber"
          active={mode === "dribble"}
          disabled={disabled}
          onClick={() => onSetMode(mode === "dribble" ? null : "dribble")}
        />
        <ActionButton
          label="Удар"
          subtitle={shootAvailable ? "по воротам" : "слишком далеко"}
          accent="rose"
          active={mode === "shoot"}
          disabled={disabled || !shootAvailable}
          onClick={() => onSetMode(mode === "shoot" ? null : "shoot")}
        />
      </div>

      {disabled && (
        <p className="mt-3 text-xs text-zinc-400">
          {state.winner
            ? `Матч окончен. Победитель — команда ${state.winner}.`
            : !myTurn
              ? "Сейчас ход соперника."
              : state.status === "quiz"
                ? "Идёт викторина — ответьте на вопрос."
                : "Нет владения мячом."}
        </p>
      )}
    </div>
  );
}

function ActionButton({
  label,
  subtitle,
  accent,
  active,
  disabled,
  onClick,
}: {
  label: string;
  subtitle: string;
  accent: "emerald" | "amber" | "rose";
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-xl px-3 py-2 text-left transition-all",
        "border border-white/10 bg-white/5 hover:bg-white/10",
        active &&
          accent === "emerald" &&
          "border-emerald-400/60 bg-emerald-400/15",
        active &&
          accent === "amber" &&
          "border-amber-400/60 bg-amber-400/15",
        active &&
          accent === "rose" &&
          "border-rose-400/60 bg-rose-400/15",
        disabled && "cursor-not-allowed opacity-50 hover:bg-white/5",
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[11px] text-zinc-400">{subtitle}</span>
    </motion.button>
  );
}
