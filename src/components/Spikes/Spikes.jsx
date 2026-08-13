import styles from "./Spikes.module.css";
import spikeImg from "../../assets/spike.png";
import { SPIKE_SIZE } from "../../constants/game.js";

function Spikes({ x, side, amount }) {
  return (
    <>
      {Array.from({ length: amount }).map((_, index) => (
        <img
          key={index}
          src={spikeImg}
          className={`${styles.spike} ${styles[side]}`}
          style={{
            // deve ser idêntico a createSpikeHitboxes: x + index * SPIKE_SIZE
            left: `${x + index * SPIKE_SIZE}px`,
          }}
          alt=""
        />
      ))}
    </>
  );
}

export default Spikes;
