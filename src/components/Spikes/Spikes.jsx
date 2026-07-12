import styles from "./Spikes.module.css";

function Spikes({ x }) {

  return (
    <div
      className={styles.spikes}
      style={{ left: `${x}px` }}
    >
      <div
        className={styles.spikesTop}
      />

      <div
        className={styles.spikesBottom}
      />
    </div>
  );
}

export default Spikes;
