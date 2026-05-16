import { nanoid } from "nanoid";
import {
  applyActorSuccess,
  applyDefenderSteal,
  applyTotalFailure,
  createInitialState,
  dribbleDifficulty,
  findPlayerById,
  kickoffFor,
  otherTeam,
  passDifficulty,
  shotDifficulty,
  validateAction,
} from "./engine";
import { getCorrectIndex, pickQuestion, quizDurationMs } from "./quiz";
import type {
  ActiveQuiz,
  GameState,
  PendingAction,
  PublicRoom,
  QuizOutcomeMessage,
  QuizParticipant,
  SeatInfo,
  Team,
} from "./types";

interface RoomRecord {
  id: string;
  seats: SeatInfo[];
  state: GameState;
  quizTimer: NodeJS.Timeout | null;
  // Server-side answer key for the current quiz (we never expose it).
  currentAnswerIndex: number | null;
}

const rooms = new Map<string, RoomRecord>();

export function listOpenRooms(): PublicRoom[] {
  const out: PublicRoom[] = [];
  for (const r of rooms.values()) {
    if (r.seats.length < 2 || r.state.status === "waiting") {
      out.push(publicRoom(r));
    }
  }
  return out;
}

export function publicRoom(r: RoomRecord): PublicRoom {
  return {
    id: r.id,
    seats: r.seats.map((s) => ({ ...s })),
    state: { ...r.state, quiz: r.state.quiz },
  };
}

export function getRoom(roomId: string): RoomRecord | null {
  return rooms.get(roomId) ?? null;
}

export function createRoom(): RoomRecord {
  const id = nanoid(6).toLowerCase();
  const record: RoomRecord = {
    id,
    seats: [],
    state: createInitialState(id),
    quizTimer: null,
    currentAnswerIndex: null,
  };
  rooms.set(id, record);
  return record;
}

export function joinRoom(
  roomId: string,
  socketId: string,
  name: string,
): { room: RoomRecord; seat: SeatInfo } | { error: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Комната не найдена." };

  // Reconnect path: same socket id already seated.
  const existing = room.seats.find((s) => s.socketId === socketId);
  if (existing) {
    existing.connected = true;
    existing.name = name || existing.name;
    return { room, seat: existing };
  }

  if (room.seats.length >= 2) return { error: "Комната заполнена." };

  // Assign team — first joiner = A, second = B (or whichever is missing).
  const takenTeams = new Set(room.seats.map((s) => s.team));
  const team: Team = takenTeams.has("A") ? "B" : "A";
  const seat: SeatInfo = {
    socketId,
    team,
    name: name || `Игрок ${team}`,
    connected: true,
  };
  room.seats.push(seat);

  if (room.seats.length === 2 && room.state.status === "waiting") {
    room.state = kickoffFor(room.state, "A");
    room.state.log.push({
      at: Date.now(),
      text: `Соперники подключились. Стартует команда A.`,
    });
  }

  return { room, seat };
}

export function leaveRoom(socketId: string): RoomRecord[] {
  const affected: RoomRecord[] = [];
  for (const room of rooms.values()) {
    const seat = room.seats.find((s) => s.socketId === socketId);
    if (!seat) continue;
    seat.connected = false;
    affected.push(room);
    // If room is empty + nobody connected for some time, garbage-collect later.
    setTimeout(() => {
      if (room.seats.every((s) => !s.connected)) {
        if (room.quizTimer) clearTimeout(room.quizTimer);
        rooms.delete(room.id);
      }
    }, 60_000);
  }
  return affected;
}

function teamOfSocket(room: RoomRecord, socketId: string): Team | null {
  return room.seats.find((s) => s.socketId === socketId)?.team ?? null;
}

// ---------------------------------------------------------------------------
//  Quiz lifecycle
// ---------------------------------------------------------------------------

export interface QuizStartResult {
  room: RoomRecord;
  quiz: ActiveQuiz;
}

