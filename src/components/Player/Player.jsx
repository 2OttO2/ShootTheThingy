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
import {
  createLivingRagdoll,
  stepLivingRagdoll,
  livingImpulse,
  livingSnapshot,
  applyBoneImpact,
  releaseBones,
} from "../../physics/livingRagdoll.js";

/**
 * Ordem de dano: membro → torso → cabeça → próximo membro → …
 * Ex: pernaE, torso, cabeça, pernaD, torso, cabeça, braçoE, …
 * Membro só cai após 3 acertos nele (várias voltas no ciclo).
 */

const LIMB_ORDER = ["legLeft", "legRight", "armLeft", "armRight"];

/** membro, torso, cabeça, membro, torso, cabeça… */
const SHOT_CYCLE = [
  "legLeft",
  "heart",
  "forehead",
  "legRight",
  "groin",
  "forehead",
  "armLeft",
  "heart",
  "forehead",
  "armRight",
  "groin",
  "forehead",
];

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


/** Posição da marca no segmento do ragdoll (não só no joint da ponta). */
function lerpPt(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function poseWoundPos(pose, w) {
  if (!pose || !w) return null;
  const part = w.part;
  const top = w.top ?? 50;
  const left = w.left ?? 50;

  // braços: ombro → mão (top maior = mais perto da mão)
  if (part === "armLeft") {
    const t = Math.max(0.28, Math.min(0.82, (top - 30) / 40));
    const p = lerpPt(pose.lShoulder, pose.lHand, t);
    return { x: p.x - 4, y: p.y - 4 };
  }
  if (part === "armRight") {
    const t = Math.max(0.28, Math.min(0.82, (top - 30) / 40));
    const p = lerpPt(pose.rShoulder, pose.rHand, t);
    return { x: p.x - 4, y: p.y - 4 };
  }

  // pernas: quadril → pé
  if (part === "legLeft") {
    const t = Math.max(0.35, Math.min(0.92, (top - 55) / 40));
    const p = lerpPt(pose.hip, pose.lFoot, t);
    return { x: p.x - 4, y: p.y - 4 };
  }
  if (part === "legRight") {
    const t = Math.max(0.35, Math.min(0.92, (top - 55) / 40));
    const p = lerpPt(pose.hip, pose.rFoot, t);
    return { x: p.x - 4, y: p.y - 4 };
  }

  // cabeça / torso / vitais
  if (part === "forehead" || part === "head") {
    const jx = ((left - 50) / 50) * 5;
    const jy = ((top - 12) / 20) * 4;
    return { x: pose.head.x + jx - 4, y: pose.head.y + jy - 4 };
  }
  if (part === "heart" || part === "torso") {
    const jx = ((left - 50) / 50) * 6;
    const jy = ((top - 40) / 30) * 5;
    return { x: pose.chest.x + jx - 4, y: pose.chest.y + jy - 4 };
  }
  if (part === "groin") {
    return { x: pose.hip.x - 4, y: pose.hip.y - 2 };
  }

  return { x: pose.chest.x - 4, y: pose.chest.y - 4 };
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


/** Torção do corpo vivo: I, torque, ω, θ (deg / deg/s) */
function torsionInertia(limbs) {
  // torso base + membros intactos aumentam I (gira mais devagar)
  let I = 0.55;
  if (!limbs?.legLeft?.severed) I += 0.12;
  if (!limbs?.legRight?.severed) I += 0.12;
  if (!limbs?.armLeft?.severed) I += 0.08;
  if (!limbs?.armRight?.severed) I += 0.08;
  return I;
}

function torsionShotImpulse(omega, limbs, hitLeftPct = 50) {
  const I = torsionInertia(limbs);
  // alavanca: tiro longe do centro gira mais
  const lever = (hitLeftPct - 50) / 50; // -1..1
  const side = lever >= 0 ? 1 : -1;
  const mag = (200 + Math.random() * 140) / I;
  // força no sentido da alavanca (ou aleatório se centro)
  const dir = Math.abs(lever) < 0.15 ? (Math.random() > 0.5 ? 1 : -1) : side;
  let next = omega + dir * mag * (0.65 + Math.abs(lever) * 0.55);
  return Math.max(-380, Math.min(380, next));
}

function stepTorsion({ angle, omega, limbs, velocityY, onFloor, dtSec }) {
  const I = torsionInertia(limbs);
  // torque aerodinâmico + queda (corpo "rola" no ar)
  const tauDrag = -1.35 * omega;
  const tauQuad = -0.0025 * omega * Math.abs(omega);
  const tauFall = velocityY * 0.9;
  let a = (tauDrag + tauQuad + tauFall) / I;

  let w = omega + a * dtSec;
  // atrito de contato com chão — freia, não endireita
  if (onFloor) {
    w *= Math.pow(0.15, dtSec); // freio forte
    // se spin baixo no chão, congela (deitado em qualquer ângulo)
    if (Math.abs(w) < 12) w = 0;
  } else {
    w *= Math.pow(0.995, dtSec * 60); // atrito do ar fraco
  }

  w = Math.max(-420, Math.min(420, w));
  let th = angle + w * dtSec;
  // unwrap só pra não estourar float
  if (th > 1080) th -= 720;
  if (th < -1080) th += 720;
  return { angle: th, omega: w };
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
  hitboxAngleRef = null, // ref do App: hitbox rotacionada
  impactEvent = null, // { id, strength, fx, fy, part } do App
  onBodySettled = null, // score só quando corpo parar
}) {
  const [wounds, setWounds] = useState([]);
  const [bloodSpray, setBloodSpray] = useState([]);
  const [ragdollPose, setRagdollPose] = useState(null);
  const [livingPose, setLivingPose] = useState(null);
  const livingRef = useRef(null);
  const prevVyRef = useRef(0);
  const [limbs, setLimbs] = useState(emptyLimbState);
  const [vitalIndex, setVitalIndex] = useState(0);
  const [detachedLimbs, setDetachedLimbs] = useState([]); // membros isolados caindo
  const detachedRef = useRef([]);
  // ângulo contínuo do corpo (não “nariz de avião”)
  const [bodyAngle, setBodyAngle] = useState(0);
  const [kickY, setKickY] = useState(0);
  const angleRef = useRef(0); // θ graus
  const spinRef = useRef(0); // ω graus/segundo
  const kickRef = useRef(0);
  const lastHitLeftRef = useRef(50); // onde o tiro acertou (alavanca)
  const cycleIndexRef = useRef(0); // índice no SHOT_CYCLE

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

    // round-robin: 1 tiro por parte do ciclo (pula membros já cortados)
    let picked = null;
    let pickedIdx = cycleIndexRef.current;
    for (let n = 0; n < SHOT_CYCLE.length; n++) {
      const idx = (cycleIndexRef.current + n) % SHOT_CYCLE.length;
      const id = SHOT_CYCLE[idx];
      if (LIMB_ORDER.includes(id) && L[id].severed) continue;
      picked = id;
      pickedIdx = idx;
      break;
    }
    // próximo ciclo começa depois do escolhido
    cycleIndexRef.current = (pickedIdx + 1) % SHOT_CYCLE.length;

    if (picked && LIMB_ORDER.includes(picked)) {
      targetPart = picked;
      const limb = L[picked];
      limb.hits += 1;

      const spots = LIMB_HOLE_SPOTS[picked];
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
        const det = LIMB_DETACH[picked];
        if (det) {
          const piece = {
            id: `${picked}-${Date.now()}`,
            part: picked,
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
    } else if (picked && VITAL_SPOTS[picked]) {
      // testa / genital / coração — marca e sangra, sem sever
      targetPart = picked;
      spot = jitter(VITAL_SPOTS[picked], 2.5);
    } else {
      const region = Math.random() > 0.35 ? "torso" : "head";
      targetPart = region;
      const pool = REGION_SPOTS[region];
      spot = jitter(pool[Math.floor(Math.random() * pool.length)], 5);
    }

    const wound = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      left: spot.left,
      top: spot.top,
      part: targetPart,
    };

    if (spot) lastHitLeftRef.current = spot.left;

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
    // garante ragdoll vivo antes do impulso (evita tiro sem giro)
    if (!livingRef.current) {
      livingRef.current = createLivingRagdoll(playerX, drawYRef.current, {
        legLeft: limbsRef.current.legLeft.severed,
        legRight: limbsRef.current.legRight.severed,
        armLeft: limbsRef.current.armLeft.severed,
        armRight: limbsRef.current.armRight.severed,
      });
    }
    // tiro = rotação pra FRENTE (+); bounce usa o mesmo valor em −
    const spinAmt = 6.5 + Math.random() * 2.5;
    livingImpulse(livingRef.current, spinAmt);
    spinRef.current += spinAmt * 40;
    kickRef.current = 5 + Math.random() * 7;
    setKickY(kickRef.current);
  }, [shotTick, deathType, playerX]);

  // impactos do gameplay (chão/teto/ambiente) → reação nos ossos
  const lastImpactId = useRef(0);
  useEffect(() => {
    if (!impactEvent || impactEvent.id === lastImpactId.current) return;
    if (deathType !== "none") return;
    lastImpactId.current = impactEvent.id;
    if (!livingRef.current) {
      livingRef.current = createLivingRagdoll(playerX, drawYRef.current, {
        legLeft: limbsRef.current.legLeft.severed,
        legRight: limbsRef.current.legRight.severed,
        armLeft: limbsRef.current.armLeft.severed,
        armRight: limbsRef.current.armRight.severed,
      });
    }
    applyBoneImpact(livingRef.current, {
      part: impactEvent.part || "chest",
      fx: impactEvent.fx ?? 0,
      fy: impactEvent.fy ?? 0,
      strength: impactEvent.strength ?? 1,
    });
    // spin visual residual
    spinRef.current += (impactEvent.fx >= 0 ? 1 : -1) * (impactEvent.strength || 1) * 25;
  }, [impactEvent, deathType, playerX]);


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
    // controle off — física assume
    if (livingRef.current) releaseBones(livingRef.current);

    const rd = createRagdoll(playerX, drawYRef.current, {
      deathType,
      velocityY: velocityRef.current,
      moveSpeed: moveSpeedRef.current,
      spin: livingRef.current?.omega ?? 0,
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
      bodyPart: deathSpike?.bodyPart ?? "torso",
      region: deathSpike?.region ?? "tip",
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
      cycleIndexRef.current = 0;
      livingRef.current = null;
      setLivingPose(null);
      prevVyRef.current = 0;
      setBodyAngle(0);
      setKickY(0);
      if (hitboxAngleRef) hitboxAngleRef.current = 0;
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

  // ---- sangramento contínuo — vivo E morto (feridas pré-morte seguem no ragdoll) ----
  useEffect(() => {
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

    const woundWorldPos = (w) => {
      let pose = null;
      if (deathType !== "none" && ragdollRef.current) {
        pose = ragdollSnapshot(ragdollRef.current);
      } else if (livingRef.current) {
        pose = livingSnapshot(livingRef.current);
      }
      const mapped = poseWoundPos(pose, w);
      if (mapped) return mapped;
      return {
        x: playerX + (w.left / 100) * 48,
        y: drawYRef.current + (w.top / 100) * 64,
      };
    };

    const stumpWorldPos = (id) => {
      const dying = deathType !== "none" && ragdollRef.current;
      if (!dying) {
        const pos = STUMP_POS[id];
        return {
          x: playerX + (pos.left / 100) * 48,
          y: drawYRef.current + (pos.top / 100) * 64,
        };
      }
      const pose = ragdollSnapshot(ragdollRef.current);
      if (!pose) {
        const pos = STUMP_POS[id];
        return {
          x: playerX + (pos.left / 100) * 48,
          y: drawYRef.current + (pos.top / 100) * 64,
        };
      }
      // coto ≈ encaixe no tronco
      if (id === "legLeft" || id === "legRight") return { x: pose.hip.x, y: pose.hip.y };
      if (id === "armLeft") return { x: pose.lShoulder.x, y: pose.lShoulder.y };
      if (id === "armRight") return { x: pose.rShoulder.x, y: pose.rShoulder.y };
      return { x: pose.chest.x, y: pose.chest.y };
    };

    let raf = null;
    let last = 0;
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
      // na morte o corpo "cai" — vy positivo leve pro sangue cair
      const vy =
        deathType !== "none" ? 4 + Math.random() * 3 : velocityRef.current;
      const ms = deathType !== "none" ? 0 : moveSpeedRef.current;

      if (venousAcc >= 70 && list.length) {
        venousAcc = 0;
        const w = list[Math.floor(Math.random() * list.length)];
        if (w) {
          const pos = woundWorldPos(w);
          bloodRef?.current?.drip({
            x: pos.x,
            y: pos.y,
            velocityY: vy,
            moveSpeed: ms,
            power: isArterialPart(w.part) ? 1.0 : 0.8,
            count: deathType !== "none" ? 3 : 2,
          });
        }
      }

      const arterials = list.filter((w) => isArterialPart(w.part));
      if (arterialAcc >= 80 && arterials.length) {
        arterialAcc = 0;
        const w = arterials[Math.floor(Math.random() * arterials.length)];
        const power =
          w.part === "heart" ? 1.3 : w.part === "forehead" ? 1.15 : 1.05;
        const pos = woundWorldPos(w);
        bloodRef?.current?.arterial({
          x: pos.x,
          y: pos.y,
          velocityY: vy,
          moveSpeed: ms,
          power: deathType !== "none" ? power * 1.1 : power,
          count: deathType !== "none" ? 4 : 3,
        });
      }

      const severed = LIMB_ORDER.filter((id) => limbsRef.current[id].severed);
      if (stumpAcc >= 75 && severed.length) {
        stumpAcc = 0;
        const id = severed[Math.floor(Math.random() * severed.length)];
        const pos = stumpWorldPos(id);
        bloodRef?.current?.stump({
          x: pos.x,
          y: pos.y,
          velocityY: vy,
          moveSpeed: ms,
          power: 1.15,
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

  // ragdoll VIVO — membros balançam; tiro = frente (+), bounce = trás (−)
  useEffect(() => {
    if (deathType !== "none") {
      livingRef.current = null;
      setLivingPose(null);
      return;
    }

    // recria ragdoll vivo quando membro é cortado (preserva ângulo)
    const sevNow = {
      legLeft: limbsRef.current.legLeft.severed,
      legRight: limbsRef.current.legRight.severed,
      armLeft: limbsRef.current.armLeft.severed,
      armRight: limbsRef.current.armRight.severed,
    };
    if (!livingRef.current) {
      livingRef.current = createLivingRagdoll(playerX, drawYRef.current, sevNow);
    } else {
      const prev = livingRef.current.severed;
      const changed =
        prev.legLeft !== sevNow.legLeft ||
        prev.legRight !== sevNow.legRight ||
        prev.armLeft !== sevNow.armLeft ||
        prev.armRight !== sevNow.armRight;
      if (changed) {
        const ang = livingRef.current.angle;
        const om = livingRef.current.omega;
        livingRef.current = createLivingRagdoll(playerX, drawYRef.current, sevNow);
        livingRef.current.angle = ang;
        livingRef.current.omega = om;
      }
    }

    let raf;
    let last = 0;
    const tick = (time) => {
      if (!last) last = time;
      const dtMs = Math.min(32, time - last);
      last = time;
      const dtSec = dtMs / 1000;
      const vy = velocityRef.current;
      const prev = prevVyRef.current;

      // BOUNCE: inversão de vy (chão ou teto) → rotação pra TRÁS
      const bounceFloor = prev > 2.5 && vy < -1.5;
      const bounceCeil = prev < -2.5 && vy > 1.5;
      if ((bounceFloor || bounceCeil) && livingRef.current) {
        const spinAmt = 6.5 + Math.random() * 2.5; // mesmo range do tiro
        livingImpulse(livingRef.current, -spinAmt); // trás
        spinRef.current -= spinAmt * 40;
      }
      prevVyRef.current = vy;

      const sev = {
        legLeft: limbsRef.current.legLeft.severed,
        legRight: limbsRef.current.legRight.severed,
        armLeft: limbsRef.current.armLeft.severed,
        armRight: limbsRef.current.armRight.severed,
      };

      stepLivingRagdoll(
        livingRef.current,
        playerX,
        drawYRef.current - kickRef.current,
        dtSec,
        vy,
        sev
      );
      setLivingPose(livingSnapshot(livingRef.current));

      kickRef.current *= Math.pow(0.12, dtSec);
      setKickY(kickRef.current);
      if (livingRef.current) {
        const rad = livingRef.current.angle;
        setBodyAngle((rad * 180) / Math.PI);
        if (hitboxAngleRef) hitboxAngleRef.current = rad;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [deathType, playerX, limbs.legLeft.severed, limbs.legRight.severed, limbs.armLeft.severed, limbs.armRight.severed]);

  
  // score só quando o corpo parar de se mexer
  useEffect(() => {
    if (deathType === "none" || !onBodySettled) return;
    let raf;
    let last = 0;
    let stillMs = 0;
    const SETTLE_SPEED = 45; // px/s médio
    const SETTLE_NEED = 700; // ms parado

    const tick = (time) => {
      if (!last) last = time;
      const dt = Math.min(40, time - last);
      last = time;
      const rd = ragdollRef.current;
      let maxSpd = 0;
      if (rd?.bodies) {
        for (const b of Object.values(rd.bodies)) {
          if (!b?.getLinearVelocity) continue;
          const v = b.getLinearVelocity();
          const s = Math.hypot(v.x, v.y);
          if (s > maxSpd) maxSpd = s;
        }
      }
      if (maxSpd < SETTLE_SPEED) stillMs += dt;
      else stillMs = 0;
      if (stillMs >= SETTLE_NEED) {
        onBodySettled();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [deathType, onBodySettled]);

  const isDying = deathType !== "none";


  if (isDying && ragdollPose) {
    const p = ragdollPose;
    const deathWoundMap = (w) => {
      const mapped = poseWoundPos(p, w);
      if (mapped) return mapped;
      return { x: p.chest.x - 4, y: p.chest.y - 4 };
    };
    return (
      <>
        <RagdollSprites pose={p} />

        {wounds.map((w) => {
          const pos = deathWoundMap(w);
          return (
            <div
              key={w.id}
              className={styles.wound}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: 10,
                height: 10,
                zIndex: 40,
              }}
            >
              <span className={styles.woundBall} />
            </div>
          );
        })}

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

  const livePose = livingPose;

  const woundMap = (pose, w) => {
    const mapped = poseWoundPos(pose, w);
    if (mapped) return mapped;
    return {
      x: playerX + (w.left / 100) * 48,
      y: drawY - kickY + (w.top / 100) * 64,
    };
  };

  return (
    <>
    {livePose && <RagdollSprites pose={livePose} />}

    {wounds.map((w) => {
      const pos = woundMap(livePose, w);
      return (
        <div
          key={w.id}
          className={styles.wound}
          style={{
            position: "absolute",
            left: pos.x,
            top: pos.y,
            width: 10,
            height: 10,
            zIndex: 40,
          }}
        >
          <span className={styles.woundBall} />
        </div>
      );
    })}

    {bloodSpray.map((d) => (
      <span
        key={d.id}
        className={styles.spray}
        style={{
          position: "absolute",
          left: playerX + (d.left / 100) * 48,
          top: drawY - kickY + (d.top / 100) * 64,
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


