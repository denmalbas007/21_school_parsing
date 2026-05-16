"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import type { PublicRoom } from "@/lib/game/types";

export default function LobbyPage() {
  const { socket, connected, playerId } = useSocket();
  const router = useRouter();
  const [name, setName] = useState("");
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("qb:name") || "";
      if (saved) setName(saved);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onRooms = (rs: PublicRoom[]) => setRooms(rs);
    socket.on("lobby:rooms", onRooms);
    socket.emit("lobby:list");
    return () => {
      socket.off("lobby:rooms", onRooms);
    };
  }, [socket]);

  const persistName = (val: string) => {
    setName(val);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("qb:name", val);
    }
  };

  const createRoom = () => {
    if (!socket) return;
    setError(null);
    socket.emit(
      "lobby:create",
      { name: name || "Игрок", playerId },
      (res) => {
        if ("error" in res) {
          setError(res.error);
          return;
        }
        socket.emit(
          "room:join",
          { roomId: res.roomId, name: name || "Игрок", playerId },
          (joinRes) => {
            if ("error" in joinRes) {
              setError(joinRes.error);
              return;
            }
            router.push(`/game/${res.roomId}`);
          },
        );
      },
    );
  };

  const joinRoom = (roomId: string) => {
    if (!socket) return;
    setError(null);
    setJoiningId(roomId);
    socket.emit(
      "room:join",
      { roomId, name: name || "Игрок", playerId },
      (res) => {
        setJoiningId(null);
        if ("error" in res) {
          setError(res.error);
          return;
        }
        router.push(`/game/${roomId}`);
      },
    );
  };

  return (
    <main className="flex-1 px-4 py-10 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-3"
          >
            <motion.span
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{
                duration: 3,
                repeat: Infinity,
                repeatDelay: 2,
                ease: "easeInOut",
              }}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 text-2xl shadow-lg shadow-emerald-500/30"
            >
              ⚽
            </motion.span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                QuizBall
              </h1>
              <p className="text-xs text-zinc-400">
                Пошаговый футбол × викторины
              </p>
            </div>
            <span
              className={`ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
                connected
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-rose-500/15 text-rose-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connected ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                }`}
              />
              {connected ? "онлайн" : "подключаемся…"}
            </span>
          </motion.div>
          <p className="text-zinc-400">
            Каждый пас, дриблинг и удар решается через викторину — сложность
            зависит от дистанции и от того, сколько защитников на линии.
            Когда соперник пытается перехватить, вы отвечаете одновременно: кто
            первый прав, тот забирает эпизод.
          </p>
        </header>

        <section className="glass rounded-2xl p-6 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-300">Ваше имя</span>
            <input
              value={name}
              onChange={(e) => persistName(e.target.value)}
              placeholder="Например, Pelé Junior"
              className="rounded-xl bg-white/5 px-4 py-3 text-base outline-none ring-1 ring-white/10 focus:ring-emerald-400/60"
            />
          </label>

          <button
            onClick={createRoom}
            disabled={!connected}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 py-3 font-semibold text-zinc-900 transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            Создать комнату и пригласить соперника
          </button>
          {error && (
            <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Открытые комнаты</h2>
            <button
              onClick={() => socket?.emit("lobby:list")}
              className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
            >
              обновить
            </button>
          </div>
          {rooms.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-zinc-400 text-sm">
              Свободных комнат нет. Создайте свою и поделитесь ссылкой —
              как только присоединится второй игрок, матч стартует автоматически.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {rooms.map((r) => (
                <li
                  key={r.id}
                  className="glass flex items-center justify-between rounded-2xl px-5 py-4"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-base">#{r.id}</span>
                    <span className="text-xs text-zinc-400">
                      Игроков: {r.seats.length} / 2
                      {r.seats.length > 0 &&
                        " · " +
                          r.seats
                            .map((s) => `${s.team}: ${s.name}`)
                            .join(", ")}
                    </span>
                  </div>
                  <button
                    onClick={() => joinRoom(r.id)}
                    disabled={!connected || joiningId === r.id}
                    className="rounded-xl bg-emerald-400/90 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-emerald-300 disabled:opacity-50"
                  >
                    {joiningId === r.id ? "входим…" : "войти"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass rounded-2xl p-5 text-sm text-zinc-300">
          <h3 className="mb-2 font-medium">Как играть</h3>
          <ol className="ml-4 list-decimal flex flex-col gap-1 text-zinc-300/90">
            <li>Команды ходят по очереди. Кто владеет мячом — атакует.</li>
            <li>
              На своём ходу с мячом выберите <b>пас</b> / <b>дриблинг</b> /{" "}
              <b>удар</b>. Появится викторина — нужно ответить быстрее
              соперника.
            </li>
            <li>
              Если соперник на линии паса/удара — он отвечает одновременно с
              вами. Перехват = мяч у него.
            </li>
            <li>
              На своём ходу без мяча — двигаете одного игрока на 1 клетку, чтобы
              перекрыть атаку. Без викторины.
            </li>
            <li>До 3 голов.</li>
          </ol>
        </section>

        <footer className="mt-auto pt-6 text-xs text-zinc-500">
          Чтобы сыграть с другом — откройте ту же ссылку игры в его браузере, и
          партия стартует автоматически.
        </footer>
      </div>
    </main>
  );
}
