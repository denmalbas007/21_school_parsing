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

function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

// Opponents within Chebyshev distance 1 of any cell in `cells`.
function defendersNearCells(
  state: GameState,
  cells: Position[],
  actorTeam: Team,
): PlayerState[] {
  const opponents = state.players.filter((p) => p.team !== actorTeam);
  return opponents.filter((p) =>
    cells.some((c) => chebyshev(c, p.pos) <= 1),
  );
}

// ---- Difficulty heuristics -------------------------------------------------

export function passDifficulty(
  state: GameState,
  from: PlayerState,
  to: PlayerState,
): { difficulty: Difficulty; defenders: PlayerState[] } {
  const dist = chebyshev(from.pos, to.pos);
  const defenders = defendersOnLine(state, from.pos, to.pos, from.team);
  let difficulty: Difficulty;
  if (dist <= 2 && defenders.length === 0) difficulty = "easy";
  else if (dist <= 4 && defenders.length <= 1) difficulty = "medium";
  else difficulty = "hard";
  return { difficulty, defenders };
}

// Lob is a chip pass that flies over defenders — they don't compete.
// But it takes longer / harder to be precise, so base difficulty is bumped.
export function lobDifficulty(
  _state: GameState,
  from: PlayerState,
  to: PlayerState,
): { difficulty: Difficulty; defenders: PlayerState[] } {
  const dist = chebyshev(from.pos, to.pos);
  let difficulty: Difficulty;
  if (dist <= 2) difficulty = "medium";
  else if (dist <= 5) difficulty = "hard";
  else difficulty = "hard";
  return { difficulty, defenders: [] };
}

// Dribble: 1 cell. Defenders adjacent to destination contest.
export function dribbleDifficulty(
  state: GameState,
  from: PlayerState,
  toPos: Position,
): { difficulty: Difficulty; defenders: PlayerState[] } {
  const defenders = defendersNearCells(state, [toPos], from.team);
  let difficulty: Difficulty;
  if (defenders.length === 0) difficulty = "easy";
  else if (defenders.length === 1) difficulty = "medium";
  else difficulty = "hard";
  return { difficulty, defenders };
}

// Sprint: 2 cells straight. Defenders adjacent to either path cell contest.
export function sprintDifficulty(
  state: GameState,
  from: PlayerState,
  toPos: Position,
): { difficulty: Difficulty; defenders: PlayerState[]; midPos: Position } {
  const dc = Math.sign(toPos.col - from.pos.col);
  const dr = Math.sign(toPos.row - from.pos.row);
  const midPos = { col: from.pos.col + dc, row: from.pos.row + dr };
  const defenders = defendersNearCells(state, [midPos, toPos], from.team);
  let difficulty: Difficulty;
  if (defenders.length === 0) difficulty = "medium";
  else difficulty = "hard";
  return { difficulty, defenders, midPos };
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

export function canShoot(_state: GameState, from: PlayerState): boolean {
  if (from.team === "A") return from.pos.col >= COLS - 3;
  return from.pos.col <= 2;
}

// Opponents whose cells lie close to the straight line between `from` and `to`.
export function defendersOnLine(
  state: GameState,
  from: Position,
  to: Position,
  actorTeam: Team,
): PlayerState[] {
  const cells = lineCells(from, to);
  const opponents = state.players.filter((p) => p.team !== actorTeam);
  return opponents.filter((p) =>
    cells.some((c) => chebyshev(c, p.pos) <= 1),
  );
}

export function goalCenter(defendingTeam: Team): Position {
  const middleRow = Math.floor(ROWS / 2);
  return defendingTeam === "A"
    ? { col: -1, row: middleRow }
    : { col: COLS, row: middleRow };
}

// ---- State builders --------------------------------------------------------

function initialPlayers(): PlayerState[] {
  const middleRow = Math.floor(ROWS / 2);
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
    ballAnim: null,
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
  next.ballAnim = null;
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

// Sprint moves 2 cells in the same direction. Both cells must be empty.
export function sprintTargets(
  state: GameState,
  player: PlayerState,
): Position[] {
  const out: Position[] = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      const mid = { col: player.pos.col + dc, row: player.pos.row + dr };
      const dst = { col: player.pos.col + 2 * dc, row: player.pos.row + 2 * dr };
      if (dst.col < 0 || dst.col >= COLS) continue;
      if (dst.row < 0 || dst.row >= ROWS) continue;
      if (findPlayerAt(state, mid)) continue;
      if (findPlayerAt(state, dst)) continue;
      out.push(dst);
    }
  }
  return out;
}

