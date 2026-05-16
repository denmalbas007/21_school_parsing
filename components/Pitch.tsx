"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { GameState, PlayerState, Position, Team } from "@/lib/game/types";

interface PitchProps {
  state: GameState;
  mySocketId: string | null;
  mySeatTeam: Team | null;
  // Visible during action picker
  passTargetIds?: string[];
  dribbleTargets?: Position[];
  canShoot?: boolean;
  highlightActionMode?: "pass" | "dribble" | "shoot" | null;
  onSelectPlayer?: (player: PlayerState) => void;
  onSelectCell?: (pos: Position) => void;
  onShoot?: () => void;
}

const CELL = 64; // px per cell
const PAD = 28;

export function Pitch({
  state,
  mySeatTeam,
  passTargetIds,
  dribbleTargets,
  canShoot,
  highlightActionMode,
  onSelectPlayer,
  onSelectCell,
  onShoot,
}: PitchProps) {
  const W = state.cols * CELL + PAD * 2;
  const H = state.rows * CELL + PAD * 2;

  const carrier = state.players.find((p) => p.id === state.ballCarrierId);

  const ballScreenPos = useMemo(() => {
    if (carrier) return cellCenter(carrier.pos);
    return cellCenter(state.ballPos);
  }, [carrier, state.ballPos]);

  function cellCenter(p: Position) {
    return {
      x: PAD + p.col * CELL + CELL / 2,
      y: PAD + p.row * CELL + CELL / 2,
    };
  }

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto block w-full max-w-[640px]"
      >
        {/* Pitch background */}
        <defs>
          <linearGradient id="pitchGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0e5430" />
            <stop offset="100%" stopColor="#0a3d23" />
          </linearGradient>
          <pattern
            id="stripes"
            patternUnits="userSpaceOnUse"
            width={CELL * 2}
            height={H}
          >
            <rect width={CELL * 2} height={H} fill="url(#pitchGrad)" />
            <rect
              x={CELL}
              width={CELL}
              height={H}
              fill="rgba(255,255,255,0.04)"
            />
          </pattern>
        </defs>
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          rx={18}
          fill="url(#stripes)"
        />
        {/* Outer line */}
        <rect
          x={PAD}
          y={PAD}
          width={state.cols * CELL}
          height={state.rows * CELL}
          fill="transparent"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth={2}
        />
        {/* Centre line */}
        <line
          x1={PAD + (state.cols * CELL) / 2}
          y1={PAD}
          x2={PAD + (state.cols * CELL) / 2}
          y2={PAD + state.rows * CELL}
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={1.5}
        />
        {/* Centre circle */}
        <circle
          cx={PAD + (state.cols * CELL) / 2}
          cy={PAD + (state.rows * CELL) / 2}
          r={CELL * 0.8}
          fill="transparent"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={1.5}
        />
        {/* Goal areas */}
        <rect
          x={PAD}
          y={PAD + CELL}
          width={CELL}
          height={CELL * (state.rows - 2)}
          fill="rgba(255,255,255,0.06)"
          stroke="rgba(255,255,255,0.45)"
        />
        <rect
          x={PAD + (state.cols - 1) * CELL}
          y={PAD + CELL}
          width={CELL}
          height={CELL * (state.rows - 2)}
          fill="rgba(255,255,255,0.06)"
          stroke="rgba(255,255,255,0.45)"
        />
        {/* Goals (outside playing area) */}
        <rect
          x={PAD - 10}
          y={PAD + CELL * Math.floor(state.rows / 2) - 4}
          width={10}
          height={CELL + 8}
          fill="rgba(34, 211, 238, 0.6)"
          rx={2}
        />
        <rect
          x={PAD + state.cols * CELL}
          y={PAD + CELL * Math.floor(state.rows / 2) - 4}
          width={10}
          height={CELL + 8}
          fill="rgba(244, 63, 94, 0.6)"
          rx={2}
        />

        {/* Cells (for dribble click) */}
        {dribbleTargets?.map((pos, i) => {
          const c = cellCenter(pos);
          return (
            <motion.rect
              key={`drib-${i}`}
              x={c.x - CELL / 2 + 4}
              y={c.y - CELL / 2 + 4}
              width={CELL - 8}
              height={CELL - 8}
              rx={10}
              fill="rgba(250, 204, 21, 0.15)"
              stroke="rgba(250, 204, 21, 0.7)"
              strokeDasharray="4 4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="cursor-pointer"
              onClick={() => onSelectCell?.(pos)}
            />
          );
        })}

        {/* Pass targets indicators */}
        {passTargetIds?.map((id) => {
          const p = state.players.find((pl) => pl.id === id);
          if (!p) return null;
          const c = cellCenter(p.pos);
          return (
            <motion.circle
              key={`pt-${id}`}
              cx={c.x}
              cy={c.y}
              r={CELL * 0.5}
              fill="transparent"
              stroke="rgba(250, 204, 21, 0.9)"
              strokeWidth={3}
              strokeDasharray="5 4"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
            />
          );
        })}

        {/* Shoot indicator */}
        {canShoot && carrier && (
          <>
            <motion.line
              x1={cellCenter(carrier.pos).x}
              y1={cellCenter(carrier.pos).y}
              x2={
                carrier.team === "A"
                  ? PAD + state.cols * CELL + 10
                  : PAD - 10
              }
              y2={PAD + CELL * Math.floor(state.rows / 2) + CELL / 2}
              stroke={
                carrier.team === "A"
                  ? "rgba(244, 63, 94, 0.85)"
                  : "rgba(34, 211, 238, 0.85)"
              }
              strokeWidth={3}
              strokeDasharray="6 6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="cursor-pointer"
              onClick={() => onShoot?.()}
            />
            <motion.circle
              cx={
                carrier.team === "A"
                  ? PAD + state.cols * CELL + 10
                  : PAD - 10
              }
              cy={PAD + CELL * Math.floor(state.rows / 2) + CELL / 2}
              r={12}
              fill="rgba(255,255,255,0.85)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="cursor-pointer"
              onClick={() => onShoot?.()}
            />
          </>
        )}

        {/* Players */}
        {state.players.map((p) => {
          const c = cellCenter(p.pos);
          const isActive = p.id === state.activePlayerId;
          const isCarrier = p.id === state.ballCarrierId;
          const teamColor =
            p.team === "A"
              ? "rgb(34, 211, 238)"
              : "rgb(244, 63, 94)";
          const clickable =
            !!passTargetIds?.includes(p.id) ||
            (highlightActionMode === null &&
              mySeatTeam === p.team &&
              p.id === state.ballCarrierId);
          return (
            <motion.g
              key={p.id}
              initial={false}
              animate={{ x: c.x, y: c.y }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
              className={cn(clickable && "cursor-pointer")}
              onClick={() => clickable && onSelectPlayer?.(p)}
            >
              {isActive && (
                <motion.circle
                  r={CELL * 0.45}
                  fill="transparent"
                  stroke="rgba(250, 204, 21, 0.9)"
                  strokeWidth={2}
                  initial={{ scale: 0.8, opacity: 0.6 }}
                  animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              )}
              <circle
                r={CELL * 0.36}
                fill={teamColor}
                stroke="rgba(0,0,0,0.5)"
                strokeWidth={2}
              />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={CELL * 0.36}
                fontWeight={700}
                fill="rgba(0,0,0,0.85)"
              >
                {p.number}
              </text>
              {isCarrier && (
                <circle
                  cx={CELL * 0.28}
                  cy={-CELL * 0.28}
                  r={6}
                  fill="white"
                  stroke="black"
                  strokeWidth={1}
                />
              )}
            </motion.g>
          );
        })}

        {/* Ball — animated separately so it visually travels */}
        <motion.circle
          initial={false}
          animate={{
            cx: ballScreenPos.x + (carrier ? CELL * 0.28 : 0),
            cy: ballScreenPos.y + (carrier ? -CELL * 0.28 : 0),
          }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          r={7}
          fill="white"
          stroke="black"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}
