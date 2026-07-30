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
 * deathType: "none" | "spike_side" | "spike_top" | "stall"
 * shotTick: incrementa a cada tiro → nova ferida aleatória
 * velocityY: velocidade vertical (inclina o corpo)
 */
function Player({
  drawY,
  shotTick = 0,
  deathType = "none",
  velocityY = 0,
}) {
  const [wounds, setWounds] = useState([]);
  const [bloodSpray, setBloodSpray] = useState([]);
  const lastTick = useRef(0);
  const sprayId = useRef(0);

  // nova ferida a cada tiro
  useEffect(() => {
    if (!shotTick || shotTick === lastTick.current) return;
    if (deathType !== "none") return;
    lastTick.current = shotTick;
    setWounds((prev) => {
      const next = [...prev, randomWound()];
      return next.slice(-14);
    });
  }, [shotTick, deathType]);

  // jorro de sangue na morte por spike
  useEffect(() => {
    if (deathType !== "spike_side" && deathType !== "spike_top") return;

    const drops = Array.from({ length: 18 }, () => {
      const id = ++sprayId.current;
      const angle =
        deathType === "spike_top"
          ? -Math.PI / 2 + (Math.random() - 0.5) * 1.4
          : (Math.random() - 0.5) * Math.PI;
      const speed = 40 + Math.random() * 90;
      const size = 4 + Math.random() * 7;
      return {
        id,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        size,
        delay: Math.random() * 80,
      };
    });
    setBloodSpray(drops);
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

      {wounds.map((w) => (
        <div
          key={w.id}
          className={styles.wound}
          style={{ left: `${w.left}%`, top: `${w.top}%` }}
        >
          <span className={styles.woundBall} />
          <span className={styles.drip} />
          <span className={`${styles.drip} ${styles.drip2}`} />
          <span className={`${styles.drip} ${styles.drip3}`} />
          <span className={styles.blob} />
          <span className={`${styles.blob} ${styles.blob2}`} />
        </div>
      ))}

      {bloodSpray.map((d) => (
        <span
          key={d.id}
          className={styles.spray}
          style={{
            width: d.size,
            height: d.size,
            animationDelay: `${d.delay}ms`,
            ["--dx"]: `${d.dx}px`,
            ["--dy"]: `${d.dy}px`,
          }}
        />
      ))}
    </div>
  );
}

export default Player;
