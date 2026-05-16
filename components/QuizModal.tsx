"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
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
  const [selected, setSelected] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick timer
  useEffect(() => {
    if (!quiz) return;
    const i = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(i);
  }, [quiz]);

  // Reset selection when a new quiz starts
  useEffect(() => {
    setSelected(null);
  }, [quiz?.questionId]);

  const myParticipation = useMemo(() => {
    if (!quiz || !mySeatTeam) return null;
    return quiz.participants.find((p) => p.team === mySeatTeam) ?? null;
  }, [quiz, mySeatTeam]);

  const showOutcome =
    !quiz &&
    lastOutcome &&
    Date.now() - (lastOutcome ? 0 : Infinity) < Infinity;

  const remainingMs = quiz ? Math.max(0, quiz.deadlineAt - now) : 0;
  const totalMs = quiz ? quiz.deadlineAt - quiz.startedAt : 1;
  const progress = quiz ? (remainingMs / totalMs) * 100 : 0;

  const correctRevealedIndex = lastOutcome?.correctIndex ?? null;
  const myAnswerIndex = myParticipation?.answeredOptionIndex ?? null;

  return (
    <AnimatePresence>
      {quiz && (
        <motion.div
          key="quiz"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur"
        >
          <motion.div
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            className="glass relative w-full max-w-xl rounded-3xl p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
                    quiz.difficulty === "easy" &&
                      "bg-emerald-400/20 text-emerald-300",
                    quiz.difficulty === "medium" &&
                      "bg-amber-400/20 text-amber-300",
                    quiz.difficulty === "hard" &&
                      "bg-rose-500/20 text-rose-300",
                  )}
                >
                  {DIFFICULTY_LABEL[quiz.difficulty]}
                </span>
                <span className="text-xs text-zinc-400">
                  участники:{" "}
                  {quiz.participants
                    .map((p) => `${p.team}${p.role === "actor" ? "↗" : "🛡"}`)
                    .join(" · ")}
                </span>
              </div>
              <span className="text-sm font-mono text-zinc-300">
                {(remainingMs / 1000).toFixed(1)}с
              </span>
            </div>

            <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div
                className={cn(
                  "h-full",
                  quiz.difficulty === "easy" && "bg-emerald-400",
                  quiz.difficulty === "medium" && "bg-amber-400",
                  quiz.difficulty === "hard" && "bg-rose-400",
                )}
                style={{ width: `${progress}%` }}
                transition={{ ease: "linear", duration: 0.1 }}
              />
            </div>

            <h2 className="mb-4 text-xl font-semibold leading-snug">
              {quiz.prompt}
            </h2>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {quiz.options.map((opt, idx) => {
                const isMy = myAnswerIndex === idx;
                const disabled =
                  !myParticipation || myParticipation.answeredOptionIndex !== null;
                return (
                  <button
                    key={idx}
                    disabled={disabled}
                    onClick={() => {
                      setSelected(idx);
                      onAnswer(quiz.questionId, idx);
                    }}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm transition-all",
                      "border-white/10 bg-white/5 hover:bg-white/10",
                      disabled && "cursor-not-allowed opacity-80",
                      isMy &&
                        "border-cyan-400/70 bg-cyan-400/15 ring-1 ring-cyan-400/40",
                      selected === idx && "scale-[0.99]",
                    )}
                  >
                    <span className="mr-2 font-mono text-xs text-zinc-400">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    {opt}
                  </button>
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

      {showOutcome && lastOutcome && (
        <motion.div
          key={`outcome-${lastOutcome.questionId}`}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed top-4 left-1/2 z-30 -translate-x-1/2 rounded-full glass px-4 py-2 text-sm"
        >
          <span className="mr-2 font-semibold">{lastOutcome.description}</span>
          {correctRevealedIndex !== null && (
            <span className="text-zinc-400">
              верный ответ:{" "}
              <span className="font-mono text-emerald-300">
                {String.fromCharCode(65 + correctRevealedIndex)}
              </span>
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
