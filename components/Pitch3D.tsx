"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useState, useEffect } from "react";
import { Vector3, MathUtils, Group, Mesh } from "three";
import type { GameState, PlayerState, Position, Team } from "@/lib/game/types";

export type ActionMode =
  | "pass"
  | "lob"
  | "dribble"
  | "sprint"
  | "shoot"
  | "relocate"
  | null;

interface Pitch3DProps {
  state: GameState;
  mySeatTeam: Team | null;
  selectedRelocatePlayerId: string | null;
  passTargetIds?: string[];
  dribbleTargets?: Position[];
  sprintTargets?: Position[];
  relocateTargets?: Position[];
  canShoot?: boolean;
  highlightActionMode: ActionMode;
  onSelectPlayer?: (player: PlayerState) => void;
  onSelectCell?: (pos: Position) => void;
  onShoot?: () => void;
}

const CELL = 1; // 1 world unit per cell
const FIELD_PAD = 0.5;

export function Pitch3D(props: Pitch3DProps) {
  const { state } = props;
  const fieldW = state.cols * CELL;
  const fieldH = state.rows * CELL;
  return (
    <div className="w-full max-w-[760px] mx-auto aspect-[16/10] rounded-2xl overflow-hidden glass">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [fieldW / 2, 6.5, fieldH + 4.5], fov: 42 }}
      >
        <color attach="background" args={["#0a1a14"]} />
        <fog attach="fog" args={["#0a1a14", 18, 32]} />

        <ambientLight intensity={0.55} />
        <directionalLight
          position={[fieldW / 2 + 4, 12, fieldH / 2 + 6]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-10}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-10}
        />
        <hemisphereLight args={["#bce4d6", "#0a3322", 0.4]} />

        <Scene {...props} fieldW={fieldW} fieldH={fieldH} />

        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableRotate={false}
          target={[fieldW / 2, 0, fieldH / 2]}
        />
      </Canvas>
    </div>
  );
}

function Scene(
  props: Pitch3DProps & { fieldW: number; fieldH: number },
) {
  const {
    state,
    mySeatTeam,
    selectedRelocatePlayerId,
    passTargetIds,
    dribbleTargets,
    sprintTargets,
    relocateTargets,
    canShoot,
    highlightActionMode,
    onSelectPlayer,
    onSelectCell,
    onShoot,
    fieldW,
    fieldH,
  } = props;

  const carrier = state.players.find((p) => p.id === state.ballCarrierId);

  return (
    <group>
      <Field cols={state.cols} rows={state.rows} />
      <Markings cols={state.cols} rows={state.rows} />
      <Goal side="left" rows={state.rows} />
      <Goal side="right" cols={state.cols} rows={state.rows} />

      {/* Click-target cells for dribble / sprint / relocate */}
      {dribbleTargets?.map((pos, i) => (
        <CellHighlight
          key={`drib-${i}-${pos.col}-${pos.row}`}
          pos={pos}
          color="#facc15"
          onClick={() => onSelectCell?.(pos)}
        />
      ))}
      {sprintTargets?.map((pos, i) => (
        <CellHighlight
          key={`spr-${i}-${pos.col}-${pos.row}`}
          pos={pos}
          color="#fb923c"
          onClick={() => onSelectCell?.(pos)}
        />
      ))}
      {relocateTargets?.map((pos, i) => (
        <CellHighlight
          key={`rel-${i}-${pos.col}-${pos.row}`}
          pos={pos}
          color="#60a5fa"
          onClick={() => onSelectCell?.(pos)}
        />
      ))}

      {/* Pass target highlights (rings under teammates) */}
      {passTargetIds?.map((id) => {
        const p = state.players.find((pl) => pl.id === id);
        if (!p) return null;
        return (
          <PassRing key={`passring-${id}`} pos={p.pos} />
        );
      })}

      {/* Shoot indicator: glowing circle in front of opposing goal */}
      {canShoot && carrier && (
        <ShootButton
          fromTeam={carrier.team}
          fromPos={carrier.pos}
          cols={state.cols}
          rows={state.rows}
          onClick={() => onShoot?.()}
        />
      )}

      {/* Players */}
      {state.players.map((p) => {
        const isCarrier = p.id === state.ballCarrierId;
        const isActive = p.id === state.activePlayerId;
        const isSelectedReloc = p.id === selectedRelocatePlayerId;
        const clickable =
          !!passTargetIds?.includes(p.id) ||
          (highlightActionMode === "relocate" &&
            mySeatTeam === p.team &&
            !isCarrier) ||
          (highlightActionMode === null &&
            mySeatTeam === p.team &&
            p.id === state.ballCarrierId);
        return (
          <Player3D
            key={p.id}
            player={p}
            isActive={isActive}
            isCarrier={isCarrier}
            isSelectedRelocate={isSelectedReloc}
            clickable={clickable}
            onClick={() => clickable && onSelectPlayer?.(p)}
          />
        );
      })}

      {/* Ball: arcs with anim when ballAnim set, else follows carrier */}
      <Ball3D state={state} />

      <ContactShadow w={fieldW} h={fieldH} />
    </group>
  );
}

