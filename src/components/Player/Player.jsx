import { useEffect, useRef, useState } from "react";
import styles from "./Player.module.css";
import {
  createRagdoll,
  stepRagdoll,
  ragdollSnapshot,
  angleBetween,
  dist,
} from "../../utils/ragdoll.js";

// posições possíveis da ferida no corpo (% left, % top)
const WOUND_ZONES = [
  { left: 28, top: 38 },
  { left: 62, top: 36 },
  { left: 45, top: 48 },
  { left: 35, top: 58 },
  { left: 58, top: 56 },
  { left: 42, top: 68 },
  { left: 30, top: 72 },
  { left: 55, top: 74 },
  { left: 38, top: 82 },
  { left: 52, top: 84 },
];

function randomWound() {
  const zone = WOUND_ZONES[Math.floor(Math.random() * WOUND_ZONES.length)];
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    left: zone.left + (Math.random() * 8 - 4),
    top: zone.top + (Math.random() * 6 - 3),
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

/** Segmento visual entre dois pontos do ragdoll */
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

  const lastTick = useRef(0);
  const velocityRef = useRef(velocityY);
  const moveSpeedRef = useRef(moveSpeed);
  const drawYRef = useRef(drawY);
  const ragdollRef = useRef(null);
  const ragdollRaf = useRef(null);
  const lastRafTime = useRef(0);
  velocityRef.current = velocityY;
  moveSpeedRef.current = moveSpeed;
  drawYRef.current = drawY;

  // tiro → ferida + jorro no sistema global de sangue
  useEffect(() => {
    if (!shotTick || shotTick === lastTick.current) return;
    if (deathType !== "none") return;
    lastTick.current = shotTick;

    const wound = randomWound();
    setWounds((prev) => [...prev, wound].slice(-14));

    // posição mundo da ferida (player 48x64 em playerX / drawY)
    const worldX = playerX + (wound.left / 100) * 48;
    const worldY = drawYRef.current + (wound.top / 100) * 64;

    bloodRef?.current?.burst({
      x: worldX,
      y: worldY,
      count: 16 + Math.floor(Math.random() * 10),
      velocityY: velocityRef.current,
      moveSpeed: moveSpeedRef.current,
      mode: "shot",
      power: 1,
    });

    // spray local CSS leve (backup visual na ferida)
    const burst = makeSprayBurst({
      count: 8 + Math.floor(Math.random() * 6),
      originLeft: wound.left,
      originTop: wound.top,
      velocityY: velocityRef.current,
      moveSpeed: moveSpeedRef.current,
      deathMode: null,
    });
    setBloodSpray((prev) => [...prev, ...burst].slice(-40));
    const timeout = setTimeout(() => {
      setBloodSpray((prev) => prev.filter((p) => !burst.find((b) => b.id === p.id)));
    }, 700);
    return () => clearTimeout(timeout);
  }, [shotTick, deathType, playerX]);

  // ativa ragdoll + sangue na morte
  useEffect(() => {
    if (deathType === "none") {
      // cleanup
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

    // jorro de sangue global na morte
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

  // limpa feridas no reset
  useEffect(() => {
    if (deathType === "none" && shotTick === 0) {
      setWounds([]);
      setBloodSpray([]);
      lastTick.current = 0;
    }
  }, [deathType, shotTick]);

  // pingos contínuos das feridas (estilo HW)
  useEffect(() => {
    if (deathType !== "none" || wounds.length === 0) return;

    const id = setInterval(() => {
      const w = wounds[Math.floor(Math.random() * wounds.length)];
      if (!w) return;
      const worldX = playerX + (w.left / 100) * 48;
      const worldY = drawYRef.current + (w.top / 100) * 64;
      bloodRef?.current?.drip({
        x: worldX,
        y: worldY,
        velocityY: velocityRef.current,
        moveSpeed: moveSpeedRef.current,
      });
    }, 280);

    return () => clearInterval(id);
  }, [wounds, deathType, playerX, bloodRef]);

  const tilt = Math.max(-18, Math.min(18, velocityY * 1.2));
  const isDying = deathType !== "none";

  // ===== RAGDOLL RENDER =====
  if (isDying && ragdollPose) {
    const p = ragdollPose;
    return (
      <>
        <div className={styles.ragdollLayer}>
          {/* tronco */}
          <Limb a={p.chest} b={p.hip} className={styles.rdTorso} thickness={14} />
          {/* pescoço / cabeça ligada */}
          <Limb a={p.head} b={p.chest} className={styles.rdNeck} thickness={6} />
          {/* braços */}
          <Limb a={p.lShoulder} b={p.lHand} className={styles.rdArm} thickness={7} />
          <Limb a={p.rShoulder} b={p.rHand} className={styles.rdArm} thickness={7} />
          <Limb a={p.chest} b={p.lShoulder} className={styles.rdArm} thickness={6} />
          <Limb a={p.chest} b={p.rShoulder} className={styles.rdArm} thickness={6} />
          {/* pernas */}
          <Limb a={p.hip} b={p.lKnee} className={styles.rdLeg} thickness={8} />
          <Limb a={p.hip} b={p.rKnee} className={styles.rdLeg} thickness={8} />
          <Limb a={p.lKnee} b={p.lFoot} className={styles.rdLeg} thickness={7} />
          <Limb a={p.rKnee} b={p.rFoot} className={styles.rdLeg} thickness={7} />

          {/* cabeça */}
          <div
            className={styles.rdHead}
            style={{ left: p.head.x - 14, top: p.head.y - 14 }}
          >
            <div className={styles.rdEye} />
            <div className={`${styles.rdEye} ${styles.rdEyeRight}`} />
          </div>

          {/* mãos / pés (bolinhas) */}
          <div className={styles.rdJoint} style={{ left: p.lHand.x - 4, top: p.lHand.y - 4 }} />
          <div className={styles.rdJoint} style={{ left: p.rHand.x - 4, top: p.rHand.y - 4 }} />
          <div className={styles.rdFoot} style={{ left: p.lFoot.x - 5, top: p.lFoot.y - 3 }} />
          <div className={styles.rdFoot} style={{ left: p.rFoot.x - 5, top: p.rFoot.y - 3 }} />
        </div>

        {/* sangue no impacto — ancorado no peito do ragdoll */}
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

  // ===== PLAYER VIVO =====
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
        <div className={styles.armLeft} />
        <div className={styles.armRight} />
        <div className={styles.legLeft} />
        <div className={styles.legRight} />
      </div>

      {wounds.map((w) => {
        const vyAbs = Math.min(1, Math.abs(velocityY) / 16);
        const hx = Math.min(1, Math.max(0, moveSpeed) / 10);
        const dripLen = 32 + vyAbs * 36 + hx * 30;

        let dripAngle = 12 + hx * 40;
        if (velocityY < -2) {
          dripAngle = 20 + hx * 35 + vyAbs * 15;
        } else if (velocityY > 2) {
          dripAngle = 5 + hx * 30;
        }

        const dripDur = Math.max(0.4, 1.05 - vyAbs * 0.35 - hx * 0.25);

        return (
          <div
            key={w.id}
            className={styles.wound}
            style={{ left: `${w.left}%`, top: `${w.top}%` }}
          >
            <span className={styles.woundBall} />
            <span
              className={styles.drip}
              style={{
                ["--drip-len"]: `${dripLen}px`,
                ["--drip-angle"]: `${dripAngle}deg`,
                animationDuration: `${dripDur}s`,
              }}
            />
            <span
              className={`${styles.drip} ${styles.drip2}`}
              style={{
                ["--drip-len"]: `${dripLen * 0.8}px`,
                ["--drip-angle"]: `${dripAngle + 10}deg`,
                animationDuration: `${dripDur + 0.18}s`,
              }}
            />
            <span
              className={`${styles.drip} ${styles.drip3}`}
              style={{
                ["--drip-len"]: `${dripLen * 0.6}px`,
                ["--drip-angle"]: `${Math.max(5, dripAngle - 8)}deg`,
                animationDuration: `${dripDur + 0.3}s`,
              }}
            />
          </div>
        );
      })}

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
