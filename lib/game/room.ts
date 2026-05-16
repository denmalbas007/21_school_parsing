import { nanoid } from "nanoid";
import {
  applyActorSuccess,
  applyDefenderSteal,
  applyRelocate,
  applyTotalFailure,
  createInitialState,
  dribbleDifficulty,
  findPlayerById,
  kickoffFor,
  lobDifficulty,
  otherTeam,
  passDifficulty,
  shotDifficulty,
  sprintDifficulty,
  validateAction,
} from "./engine";
import {
  getCorrectIndex,
  getQuestionCategory,
  pickQuestion,
  quizDurationMs,
} from "./quiz";
import type {
  ActiveQuiz,
  GameState,
  PendingAction,
  PublicRoom,
  QuestionCategory,
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
  currentAnswerIndex: number | null;
  gcTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, RoomRecord>();
const socketToRoom = new Map<string, string>();

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
    gcTimer: null,
  };
  rooms.set(id, record);
  return record;
}

export function joinRoom(
  roomId: string,
  playerId: string,
  socketId: string,
  name: string,
): { room: RoomRecord; seat: SeatInfo } | { error: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Комната не найдена." };

  if (room.gcTimer) {
    clearTimeout(room.gcTimer);
    room.gcTimer = null;
  }

  const existing = room.seats.find((s) => s.playerId === playerId);
  if (existing) {
    if (existing.socketId && existing.socketId !== socketId) {
      socketToRoom.delete(existing.socketId);
    }
    existing.socketId = socketId;
    existing.connected = true;
    if (name) existing.name = name;
    socketToRoom.set(socketId, roomId);
    return { room, seat: existing };
  }

  if (room.seats.length >= 2) return { error: "Комната заполнена." };

  const takenTeams = new Set(room.seats.map((s) => s.team));
  const team: Team = takenTeams.has("A") ? "B" : "A";
  const seat: SeatInfo = {
    playerId,
    socketId,
    team,
    name: name || `Игрок ${team}`,
    connected: true,
  };
  room.seats.push(seat);
  socketToRoom.set(socketId, roomId);

  if (room.seats.length === 2 && room.state.status === "waiting") {
    room.state = kickoffFor(room.state, "A");
    room.state.log.push({
      at: Date.now(),
      text: `Соперники подключились. Стартует команда A.`,
    });
  }

  return { room, seat };
}

export function markSocketDisconnected(socketId: string): RoomRecord[] {
  const affected: RoomRecord[] = [];
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return affected;
  socketToRoom.delete(socketId);
  const room = rooms.get(roomId);
  if (!room) return affected;
  const seat = room.seats.find((s) => s.socketId === socketId);
  if (!seat) return affected;
  seat.connected = false;
  seat.socketId = null;
  room.state.log.push({
    at: Date.now(),
    text: `Игрок команды ${seat.team} отключился. Ждём возвращения 60 сек.`,
  });
  affected.push(room);

  if (room.seats.every((s) => !s.connected)) {
    if (room.gcTimer) clearTimeout(room.gcTimer);
    room.gcTimer = setTimeout(() => {
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
//  Quiz lifecycle + non-quiz actions
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
    outcome: QuizOutcomeMessage | null,
  ) => void,
):
  | { quiz: QuizStartResult }
  | { instantResolved: true; room: RoomRecord }
  | { error: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Комната не найдена." };
  const actorTeam = teamOfSocket(room, socketId);
  if (!actorTeam) return { error: "Вы не за столом." };

  const validation = validateAction(room.state, actorTeam, action);
  if (!validation.ok) return { error: validation.reason ?? "Неверный ход." };

  // Relocate is the only action without a quiz.
  if (action.type === "relocate") {
    const res = applyRelocate(room.state, action);
    room.state = res.state;
    onResolve(room, null);
    return { instantResolved: true, room };
  }

  const actor = findPlayerById(room.state, action.from)!;

  let difficulty: "easy" | "medium" | "hard";
  let defenders: { id: string; team: Team }[] = [];

  if (action.type === "pass") {
    const target = findPlayerById(room.state, action.to)!;
    const d = passDifficulty(room.state, actor, target);
    difficulty = d.difficulty;
    defenders = d.defenders.map((p) => ({ id: p.id, team: p.team }));
  } else if (action.type === "lob") {
    const target = findPlayerById(room.state, action.to)!;
    const d = lobDifficulty(room.state, actor, target);
    difficulty = d.difficulty;
    defenders = d.defenders.map((p) => ({ id: p.id, team: p.team }));
  } else if (action.type === "dribble") {
    const d = dribbleDifficulty(room.state, actor, action.toPos);
    difficulty = d.difficulty;
    defenders = d.defenders.map((p) => ({ id: p.id, team: p.team }));
  } else if (action.type === "sprint") {
    const d = sprintDifficulty(room.state, actor, action.toPos);
    difficulty = d.difficulty;
    defenders = d.defenders.map((p) => ({ id: p.id, team: p.team }));
  } else {
    const d = shotDifficulty(room.state, actor);
    difficulty = d.difficulty;
    defenders = d.defenders.map((p) => ({ id: p.id, team: p.team }));
  }

  const question = pickQuestion(difficulty, room.id);
  const correctIndex = getCorrectIndex(question.id)!;
  const category =
    getQuestionCategory(question.id) ?? (question.category as QuestionCategory);

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
    category,
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

  return { quiz: { room, quiz } };
}

export function submitAnswer(
  roomId: string,
  socketId: string,
  questionId: string,
  optionIndex: number,
  onResolve: (
    room: RoomRecord,
    outcome: QuizOutcomeMessage | null,
  ) => void,
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
  onResolve: (
    room: RoomRecord,
    outcome: QuizOutcomeMessage | null,
  ) => void,
  _timedOut: boolean,
) {
  const quiz = room.state.quiz;
  if (!quiz) return;
  const correctIndex = room.currentAnswerIndex ?? -1;

  const actor = quiz.participants.find((p) => p.role === "actor")!;

  for (const p of quiz.participants) {
    if (p.correct === null) {
      p.correct = false;
    }
  }

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
      outcomeKey = corrects.find(
        (c) => c.role === "defender" && c.answeredAt === winner.answeredAt,
      )
        ? "tie_to_actor"
        : "actor_win";
      const res = applyActorSuccess(room.state, quiz.action);
      description = res.description;
      room.state = res.state;
      if (res.goal && room.state.status === "goal") {
        const concededTeam = otherTeam(actor.team);
        setTimeout(() => {
          room.state = kickoffFor(room.state, concededTeam);
          room.state.log.push({
            at: Date.now(),
            text: `Розыгрыш мяча с центра: команда ${concededTeam}.`,
          });
          onResolve(room, null);
        }, 2500);
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
}
