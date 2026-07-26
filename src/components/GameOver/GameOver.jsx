import styles from "./GameOver.module.css";

function GameOver({ distance, onRestart, onMenu }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.box}>
        <h1 className={styles.title}>GAME OVER</h1>
        <p className={styles.subtitle}>morreu de morte morrida</p>

        <div className={styles.score}>
          <span className={styles.scoreLabel}>Distância</span>
          <span className={styles.scoreValue}>{distance}</span>
        </div>

        <button className={styles.button} onClick={onRestart}>
          Reiniciar
        </button>

        {onMenu && (
          <button className={styles.menuButton} onClick={onMenu}>
            Menu
          </button>
        )}

        <p className={styles.hint}>ou aperte ESPAÇO pra reiniciar</p>
      </div>
    </div>
  );
}

export default GameOver;
