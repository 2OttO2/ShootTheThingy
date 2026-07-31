import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import styles from "./BloodLayer.module.css";
import {
  createBloodSystem,
  bloodBurst,
  bloodDrip,
  bloodArterial,
  bloodStump,
  stepBlood,
  bloodSnapshot,
  clearBlood,
  setBloodFloor,
} from "../../utils/bloodParticles.js";

/**
 * Camada global de sangue.
 *   bloodRef.current.burst({ x, y, count, mode, power, ... })
 *   bloodRef.current.drip({ x, y })
 *   bloodRef.current.arterial({ x, y })
 *   bloodRef.current.stump({ x, y })
 *   bloodRef.current.clear()
 */
const BloodLayer = forwardRef(function BloodLayer({ active = true }, ref) {
  const systemRef = useRef(null);
  const rafRef = useRef(null);
  const lastTime = useRef(0);
  const [particles, setParticles] = useState([]);

  if (!systemRef.current) {
    systemRef.current = createBloodSystem();
  }

  useImperativeHandle(ref, () => ({
    burst(opts) {
      const sys = systemRef.current;
      setBloodFloor(sys, window.innerHeight - 8);
      bloodBurst(sys, opts.x, opts.y, opts);
    },
    drip(opts) {
      const sys = systemRef.current;
      setBloodFloor(sys, window.innerHeight - 8);
      bloodDrip(sys, opts.x, opts.y, opts);
    },
    arterial(opts) {
      const sys = systemRef.current;
      setBloodFloor(sys, window.innerHeight - 8);
      bloodArterial(sys, opts.x, opts.y, opts);
    },
    stump(opts) {
      const sys = systemRef.current;
      setBloodFloor(sys, window.innerHeight - 8);
      bloodStump(sys, opts.x, opts.y, opts);
    },
    clear() {
      clearBlood(systemRef.current);
      setParticles([]);
    },
  }));

  useEffect(() => {
    if (!active) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    setBloodFloor(systemRef.current, window.innerHeight - 8);
    lastTime.current = 0;

    const loop = (time) => {
      if (!lastTime.current) lastTime.current = time;
      const dt = Math.min(time - lastTime.current, 40);
      lastTime.current = time;
      const dtNorm = dt / 16.67;

      stepBlood(systemRef.current, dtNorm);
      setParticles(bloodSnapshot(systemRef.current));
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active]);

  return (
    <div className={styles.layer}>
      {particles.map((p) => (
        <span
          key={p.id}
          className={styles.drop}
          style={{
            left: p.x,
            top: p.y,
            width: p.width,
            height: p.height,
            opacity: p.opacity,
            transform: `translate(-50%, -50%) rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
});

export default BloodLayer;

