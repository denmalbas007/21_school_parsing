"use client";

import { motion } from "framer-motion";
import type { GameState, PlayerState, Team } from "@/lib/game/types";
import { canShoot } from "@/lib/game/engine";
import { cn } from "@/lib/utils";

export type ActionMode =
  | "pass"
  | "lob"
  | "dribble"
  | "sprint"
  | "shoot"
  | "relocate"
  | null;

interface ActionPanelProps {
  state: GameState;
  mySeatTeam: Team | null;
  mode: ActionMode;
  onSetMode: (mode: ActionMode) => void;
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
  const iHaveBall =
    !!carrier && mySeatTeam !== null && carrier.team === mySeatTeam;
  const myCarrier = myTurn && iHaveBall ? carrier : null;
  const shootAvailable = !!(myCarrier && canShoot(state, myCarrier));

  const disabled =
    state.status !== "play" || !myTurn || state.winner !== null;

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
          {myTurn && (
            <span className="ml-2 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              ваш
            </span>
          )}
        </span>
        {state.status === "quiz" && (
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs text-amber-200">
            викторина
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {iHaveBall && myTurn && (
          <>
            <ActionButton
              label="Пас"
              subtitle="на партнёра"
              accent="emerald"
              active={mode === "pass"}
              disabled={disabled}
              onClick={() => onSetMode(mode === "pass" ? null : "pass")}
            />
            <ActionButton
              label="Навес"
              subtitle="над защитой"
              accent="violet"
              active={mode === "lob"}
              disabled={disabled}
              onClick={() => onSetMode(mode === "lob" ? null : "lob")}
            />
            <ActionButton
              label="Дриблинг"
              subtitle="1 клетка"
              accent="amber"
              active={mode === "dribble"}
              disabled={disabled}
              onClick={() => onSetMode(mode === "dribble" ? null : "dribble")}
            />
            <ActionButton
              label="Спринт"
              subtitle="2 клетки прямо"
              accent="orange"
              active={mode === "sprint"}
              disabled={disabled}
              onClick={() => onSetMode(mode === "sprint" ? null : "sprint")}
            />
            <ActionButton
              label="Удар"
              subtitle={shootAvailable ? "по воротам" : "далеко"}
              accent="rose"
              active={mode === "shoot"}
              disabled={disabled || !shootAvailable}
              onClick={() => onSetMode(mode === "shoot" ? null : "shoot")}
            />
          </>
        )}
        <ActionButton
          label="Передвинуть"
          subtitle={
            iHaveBall ? "партнёра без мяча" : "любого игрока"
          }
          accent="sky"
          active={mode === "relocate"}
          disabled={disabled}
          onClick={() => onSetMode(mode === "relocate" ? null : "relocate")}
        />
      </div>

      {disabled && (
        <p className="mt-3 text-xs text-zinc-400">
          {state.winner
            ? `Матч окончен. Победитель — команда ${state.winner}.`
            : !myTurn
              ? "Сейчас ход соперника. Подождите его решения."
              : state.status === "quiz"
                ? "Идёт викторина — ответьте на вопрос."
                : ""}
        </p>
      )}

      {!disabled && mode && (
        <p className="mt-3 text-xs text-zinc-400">
          {mode === "pass" && "Выберите партнёра — линии паса покажут возможности."}
          {mode === "lob" && "Выберите партнёра — навес идёт над защитниками, но викторина сложнее."}
          {mode === "dribble" && "Кликните на жёлтую клетку. Защитник рядом — викторина."}
          {mode === "sprint" && "Кликните оранжевую клетку (2 клетки в одном направлении)."}
          {mode === "shoot" && "Кликните светящийся мяч у ворот соперника."}
          {mode === "relocate" && (iHaveBall
            ? "Выберите своего игрока без мяча, потом клетку рядом."
            : "Выберите своего игрока, потом клетку рядом — без викторины.")}
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
  accent: "emerald" | "amber" | "rose" | "sky" | "violet" | "orange";
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
        active && accent === "emerald" && "border-emerald-400/60 bg-emerald-400/15",
        active && accent === "amber" && "border-amber-400/60 bg-amber-400/15",
        active && accent === "rose" && "border-rose-400/60 bg-rose-400/15",
        active && accent === "sky" && "border-sky-400/60 bg-sky-400/15",
        active && accent === "violet" && "border-violet-400/60 bg-violet-400/15",
        active && accent === "orange" && "border-orange-400/60 bg-orange-400/15",
        disabled && "cursor-not-allowed opacity-50 hover:bg-white/5",
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[11px] text-zinc-400">{subtitle}</span>
    </motion.button>
  );
}
