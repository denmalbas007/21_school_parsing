"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { CATEGORY_LABELS } from "@/data/questions";
import type {
  ActiveQuiz,
  QuizOutcomeMessage,
  Team,
} from "@/lib/game/types";
import { cn } from "@/lib/utils";

interface QuizModalProps {
  quiz: ActiveQuiz | null;
  mySeatTeam: Team | null;
  lastOutcome: QuizOutcomeMessage | null;
  onAnswer: (questionId: string, optionIndex: number) => void;
}

const DIFFICULTY_LABEL: Record<ActiveQuiz["difficulty"], string> = {
  easy: "лёгкая",
  medium: "средняя",
  hard: "жёсткая",
};

export function QuizModal({
  quiz,
  mySeatTeam,
  lastOutcome,
  onAnswer,
}: QuizModalProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!quiz) return;
    const i = setInterval(() => setNow(Date.now()), 80);
    return () => clearInterval(i);
  }, [quiz]);

  const myParticipation = useMemo(() => {
    if (!quiz || !mySeatTeam) return null;
    return quiz.participants.find((p) => p.team === mySeatTeam) ?? null;
  }, [quiz, mySeatTeam]);

  const remainingMs = quiz ? Math.max(0, quiz.deadlineAt - now) : 0;
  const totalMs = quiz ? quiz.deadlineAt - quiz.startedAt : 1;
  const progress = quiz ? Math.max(0, (remainingMs / totalMs) * 100) : 0;

  const correctRevealedIndex = lastOutcome?.correctIndex ?? null;
  const myAnswerIndex = myParticipation?.answeredOptionIndex ?? null;

  // Outcome banner is shown briefly after a quiz ends.
  const showOutcomeBanner = !quiz && !!lastOutcome;

  const myCorrect =
    lastOutcome && mySeatTeam !== null
      ? lastOutcome.participants.find((p) => p.team === mySeatTeam)?.correct
      : null;

  return (
    <AnimatePresence>
      {quiz && (
        <motion.div
          key="quiz"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur"
        >
          <motion.div
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            className="glass relative w-full max-w-xl rounded-3xl p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DifficultyChip difficulty={quiz.difficulty} />
                <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-300">
                  {CATEGORY_LABELS[quiz.category] ?? quiz.category}
                </span>
                <span className="text-xs text-zinc-400">
                  {quiz.participants.length === 1
                    ? "соло"
                    : `${quiz.participants.length} участн.`}
                </span>
              </div>
              <CountdownRing
                progress={progress}
                seconds={remainingMs / 1000}
                difficulty={quiz.difficulty}
              />
            </div>

            <h2 className="mb-5 text-xl font-semibold leading-snug">
              {quiz.prompt}
            </h2>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {quiz.options.map((opt, idx) => {
                const isMy = myAnswerIndex === idx;
                const disabled =
                  !myParticipation ||
                  myParticipation.answeredOptionIndex !== null;
                return (
                  <motion.button
                    key={idx}
                    whileHover={!disabled ? { scale: 1.01 } : undefined}
                    whileTap={!disabled ? { scale: 0.99 } : undefined}
                    disabled={disabled}
                    onClick={() => onAnswer(quiz.questionId, idx)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm transition-all",
                      "border-white/10 bg-white/5 hover:bg-white/10",
                      disabled && "cursor-not-allowed",
                      isMy &&
                        "border-cyan-400/70 bg-cyan-400/15 ring-1 ring-cyan-400/40",
                    )}
                  >
                    <span className="mr-2 font-mono text-xs text-zinc-400">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    {opt}
                  </motion.button>
                );
              })}
            </div>

            {!myParticipation && (
              <div className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-300">
                Вы не участвуете в этом эпизоде — наблюдаем за соперниками.
              </div>
            )}
            {myParticipation &&
              myParticipation.answeredOptionIndex !== null && (
                <div className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-300">
                  Ответ принят. Ждём остальных…
                </div>
              )}
          </motion.div>
        </motion.div>
      )}

      {showOutcomeBanner && lastOutcome && (
        <motion.div
          key={`outcome-${lastOutcome.questionId}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "fixed top-4 left-1/2 z-30 -translate-x-1/2 rounded-2xl px-4 py-2 text-sm shadow-lg",
            myCorrect === true && "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/60",
            myCorrect === false && "bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/60",
            myCorrect == null && "glass",
          )}
        >
          <span className="mr-2 font-semibold">{lastOutcome.description}</span>
          {correctRevealedIndex !== null && (
            <span className="text-zinc-200/80">
              верный ответ:{" "}
              <span className="font-mono text-emerald-200">
                {String.fromCharCode(65 + correctRevealedIndex)}
              </span>
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DifficultyChip({
  difficulty,
}: {
  difficulty: ActiveQuiz["difficulty"];
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        difficulty === "easy" && "bg-emerald-400/20 text-emerald-300",
        difficulty === "medium" && "bg-amber-400/20 text-amber-300",
        difficulty === "hard" && "bg-rose-500/20 text-rose-300",
      )}
    >
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  );
}

function CountdownRing({
  progress,
  seconds,
  difficulty,
}: {
  progress: number;
  seconds: number;
  difficulty: ActiveQuiz["difficulty"];
}) {
  const R = 18;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - progress / 100);
  const stroke =
    difficulty === "easy"
      ? "#34d399"
      : difficulty === "medium"
        ? "#fbbf24"
        : "#fb7185";
  return (
    <div className="relative h-12 w-12">
      <svg
        viewBox="0 0 48 48"
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={24}
          cy={24}
          r={R}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={4}
          fill="transparent"
        />
        <circle
          cx={24}
          cy={24}
          r={R}
          stroke={stroke}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          fill="transparent"
          style={{ transition: "stroke-dashoffset 100ms linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-zinc-200">
        {seconds.toFixed(1)}
      </div>
    </div>
  );
}
