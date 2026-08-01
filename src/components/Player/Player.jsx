import { useEffect, useRef, useState } from "react";
import styles from "./Player.module.css";
import RagdollSprites from "./RagdollSprites.jsx";
import {
  createRagdoll,
  stepRagdoll,
  ragdollSnapshot,
  angleBetween,
  dist,
} from "../../utils/ragdoll.js";

/**
 * Ordem de dano:
 * 1) perna E → 2) perna D → 3) braço E → 4) braço D  (3 tiros cada, 2 furos visíveis)
 * 5) testa → 6) genital → 7) coração  (1 tiro cada marca)
 * depois: aleatório na mesma região (torso/cabeça)
 */

const LIMB_ORDER = ["legLeft", "legRight", "armLeft", "armRight"];

const LIMB_DETACH = {
  legLeft: { ox: 12, oy: 52, w: 10, h: 22, kind: "leg" },
  legRight: { ox: 30, oy: 52, w: 10, h: 22, kind: "leg" },
  armLeft: { ox: 2, oy: 28, w: 9, h: 18, kind: "arm" },
  armRight: { ox: 38, oy: 28, w: 9, h: 18, kind: "arm" },
};

const LIMB_HP = 3;
const LIMB_MAX_HOLES = 2;

const LIMB_HOLE_SPOTS = {
  legLeft: [
    { left: 28, top: 78 },
    { left: 32, top: 88 },
  ],
  legRight: [
    { left: 68, top: 78 },
    { left: 64, top: 88 },
  ],
  armLeft: [
    { left: 12, top: 42 },
    { left: 16, top: 52 },
  ],
  armRight: [
    { left: 84, top: 42 },
    { left: 80, top: 52 },
  ],
};

const VITAL_ORDER = ["forehead", "groin", "heart"];
const VITAL_SPOTS = {
  forehead: { left: 50, top: 12 },
  groin: { left: 50, top: 62 },
  heart: { left: 42, top: 38 },
};

const REGION_SPOTS = {
  head: [
    { left: 42, top: 8 },
    { left: 58, top: 10 },
    { left: 48, top: 18 },
    { left: 55, top: 16 },
  ],
  torso: [
    { left: 40, top: 36 },
    { left: 55, top: 40 },
    { left: 45, top: 48 },
    { left: 52, top: 52 },
    { left: 48, top: 58 },
  ],
};

function jitter(spot, amount = 4) {
  return {
    left: spot.left + (Math.random() * amount * 2 - amount),
    top: spot.top + (Math.random() * amount * 2 - amount),
  };
}

function makeSprayBurst({ count, originLeft, originTop, velocityY, moveSpeed, deathMode }) {
  const particles = [];
  const vyBias = Math.max(-1, Math.min(1, velocityY / 12));
  const vxBias = -Math.min(1, Math.max(0, moveSpeed) / 10);

  for (let i = 0; i < count; i++) {
    let angle = Math.random() * Math.PI * 2;
    if (deathMode === "spike_top") {
      angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    } else if (deathMode === "spike_side") {
      angle = (Math.random() - 0.5) * Math.PI * 1.7;
    }

    const speedBase = deathMode ? 80 + Math.random() * 160 : 40 + Math.random() * 110;
    const speedBoost =
      1 +
      Math.min(1.2, Math.abs(velocityY) / 18) +
      Math.min(0.8, Math.max(0, moveSpeed) / 12);
    const speed = speedBase * speedBoost;

    const isStreak = Math.random() > 0.35;
    const width = isStreak ? 1.5 + Math.random() * 2.5 : 2.5 + Math.random() * 4;
    const height = isStreak ? 8 + Math.random() * 18 : 3 + Math.random() * 6;

    let dx = Math.cos(angle) * speed + vxBias * 50;
    let dy = Math.sin(angle) * speed + vyBias * 25;
    if (dx > 15) dx *= 0.35;

    const rot = (Math.atan2(dy, dx) * 180) / Math.PI + 90;

    particles.push({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      left: originLeft,
      top: originTop,
      dx,
      dy,
      size: width,
      height,
      delay: Math.random() * (deathMode ? 50 : 30),
      duration: deathMode ? 0.5 + Math.random() * 0.4 : 0.35 + Math.random() * 0.4,
      rot,
    });
  }
  return particles;
}

