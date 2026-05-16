import type {
  Difficulty,
  GameState,
  PendingAction,
  PlayerState,
  Position,
  Team,
} from "./types";

export const COLS = 8;
export const ROWS = 5;
export const GOAL_TARGET = 3;

// Team A defends col -1 (left) and attacks toward col COLS (right).
// Team B is mirrored.
export const ATTACKING_GOAL: Record<Team, "right" | "left"> = {
  A: "right",
  B: "left",
};

export function otherTeam(t: Team): Team {
  return t === "A" ? "B" : "A";
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function samePos(a: Position, b: Position): boolean {
  return a.col === b.col && a.row === b.row;
}

// All grid cells the straight line between `from` and `to` passes through
// (Bresenham-ish), exclusive of the endpoints.
export function lineCells(from: Position, to: Position): Position[] {
  const cells: Position[] = [];
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 1) return cells;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const col = Math.round(from.col + dx * t);
    const row = Math.round(from.row + dy * t);
    cells.push({ col, row });
  }
  return cells;
}

export function findPlayerById(
  state: GameState,
  id: string,
): PlayerState | null {
  return state.players.find((p) => p.id === id) ?? null;
}

export function findPlayerAt(
  state: GameState,
  pos: Position,
): PlayerState | null {
  return state.players.find((p) => samePos(p.pos, pos)) ?? null;
}

export function teammatesOf(state: GameState, team: Team): PlayerState[] {
  return state.players.filter((p) => p.team === team);
}

export function opponentsOf(state: GameState, team: Team): PlayerState[] {
  return state.players.filter((p) => p.team !== team);
}

// ---- Difficulty heuristics -------------------------------------------------

export function passDifficulty(
  state: GameState,
  from: PlayerState,
  to: PlayerState,
): { difficulty: Difficulty; defenders: PlayerState[] } {
  const dist = manhattan(from.pos, to.pos);
  const defenders = defendersOnLine(state, from.pos, to.pos, from.team);
  let difficulty: Difficulty;
  if (dist <= 2 && defenders.length === 0) difficulty = "easy";
  else if (dist <= 4 && defenders.length <= 1) difficulty = "medium";
  else difficulty = "hard";
  return { difficulty, defenders };
}

export function dribbleDifficulty(): { difficulty: Difficulty } {
  return { difficulty: "easy" };
}

export function shotDifficulty(
  state: GameState,
  from: PlayerState,
): {
  difficulty: Difficulty;
  defenders: PlayerState[];
  shotTarget: Position;
} {
  const shotTarget = goalCenter(otherTeam(from.team));
  const distCols =
    from.team === "A" ? COLS - 1 - from.pos.col : from.pos.col;
  const defenders = defendersOnLine(state, from.pos, shotTarget, from.team);
  let difficulty: Difficulty;
  if (distCols <= 1 && defenders.length === 0) difficulty = "easy";
  else if (distCols <= 2 && defenders.length <= 1) difficulty = "medium";
  else difficulty = "hard";
  return { difficulty, defenders, shotTarget };
}

export function canShoot(state: GameState, from: PlayerState): boolean {
  if (from.team === "A") return from.pos.col >= COLS - 3;
  return from.pos.col <= 2;
}

// The opponents who sit on (or right next to) the straight line between
// passer / shooter and the destination. They are the candidates to
// intercept.
export function defendersOnLine(
  state: GameState,
  from: Position,
  to: Position,
  actorTeam: Team,
): PlayerState[] {
  const cells = lineCells(from, to);
  const opponents = state.players.filter((p) => p.team !== actorTeam);
  return opponents.filter((p) =>
    cells.some(
      (c) =>
        Math.abs(c.col - p.pos.col) + Math.abs(c.row - p.pos.row) <= 1,
    ),
  );
}

export function goalCenter(defendingTeam: Team): Position {
  // The conceptual goal cell sits one column outside the pitch.
  const middleRow = Math.floor(ROWS / 2);
  return defendingTeam === "A"
    ? { col: -1, row: middleRow }
    : { col: COLS, row: middleRow };
}

// ---- State builders --------------------------------------------------------

function initialPlayers(): PlayerState[] {
  const middleRow = Math.floor(ROWS / 2);
  // 3v3, lined up symmetrically.
  return [
    { id: "A1", team: "A", number: 1, pos: { col: 1, row: middleRow - 1 } },
    { id: "A2", team: "A", number: 2, pos: { col: 1, row: middleRow } },
    { id: "A3", team: "A", number: 3, pos: { col: 1, row: middleRow + 1 } },
    { id: "B1", team: "B", number: 1, pos: { col: COLS - 2, row: middleRow - 1 } },
    { id: "B2", team: "B", number: 2, pos: { col: COLS - 2, row: middleRow } },
    { id: "B3", team: "B", number: 3, pos: { col: COLS - 2, row: middleRow + 1 } },
  ];
}

