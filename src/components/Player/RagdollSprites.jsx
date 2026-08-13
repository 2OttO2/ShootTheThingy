/**
 * Render do ragdoll com "sprites" SVG por membro (estilo Happy Wheels light).
 * Cada segmento é um SVG rotacionado entre dois joints.
 *
 * Amputação por tiro: só coto no tronco — a peça voadora é
 * `detachedLimbs` no Player (não redesenhar o membro colado no corpo).
 *
 * Amputação física na morte (spike): se knee/foot estão LONGE do hip,
 * desenha a peça solta na pose (está no spike / caindo).
 */
import { angleBetween, dist } from "../../utils/ragdoll.js";
import styles from "./Player.module.css";

function Segment({ a, b, maxLen = 34, children, z = 2 }) {
  if (!a || !b) return null;
  const len = Math.min(maxLen, Math.max(6, dist(a, b)));
  const angle = angleBetween(a, b);
  return (
    <div
      className={styles.rdSeg}
      style={{
        left: a.x,
        top: a.y,
        width: len,
        transform: `rotate(${angle}deg)`,
        zIndex: z,
      }}
    >
      <div className={styles.rdSegInner} style={{ width: len }}>
        {children}
      </div>
    </div>
  );
}

function ArmSprite() {
  return (
    <svg viewBox="0 0 40 12" width="100%" height="12" preserveAspectRatio="none">
      <rect x="1" y="1" width="38" height="10" rx="5" fill="#f5d0a9" stroke="#333" strokeWidth="2" />
    </svg>
  );
}

function LegSprite() {
  return (
    <svg viewBox="0 0 40 14" width="100%" height="14" preserveAspectRatio="none">
      <rect x="1" y="1" width="38" height="12" rx="4" fill="#2d3436" stroke="#333" strokeWidth="2" />
    </svg>
  );
}

function NeckSprite() {
  return (
    <svg viewBox="0 0 20 8" width="100%" height="8" preserveAspectRatio="none">
      <rect x="1" y="1" width="18" height="6" rx="3" fill="#f5d0a9" stroke="#333" strokeWidth="1.5" />
    </svg>
  );
}

function TorsoSprite({ h = 22 }) {
  return (
    <svg viewBox={`0 0 28 ${h}`} width="28" height={h}>
      <rect x="1" y="1" width="26" height={h - 2} rx="7" fill="#6c5ce7" stroke="#333" strokeWidth="2" />
    </svg>
  );
}

function HeadSprite() {
  return (
    <svg viewBox="0 0 32 30" width="32" height="30">
      <ellipse cx="16" cy="15" rx="14" ry="13" fill="#f5d0a9" stroke="#333" strokeWidth="2" />
      <circle cx="11" cy="13" r="2.2" fill="#111" />
      <circle cx="21" cy="13" r="2.2" fill="#111" />
      <path d="M11 20 Q16 24 21 20" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Coto no tronco (marca de amputação). */
function Stump({ at, angleDeg = 90, z = 4 }) {
  if (!at) return null;
  return (
    <div
      className={styles.rdSeg}
      style={{
        left: at.x,
        top: at.y,
        width: 10,
        transform: `rotate(${angleDeg}deg)`,
        zIndex: z,
      }}
    >
      <div
        className={styles.rdSegInner}
        style={{
          width: 10,
          height: 8,
          borderRadius: 3,
          background: "#c0392b",
          border: "1.5px solid #333",
        }}
      />
    </div>
  );
}

/**
 * @param {{ pose: object }} props
 */
export default function RagdollSprites({ pose: p }) {
  if (!p) return null;

  const sev = p.severed || {};
  const torsoH = Math.min(28, Math.max(18, dist(p.chest, p.hip)));
  const mx = (p.chest.x + p.hip.x) / 2;
  const my = (p.chest.y + p.hip.y) / 2;
  const torsoAngle = angleBetween(p.chest, p.hip);

  // Peça física solta (morte/spike): joint longe do tronco
  const looseLegL =
    sev.legLeft && p.lKnee && p.lFoot && dist(p.hip, p.lKnee) > 36;
  const looseLegR =
    sev.legRight && p.rKnee && p.rFoot && dist(p.hip, p.rKnee) > 36;
  const looseArmL =
    sev.armLeft && p.lHand && p.lShoulder && dist(p.chest, p.lHand) > 48;
  const looseArmR =
    sev.armRight && p.rHand && p.rShoulder && dist(p.chest, p.rHand) > 48;

  return (
    <div className={styles.ragdollLayer}>
      {/* Pernas */}
      {!sev.legLeft ? (
        <>
          <Segment a={p.hip} b={p.lKnee} maxLen={24} z={1}>
            <LegSprite />
          </Segment>
          <Segment a={p.lKnee} b={p.lFoot} maxLen={24} z={1}>
            <LegSprite />
          </Segment>
        </>
      ) : (
        <>
          <Stump at={p.hip} angleDeg={100} z={4} />
          {looseLegL && (
            <Segment a={p.lKnee} b={p.lFoot} maxLen={30} z={5}>
              <LegSprite />
            </Segment>
          )}
        </>
      )}
      {!sev.legRight ? (
        <>
          <Segment a={p.hip} b={p.rKnee} maxLen={24} z={1}>
            <LegSprite />
          </Segment>
          <Segment a={p.rKnee} b={p.rFoot} maxLen={24} z={1}>
            <LegSprite />
          </Segment>
        </>
      ) : (
        <>
          <Stump at={p.hip} angleDeg={80} z={4} />
          {looseLegR && (
            <Segment a={p.rKnee} b={p.rFoot} maxLen={30} z={5}>
              <LegSprite />
            </Segment>
          )}
        </>
      )}

      {/* Braços */}
      {!sev.armLeft ? (
        <Segment a={p.lShoulder} b={p.lHand} maxLen={26} z={2}>
          <ArmSprite />
        </Segment>
      ) : (
        <>
          <Stump at={p.lShoulder} angleDeg={90} z={4} />
          {looseArmL && (
            <Segment
              a={p.lHand}
              b={{ x: p.lHand.x + 16, y: p.lHand.y + 8 }}
              maxLen={22}
              z={5}
            >
              <ArmSprite />
            </Segment>
          )}
        </>
      )}
      {!sev.armRight ? (
        <Segment a={p.rShoulder} b={p.rHand} maxLen={26} z={2}>
          <ArmSprite />
        </Segment>
      ) : (
        <>
          <Stump at={p.rShoulder} angleDeg={90} z={4} />
          {looseArmR && (
            <Segment
              a={p.rHand}
              b={{ x: p.rHand.x - 16, y: p.rHand.y + 8 }}
              maxLen={22}
              z={5}
            >
              <ArmSprite />
            </Segment>
          )}
        </>
      )}

      {/* torso */}
      <div
        className={styles.rdSeg}
        style={{
          left: mx - 14,
          top: my - torsoH / 2,
          width: 28,
          height: torsoH,
          transform: `rotate(${torsoAngle}deg)`,
          zIndex: 3,
          transformOrigin: "center center",
        }}
      >
        <TorsoSprite h={torsoH} />
      </div>

      <Segment a={p.head} b={p.chest} maxLen={20} z={3}>
        <NeckSprite />
      </Segment>

      <div
        style={{
          position: "absolute",
          left: p.head.x - 16,
          top: p.head.y - 15,
          zIndex: 6,
          pointerEvents: "none",
        }}
      >
        <HeadSprite />
      </div>
    </div>
  );
}
