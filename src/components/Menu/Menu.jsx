import styles from "./Menu.module.css";

function Menu({ onStart, onScores }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.box}>
        <h1 className={styles.title}>ShootTheThingy</h1>
        <p className={styles.subtitle}>escolha sua arma. sobreviva.</p>

        <div className={styles.buttons}>
          <button className={styles.button} onClick={onStart}>
            Iniciar Jogo
          </button>
          <button className={`${styles.button} ${styles.secondary}`} onClick={onScores}>
            Ver Scores
          </button>
        </div>
      </div>
    </div>
  );
}

export default Menu;
