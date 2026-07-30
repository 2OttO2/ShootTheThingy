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
      .sort((a, b) => (b.score ?? b.distance) - (a.score ?? a.distance))
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
                <span className={styles.name}>{entry.name || "Anônimo"}</span>
                <span className={styles.weapon}>{entry.weapon || "—"}</span>
                <span className={styles.distance}>
                     {entry.score ?? entry.distance}
                </span>
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
//responsavel por salvar o score 
export function saveScore(score, weaponName, name, rawDistance) {
  try {
    const scores = getScores();
    scores.push({
      name: name || "Anônimo",
      score,
      distance: rawDistance ?? score,
      weapon: weaponName,
      date: new Date().toISOString(),
    });
    localStorage.setItem("shootthethingy_scores", JSON.stringify(scores));
  } catch {
    // ignore
  }
}
