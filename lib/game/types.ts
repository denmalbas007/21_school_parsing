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
  socketId: string;
  team: Team;
  name: string;
  connected: boolean;
}

export type ActionType = "pass" | "dribble" | "shoot";

export type PendingAction =
  | { type: "pass"; from: string; to: string }
  | { type: "dribble"; from: string; toPos: Position }
  | { type: "shoot"; from: string };

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty: Difficulty;
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
