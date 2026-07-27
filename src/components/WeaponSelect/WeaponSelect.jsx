import styles from "./WeaponSelect.module.css";
import { WEAPONS } from "../../constants/game.js";

import weaponPistol from "../../assets/weapons/pistol.png";
import weaponSub from "../../assets/weapons/sub.png";
import weaponShotgun from "../../assets/weapons/shotgun.png";
import weaponSniper from "../../assets/weapons/sniper.png";

const WEAPON_IMG = {
  pistol: weaponPistol,
  sub: weaponSub,
  shotgun: weaponShotgun,
  sniper: weaponSniper,
};

function WeaponSelect({ onSelect, onBack }) {
  const weapons = Object.values(WEAPONS);

  return (
    <div className={styles.overlay}>
      <div className={styles.box}>
        <h1 className={styles.title}>Escolha sua arma</h1>
        <p className={styles.subtitle}>
          cada uma muda o recoil, cadência e reload
        </p>

        <div className={styles.grid}>
          {weapons.map((weapon) => (
            <button
              key={weapon.id}
              className={styles.card}
              style={{ borderColor: weapon.color }}
              onClick={() => onSelect(weapon.id)}
            >
              <div className={styles.iconRow}>
                <div
                  className={styles.icon}
                  style={{ background: weapon.color }}
                />
                <img
                  className={styles.weaponImg}
                  src={WEAPON_IMG[weapon.id]}
                  alt={weapon.name}
                  draggable={false}
                />
              </div>
              <h2 className={styles.name}>{weapon.name}</h2>
              <p className={styles.desc}>{weapon.description}</p>

              <div className={styles.stats}>
                <span>Impacto: {Math.abs(weapon.impact)}</span>
                <span>Firerate: {weapon.firerate}ms</span>
                <span>Reload: {weapon.reload}ms</span>
                <span>Pente: {weapon.magazine}</span>
              </div>
            </button>
          ))}
        </div>

        <button className={styles.back} onClick={onBack}>
          ← Voltar
        </button>
      </div>
    </div>
  );
}

export default WeaponSelect;
