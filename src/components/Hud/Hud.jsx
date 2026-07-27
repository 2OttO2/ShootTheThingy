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

// intensidade do kick por arma (graus)
const RECOIL_DEG = {
  pistol: 8,
  sub: 5,
  shotgun: 14,
  sniper: 18,
};

function Hud({ weapon, ammo, isReloading, shotTick = 0 }) {
  const [recoiling, setRecoiling] = useState(false);
  const [flash, setFlash] = useState(false);
  const [ejected, setEjected] = useState([]); // { id, src }
  const lastTick = useRef(0);
  const ejectId = useRef(0);

  useEffect(() => {
    if (!weapon || shotTick === 0 || shotTick === lastTick.current) return;
    lastTick.current = shotTick;

    // recoil + flash
    setRecoiling(true);
    setFlash(true);

    const recoilMs = weapon.id === "sub" ? 80 : 120;
    const flashMs = weapon.id === "sub" ? 50 : 70;

    const t1 = setTimeout(() => setRecoiling(false), recoilMs);
    const t2 = setTimeout(() => setFlash(false), flashMs);

    // bala saltando do HUD
    const id = ++ejectId.current;
    const src = BULLET_IMG[weapon.id] || bulletPistol;
    setEjected((prev) => [...prev, { id, src }]);
    const t3 = setTimeout(() => {
      setEjected((prev) => prev.filter((b) => b.id !== id));
    }, 450);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [shotTick, weapon]);

  if (!weapon) return null;

  const max = weapon.magazine;
  const weaponSrc = WEAPON_IMG[weapon.id] || weaponPistol;
  const bulletSrc = BULLET_IMG[weapon.id] || bulletPistol;
  const slots = Math.min(max, 24);
  const kick = RECOIL_DEG[weapon.id] || 8;

  return (
    <div className={styles.hud}>
      <div className={styles.weaponBlock}>
        <div className={styles.weaponStage}>
          <img
            className={`${styles.weaponSprite} ${
              recoiling ? styles.weaponRecoil : ""
            }`}
            style={
              recoiling
                ? { transform: `scaleX(-1) rotate(${kick}deg)` }
                : undefined
            }
            src={weaponSrc}
            alt={weapon.name}
            draggable={false}
          />
          {flash && <span className={styles.muzzleFlash} />}
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

      <div className={styles.bullets}>
        {Array.from({ length: slots }).map((_, i) => {
          const filledUpTo = Math.ceil((ammo / max) * slots);
          const filled = i < filledUpTo;
          return (
            <img
              key={i}
              className={`${styles.bullet} ${
                filled ? styles.bulletFilled : styles.bulletEmpty
              }`}
              src={bulletSrc}
              alt=""
              draggable={false}
            />
          );
        })}

        {/* balas ejetadas animadas */}
        {ejected.map((b) => (
          <img
            key={b.id}
            className={styles.ejectedBullet}
            src={b.src}
            alt=""
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}

export default Hud;
