import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import styles from "./BloodLayer.module.css";
import {
  createBloodSystem,
  bloodBurst,
  bloodDrip,
  bloodArterial,
  bloodStump,
  stepBlood,
  clearBlood,
  setBloodFloor,
} from "../../utils/bloodParticles.js";

/**
 * Canvas blood layer — sem React state, sem manchas no chão.
 *   bloodRef.current.burst / drip / arterial / stump / clear
 */
const BloodLayer = forwardRef(function BloodLayer({ active = true }, ref) {
  const systemRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const lastTime = useRef(0);

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
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    if (!active) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return () => window.removeEventListener("resize", resize);
    }

    setBloodFloor(systemRef.current, window.innerHeight - 8);
    lastTime.current = 0;

    const draw = (ctx, sys) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (const p of sys.particles) {
        const alpha = Math.max(0, Math.min(1, p.life / Math.max(0.01, p.maxLife)));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#a00000";
        ctx.beginPath();
        ctx.ellipse(0, 0, p.width * 0.55, p.height * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    const loop = (time) => {
      if (!lastTime.current) lastTime.current = time;
      const dt = Math.min(time - lastTime.current, 40);
      lastTime.current = time;
      const dtNorm = dt / 16.67;

      const sys = systemRef.current;
      stepBlood(sys, dtNorm);

      const ctx = canvas.getContext("2d");
      if (ctx) draw(ctx, sys);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active]);

  return <canvas ref={canvasRef} className={styles.layer} />;
});

export default BloodLayer;

