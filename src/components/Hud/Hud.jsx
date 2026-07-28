import { useEffect, useState, useRef } from "react";
import styles from "./Hud.module.css";

import weaponPistol from "../../assets/weapons/pistol.png";
import weaponSub from "../../assets/weapons/sub.png";
import weaponShotgun from "../../assets/weapons/shotgun.png";
import weaponSniper from "../../assets/weapons/sniper.png";

import bulletPistol from "../../assets/bullets/pistol.png";
import bulletSub from "../../assets/bullets/sub.png";
import bulletShotgun from "../../assets/bullets/shotgun.png";
import bulletSniper from "../../assets/bullets/sniper.png";

const WEAPON_IMG = {
  pistol: weaponPistol,
  sub: weaponSub,
  shotgun: weaponShotgun,
  sniper: weaponSniper,
};

const BULLET_IMG = {
  pistol: bulletPistol,
  sub: bulletSub,
  shotgun: bulletShotgun,
  sniper: bulletSniper,
};

const RECOIL_DEG = {
  pistol: 8,
  sub: 5,
  shotgun: 14,
  sniper: 18,
};

function Hud({ weapon, ammo, isReloading, shotTick = 0, distance = 0, speed = 0, maxSpeed = 10 }) {
  const [recoiling, setRecoiling] = useState(false);
  const [flash, setFlash] = useState(false);
  const [ejected, setEjected] = useState([]); // { id, src, left, bottom }
  const lastTick = useRef(0);
  const ejectId = useRef(0);
  const bulletRefs = useRef([]);
  const bulletsBoxRef = useRef(null);

  useEffect(() => {
    if (!weapon || shotTick === 0 || shotTick === lastTick.current) return;
    lastTick.current = shotTick;

    setRecoiling(true);
    setFlash(true);

    const recoilMs = weapon.id === "sub" ? 90 : weapon.id === "sniper" ? 150 : 130;
    const flashMs =
      weapon.id === "sub" ? 50 :
      weapon.id === "shotgun" ? 100 :
      weapon.id === "sniper" ? 90 : 70;

    const t1 = setTimeout(() => setRecoiling(false), recoilMs);
    const t2 = setTimeout(() => setFlash(false), flashMs);

    const spentIndex = Math.max(0, ammo);
    const slotEl = bulletRefs.current[spentIndex];
    const boxEl = bulletsBoxRef.current;

    let left = 10;
    let bottom = 6;
    if (slotEl && boxEl) {
      left = slotEl.offsetLeft;
      bottom = boxEl.clientHeight - slotEl.offsetTop - slotEl.offsetHeight;
    }

    const id = ++ejectId.current;
    const src = BULLET_IMG[weapon.id] || bulletPistol;
    setEjected((prev) => [...prev, { id, src, left, bottom }]);
    const t3 = setTimeout(() => {
      setEjected((prev) => prev.filter((b) => b.id !== id));
    }, 450);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [shotTick, weapon, ammo]);

  if (!weapon) return null;

  const max = weapon.magazine;
  const weaponSrc = WEAPON_IMG[weapon.id] || weaponPistol;
  const bulletSrc = BULLET_IMG[weapon.id] || bulletPistol;
  const slots = Math.min(max, 24);
  const kick = RECOIL_DEG[weapon.id] || 8;

  const speedRatio = Math.max(0, Math.min(1, speed / maxSpeed));
  const speedClass =
    speedRatio <= 0.05 ? styles.speedCritical :
    speedRatio <= 0.25 ? styles.speedLow :
    speedRatio <= 0.55 ? styles.speedMid :
    styles.speedHigh;

  return (
    <>
      {/* stats — canto superior esquerdo */}
      <div className={styles.stats}>
        <div className={styles.statBlock}>
          <span className={styles.statLabel}>DIST</span>
          <span className={styles.statValue}>{distance}</span>
        </div>

        <div className={`${styles.statBlock} ${styles.speedBlock}`}>
          <div className={styles.speedHeader}>
            <span className={styles.statLabel}>SPEED</span>
            <span className={`${styles.speedNum} ${speedClass}`}>
              {speed.toFixed(1)}
            </span>
          </div>
          <div className={styles.speedTrack}>
            <div
              className={`${styles.speedFill} ${speedClass}`}
              style={{ width: `${speedRatio * 100}%` }}
            />
            <span className={styles.tick} style={{ left: "25%" }} />
            <span className={styles.tick} style={{ left: "50%" }} />
            <span className={styles.tick} style={{ left: "75%" }} />
          </div>
        </div>
      </div>

      {/* arma + munição — canto inferior esquerdo */}
      <div className={styles.hud}>
        <div className={styles.weaponBlock}>
          <div className={styles.weaponStage}>
            <img
              className={`${styles.weaponSprite} ${
                recoiling ? styles.weaponRecoil : ""
              }`}
              style={{ "--kick": `${kick}deg` }}
              src={weaponSrc}
              alt={weapon.name}
              draggable={false}
            />
            <span
              className={`${styles.muzzleFlash} ${
                styles[`flash_${weapon.id}`] || ""
              } ${flash ? styles.muzzleFlashOn : ""}`}
              aria-hidden
            >
              <span className={styles.flashCore} />
              <span className={styles.flashStar} />
              <span className={styles.flashSpark} />
              <span className={styles.flashSpark2} />
              <span className={styles.flashSpark3} />
            </span>
          </div>

          <div className={styles.weaponInfo}>
            <span className={styles.weaponName} style={{ color: weapon.color }}>
              {weapon.name}
            </span>
            <span className={styles.ammoCount}>
              {isReloading ? (
                <span className={styles.reloading}>REC...</span>
              ) : (
                <>
                  <span className={styles.ammoCurrent}>{ammo}</span>
                  <span className={styles.ammoSep}>/</span>
                  <span className={styles.ammoMax}>{max}</span>
                </>
              )}
            </span>
          </div>
        </div>

        <div className={styles.bullets} ref={bulletsBoxRef}>
          {Array.from({ length: slots }).map((_, i) => {
            const filledUpTo = Math.ceil((ammo / max) * slots);
            const filled = i < filledUpTo;
            return (
              <img
                key={i}
                ref={(el) => {
                  bulletRefs.current[i] = el;
                }}
                className={`${styles.bullet} ${
                  filled ? styles.bulletFilled : styles.bulletEmpty
                }`}
                src={bulletSrc}
                alt=""
                draggable={false}
              />
            );
          })}

          {ejected.map((b) => (
            <img
              key={b.id}
              className={styles.ejectedBullet}
              style={{ left: b.left, bottom: b.bottom }}
              src={b.src}
              alt=""
              draggable={false}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export default Hud;
