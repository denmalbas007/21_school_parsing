import type {
  PendingAction,
  PublicRoom,
  QuizOutcomeMessage,
} from "./game/types";

export interface ServerToClientEvents {
  "lobby:rooms": (rooms: PublicRoom[]) => void;
  "room:state": (room: PublicRoom) => void;
  "quiz:outcome": (msg: QuizOutcomeMessage) => void;
  "system:error": (msg: { message: string }) => void;
  "system:hello": (msg: { socketId: string }) => void;
}

export interface ClientToServerEvents {
  "lobby:list": () => void;
  "lobby:create": (
    payload: { name: string },
    ack: (res: { roomId: string } | { error: string }) => void,
  ) => void;
  "room:join": (
    payload: { roomId: string; name: string },
    ack: (res: { ok: true; room: PublicRoom } | { error: string }) => void,
  ) => void;
  "room:leave": (payload: { roomId: string }) => void;
  "game:action": (
    payload: { roomId: string; action: PendingAction },
    ack: (res: { ok: true } | { error: string }) => void,
  ) => void;
  "quiz:answer": (
    payload: { roomId: string; questionId: string; optionIndex: number },
    ack: (res: { ok: true } | { error: string }) => void,
  ) => void;
}
