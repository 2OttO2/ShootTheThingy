import styles from "./Spikes.module.css";
import spikeImg from "../../assets/spike.png";

function Spikes({ x, side, amount }) {
  return (
    <div
      className={`${styles.spikes} ${styles[side]}`}
      style={{ left: `${x}px` }}
    >
      {Array.from({ length: amount }).map((_, index) => (
        <img
          key={index}
          src={spikeImg}
          className={styles.spike}
          alt=""
        />
      ))}
    </div>
  );
}

export default Spikes;
