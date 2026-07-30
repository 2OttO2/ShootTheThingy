import { useEffect, useRef, useState } from "react";
import styles from "./Player.module.css";
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

function Limb({ a, b, className, thickness = 8 }) {
  if (!a || !b) return null;
  const length = dist(a, b);
  const angle = angleBetween(a, b);
  return (
    <div
      className={className}
      style={{
        left: a.x,
        top: a.y,
        width: length,
        height: thickness,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 50%",
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
      count: severedNow ? 22 + Math.floor(Math.random() * 10) : 14 + Math.floor(Math.random() * 8),
      velocityY: velocityRef.current,
      moveSpeed: moveSpeedRef.current,
      mode: severedNow ? "death" : "shot",
      power: severedNow ? 1.15 : 1,
    });

    const burst = makeSprayBurst({
      count: severedNow ? 12 : 6,
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

    const rd = createRagdoll(playerX, drawYRef.current, {
      deathType,
      velocityY: velocityRef.current,
      moveSpeed: moveSpeedRef.current,
      floorY,
      ceilingY,
    });
    ragdollRef.current = rd;
    setRagdollPose(ragdollSnapshot(rd));
    lastRafTime.current = 0;

    const cx = playerX + 24;
    const cy = drawYRef.current + 32;
    bloodRef?.current?.burst({
      x: cx,
      y: cy,
      count: deathType === "stall" ? 18 : 45 + Math.floor(Math.random() * 20),
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

      stepRagdoll(ragdollRef.current, dtNorm);
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
  }, [deathType, playerX]);

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
    }
  }, [deathType, shotTick]);

  // pingos só via partículas globais
  useEffect(() => {
    if (deathType !== "none" || wounds.length === 0) return;

    const id = setInterval(() => {
      const list = woundsRef.current;
      const w = list[Math.floor(Math.random() * list.length)];
      if (!w) return;
      const worldX = playerX + (w.left / 100) * 48;
      const worldY = drawYRef.current + (w.top / 100) * 64;
      bloodRef?.current?.drip({
        x: worldX,
        y: worldY,
        velocityY: velocityRef.current,
        moveSpeed: moveSpeedRef.current,
      });
    }, 260);

    return () => clearInterval(id);
  }, [wounds.length, deathType, playerX, bloodRef]);

  const tilt = Math.max(-18, Math.min(18, velocityY * 1.2));
  const isDying = deathType !== "none";

  if (isDying && ragdollPose) {
    const p = ragdollPose;
    return (
      <>
        <div className={styles.ragdollLayer}>
          <Limb a={p.chest} b={p.hip} className={styles.rdTorso} thickness={14} />
          <Limb a={p.head} b={p.chest} className={styles.rdNeck} thickness={6} />
          <Limb a={p.lShoulder} b={p.lHand} className={styles.rdArm} thickness={7} />
          <Limb a={p.rShoulder} b={p.rHand} className={styles.rdArm} thickness={7} />
          <Limb a={p.chest} b={p.lShoulder} className={styles.rdArm} thickness={6} />
          <Limb a={p.chest} b={p.rShoulder} className={styles.rdArm} thickness={6} />
          <Limb a={p.hip} b={p.lKnee} className={styles.rdLeg} thickness={8} />
          <Limb a={p.hip} b={p.rKnee} className={styles.rdLeg} thickness={8} />
          <Limb a={p.lKnee} b={p.lFoot} className={styles.rdLeg} thickness={7} />
          <Limb a={p.rKnee} b={p.rFoot} className={styles.rdLeg} thickness={7} />

          <div
            className={styles.rdHead}
            style={{ left: p.head.x - 14, top: p.head.y - 14 }}
          >
            <div className={styles.rdEye} />
            <div className={`${styles.rdEye} ${styles.rdEyeRight}`} />
          </div>

          <div className={styles.rdJoint} style={{ left: p.lHand.x - 4, top: p.lHand.y - 4 }} />
          <div className={styles.rdJoint} style={{ left: p.rHand.x - 4, top: p.rHand.y - 4 }} />
          <div className={styles.rdFoot} style={{ left: p.lFoot.x - 5, top: p.lFoot.y - 3 }} />
          <div className={styles.rdFoot} style={{ left: p.rFoot.x - 5, top: p.rFoot.y - 3 }} />
        </div>

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
    <div
      className={styles.player}
      style={{
        top: `${drawY}px`,
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
  );
}

export default Player;
