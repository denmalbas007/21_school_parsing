"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { GameState, PlayerState, Position, Team } from "@/lib/game/types";

export type ActionMode = "pass" | "dribble" | "shoot" | "relocate" | null;

interface PitchProps {
  state: GameState;
  mySeatTeam: Team | null;
  selectedRelocatePlayerId: string | null;
  passTargetIds?: string[];
  dribbleTargets?: Position[];
  relocateTargets?: Position[];
  canShoot?: boolean;
  highlightActionMode: ActionMode;
  onSelectPlayer?: (player: PlayerState) => void;
  onSelectCell?: (pos: Position) => void;
  onShoot?: () => void;
}

const CELL = 64;
const PAD = 28;

export function Pitch({
  state,
  mySeatTeam,
  selectedRelocatePlayerId,
  passTargetIds,
  dribbleTargets,
  relocateTargets,
  canShoot,
  highlightActionMode,
  onSelectPlayer,
  onSelectCell,
  onShoot,
}: PitchProps) {
  const W = state.cols * CELL + PAD * 2;
  const H = state.rows * CELL + PAD * 2;

  const carrier = state.players.find((p) => p.id === state.ballCarrierId);

  function cellCenter(p: Position) {
    return {
      x: PAD + p.col * CELL + CELL / 2,
      y: PAD + p.row * CELL + CELL / 2,
    };
  }

  const ballScreenPos = useMemo(() => {
    if (carrier) return cellCenter(carrier.pos);
    return cellCenter(state.ballPos);
  }, [carrier, state.ballPos]);

  const goalACy = PAD + CELL * Math.floor(state.rows / 2) + CELL / 2;

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto block w-full max-w-[680px]"
      >
        <defs>
          <linearGradient id="pitchGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#127a3c" />
            <stop offset="100%" stopColor="#0a4a25" />
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
              fill="rgba(255,255,255,0.045)"
            />
          </pattern>
          <radialGradient id="ballGrad">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#eaeaea" />
            <stop offset="100%" stopColor="#a0a0a0" />
          </radialGradient>
          <filter id="playerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Pitch */}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          rx={18}
          fill="url(#stripes)"
        />
        <rect
          x={PAD}
          y={PAD}
          width={state.cols * CELL}
          height={state.rows * CELL}
          fill="transparent"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth={2}
        />
        <line
          x1={PAD + (state.cols * CELL) / 2}
          y1={PAD}
          x2={PAD + (state.cols * CELL) / 2}
          y2={PAD + state.rows * CELL}
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={1.5}
        />
        <circle
          cx={PAD + (state.cols * CELL) / 2}
          cy={PAD + (state.rows * CELL) / 2}
          r={CELL * 0.8}
          fill="transparent"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={1.5}
        />
        <circle
          cx={PAD + (state.cols * CELL) / 2}
          cy={PAD + (state.rows * CELL) / 2}
          r={3}
          fill="rgba(255,255,255,0.55)"
        />
        {/* Penalty boxes (left & right) */}
        <rect
          x={PAD}
          y={PAD + CELL * 0.5}
          width={CELL * 1.5}
          height={CELL * (state.rows - 1)}
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.5)"
        />
        <rect
          x={PAD + (state.cols - 1.5) * CELL}
          y={PAD + CELL * 0.5}
          width={CELL * 1.5}
          height={CELL * (state.rows - 1)}
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.5)"
        />

        {/* Goals (outside playing area) */}
        <rect
          x={PAD - 12}
          y={goalACy - CELL * 0.9}
          width={12}
          height={CELL * 1.8}
          fill="rgba(34, 211, 238, 0.5)"
          stroke="rgba(34, 211, 238, 0.95)"
          strokeWidth={2}
          rx={2}
        />
        <rect
          x={PAD + state.cols * CELL}
          y={goalACy - CELL * 0.9}
          width={12}
          height={CELL * 1.8}
          fill="rgba(244, 63, 94, 0.5)"
          stroke="rgba(244, 63, 94, 0.95)"
          strokeWidth={2}
          rx={2}
        />

        {/* Relocate target cells */}
        {relocateTargets?.map((pos, i) => {
          const c = cellCenter(pos);
          return (
            <motion.rect
              key={`reloc-${i}`}
              x={c.x - CELL / 2 + 4}
              y={c.y - CELL / 2 + 4}
              width={CELL - 8}
              height={CELL - 8}
              rx={10}
              fill="rgba(96, 165, 250, 0.18)"
              stroke="rgba(96, 165, 250, 0.85)"
              strokeDasharray="4 4"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              className="cursor-pointer"
              onClick={() => onSelectCell?.(pos)}
            />
          );
        })}

        {/* Dribble target cells */}
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
              fill="rgba(250, 204, 21, 0.18)"
              stroke="rgba(250, 204, 21, 0.85)"
              strokeDasharray="4 4"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              className="cursor-pointer"
              onClick={() => onSelectCell?.(pos)}
            />
          );
        })}

        {/* Pass target highlights + dashed line from carrier */}
        {carrier &&
          passTargetIds?.map((id) => {
            const p = state.players.find((pl) => pl.id === id);
            if (!p) return null;
            const c = cellCenter(p.pos);
            const cFrom = cellCenter(carrier.pos);
            return (
              <g key={`pt-${id}`}>
                <motion.line
                  x1={cFrom.x}
                  y1={cFrom.y}
                  x2={c.x}
                  y2={c.y}
                  stroke="rgba(250, 204, 21, 0.6)"
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                />
                <motion.circle
                  cx={c.x}
                  cy={c.y}
                  r={CELL * 0.5}
                  fill="transparent"
                  stroke="rgba(250, 204, 21, 0.95)"
                  strokeWidth={3}
                  strokeDasharray="5 4"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                />
              </g>
            );
          })}

        {/* Shoot indicator */}
        {canShoot && carrier && (
          <g>
            <motion.line
              x1={cellCenter(carrier.pos).x}
              y1={cellCenter(carrier.pos).y}
              x2={
                carrier.team === "A"
                  ? PAD + state.cols * CELL + 12
                  : PAD - 12
              }
              y2={goalACy}
              stroke={
                carrier.team === "A"
                  ? "rgba(244, 63, 94, 0.85)"
                  : "rgba(34, 211, 238, 0.85)"
              }
              strokeWidth={3}
              strokeDasharray="8 6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="cursor-pointer"
              onClick={() => onShoot?.()}
            />
            <motion.circle
              cx={
                carrier.team === "A"
                  ? PAD + state.cols * CELL + 12
                  : PAD - 12
              }
              cy={goalACy}
              r={13}
              fill="rgba(255,255,255,0.92)"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              className="cursor-pointer"
              onClick={() => onShoot?.()}
            />
          </g>
        )}

        {/* Players */}
        {state.players.map((p) => {
          const c = cellCenter(p.pos);
          const isActive = p.id === state.activePlayerId;
          const isCarrier = p.id === state.ballCarrierId;
          const isSelectedRelocate = p.id === selectedRelocatePlayerId;
          const teamColor =
            p.team === "A"
              ? "rgb(34, 211, 238)"
              : "rgb(244, 63, 94)";
          const teamShadow =
            p.team === "A"
              ? "rgba(34, 211, 238, 0.55)"
              : "rgba(244, 63, 94, 0.55)";
          const clickable =
            !!passTargetIds?.includes(p.id) ||
            (highlightActionMode === "relocate" &&
              mySeatTeam === p.team &&
              !isCarrier) ||
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
              {(isActive || isSelectedRelocate) && (
                <motion.circle
                  r={CELL * 0.46}
                  fill="transparent"
                  stroke={
                    isSelectedRelocate
                      ? "rgba(96, 165, 250, 0.95)"
                      : "rgba(250, 204, 21, 0.9)"
                  }
                  strokeWidth={2.5}
                  initial={{ scale: 0.8, opacity: 0.6 }}
                  animate={{ scale: [1, 1.14, 1], opacity: [0.7, 1, 0.7] }}
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
                stroke="rgba(0,0,0,0.55)"
                strokeWidth={2}
                style={{ filter: `drop-shadow(0 0 8px ${teamShadow})` }}
              />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={CELL * 0.34}
                fontWeight={800}
                fill="rgba(0,0,0,0.85)"
                style={{ pointerEvents: "none" }}
              >
                {p.number}
              </text>
              {isCarrier && (
                <g style={{ pointerEvents: "none" }}>
                  <circle
                    cx={CELL * 0.28}
                    cy={-CELL * 0.28}
                    r={8}
                    fill="url(#ballGrad)"
                    stroke="black"
                    strokeWidth={1}
                  />
                </g>
              )}
            </motion.g>
          );
        })}

        {/* Loose ball — separate animated element if not carried */}
        {!carrier && (
          <motion.circle
            initial={false}
            animate={{ cx: ballScreenPos.x, cy: ballScreenPos.y }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            r={9}
            fill="url(#ballGrad)"
            stroke="black"
            strokeWidth={1.5}
          />
        )}
      </svg>
    </div>
  );
}
