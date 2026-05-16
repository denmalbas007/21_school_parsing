"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { GameLogEntry } from "@/lib/game/types";

interface GameLogProps {
  entries: GameLogEntry[];
}

export function GameLog({ entries }: GameLogProps) {
  const recent = entries.slice(-6).reverse();
  return (
    <div className="glass max-h-48 overflow-y-auto rounded-2xl p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
        События
      </h3>
      <ul className="flex flex-col gap-1.5 text-sm">
        <AnimatePresence initial={false}>
          {recent.map((e, idx) => (
            <motion.li
              key={`${e.at}-${idx}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-zinc-200"
            >
              <span className="mr-2 font-mono text-[10px] text-zinc-500">
                {new Date(e.at).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              {e.text}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
