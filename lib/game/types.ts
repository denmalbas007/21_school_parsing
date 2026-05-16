export type Team = "A" | "B";
export type Difficulty = "easy" | "medium" | "hard";

export interface Position {
  col: number;
  row: number;
}

export interface PlayerState {
  id: string;
  team: Team;
  number: number;
  pos: Position;
}

export interface SeatInfo {
  // Stable per-browser id (persisted in localStorage). Survives reconnects.
  playerId: string;
  // Current socket id (changes on each reconnect). May be null while waiting.
  socketId: string | null;
  team: Team;
  name: string;
  connected: boolean;
}

export type ActionType =
  | "pass"
  | "lob"
  | "dribble"
  | "sprint"
  | "shoot"
  | "relocate";

export type PendingAction =
  | { type: "pass"; from: string; to: string }
  | { type: "lob"; from: string; to: string }
  | { type: "dribble"; from: string; toPos: Position }
  | { type: "sprint"; from: string; toPos: Position }
  | { type: "shoot"; from: string }
  | { type: "relocate"; from: string; toPos: Position };

export type QuestionCategory =
  | "football"
  | "sports"
  | "history"
  | "geography"
  | "science"
  | "culture"
  | "tech"
  | "math";

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty: Difficulty;
  category: QuestionCategory;
  source: "local" | "opentdb";
}

export interface QuizParticipant {
  playerId: string;
  team: Team;
  role: "actor" | "defender";
  answeredOptionIndex: number | null;
  answeredAt: number | null;
  correct: boolean | null;
}

export interface ActiveQuiz {
  questionId: string;
  prompt: string;
  options: string[];
  difficulty: Difficulty;
  category: QuestionCategory;
  startedAt: number;
  deadlineAt: number;
  action: PendingAction;
  participants: QuizParticipant[];
}

export interface GameLogEntry {
  at: number;
  text: string;
}

export type GameStatus =
  | "waiting"
  | "kickoff"
  | "play"
  | "quiz"
  | "resolving"
  | "goal"
  | "ended";

export interface ScoreState {
  A: number;
  B: number;
}

export interface GameState {
  roomId: string;
  cols: number;
  rows: number;
  players: PlayerState[];
  ballCarrierId: string | null;
  ballPos: Position;
  turn: Team;
  activePlayerId: string | null;
  score: ScoreState;
  status: GameStatus;
  quiz: ActiveQuiz | null;
  log: GameLogEntry[];
  turnNumber: number;
  goalTarget: number;
  winner: Team | null;
  // Visual hint for the client: where the ball is travelling, used for arc anim.
  ballAnim: {
    fromPos: Position;
    toPos: Position;
    kind: "pass" | "lob" | "dribble" | "sprint" | "shoot";
    startedAt: number;
    durationMs: number;
  } | null;
}

export interface PublicRoom {
  id: string;
  seats: SeatInfo[];
  state: GameState | null;
}

export interface QuizOutcomeMessage {
  questionId: string;
  correctIndex: number;
  participants: QuizParticipant[];
  outcome:
    | "actor_win"
    | "defender_win"
    | "all_failed"
    | "tie_to_actor";
  winnerId: string | null;
  description: string;
}
