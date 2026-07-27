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

function Hud({ weapon, ammo, isReloading }) {
  if (!weapon) return null;

  const max = weapon.magazine;
  const weaponSrc = WEAPON_IMG[weapon.id] || weaponPistol;
  const bulletSrc = BULLET_IMG[weapon.id] || bulletPistol;

  // quantos slots visuais (limita se o pente for grande)
  const slots = Math.min(max, 24);

  return (
    <div className={styles.hud}>
      <div className={styles.weaponBlock}>
        <img
          className={styles.weaponSprite}
          src={weaponSrc}
          alt={weapon.name}
          draggable={false}
        />
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
      </div>
    </div>
  );
}

export default Hud;