export function createInitialState(roomId: string): GameState {
  const players = initialPlayers();
  const startingCarrier = players.find((p) => p.team === "A" && p.number === 2)!;
  return {
    roomId,
    cols: COLS,
    rows: ROWS,
    players,
    ballCarrierId: startingCarrier.id,
    ballPos: { ...startingCarrier.pos },
    turn: "A",
    activePlayerId: startingCarrier.id,
    score: { A: 0, B: 0 },
    status: "waiting",
    quiz: null,
    log: [
      {
        at: Date.now(),
        text: "Лобби создано. Ждём второго игрока.",
      },
    ],
    turnNumber: 0,
    goalTarget: GOAL_TARGET,
    winner: null,
  };
}

export function kickoffFor(state: GameState, kickoffTeam: Team): GameState {
  const next: GameState = {
    ...state,
    players: initialPlayers(),
    quiz: null,
  };
  const carrier = next.players.find(
    (p) => p.team === kickoffTeam && p.number === 2,
  )!;
  next.ballCarrierId = carrier.id;
  next.ballPos = { ...carrier.pos };
  next.turn = kickoffTeam;
  next.activePlayerId = carrier.id;
  next.status = "play";
  next.turnNumber += 1;
  return next;
}

// ---- Movement helpers ------------------------------------------------------

export function dribbleTargets(
  state: GameState,
  player: PlayerState,
): Position[] {
  const out: Position[] = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      const np = { col: player.pos.col + dc, row: player.pos.row + dr };
      if (np.col < 0 || np.col >= COLS) continue;
      if (np.row < 0 || np.row >= ROWS) continue;
      if (findPlayerAt(state, np)) continue;
      out.push(np);
    }
  }
  return out;
}

export function passTargets(
  state: GameState,
  player: PlayerState,
): PlayerState[] {
  return teammatesOf(state, player.team).filter((p) => p.id !== player.id);
}

// ---- Action validation -----------------------------------------------------

export interface ActionValidation {
  ok: boolean;
  reason?: string;
}

export function validateAction(
  state: GameState,
  actorSocketTeam: Team,
  action: PendingAction,
): ActionValidation {
  if (state.status !== "play") {
    return { ok: false, reason: "Сейчас не время для действия." };
  }
  if (state.turn !== actorSocketTeam) {
    return { ok: false, reason: "Сейчас ход соперника." };
  }
  if (!state.ballCarrierId) {
    return { ok: false, reason: "Мяч сейчас ничей." };
  }
  const actor = findPlayerById(state, action.from);
  if (!actor) return { ok: false, reason: "Игрок не найден." };
  if (actor.team !== actorSocketTeam) {
    return { ok: false, reason: "Это не ваш игрок." };
  }
  if (actor.id !== state.ballCarrierId) {
    return { ok: false, reason: "Этот игрок не владеет мячом." };
  }

  if (action.type === "pass") {
    const target = findPlayerById(state, action.to);
    if (!target) return { ok: false, reason: "Получатель не найден." };
    if (target.team !== actor.team)
      return { ok: false, reason: "Нельзя пасовать сопернику." };
    if (target.id === actor.id)
      return { ok: false, reason: "Нельзя пасовать самому себе." };
    return { ok: true };
  }
  if (action.type === "dribble") {
    const dx = Math.abs(action.toPos.col - actor.pos.col);
    const dy = Math.abs(action.toPos.row - actor.pos.row);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
      return { ok: false, reason: "Дриблинг — только на 1 клетку." };
    }
    if (
      action.toPos.col < 0 ||
      action.toPos.col >= COLS ||
      action.toPos.row < 0 ||
      action.toPos.row >= ROWS
    ) {
      return { ok: false, reason: "За пределами поля." };
    }
    if (findPlayerAt(state, action.toPos)) {
      return { ok: false, reason: "Клетка занята." };
    }
    return { ok: true };
  }
  if (action.type === "shoot") {
    if (!canShoot(state, actor)) {
      return { ok: false, reason: "Слишком далеко для удара." };
    }
    return { ok: true };
  }
  return { ok: false, reason: "Неизвестное действие." };
}

// ---- Outcome application ---------------------------------------------------

export interface ResolutionResult {
  state: GameState;
  description: string;
  goal: boolean;
}

