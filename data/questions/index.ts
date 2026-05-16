import type { Difficulty, QuestionCategory, QuizQuestion } from "@/lib/game/types";
import { CULTURE_QUESTIONS } from "./culture";
import { FOOTBALL_QUESTIONS } from "./football";
import { GEOGRAPHY_QUESTIONS } from "./geography";
import { HISTORY_QUESTIONS } from "./history";
import { MATH_QUESTIONS } from "./math";
import { SCIENCE_QUESTIONS } from "./science";
import { SPORTS_QUESTIONS } from "./sports";
import { TECH_QUESTIONS } from "./tech";

export const ALL_QUESTIONS: QuizQuestion[] = [
  ...FOOTBALL_QUESTIONS,
  ...SPORTS_QUESTIONS,
  ...HISTORY_QUESTIONS,
  ...GEOGRAPHY_QUESTIONS,
  ...SCIENCE_QUESTIONS,
  ...CULTURE_QUESTIONS,
  ...TECH_QUESTIONS,
  ...MATH_QUESTIONS,
];

// Sanity: every question must have exactly 4 options and a valid correctIndex.
// Run once at module load — failures throw early in dev.
for (const q of ALL_QUESTIONS) {
  if (q.options.length !== 4) {
    throw new Error(`Question ${q.id} has ${q.options.length} options, expected 4`);
  }
  if (q.correctIndex < 0 || q.correctIndex >= 4) {
    throw new Error(`Question ${q.id} has invalid correctIndex ${q.correctIndex}`);
  }
}

export const QUESTIONS_BY_DIFFICULTY: Record<Difficulty, QuizQuestion[]> = {
  easy: ALL_QUESTIONS.filter((q) => q.difficulty === "easy"),
  medium: ALL_QUESTIONS.filter((q) => q.difficulty === "medium"),
  hard: ALL_QUESTIONS.filter((q) => q.difficulty === "hard"),
};

export function questionsByCategory(category: QuestionCategory): QuizQuestion[] {
  return ALL_QUESTIONS.filter((q) => q.category === category);
}

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  football: "Футбол",
  sports: "Спорт",
  history: "История",
  geography: "География",
  science: "Наука",
  culture: "Культура",
  tech: "Технологии",
  math: "Математика",
};
