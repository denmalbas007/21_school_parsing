"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import type { Team } from "@/lib/game/types";

interface GoalCelebrationProps {
  show: boolean;
  team: Team | null;
  scorerLabel?: string;
  // "goal" = scored, "win" = final goal of the match
  mode: "goal" | "win" | null;
}

const TEAM_COLOR: Record<Team, string> = {
  A: "#22d3ee",
  B: "#f43f5e",
};

const TEAM_GRAD: Record<Team, string> = {
  A: "from-cyan-400 via-cyan-500 to-sky-600",
  B: "from-rose-400 via-rose-500 to-pink-600",
};

export function GoalCelebration({
  show,
  team,
  scorerLabel,
  mode,
}: GoalCelebrationProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: 36 }).map((_, i) => ({
        i,
        x: (Math.random() - 0.5) * 800,
        y: -200 - Math.random() * 200,
        rot: Math.random() * 720 - 360,
        delay: Math.random() * 0.3,
        color:
          team === "A"
            ? `hsl(${180 + Math.random() * 40}, 90%, ${55 + Math.random() * 20}%)`
            : `hsl(${340 + Math.random() * 30}, 90%, ${55 + Math.random() * 20}%)`,
      })),
    [team, show],
  );

  return (
    <AnimatePresence>
      {show && team && (
        <motion.div
          key="goal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        >
          {/* Backdrop wash with team color */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at center, ${TEAM_COLOR[team]}55 0%, transparent 65%)`,
            }}
          />

          {/* Confetti */}
          <div className="absolute inset-0 overflow-hidden">
            {particles.map((p) => (
              <motion.span
                key={p.i}
                className="absolute left-1/2 top-1/2 block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: p.color }}
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={{
                  x: p.x,
                  y: -p.y + 600,
                  rotate: p.rot,
                  opacity: [1, 1, 0],
                }}
                transition={{
                  duration: 1.8,
                  delay: p.delay,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>

          {/* Big text */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 16 }}
            className="relative flex flex-col items-center gap-3"
          >
            <motion.h2
              animate={{
                textShadow: [
                  `0 0 24px ${TEAM_COLOR[team]}`,
                  `0 0 48px ${TEAM_COLOR[team]}`,
                  `0 0 24px ${TEAM_COLOR[team]}`,
                ],
              }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className={`bg-gradient-to-b ${TEAM_GRAD[team]} bg-clip-text text-7xl font-black tracking-tight text-transparent sm:text-9xl`}
            >
              {mode === "win" ? "ПОБЕДА!" : "ГОЛ!"}
            </motion.h2>
            <p className="text-base text-zinc-100 sm:text-xl">
              Команда{" "}
              <span
                className="font-bold"
                style={{ color: TEAM_COLOR[team] }}
              >
                {team}
              </span>
              {scorerLabel ? ` · ${scorerLabel}` : ""}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
