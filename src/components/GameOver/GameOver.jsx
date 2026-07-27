import { useState } from "react";
import styles from "./GameOver.module.css";

function GameOver({ distance, weaponName, onRestart, onMenu, onPostScore }) {
  const [name, setName] = useState("");
  const [posted, setPosted] = useState(false);

  function handlePost() {
    const trimmed = name.trim();
    if (!trimmed || posted) return;
    onPostScore(trimmed, distance, weaponName);
    setPosted(true);
  }

  function handleKeyDown(e) {
    // não deixa o espaço reiniciar enquanto digita o nome
    if (e.code === "Space") {
      e.stopPropagation();
    }
    if (e.code === "Enter") {
      e.preventDefault();
      handlePost();
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.box}>
        <h1 className={styles.title}>GAME OVER</h1>
        <p className={styles.subtitle}>morreu de morte morrida</p>

        <div className={styles.score}>
          <span className={styles.scoreLabel}>Distância</span>
          <span className={styles.scoreValue}>{distance}</span>
        </div>

        {!posted ? (
          <div className={styles.postArea}>
            <input
              className={styles.nameInput}
              type="text"
              maxLength={12}
              placeholder="seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button
              className={styles.button}
              onClick={handlePost}
              disabled={!name.trim()}
            >
              Postar Score
            </button>
          </div>
        ) : (
          <p className={styles.postedMsg}>score postado!</p>
        )}

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