export function relocateTargets(
  state: GameState,
  player: PlayerState,
): Position[] {
  return dribbleTargets(state, player);
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
  const actor = findPlayerById(state, action.from);
  if (!actor) return { ok: false, reason: "Игрок не найден." };
  if (actor.team !== actorSocketTeam) {
    return { ok: false, reason: "Это не ваш игрок." };
  }

  const myTeamHasBall =
    state.ballCarrierId != null &&
    findPlayerById(state, state.ballCarrierId)?.team === actorSocketTeam;

  if (action.type === "relocate") {
    // Cannot relocate the ball carrier (use dribble for that).
    if (actor.id === state.ballCarrierId) {
      return {
        ok: false,
        reason: "Носителя мяча нельзя двигать relocate'ом — используйте дриблинг.",
      };
    }
    const dx = Math.abs(action.toPos.col - actor.pos.col);
    const dy = Math.abs(action.toPos.row - actor.pos.row);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
      return { ok: false, reason: "Можно сдвинуть только на 1 клетку." };
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

  if (!myTeamHasBall) {
    return {
      ok: false,
      reason: "Мяч не у вашей команды — переместите игрока в защиту.",
    };
  }
  if (actor.id !== state.ballCarrierId) {
    return { ok: false, reason: "Этот игрок не владеет мячом." };
  }

  if (action.type === "pass" || action.type === "lob") {
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

  if (action.type === "sprint") {
    const dx = action.toPos.col - actor.pos.col;
    const dy = action.toPos.row - actor.pos.row;
    const stepDx = Math.sign(dx);
    const stepDy = Math.sign(dy);
    if (
      (Math.abs(dx) !== 2 && Math.abs(dx) !== 0) ||
      (Math.abs(dy) !== 2 && Math.abs(dy) !== 0) ||
      (dx === 0 && dy === 0) ||
      // diagonal sprint must be exactly 2-2, orthogonal exactly 2-0/0-2
      (Math.abs(dx) === 2 && Math.abs(dy) === 1) ||
      (Math.abs(dx) === 1 && Math.abs(dy) === 2)
    ) {
      return {
        ok: false,
        reason: "Спринт — ровно 2 клетки в одном направлении.",
      };
    }
    const mid = { col: actor.pos.col + stepDx, row: actor.pos.row + stepDy };
    if (
      action.toPos.col < 0 ||
      action.toPos.col >= COLS ||
      action.toPos.row < 0 ||
      action.toPos.row >= ROWS
    ) {
      return { ok: false, reason: "Спринт уходит за поле." };
    }
    if (findPlayerAt(state, mid))
      return { ok: false, reason: "Промежуточная клетка занята." };
    if (findPlayerAt(state, action.toPos))
      return { ok: false, reason: "Конечная клетка занята." };
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

function flipTurn(_state: GameState, actingTeam: Team): Team {
  return otherTeam(actingTeam);
}

export function applyRelocate(
  state: GameState,
  action: { type: "relocate"; from: string; toPos: Position },
): ResolutionResult {
  const actor = findPlayerById(state, action.from);
  if (!actor) return { state, description: "Игрок не найден", goal: false };
  const movedPlayers = state.players.map((p) =>
    p.id === actor.id ? { ...p, pos: { ...action.toPos } } : p,
  );
  const next: GameState = {
    ...state,
    players: movedPlayers,
    activePlayerId: actor.id,
    turn: flipTurn(state, actor.team),
    status: "play",
    turnNumber: state.turnNumber + 1,
    log: [
      ...state.log,
      { at: Date.now(), text: `${badge(actor)} занял позицию.` },
    ],
    quiz: null,
    ballAnim: null,
  };
  return { state: next, description: "Позиция занята", goal: false };
}

export function applyActorSuccess(
  state: GameState,
  action: PendingAction,
): ResolutionResult {
  const actor = findPlayerById(state, action.from);
  if (!actor) {
    return { state, description: "Игрок не найден", goal: false };
  }

  if (action.type === "pass" || action.type === "lob") {
    const target = findPlayerById(state, action.to);
    if (!target)
      return { state, description: "Принимающий пропал", goal: false };
    const next: GameState = {
      ...state,
      ballCarrierId: target.id,
      ballPos: { ...target.pos },
      activePlayerId: target.id,
      turn: flipTurn(state, actor.team),
      status: "play",
      turnNumber: state.turnNumber + 1,
      log: [
        ...state.log,
        {
          at: Date.now(),
          text:
            action.type === "lob"
              ? `${badge(actor)} 🪂 навес на ${badge(target)} принят.`
              : `${badge(actor)} → пас на ${badge(target)} принят.`,
        },
      ],
      quiz: null,
      ballAnim: {
        fromPos: { ...actor.pos },
        toPos: { ...target.pos },
        kind: action.type,
        startedAt: Date.now(),
        durationMs: 650,
      },
    };
    return {
      state: next,
      description:
        action.type === "lob" ? "Навес доставлен" : "Пас принят",
      goal: false,
    };
  }

  if (action.type === "dribble" || action.type === "sprint") {
    const movedPlayers = state.players.map((p) =>
      p.id === actor.id ? { ...p, pos: { ...action.toPos } } : p,
    );
    const next: GameState = {
      ...state,
      players: movedPlayers,
      ballPos: { ...action.toPos },
      activePlayerId: actor.id,
      turn: flipTurn(state, actor.team),
      status: "play",
      turnNumber: state.turnNumber + 1,
      log: [
        ...state.log,
        {
          at: Date.now(),
          text:
            action.type === "sprint"
              ? `${badge(actor)} 🏃 прорвался на 2 клетки.`
              : `${badge(actor)} прошёл в дриблинге.`,
        },
      ],
      quiz: null,
      ballAnim: {
        fromPos: { ...actor.pos },
        toPos: { ...action.toPos },
        kind: action.type,
        startedAt: Date.now(),
        durationMs: 450,
      },
    };
    return {
      state: next,
      description:
        action.type === "sprint" ? "Спринт удался" : "Дриблинг удался",
      goal: false,
    };
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
      ballAnim: {
        fromPos: { ...actor.pos },
        toPos: goalCenter(otherTeam(actor.team)),
        kind: "shoot",
        startedAt: Date.now(),
        durationMs: 600,
      },
    };
    return { state: next, description: "Гол!", goal: true };
  }

  if (action.type === "relocate") {
    return applyRelocate(state, action);
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
          action.type === "shoot"
            ? "удар"
            : action.type === "pass" || action.type === "lob"
              ? "пас"
              : "мяч"
        } у ${actor ? badge(actor) : "соперника"}.`,
      },
    ],
    quiz: null,
    ballAnim: actor
      ? {
          fromPos: { ...actor.pos },
          toPos: { ...defender.pos },
          kind:
            action.type === "lob"
              ? "lob"
              : action.type === "pass"
                ? "pass"
                : "dribble",
          startedAt: Date.now(),
          durationMs: 500,
        }
      : null,
  };
  return { state: next, description: "Перехват!", goal: false };
}

export function applyTotalFailure(
  state: GameState,
  action: PendingAction,
): ResolutionResult {
  const actor = findPlayerById(state, action.from);
  if (!actor) return { state, description: "?", goal: false };

  const ballLandPos: Position =
    action.type === "pass" || action.type === "lob"
      ? findPlayerById(state, action.to)?.pos ?? { ...actor.pos }
      : action.type === "dribble" || action.type === "sprint"
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
    ballAnim: null,
  };
  return { state: next, description: "Потеря темпа", goal: false };
}

export function badge(p: PlayerState): string {
  return `${p.team}${p.number}`;
}
