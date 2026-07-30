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
 * A direção do jorro puxa um pouco pro sentido do movimento.
 */
function makeSprayBurst({ count, originLeft, originTop, velocityY, deathMode }) {
  const particles = [];
  // bias vertical: subindo → jorra mais pra cima; caindo → mais pra baixo
  const vyBias = Math.max(-1, Math.min(1, velocityY / 12));

  for (let i = 0; i < count; i++) {
    let angle;
    if (deathMode === "spike_top") {
      // explode mais pra cima e lados
      angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    } else if (deathMode === "spike_side") {
      angle = (Math.random() - 0.5) * Math.PI * 1.6;
    } else {
      // tiro: 360° mas com bias da velocidade
      angle = Math.random() * Math.PI * 2;
      // puxa o ângulo um pouco na direção do movimento vertical
      angle += vyBias * 0.55;
    }

    const speedBase = deathMode ? 70 + Math.random() * 140 : 35 + Math.random() * 95;
    // quanto mais rápido o player, mais longe o sangue voa
    const speedBoost = 1 + Math.min(1.5, Math.abs(velocityY) / 18);
    const speed = speedBase * speedBoost;

    const size = deathMode
      ? 3 + Math.random() * 8
      : 2 + Math.random() * 5;

    particles.push({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      left: originLeft,
      top: originTop,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed + vyBias * 20,
      size,
      height: size * (0.65 + Math.random() * 0.7),
      delay: Math.random() * (deathMode ? 60 : 40),
      duration: deathMode ? 0.55 + Math.random() * 0.35 : 0.4 + Math.random() * 0.35,
      rot: (Math.random() - 0.5) * 720,
    });
  }
  return particles;
}

function Player({
  drawY,
  shotTick = 0,
  deathType = "none",
  velocityY = 0,
}) {
  const [wounds, setWounds] = useState([]);
  const [bloodSpray, setBloodSpray] = useState([]);
  const lastTick = useRef(0);
  const velocityRef = useRef(velocityY);
  velocityRef.current = velocityY;

  // tiro → ferida + jorro de partículas (HW style)
  useEffect(() => {
    if (!shotTick || shotTick === lastTick.current) return;
    if (deathType !== "none") return;
    lastTick.current = shotTick;

    const wound = randomWound();
    setWounds((prev) => [...prev, wound].slice(-14));

    const burst = makeSprayBurst({
      count: 14 + Math.floor(Math.random() * 10), // 14–23 partículas
      originLeft: wound.left,
      originTop: wound.top,
      velocityY: velocityRef.current,
      deathMode: null,
    });

    setBloodSpray((prev) => {
      const next = [...prev, ...burst];
      // evita acumular infinitamente
      return next.slice(-80);
    });

    // remove partículas antigas depois da animação
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
      count: 36 + Math.floor(Math.random() * 16),
      originLeft: 50,
      originTop: 50,
      velocityY: velocityRef.current,
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

      {/* feridas permanentes (bolinha) + filete leve residual */}
      {wounds.map((w) => (
        <div
          key={w.id}
          className={styles.wound}
          style={{ left: `${w.left}%`, top: `${w.top}%` }}
        >
          <span className={styles.woundBall} />
          <span className={styles.drip} />
          <span className={`${styles.drip} ${styles.drip2}`} />
        </div>
      ))}

      {/* partículas de sangue voando (tiro + morte) */}
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