function Limb({ a, b, className, thickness = 8, maxLen = 36 }) {
  if (!a || !b) return null;
  // clamp visual length — physics may stretch, draw never turns to spaghetti
  const length = Math.min(maxLen, Math.max(4, dist(a, b)));
  const angle = angleBetween(a, b);
  return (
    <div
      className={className}
      style={{
        left: a.x,
        top: a.y - thickness / 2,
        width: length,
        height: thickness,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 50%",
      }}
    />
  );
}

/** Torso como bloco goofy (não só uma barra fina) */
function TorsoBlock({ chest, hip }) {
  if (!chest || !hip) return null;
  const mx = (chest.x + hip.x) / 2;
  const my = (chest.y + hip.y) / 2;
  const angle = angleBetween(chest, hip);
  const h = Math.min(28, Math.max(16, dist(chest, hip)));
  return (
    <div
      className={styles.rdTorsoBlock}
      style={{
        left: mx - 12,
        top: my - h / 2,
        height: h,
        transform: `rotate(${angle}deg)`,
      }}
    />
  );
}

function emptyLimbState() {
  return {
    legLeft: { hits: 0, severed: false, holes: [] },
    legRight: { hits: 0, severed: false, holes: [] },
    armLeft: { hits: 0, severed: false, holes: [] },
    armRight: { hits: 0, severed: false, holes: [] },
  };
}