function cellToXZ(pos: Position): [number, number] {
  return [pos.col * CELL + CELL / 2, pos.row * CELL + CELL / 2];
}

// ---- Pitch surface ---------------------------------------------------------

function Field({ cols, rows }: { cols: number; rows: number }) {
  const W = cols * CELL + FIELD_PAD * 2;
  const H = rows * CELL + FIELD_PAD * 2;

  // Stripe planes: 1 col wide, alternating green shades
  const stripes = useMemo(() => {
    const out: Array<{ x: number; light: boolean }> = [];
    for (let c = 0; c < cols; c++) {
      out.push({ x: c * CELL + CELL / 2, light: c % 2 === 0 });
    }
    return out;
  }, [cols]);

  return (
    <group>
      {/* Slightly larger base so the borders look like turf around the pitch */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[cols * CELL / 2, -0.02, rows * CELL / 2]}
        receiveShadow
      >
        <planeGeometry args={[W + 2, H + 2]} />
        <meshStandardMaterial color="#072919" roughness={0.95} />
      </mesh>

      {stripes.map((s, i) => (
        <mesh
          key={`stripe-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[s.x, 0, rows * CELL / 2]}
          receiveShadow
        >
          <planeGeometry args={[CELL, rows * CELL]} />
          <meshStandardMaterial
            color={s.light ? "#1a7a3f" : "#15663a"}
            roughness={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

function Markings({ cols, rows }: { cols: number; rows: number }) {
  const w = cols * CELL;
  const h = rows * CELL;
  const lineY = 0.011;
  const T = 0.06; // line thickness

  return (
    <group>
      {/* Outer rect */}
      <Line points={[[0, lineY, 0], [w, lineY, 0]]} thickness={T} />
      <Line points={[[w, lineY, 0], [w, lineY, h]]} thickness={T} />
      <Line points={[[w, lineY, h], [0, lineY, h]]} thickness={T} />
      <Line points={[[0, lineY, h], [0, lineY, 0]]} thickness={T} />
      {/* Center line */}
      <Line points={[[w / 2, lineY, 0], [w / 2, lineY, h]]} thickness={T} />
      {/* Center circle */}
      <CircleLine cx={w / 2} cz={h / 2} radius={0.9} thickness={T} y={lineY} />
      {/* Penalty boxes */}
      <Box2D
        x1={0} z1={0.5}
        x2={1.5} z2={h - 0.5}
        thickness={T} y={lineY}
      />
      <Box2D
        x1={w - 1.5} z1={0.5}
        x2={w} z2={h - 0.5}
        thickness={T} y={lineY}
      />
    </group>
  );
}

function Line({ points, thickness }: { points: [number, number, number][]; thickness: number }) {
  const [a, b] = points;
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  const cz = (a[2] + b[2]) / 2;
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  return (
    <mesh position={[cx, cy, cz]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[len, 0.002, thickness]} />
      <meshBasicMaterial color="white" />
    </mesh>
  );
}

function CircleLine({
  cx, cz, radius, thickness, y,
}: { cx: number; cz: number; radius: number; thickness: number; y: number }) {
  const segments = 48;
  const lines: [number, number, number][][] = [];
  for (let i = 0; i < segments; i++) {
    const a1 = (i / segments) * Math.PI * 2;
    const a2 = ((i + 1) / segments) * Math.PI * 2;
    lines.push([
      [cx + Math.cos(a1) * radius, y, cz + Math.sin(a1) * radius],
      [cx + Math.cos(a2) * radius, y, cz + Math.sin(a2) * radius],
    ]);
  }
  return (
    <group>
      {lines.map((p, i) => (
        <Line key={`cl-${i}`} points={p} thickness={thickness} />
      ))}
    </group>
  );
}

function Box2D({ x1, z1, x2, z2, thickness, y }: {
  x1: number; z1: number; x2: number; z2: number; thickness: number; y: number;
}) {
  return (
    <group>
      <Line points={[[x1, y, z1], [x2, y, z1]]} thickness={thickness} />
      <Line points={[[x2, y, z1], [x2, y, z2]]} thickness={thickness} />
      <Line points={[[x2, y, z2], [x1, y, z2]]} thickness={thickness} />
      <Line points={[[x1, y, z2], [x1, y, z1]]} thickness={thickness} />
    </group>
  );
}

// ---- Goals -----------------------------------------------------------------

function Goal({ side, cols, rows }: { side: "left" | "right"; cols?: number; rows: number }) {
  const x = side === "left" ? -0.05 : (cols ?? 0) * CELL + 0.05;
  const z = rows * CELL / 2;
  const teamColor = side === "left" ? "#22d3ee" : "#f43f5e";
  return (
    <group position={[x, 0, z]}>
      {/* posts */}
      <mesh position={[0, 0.75, -1]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.5, 8]} />
        <meshStandardMaterial color="white" />
      </mesh>
      <mesh position={[0, 0.75, 1]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.5, 8]} />
        <meshStandardMaterial color="white" />
      </mesh>
      {/* crossbar */}
      <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 2, 8]} />
        <meshStandardMaterial color="white" />
      </mesh>
      {/* net (semi-transparent slab tinted with team color) */}
      <mesh position={[side === "left" ? -0.35 : 0.35, 0.75, 0]}>
        <boxGeometry args={[0.7, 1.5, 2]} />
        <meshStandardMaterial
          color={teamColor}
          transparent
          opacity={0.18}
          emissive={teamColor}
          emissiveIntensity={0.25}
        />
      </mesh>
    </group>
  );
}

// ---- Players ---------------------------------------------------------------

function Player3D({
  player,
  isActive,
  isCarrier,
  isSelectedRelocate,
  clickable,
  onClick,
}: {
  player: PlayerState;
  isActive: boolean;
  isCarrier: boolean;
  isSelectedRelocate: boolean;
  clickable: boolean;
  onClick: () => void;
}) {
  const groupRef = useRef<Group | null>(null);
  const targetRef = useRef(new Vector3());
  const [x, z] = cellToXZ(player.pos);
  targetRef.current.set(x, 0, z);

  // Spring-like position lerp.
  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const cur = groupRef.current.position;
    cur.x = MathUtils.damp(cur.x, targetRef.current.x, 8, dt);
    cur.z = MathUtils.damp(cur.z, targetRef.current.z, 8, dt);
  });

  const color = player.team === "A" ? "#22d3ee" : "#f43f5e";
  const emissive = isCarrier ? color : "#000000";

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {(isActive || isSelectedRelocate) && (
        <ActiveRing color={isSelectedRelocate ? "#60a5fa" : "#facc15"} />
      )}
      {/* Body capsule */}
      <mesh
        position={[0, 0.45, 0]}
        castShadow
        onPointerDown={(e) => {
          if (!clickable) return;
          e.stopPropagation();
          onClick();
        }}
      >
        <capsuleGeometry args={[0.22, 0.5, 6, 14]} />
        <meshStandardMaterial
          color={color}
          roughness={0.55}
          metalness={0.1}
          emissive={emissive}
          emissiveIntensity={isCarrier ? 0.35 : 0}
        />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#f0c8a8" roughness={0.7} />
      </mesh>
      {/* Number badge floating above */}
      <NumberSprite num={player.number} team={player.team} />
      {clickable && <ClickHaloRing />}
    </group>
  );
}

function ActiveRing({ color }: { color: string }) {
  const meshRef = useRef<Mesh | null>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (meshRef.current) {
      const sc = 1 + Math.sin(t * 3) * 0.08;
      meshRef.current.scale.set(sc, 1, sc);
    }
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <ringGeometry args={[0.32, 0.4, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} />
    </mesh>
  );
}

function ClickHaloRing() {
  const meshRef = useRef<Mesh | null>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (meshRef.current) {
      const m = meshRef.current.material as { opacity?: number };
      m.opacity = 0.35 + Math.sin(t * 4) * 0.2;
    }
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <ringGeometry args={[0.42, 0.5, 32]} />
      <meshBasicMaterial color="#10b981" transparent opacity={0.5} />
    </mesh>
  );
}

function NumberSprite({ num, team }: { num: number; team: Team }) {
  const color = team === "A" ? "#22d3ee" : "#f43f5e";
  // Use a billboard text via HTML overlay? Three.js text geometry costs.
  // Simpler: a flat plane with canvas texture would be too much; for now
  // render the number as a small badge that always faces forward (Y rot=0).
  return (
    <group position={[0, 1.55, 0]}>
      <mesh>
        <circleGeometry args={[0.22, 24]} />
        <meshBasicMaterial color="#0f1419" />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <ringGeometry args={[0.2, 0.22, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* digit segments via mini boxes (simpler than text). */}
      <DigitMesh digit={num} y={0} color={color} />
    </group>
  );
}

// Tiny 7-segment-like renderer for digits 1..9.
function DigitMesh({
  digit,
  y,
  color,
}: { digit: number; y: number; color: string }) {
  const W = 0.06;
  const H = 0.08;
  const T = 0.015;
  // Segment shapes for digits 1..9 (boolean which of 7 segs is on).
  // a=top, b=top-right, c=bot-right, d=bot, e=bot-left, f=top-left, g=middle
  const SEG: Record<number, [boolean, boolean, boolean, boolean, boolean, boolean, boolean]> = {
    1: [false, true, true, false, false, false, false],
    2: [true, true, false, true, true, false, true],
    3: [true, true, true, true, false, false, true],
    4: [false, true, true, false, false, true, true],
    5: [true, false, true, true, false, true, true],
    6: [true, false, true, true, true, true, true],
    7: [true, true, true, false, false, false, false],
    8: [true, true, true, true, true, true, true],
    9: [true, true, true, true, false, true, true],
    0: [true, true, true, true, true, true, false],
  };
  const segs = SEG[digit] ?? SEG[0];
  const segGeoms: Array<{
    key: string;
    args: [number, number, number];
    pos: [number, number, number];
  }> = [
    { key: "a", args: [W, T, 0.01], pos: [0, H, 0.003] },
    { key: "b", args: [T, H / 2, 0.01], pos: [W / 2, H / 2, 0.003] },
    { key: "c", args: [T, H / 2, 0.01], pos: [W / 2, -H / 2, 0.003] },
    { key: "d", args: [W, T, 0.01], pos: [0, -H, 0.003] },
    { key: "e", args: [T, H / 2, 0.01], pos: [-W / 2, -H / 2, 0.003] },
    { key: "f", args: [T, H / 2, 0.01], pos: [-W / 2, H / 2, 0.003] },
    { key: "g", args: [W, T, 0.01], pos: [0, 0, 0.003] },
  ];
  return (
    <group position={[0, y, 0]}>
      {segGeoms.map((s, i) =>
        segs[i] ? (
          <mesh key={s.key} position={s.pos}>
            <boxGeometry args={s.args} />
            <meshBasicMaterial color={color} />
          </mesh>
        ) : null,
      )}
    </group>
  );
}

// ---- Ball ------------------------------------------------------------------

function Ball3D({ state }: { state: GameState }) {
  const ref = useRef<Mesh | null>(null);
  const carrier = state.players.find((p) => p.id === state.ballCarrierId);
  const anim = state.ballAnim;

  // Cache the start time/position from the anim event.
  const animRef = useRef<{
    startedAt: number;
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    duration: number;
    peak: number;
  } | null>(null);

  if (anim) {
    const [fromX, fromZ] = cellToXZ(anim.fromPos);
    const [toX, toZ] = cellToXZ(anim.toPos);
    const peak = anim.kind === "lob" ? 1.6 : anim.kind === "shoot" ? 1.2 : 0.5;
    if (
      !animRef.current ||
      animRef.current.startedAt !== anim.startedAt
    ) {
      animRef.current = {
        startedAt: anim.startedAt,
        fromX,
        fromZ,
        toX,
        toZ,
        duration: anim.durationMs,
        peak,
      };
    }
  }

  // Resting position behind the carrier's right shoulder
  const restPos = useMemo(() => {
    if (!carrier) return new Vector3(state.ballPos.col + 0.5, 0.12, state.ballPos.row + 0.5);
    const [x, z] = cellToXZ(carrier.pos);
    return new Vector3(x + 0.2, 0.12, z - 0.2);
  }, [carrier, state.ballPos]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    if (animRef.current) {
      const a = animRef.current;
      const elapsed = Date.now() - a.startedAt;
      const t = Math.min(1, elapsed / a.duration);
      const x = a.fromX + (a.toX - a.fromX) * t;
      const z = a.fromZ + (a.toZ - a.fromZ) * t;
      // Arc: y peaks mid-flight
      const y = 0.12 + Math.sin(t * Math.PI) * a.peak;
      ref.current.position.set(x, y, z);
      if (t >= 1) {
        animRef.current = null;
      }
    } else {
      ref.current.position.x = MathUtils.damp(ref.current.position.x, restPos.x, 10, dt);
      ref.current.position.y = MathUtils.damp(ref.current.position.y, restPos.y, 10, dt);
      ref.current.position.z = MathUtils.damp(ref.current.position.z, restPos.z, 10, dt);
    }
    ref.current.rotation.x += dt * 6;
    ref.current.rotation.y += dt * 4;
  });

  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[0.14, 24, 24]} />
      <meshStandardMaterial color="white" roughness={0.4} />
    </mesh>
  );
}

// ---- Cell highlights -------------------------------------------------------

function CellHighlight({
  pos,
  color,
  onClick,
}: {
  pos: Position;
  color: string;
  onClick: () => void;
}) {
  const [x, z] = cellToXZ(pos);
  const meshRef = useRef<Mesh | null>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (meshRef.current) {
      const m = meshRef.current.material as { opacity?: number };
      m.opacity = 0.35 + Math.sin(t * 3.5) * 0.18;
    }
  });
  return (
    <mesh
      ref={meshRef}
      position={[x, 0.02, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <planeGeometry args={[CELL * 0.85, CELL * 0.85]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} />
    </mesh>
  );
}

function PassRing({ pos }: { pos: Position }) {
  const [x, z] = cellToXZ(pos);
  const meshRef = useRef<Mesh | null>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (meshRef.current) {
      const sc = 1 + Math.sin(t * 4) * 0.12;
      meshRef.current.scale.set(sc, 1, sc);
    }
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.025, z]}>
      <ringGeometry args={[0.38, 0.46, 32]} />
      <meshBasicMaterial color="#facc15" transparent opacity={0.85} />
    </mesh>
  );
}

function ShootButton({
  fromTeam,
  fromPos,
  cols,
  rows,
  onClick,
}: {
  fromTeam: Team;
  fromPos: Position;
  cols: number;
  rows: number;
  onClick: () => void;
}) {
  const x = fromTeam === "A" ? cols * CELL - 0.2 : 0.2;
  const z = rows * CELL / 2;
  const color = fromTeam === "A" ? "#f43f5e" : "#22d3ee";
  const ref = useRef<Mesh | null>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (ref.current) {
      const sc = 1 + Math.sin(t * 5) * 0.15;
      ref.current.scale.set(sc, sc, sc);
    }
  });

  // Also render a dashed line from carrier to here (simplified: tube)
  const [fx, fz] = cellToXZ(fromPos);
  const dx = x - fx;
  const dz = z - fz;
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);

  return (
    <group>
      <mesh
        position={[(fx + x) / 2, 0.05, (fz + z) / 2]}
        rotation={[0, -angle, 0]}
      >
        <boxGeometry args={[len, 0.01, 0.06]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh
        ref={ref}
        position={[x, 0.25, z]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <sphereGeometry args={[0.24, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
        />
      </mesh>
    </group>
  );
}

function ContactShadow({ w, h }: { w: number; h: number }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[w / 2, -0.025, h / 2]}
      receiveShadow
    >
      <planeGeometry args={[w + 6, h + 6]} />
      <shadowMaterial transparent opacity={0.35} />
    </mesh>
  );
}

// Suppress unused-vars TS warning for imports we keep ready for future use.
void useState;
void useEffect;
void useThree;