export function startQuizForAction(
  roomId: string,
  socketId: string,
  action: PendingAction,
  onResolve: (
    room: RoomRecord,
    outcome: QuizOutcomeMessage,
  ) => void,
): QuizStartResult | { error: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Комната не найдена." };
  const actorTeam = teamOfSocket(room, socketId);
  if (!actorTeam) return { error: "Вы не за столом." };

  const validation = validateAction(room.state, actorTeam, action);
  if (!validation.ok) return { error: validation.reason ?? "Неверный ход." };

  const actor = findPlayerById(room.state, action.from)!;

  // Figure out who participates + difficulty
  let difficulty: "easy" | "medium" | "hard";
  let defenders: { id: string; team: Team }[] = [];

  if (action.type === "pass") {
    const target = findPlayerById(room.state, action.to)!;
    const d = passDifficulty(room.state, actor, target);
    difficulty = d.difficulty;
    defenders = d.defenders.map((p) => ({ id: p.id, team: p.team }));
  } else if (action.type === "dribble") {
    difficulty = dribbleDifficulty().difficulty;
  } else {
    const d = shotDifficulty(room.state, actor);
    difficulty = d.difficulty;
    defenders = d.defenders.map((p) => ({ id: p.id, team: p.team }));
  }

  const question = pickQuestion(difficulty);
  const correctIndex = getCorrectIndex(question.id)!;

  const startedAt = Date.now();
  const deadlineAt = startedAt + quizDurationMs(difficulty);

  const participants: QuizParticipant[] = [
    {
      playerId: actor.id,
      team: actor.team,
      role: "actor",
      answeredOptionIndex: null,
      answeredAt: null,
      correct: null,
    },
    ...defenders.map<QuizParticipant>((d) => ({
      playerId: d.id,
      team: d.team,
      role: "defender",
      answeredOptionIndex: null,
      answeredAt: null,
      correct: null,
    })),
  ];

  const quiz: ActiveQuiz = {
    questionId: question.id,
    prompt: question.prompt,
    options: question.options,
    difficulty,
    startedAt,
    deadlineAt,
    action,
    participants,
  };

  room.state = {
    ...room.state,
    status: "quiz",
    quiz,
  };
  room.currentAnswerIndex = correctIndex;

  if (room.quizTimer) clearTimeout(room.quizTimer);
  room.quizTimer = setTimeout(() => {
    finalizeQuiz(room, onResolve, /* timedOut */ true);
  }, deadlineAt - startedAt + 100);

  return { room, quiz };
}

export function submitAnswer(
  roomId: string,
  socketId: string,
  questionId: string,
  optionIndex: number,
  onResolve: (room: RoomRecord, outcome: QuizOutcomeMessage) => void,
): { room: RoomRecord } | { error: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Комната не найдена." };
  if (!room.state.quiz) return { error: "Сейчас не идёт викторина." };
  if (room.state.quiz.questionId !== questionId) {
    return { error: "Викторина уже завершена." };
  }
  const team = teamOfSocket(room, socketId);
  if (!team) return { error: "Вы не за столом." };

  const correctIndex = room.currentAnswerIndex;
  if (correctIndex === null) return { error: "Нет ключа ответа." };

  // Each socket controls a team — apply answer to every participant from
  // that team that has not yet answered. In practice that's at most 1 actor
  // (your team) or at most 1 defender on the line (opponent team).
  let touched = false;
  for (const p of room.state.quiz.participants) {
    if (p.team !== team) continue;
    if (p.answeredOptionIndex !== null) continue;
    p.answeredOptionIndex = optionIndex;
    p.answeredAt = Date.now();
    p.correct = optionIndex === correctIndex;
    touched = true;
  }
  if (!touched) {
    return { error: "Уже ответили." };
  }

  // Resolve early if everyone has answered, OR if any defender got it correct
  // (defender correct = instant steal), OR if actor got it correct AND there
  // are no defenders (or all defenders answered wrong).
  const all = room.state.quiz.participants;
  const allAnswered = all.every((p) => p.answeredOptionIndex !== null);
  const defenderCorrect = all.some(
    (p) => p.role === "defender" && p.correct === true,
  );
  const actorCorrect = all.find((p) => p.role === "actor")?.correct === true;
  const noLiveDefenders = all
    .filter((p) => p.role === "defender")
    .every((p) => p.correct === false);

  if (allAnswered || defenderCorrect || (actorCorrect && noLiveDefenders)) {
    if (room.quizTimer) {
      clearTimeout(room.quizTimer);
      room.quizTimer = null;
    }
    finalizeQuiz(room, onResolve, /* timedOut */ false);
  }
  return { room };
}