// Move ball / players to reflect a successful actor outcome.
export function applyActorSuccess(
  state: GameState,
  action: PendingAction,
): ResolutionResult {
  const actor = findPlayerById(state, action.from);
  if (!actor) {
    return { state, description: "Игрок не найден", goal: false };
  }

  if (action.type === "pass") {
    const target = findPlayerById(state, action.to);
    if (!target) return { state, description: "Принимающий пропал", goal: false };
    const next = {
      ...state,
      ballCarrierId: target.id,
      ballPos: { ...target.pos },
      activePlayerId: target.id,
      turn: target.team,
      status: "play" as const,
      turnNumber: state.turnNumber + 1,
      log: [
        ...state.log,
        {
          at: Date.now(),
          text: `${badge(actor)} → пас на ${badge(target)} принят.`,
        },
      ],
      quiz: null,
    };
    return { state: next, description: `Пас принят: ${badge(target)}`, goal: false };
  }

  if (action.type === "dribble") {
    const movedPlayers = state.players.map((p) =>
      p.id === actor.id ? { ...p, pos: { ...action.toPos } } : p,
    );
    const next: GameState = {
      ...state,
      players: movedPlayers,
      ballPos: { ...action.toPos },
      activePlayerId: actor.id,
      turn: otherTeam(actor.team),
      status: "play",
      turnNumber: state.turnNumber + 1,
      log: [
        ...state.log,
        { at: Date.now(), text: `${badge(actor)} прошёл в дриблинге.` },
      ],
      quiz: null,
    };
    return { state: next, description: "Дриблинг удался", goal: false };
  }

  if (action.type === "shoot") {
    const scoringTeam = actor.team;
    const newScore = {
      ...state.score,
      [scoringTeam]: state.score[scoringTeam] + 1,
    };
    const winner =
      newScore[scoringTeam] >= state.goalTarget ? scoringTeam : null;
    const next: GameState = {
      ...state,
      score: newScore,
      status: winner ? "ended" : "goal",
      winner,
      ballCarrierId: null,
      log: [
        ...state.log,
        {
          at: Date.now(),
          text: `⚽️ ГОЛ! ${badge(actor)} поразил ворота команды ${otherTeam(
            actor.team,
          )}.`,
        },
      ],
      quiz: null,
    };
    return { state: next, description: "Гол!", goal: true };
  }
  return { state, description: "?", goal: false };
}

export function applyDefenderSteal(
  state: GameState,
  defender: PlayerState,
  action: PendingAction,
): ResolutionResult {
  const actor = findPlayerById(state, action.from);
  const next: GameState = {
    ...state,
    ballCarrierId: defender.id,
    ballPos: { ...defender.pos },
    activePlayerId: defender.id,
    turn: defender.team,
    status: "play",
    turnNumber: state.turnNumber + 1,
    log: [
      ...state.log,
      {
        at: Date.now(),
        text: `🛑 ${badge(defender)} перехватил ${
          action.type === "shoot" ? "удар" : action.type === "pass" ? "пас" : "мяч"
        } у ${actor ? badge(actor) : "соперника"}.`,
      },
    ],
    quiz: null,
  };
  return { state: next, description: "Перехват", goal: false };
}

export function applyTotalFailure(
  state: GameState,
  action: PendingAction,
): ResolutionResult {
  // Nobody got it right in time → ball is loose, nearest opposite-team player
  // claims it. If actor is closest in absence of opponents, opponent team
  // still gets it (penalty for chaos).
  const actor = findPlayerById(state, action.from);
  if (!actor) return { state, description: "?", goal: false };

  const ballLandPos: Position =
    action.type === "pass"
      ? findPlayerById(state, action.to)?.pos ?? { ...actor.pos }
      : action.type === "dribble"
        ? action.toPos
        : { ...actor.pos };

  const opponents = opponentsOf(state, actor.team);
  let nearest = opponents[0];
  let nearestD = Infinity;
  for (const op of opponents) {
    const d =
      Math.abs(op.pos.col - ballLandPos.col) +
      Math.abs(op.pos.row - ballLandPos.row);
    if (d < nearestD) {
      nearestD = d;
      nearest = op;
    }
  }

  const next: GameState = {
    ...state,
    ballCarrierId: nearest.id,
    ballPos: { ...nearest.pos },
    activePlayerId: nearest.id,
    turn: nearest.team,
    status: "play",
    turnNumber: state.turnNumber + 1,
    log: [
      ...state.log,
      {
        at: Date.now(),
        text: `⏳ Никто не успел. Мяч у ${badge(nearest)}.`,
      },
    ],
    quiz: null,
  };
  return { state: next, description: "Потеря темпа", goal: false };
}

export function badge(p: PlayerState): string {
  return `${p.team}${p.number}`;
}
