import styles from "./Spikes.module.css";

function Spikes({ x, gapSize, gapY }) {

  return (
    <div
      className={styles.spikes}
      style={{ left: `${x}px` }}
    >
      <div
        className={styles.spikesTop}
        style={{
          height: `${gapY}px`
        }}
      />

      <div
        className={styles.spikesBottom}
        style={{
          top: `${gapY + gapSize}px`,
          height: `${1080 - (gapY + gapSize)}px`
        }}
      />
    </div>
  );
}

export default Spikes;