function Player({
  drawY,
  shotTick = 0,
  deathType = "none",
  deathSpike = null,
  deathObstacles = [],
  velocityY = 0,
  moveSpeed = 0,
  playerX = 300,
  bloodRef = null,
}) {
  const [wounds, setWounds] = useState([]);
  const [bloodSpray, setBloodSpray] = useState([]);
  const [ragdollPose, setRagdollPose] = useState(null);
  const [limbs, setLimbs] = useState(emptyLimbState);
  const [vitalIndex, setVitalIndex] = useState(0);
  const [detachedLimbs, setDetachedLimbs] = useState([]); // membros isolados caindo
  const detachedRef = useRef([]);
  // ângulo contínuo do corpo (não “nariz de avião”)
  const [bodyAngle, setBodyAngle] = useState(0);
  const [kickY, setKickY] = useState(0);
  const angleRef = useRef(0);
  const spinRef = useRef(0); // deg por frame ~16ms
  const kickRef = useRef(0);

  const lastTick = useRef(0);
  const velocityRef = useRef(velocityY);
  const moveSpeedRef = useRef(moveSpeed);
  const drawYRef = useRef(drawY);
  const ragdollRef = useRef(null);
  const ragdollRaf = useRef(null);
  const lastRafTime = useRef(0);
  const limbsRef = useRef(limbs);
  const vitalRef = useRef(vitalIndex);
  const woundsRef = useRef(wounds);

  velocityRef.current = velocityY;
  moveSpeedRef.current = moveSpeed;
  drawYRef.current = drawY;
  limbsRef.current = limbs;
  vitalRef.current = vitalIndex;
  woundsRef.current = wounds;

  function applyShot() {
    const L = { ...limbsRef.current };
    for (const k of Object.keys(L)) {
      L[k] = { ...L[k], holes: [...L[k].holes] };
    }

    let targetPart = null;
    let spot = null;
    let severedNow = false;

    const nextLimb = LIMB_ORDER.find((id) => !L[id].severed);
    if (nextLimb) {
      targetPart = nextLimb;
      const limb = L[nextLimb];
      limb.hits += 1;

      const spots = LIMB_HOLE_SPOTS[nextLimb];
      const holeIdx = Math.min(limb.holes.length, spots.length - 1);
      const pos = jitter(spots[holeIdx], 3);
      if (limb.holes.length < LIMB_MAX_HOLES) {
        limb.holes.push(pos);
      } else {
        limb.holes[limb.holes.length - 1] = pos;
      }

      spot = pos;

      if (limb.hits >= LIMB_HP) {
        limb.severed = true;
        severedNow = true;

        // membro isolado que cai sangrando
        const det = LIMB_DETACH[nextLimb];
        if (det) {
          const piece = {
            id: `${nextLimb}-${Date.now()}`,
            part: nextLimb,
            kind: det.kind,
            x: playerX + det.ox,
            y: drawYRef.current + det.oy,
            vx: -2 - Math.random() * 3 - moveSpeedRef.current * 0.15,
            vy: -1 + Math.random() * 2,
            rot: (Math.random() - 0.5) * 40,
            vr: (Math.random() - 0.5) * 8,
            w: det.w,
            h: det.h,
            life: 8,
          };
          detachedRef.current = [...detachedRef.current, piece].slice(-6);
          setDetachedLimbs(detachedRef.current);
        }
      }

      setLimbs(L);
      limbsRef.current = L;
    } else {
      let vIdx = vitalRef.current;
      if (vIdx < VITAL_ORDER.length) {
        targetPart = VITAL_ORDER[vIdx];
        spot = jitter(VITAL_SPOTS[targetPart], 2.5);
        vIdx += 1;
        setVitalIndex(vIdx);
        vitalRef.current = vIdx;
      } else {
        const region = Math.random() > 0.35 ? "torso" : "head";
        targetPart = region;
        const pool = REGION_SPOTS[region];
        spot = jitter(pool[Math.floor(Math.random() * pool.length)], 5);
      }
    }

    const wound = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      left: spot.left,
      top: spot.top,
      part: targetPart,
    };

    setWounds((prev) => {
      let next = [...prev, wound];
      if (severedNow && targetPart) {
        next = next.filter((w) => w.part !== targetPart);
      }
      next = next.filter((w) => {
        if (LIMB_ORDER.includes(w.part)) {
          return !L[w.part]?.severed;
        }
        return true;
      });
      return next.slice(-20);
    });

    const worldX = playerX + (spot.left / 100) * 48;
    const worldY = drawYRef.current + (spot.top / 100) * 64;

    bloodRef?.current?.burst({
      x: worldX,
      y: worldY,
      count: severedNow ? 12 + Math.floor(Math.random() * 6) : 8 + Math.floor(Math.random() * 5),
      velocityY: velocityRef.current,
      moveSpeed: moveSpeedRef.current,
      mode: severedNow ? "death" : "shot",
      power: severedNow ? 1.15 : 1,
    });

    const burst = makeSprayBurst({
      count: severedNow ? 6 : 4,
      originLeft: spot.left,
      originTop: spot.top,
      velocityY: velocityRef.current,
      moveSpeed: moveSpeedRef.current,
      deathMode: severedNow ? "spike_side" : null,
    });
    setBloodSpray((prev) => [...prev, ...burst].slice(-40));
    setTimeout(() => {
      setBloodSpray((prev) => prev.filter((p) => !burst.find((b) => b.id === p.id)));
    }, 700);
  }

  useEffect(() => {
    if (!shotTick || shotTick === lastTick.current) return;
    if (deathType !== "none") return;
    lastTick.current = shotTick;
    applyShot();
    // kickback do corpo (pra cima/trás), não balanço L-R
    // cada tiro = impulso de rotação real (pode virar de cabeça pra baixo)
    const dir = Math.random() > 0.45 ? 1 : -1;
    // 50–110 deg de spin por tiro — acumula se atirar de novo
    const spinBoost = dir * (55 + Math.random() * 55);
    spinRef.current += spinBoost;
    // clamp spin pra não ficar infinito demais
    spinRef.current = Math.max(-140, Math.min(140, spinRef.current));
    kickRef.current = 8 + Math.random() * 10;
    setKickY(kickRef.current);
  }, [shotTick, deathType, playerX]);

  useEffect(() => {
    if (deathType === "none") {
      if (ragdollRaf.current) {
        cancelAnimationFrame(ragdollRaf.current);
        ragdollRaf.current = null;
      }
      ragdollRef.current = null;
      setRagdollPose(null);
      return;
    }

    const floorY = window.innerHeight - 8;
    const ceilingY = 5;

    const L = limbsRef.current;
    const tipX = deathSpike?.tipX ?? playerX + 24;
    const tipY =
      deathSpike?.tipY ??
      (deathType === "spike_hang"
        ? 60
        : window.innerHeight - 64);
    const rd = createRagdoll(playerX, drawYRef.current, {
      deathType,
      velocityY: velocityRef.current,
      floorY,
      ceilingY,
      severed: {
        legLeft: L.legLeft.severed,
        legRight: L.legRight.severed,
        armLeft: L.armLeft.severed,
        armRight: L.armRight.severed,
      },
      spikeTipX: tipX,
      spikeTipY: tipY,
      spikeSide: deathSpike?.side ?? "bottom",
      offsetX: deathSpike?.offsetX ?? 0,
      impact: deathSpike?.impact ?? 1,
      obstacles: deathObstacles ?? [],
      onBlood: ({ x, y, count = 8, power = 1 }) => {
        bloodRef?.current?.burst({
          x,
          y,
          count,
          power,
          velocityY: 2,
          moveSpeed: 0,
        });
      },
    });
    ragdollRef.current = rd;
    setRagdollPose(ragdollSnapshot(rd));
    lastRafTime.current = 0;

    const cx = playerX + 24;
    const cy = drawYRef.current + 32;
    bloodRef?.current?.burst({
      x: cx,
      y: cy,
      count: deathType === "stall" ? 10 : 20 + Math.floor(Math.random() * 10),
      velocityY: velocityRef.current,
      moveSpeed: moveSpeedRef.current,
      mode: "death",
      power: deathType === "stall" ? 0.6 : 1.3,
    });

    const loop = (time) => {
      if (!ragdollRef.current) return;
      if (!lastRafTime.current) lastRafTime.current = time;
      const dt = Math.min(time - lastRafTime.current, 40);
      lastRafTime.current = time;
      const dtNorm = dt / 16.67;

      stepRagdoll(ragdollRef.current, dtNorm, moveSpeedRef.current);
      setRagdollPose(ragdollSnapshot(ragdollRef.current));
      ragdollRaf.current = requestAnimationFrame(loop);
    };
    ragdollRaf.current = requestAnimationFrame(loop);

    return () => {
      if (ragdollRaf.current) {
        cancelAnimationFrame(ragdollRaf.current);
        ragdollRaf.current = null;
      }
    };
  }, [deathType, playerX, deathSpike, deathObstacles]);

  useEffect(() => {
    if (deathType === "none" && shotTick === 0) {
      setWounds([]);
      setBloodSpray([]);
      const empty = emptyLimbState();
      setLimbs(empty);
      setVitalIndex(0);
      lastTick.current = 0;
      limbsRef.current = empty;
      vitalRef.current = 0;
      angleRef.current = 0;
      spinRef.current = 0;
      kickRef.current = 0;
      setBodyAngle(0);
      setKickY(0);
      detachedRef.current = [];
      setDetachedLimbs([]);
    }
  }, [deathType, shotTick]);


  // membros isolados: física + sangue
  useEffect(() => {
    let raf = null;
    let last = 0;
    let bleedAcc = 0;
    const floorY = () => window.innerHeight - 10;

    const loop = (time) => {
      if (!last) last = time;
      const dt = Math.min(time - last, 40);
      last = time;
      const dtN = dt / 16.67;
      bleedAcc += dt;

      let list = detachedRef.current;
      if (list.length) {
        const next = [];
        for (const piece of list) {
          piece.vy += 0.35 * dtN;
          piece.vx *= 0.995;
          // some pra esquerda com o “avanço” do mapa
          piece.x += piece.vx * dtN - 1.6 * dtN;
          piece.y += piece.vy * dtN;
          piece.rot += piece.vr * dtN;
          piece.life -= dtN * 0.016;

          if (piece.y + piece.h > floorY()) {
            piece.y = floorY() - piece.h;
            piece.vy *= -0.2;
            piece.vx *= 0.7;
            piece.vr *= 0.5;
            if (Math.abs(piece.vy) < 0.5) piece.vy = 0;
          }

          // fora da tela → desaparece
          if (piece.x < -80 || piece.life <= 0) continue;
          next.push(piece);
        }
        detachedRef.current = next;
        setDetachedLimbs(next);

        // sangue contínuo de cada membro no chão / caindo
        if (bleedAcc >= 90 && next.length) {
          bleedAcc = 0;
          const piece = next[Math.floor(Math.random() * next.length)];
          bloodRef?.current?.drip({
            x: piece.x + piece.w * 0.5,
            y: piece.y + 4,
            velocityY: piece.vy,
            moveSpeed: Math.abs(piece.vx),
            count: 2,
            power: 0.8,
          });
        }
      }

      raf = requestAnimationFrame(loop);
    };

    if (detachedRef.current.length > 0 || detachedLimbs.length > 0) {
      raf = requestAnimationFrame(loop);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [detachedLimbs.length, bloodRef]);

  // ---- sangramento contínuo (sem pausa) via rAF ----
  useEffect(() => {
    if (deathType !== "none") return;

    const hasWounds = wounds.length > 0;
    const L = limbsRef.current;
    const hasStump =
      L.legLeft.severed ||
      L.legRight.severed ||
      L.armLeft.severed ||
      L.armRight.severed;
    if (!hasWounds && !hasStump) return;

    const STUMP_POS = {
      legLeft: { left: 30, top: 72 },
      legRight: { left: 66, top: 72 },
      armLeft: { left: 14, top: 36 },
      armRight: { left: 82, top: 36 },
    };

    const isArterialPart = (part) =>
      part === "heart" || part === "forehead" || part === "groin";

    let raf = null;
    let last = 0;
    // acumuladores em ms — emitem sempre que passam o limiar (stream contínuo)
    let venousAcc = 0;
    let arterialAcc = 0;
    let stumpAcc = 0;

    const loop = (time) => {
      if (!last) last = time;
      const dt = Math.min(time - last, 40);
      last = time;

      venousAcc += dt;
      arterialAcc += dt;
      stumpAcc += dt;

      const list = woundsRef.current;
      const vy = velocityRef.current;
      const ms = moveSpeedRef.current;

      // venous: stream contínuo, 1 fonte por tick (leve)
      if (venousAcc >= 70 && list.length) {
        venousAcc = 0;
        const w = list[Math.floor(Math.random() * list.length)];
        if (w) {
          bloodRef?.current?.drip({
            x: playerX + (w.left / 100) * 48,
            y: drawYRef.current + (w.top / 100) * 64,
            velocityY: vy,
            moveSpeed: ms,
            power: isArterialPart(w.part) ? 0.95 : 0.75,
            count: 2,
          });
        }
      }

      // arterial: 1 vital por tick, ritmo alto mas barato
      const arterials = list.filter((w) => isArterialPart(w.part));
      if (arterialAcc >= 80 && arterials.length) {
        arterialAcc = 0;
        const w = arterials[Math.floor(Math.random() * arterials.length)];
        const power =
          w.part === "heart" ? 1.25 : w.part === "forehead" ? 1.1 : 1.0;
        bloodRef?.current?.arterial({
          x: playerX + (w.left / 100) * 48,
          y: drawYRef.current + (w.top / 100) * 64,
          velocityY: vy,
          moveSpeed: ms,
          power,
          count: 3,
        });
      }

      // stump: 1 coto por tick
      const severed = LIMB_ORDER.filter((id) => limbsRef.current[id].severed);
      if (stumpAcc >= 75 && severed.length) {
        stumpAcc = 0;
        const id = severed[Math.floor(Math.random() * severed.length)];
        const pos = STUMP_POS[id];
        bloodRef?.current?.stump({
          x: playerX + (pos.left / 100) * 48,
          y: drawYRef.current + (pos.top / 100) * 64,
          velocityY: vy,
          moveSpeed: ms,
          power: 1.1,
          count: 3,
        });
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [wounds.length, limbs, deathType, playerX, bloodRef]);

    // integração de spin — corpo gira de verdade, não “nariz de avião”
  useEffect(() => {
    if (deathType !== "none") return;
    let raf;
    let last = 0;
    const tick = (time) => {
      if (!last) last = time;
      const dt = Math.min(32, time - last) / 16.67;
      last = time;

      // torque leve pela velocidade vertical (queda acelera o giro, subida também)
      const vy = velocityRef.current;
      spinRef.current += vy * 0.08 * dt;

      // atrito: no ar quase não para; “chão” freia mais
      const onFloor =
        typeof window !== "undefined" &&
        drawYRef.current >= window.innerHeight - 100;
      const friction = onFloor ? 0.88 : 0.995;
      spinRef.current *= Math.pow(friction, dt);

      // kick vertical decai
      kickRef.current *= Math.pow(0.85, dt);

      angleRef.current += spinRef.current * 0.55 * dt;
      // mantém ângulo legível (pode dar voltas)
      if (angleRef.current > 720) angleRef.current -= 720;
      if (angleRef.current < -720) angleRef.current += 720;

      setBodyAngle(angleRef.current);
      setKickY(kickRef.current);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [deathType]);

  // feridas empurram o spin base (corpo mole)
  const hurtSpin = wounds.length * 3;
  const tilt = bodyAngle + (spinRef.current >= 0 ? hurtSpin * 0.15 : -hurtSpin * 0.15);
  const isDying = deathType !== "none";


  if (isDying && ragdollPose) {
    const p = ragdollPose;
    return (
      <>
        <RagdollSprites pose={p} />

            {detachedLimbs.map((piece) => (
        <div
          key={piece.id}
          className={
            piece.kind === "leg" ? styles.detachedLeg : styles.detachedArm
          }
          style={{
            position: "absolute",
            left: piece.x,
            top: piece.y,
            width: piece.w,
            height: piece.h,
            transform: `rotate(${piece.rot}deg)`,
          }}
        />
      ))}

        {bloodSpray.map((d) => (
          <span
            key={d.id}
            className={styles.spray}
            style={{
              position: "absolute",
              left: p.chest.x,
              top: p.chest.y,
              width: d.size,
              height: d.height,
              zIndex: 30,
              animationDuration: `${d.duration}s`,
              animationDelay: `${d.delay}ms`,
              ["--dx"]: `${d.dx}px`,
              ["--dy"]: `${d.dy}px`,
              ["--rot"]: `${d.rot}deg`,
            }}
          />
        ))}
      </>
    );
  }

  return (
    <>
    <div
      className={styles.player}
      style={{
        top: `${drawY - kickY}px`,
        transform: `rotate(${tilt}deg)`,
      }}
    >
      <div className={styles.body}>
        <div className={styles.head}>
          <div className={styles.eye} />
          <div className={`${styles.eye} ${styles.eyeRight}`} />
          <div className={styles.mouth} />
        </div>
        <div className={styles.torso} />
        {!limbs.armLeft.severed && <div className={styles.armLeft} />}
        {!limbs.armRight.severed && <div className={styles.armRight} />}
        {!limbs.legLeft.severed && <div className={styles.legLeft} />}
        {!limbs.legRight.severed && <div className={styles.legRight} />}

        {limbs.armLeft.severed && <div className={`${styles.stump} ${styles.stumpArmLeft}`} />}
        {limbs.armRight.severed && <div className={`${styles.stump} ${styles.stumpArmRight}`} />}
        {limbs.legLeft.severed && <div className={`${styles.stump} ${styles.stumpLegLeft}`} />}
        {limbs.legRight.severed && <div className={`${styles.stump} ${styles.stumpLegRight}`} />}
      </div>

      {wounds.map((w) => (
        <div
          key={w.id}
          className={styles.wound}
          style={{ left: `${w.left}%`, top: `${w.top}%` }}
        >
          <span className={styles.woundBall} />
        </div>
      ))}

      {bloodSpray.map((d) => (
        <span
          key={d.id}
          className={styles.spray}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.height,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}ms`,
            ["--dx"]: `${d.dx}px`,
            ["--dy"]: `${d.dy}px`,
            ["--rot"]: `${d.rot}deg`,
          }}
        />
      ))}
    </div>

      {/* membros isolados em coords de mundo */}
      {detachedLimbs.map((piece) => (
        <div
          key={piece.id}
          className={
            piece.kind === "leg" ? styles.detachedLeg : styles.detachedArm
          }
          style={{
            position: "absolute",
            left: piece.x,
            top: piece.y,
            width: piece.w,
            height: piece.h,
            transform: `rotate(${piece.rot}deg)`,
          }}
        />
      ))}
    </>
  );
}

export default Player;


