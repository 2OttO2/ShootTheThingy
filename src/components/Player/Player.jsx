import { useEffect, useRef, useState } from "react";
import styles from "./Player.module.css";

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

/**
 * Cria partículas estilo Happy Wheels.
 * velocityY: negativo = subindo (recoil), positivo = caindo
 * moveSpeed: horizontal — sangue arrasta pra ESQUERDA
 */
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

    // nunca empurra o sangue "pra frente" (direita)
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

function Player({
  drawY,
  shotTick = 0,
  deathType = "none",
  velocityY = 0,
  moveSpeed = 0,
}) {
  const [wounds, setWounds] = useState([]);
  const [bloodSpray, setBloodSpray] = useState([]);
  const lastTick = useRef(0);
  const velocityRef = useRef(velocityY);
  const moveSpeedRef = useRef(moveSpeed);
  velocityRef.current = velocityY;
  moveSpeedRef.current = moveSpeed;

  // tiro → ferida + jorro
  useEffect(() => {
    if (!shotTick || shotTick === lastTick.current) return;
    if (deathType !== "none") return;
    lastTick.current = shotTick;

    const wound = randomWound();
    setWounds((prev) => [...prev, wound].slice(-14));

    const burst = makeSprayBurst({
      count: 18 + Math.floor(Math.random() * 12),
      originLeft: wound.left,
      originTop: wound.top,
      velocityY: velocityRef.current,
      moveSpeed: moveSpeedRef.current,
      deathMode: null,
    });

    setBloodSpray((prev) => {
      const next = [...prev, ...burst];
      return next.slice(-80);
    });

    const maxLife = 900;
    const timeout = setTimeout(() => {
      setBloodSpray((prev) => prev.filter((p) => !burst.find((b) => b.id === p.id)));
    }, maxLife);
    return () => clearTimeout(timeout);
  }, [shotTick, deathType]);

  // morte por spike → jorro grande
  useEffect(() => {
    if (deathType !== "spike_side" && deathType !== "spike_top") return;

    const burst = makeSprayBurst({
      count: 40 + Math.floor(Math.random() * 20),
      originLeft: 50,
      originTop: 50,
      velocityY: velocityRef.current,
      moveSpeed: moveSpeedRef.current,
      deathMode: deathType,
    });
    setBloodSpray(burst);
  }, [deathType]);

  // limpa no reset
  useEffect(() => {
    if (deathType === "none" && shotTick === 0) {
      setWounds([]);
      setBloodSpray([]);
      lastTick.current = 0;
    }
  }, [deathType, shotTick]);

  const tilt = Math.max(-18, Math.min(18, velocityY * 1.2));
  const isDying = deathType !== "none";
  const deathClass =
    deathType === "spike_side"
      ? styles.dyingSide
      : deathType === "spike_top"
        ? styles.dyingTop
        : deathType === "stall"
          ? styles.dyingStall
          : "";

  return (
    <div
      className={`${styles.player} ${isDying ? deathClass : ""}`}
      style={{
        top: `${drawY}px`,
        transform: isDying ? undefined : `rotate(${tilt}deg)`,
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

      {/* feridas + filetes (arrastam pra ESQUERDA com moveSpeed) */}
      {wounds.map((w) => {
        const vyAbs = Math.min(1, Math.abs(velocityY) / 16);
        const hx = Math.min(1, Math.max(0, moveSpeed) / 10);

        const dripLen = 32 + vyAbs * 36 + hx * 30;

        // positivo = pende pra esquerda (nunca pra direita)
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

      {/* partículas voando */}
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
