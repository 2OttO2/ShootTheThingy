import styles from "./Hud.module.css";

const BULLET_CLASS = {
  pistol: styles.bulletPistol,
  sub: styles.bulletSub,
  shotgun: styles.bulletShotgun,
  sniper: styles.bulletSniper,
};

const WEAPON_CLASS = {
  pistol: styles.weaponPistol,
  sub: styles.weaponSub,
  shotgun: styles.weaponShotgun,
  sniper: styles.weaponSniper,
};

function Hud({ weapon, ammo, isReloading }) {
  if (!weapon) return null;

  const max = weapon.magazine;
  const bulletClass = BULLET_CLASS[weapon.id] || styles.bulletPistol;
  const weaponClass = WEAPON_CLASS[weapon.id] || styles.weaponPistol;

  // quantos "slots" de munição mostrar (limita visualmente se o pente for grande)
  const slots = Math.min(max, 24);

  return (
    <div className={styles.hud}>
      <div className={styles.weaponBlock}>
        <div
          className={`${styles.weaponSprite} ${weaponClass}`}
          style={{ borderColor: weapon.color }}
          title={weapon.name}
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
          // mapeia slots visuais para a munição real (pente grande = alguns slots representam mais de 1)
          const filledUpTo = Math.ceil((ammo / max) * slots);
          const filled = i < filledUpTo;
          return (
            <span
              key={i}
              className={`${styles.bullet} ${bulletClass} ${
                filled ? styles.bulletFilled : styles.bulletEmpty
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default Hud;