function finalizeQuiz(
  room: RoomRecord,
  onResolve: (room: RoomRecord, outcome: QuizOutcomeMessage) => void,
  _timedOut: boolean,
) {
  const quiz = room.state.quiz;
  if (!quiz) return;
  const correctIndex = room.currentAnswerIndex ?? -1;

  const actor = quiz.participants.find((p) => p.role === "actor")!;
  const defenders = quiz.participants.filter((p) => p.role === "defender");

  // Lock in correctness for any unanswered participants.
  for (const p of quiz.participants) {
    if (p.correct === null) {
      p.correct = false;
    }
  }

  // Earliest correct answer wins.
  const corrects = [...quiz.participants].filter((p) => p.correct);
  corrects.sort(
    (a, b) =>
      (a.answeredAt ?? Number.MAX_SAFE_INTEGER) -
      (b.answeredAt ?? Number.MAX_SAFE_INTEGER),
  );

  let outcomeKey: QuizOutcomeMessage["outcome"];
  let winnerId: string | null = null;
  let description = "";

  if (corrects.length === 0) {
    outcomeKey = "all_failed";
    description = "Никто не справился с вопросом.";
    const res = applyTotalFailure(room.state, quiz.action);
    room.state = res.state;
  } else {
    const winner = corrects[0];
    winnerId = winner.playerId;
    if (winner.role === "actor") {
      // Tie-break: if a defender answered at exactly the same ms, favour actor.
      outcomeKey = corrects.find(
        (c) => c.role === "defender" && c.answeredAt === winner.answeredAt,
      )
        ? "tie_to_actor"
        : "actor_win";
      const res = applyActorSuccess(room.state, quiz.action);
      description = res.description;
      room.state = res.state;
      // If it was a shot that resulted in a goal, queue kickoff.
      if (res.goal && room.state.status === "goal") {
        // Briefly stay in "goal" status for animation, then kickoff for the
        // conceded team.
        const concededTeam = otherTeam(actor.team);
        setTimeout(() => {
          room.state = kickoffFor(room.state, concededTeam);
          room.state.log.push({
            at: Date.now(),
            text: `Стартовый удар: команда ${concededTeam}.`,
          });
          onResolve(room, {
            questionId: quiz.questionId,
            correctIndex,
            participants: quiz.participants,
            outcome: outcomeKey,
            winnerId,
            description: "Розыгрыш мяча с центра.",
          });
        }, 1800);
      }
    } else {
      outcomeKey = "defender_win";
      const defenderPlayer = findPlayerById(room.state, winner.playerId);
      if (defenderPlayer) {
        const res = applyDefenderSteal(room.state, defenderPlayer, quiz.action);
        description = res.description;
        room.state = res.state;
      } else {
        const res = applyTotalFailure(room.state, quiz.action);
        room.state = res.state;
        description = "Защитник пропал. Мяч ничей.";
      }
    }
  }

  room.currentAnswerIndex = null;
  if (room.quizTimer) {
    clearTimeout(room.quizTimer);
    room.quizTimer = null;
  }

  onResolve(room, {
    questionId: quiz.questionId,
    correctIndex,
    participants: quiz.participants,
    outcome: outcomeKey,
    winnerId,
    description: description || "Готово.",
  });

  // Quietly ignore "defenders" variable, just reference it so TS keeps it.
  void defenders;
}
