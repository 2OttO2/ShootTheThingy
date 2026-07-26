import { useMemo } from "react";
import styles from "./Scores.module.css";

function getScores() {
  try {
    const raw = localStorage.getItem("shootthethingy_scores");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function Scores({ onBack }) {
  const scores = useMemo(() => {
    return getScores()
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 15);
  }, []);

  return (
    <div className={styles.overlay}>
      <div className={styles.box}>
        <h1 className={styles.title}>Scores</h1>
        <p className={styles.subtitle}>melhores distâncias</p>

        {scores.length === 0 ? (
          <p className={styles.empty}>Nenhum score ainda. Vai jogar!</p>
        ) : (
          <ul className={styles.list}>
            {scores.map((entry, i) => (
              <li key={i} className={styles.row}>
                <span className={styles.rank}>#{i + 1}</span>
                <span className={styles.weapon}>{entry.weapon || "—"}</span>
                <span className={styles.distance}>{entry.distance}</span>
              </li>
            ))}
          </ul>
        )}

        <button className={styles.back} onClick={onBack}>
          ← Voltar
        </button>
      </div>
    </div>
  );
}

export default Scores;

// helper pra salvar score (pode ser chamado do App)
export function saveScore(distance, weaponName) {
  try {
    const scores = getScores();
    scores.push({
      distance,
      weapon: weaponName,
      date: new Date().toISOString(),
    });
    localStorage.setItem("shootthethingy_scores", JSON.stringify(scores));
  } catch {
    // ignore
  }
}
