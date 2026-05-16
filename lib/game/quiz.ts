import {
  ALL_QUESTIONS,
  QUESTIONS_BY_DIFFICULTY,
} from "@/data/questions";
import type {
  Difficulty,
  QuestionCategory,
  QuizQuestion,
} from "./types";

// In-memory pool that we can extend with questions fetched from a remote
// quiz API. We never mutate the imported arrays directly.
const remotePool: Record<Difficulty, QuizQuestion[]> = {
  easy: [],
  medium: [],
  hard: [],
};

// We also keep a server-side lookup of correct answers, keyed by question id,
// so we can validate answers without ever sending the answer to the client.
const ANSWER_KEY = new Map<string, number>();
const CATEGORY_KEY = new Map<string, QuestionCategory>();

for (const q of ALL_QUESTIONS) {
  ANSWER_KEY.set(q.id, q.correctIndex);
  CATEGORY_KEY.set(q.id, q.category);
}

export function getCorrectIndex(questionId: string): number | undefined {
  return ANSWER_KEY.get(questionId);
}

export function getQuestionCategory(
  questionId: string,
): QuestionCategory | undefined {
  return CATEGORY_KEY.get(questionId);
}

export function registerQuestion(q: QuizQuestion) {
  ANSWER_KEY.set(q.id, q.correctIndex);
  CATEGORY_KEY.set(q.id, q.category);
}

interface OpenTdbResponse {
  response_code: number;
  results: Array<{
    type: string;
    difficulty: "easy" | "medium" | "hard";
    category: string;
    question: string;
    correct_answer: string;
    incorrect_answers: string[];
  }>;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&aacute;/g, "á")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&hellip;/g, "…");
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

let remoteFetchInFlight: Promise<void> | null = null;
let lastRemoteFetchAt = 0;
const REMOTE_FETCH_COOLDOWN_MS = 60_000;

export function maybeRefillRemotePool() {
  if (remoteFetchInFlight) return;
  if (Date.now() - lastRemoteFetchAt < REMOTE_FETCH_COOLDOWN_MS) return;
  lastRemoteFetchAt = Date.now();

  remoteFetchInFlight = (async () => {
    try {
      const url = "https://opentdb.com/api.php?amount=15&type=multiple";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data: OpenTdbResponse = await res.json();
      if (data.response_code !== 0) return;

      for (const r of data.results) {
        const decoded = {
          prompt: decodeHtml(r.question),
          correct: decodeHtml(r.correct_answer),
          incorrect: r.incorrect_answers.map(decodeHtml),
        };
        const optionsRaw = shuffle([decoded.correct, ...decoded.incorrect]);
        if (optionsRaw.length !== 4) continue;
        const correctIndex = optionsRaw.indexOf(decoded.correct);
        const id = `otdb-${r.difficulty}-${Date.now()}-${Math.floor(
          Math.random() * 1e6,
        )}`;
        const q: QuizQuestion = {
          id,
          prompt: decoded.prompt,
          options: optionsRaw,
          correctIndex,
          difficulty: r.difficulty,
          category: "sports",
          source: "opentdb",
        };
        remotePool[r.difficulty].push(q);
        registerQuestion(q);
      }
    } catch {
      // ignore network errors — local bank is always available
    } finally {
      remoteFetchInFlight = null;
    }
  })();
}

// Per-room recently-used cache so the same question doesn't repeat in a match.
const recentByRoom = new Map<string, string[]>();
const RECENT_LIMIT = 20;

function rememberPicked(roomId: string, baseId: string) {
  const list = recentByRoom.get(roomId) ?? [];
  list.push(baseId);
  while (list.length > RECENT_LIMIT) list.shift();
  recentByRoom.set(roomId, list);
}

function notRecentlyPicked(roomId: string): (q: QuizQuestion) => boolean {
  const list = recentByRoom.get(roomId) ?? [];
  const set = new Set(list);
  return (q) => !set.has(q.id);
}

export function pickQuestion(
  difficulty: Difficulty,
  roomId: string,
): QuizQuestion {
  const remote = remotePool[difficulty];
  const local = QUESTIONS_BY_DIFFICULTY[difficulty];

  // 25% chance to use a remote question if available.
  const useRemote = remote.length > 0 && Math.random() < 0.25;
  const bank = useRemote ? remote : local;
  const filtered = bank.filter(notRecentlyPicked(roomId));
  const pool = filtered.length > 0 ? filtered : bank;
  const picked = pool[Math.floor(Math.random() * pool.length)];

  if (remote.length < 5) maybeRefillRemotePool();
  rememberPicked(roomId, picked.id);

  // Reshuffle option order to keep things fresh, but recompute the answer key.
  const correctAnswer = picked.options[picked.correctIndex];
  const newOptions = shuffle(picked.options);
  const newCorrectIndex = newOptions.indexOf(correctAnswer);
  const rotated: QuizQuestion = {
    ...picked,
    id: `${picked.id}::${Date.now().toString(36)}-${Math.floor(
      Math.random() * 1e6,
    ).toString(36)}`,
    options: newOptions,
    correctIndex: newCorrectIndex,
  };
  registerQuestion(rotated);
  return rotated;
}

export function quizDurationMs(difficulty: Difficulty): number {
  switch (difficulty) {
    case "easy":
      return 16_000;
    case "medium":
      return 13_000;
    case "hard":
      return 11_000;
  }
}
