import styles from "./Spikes.module.css";
import spikeImg from "../../assets/spike.png";

function Spikes({ x, side, amount}) {

  return (
    <>
      {Array.from({ length: amount }).map((_, index) => (
        <img
          key={index}
          src={spikeImg}
          className={`${styles.spike} ${styles[side]}`}
          style={{
            left: `${x + index * 64}px`
          }}
          alt=""
        />
      ))}
    </>
  );
}

export default Spikes;
