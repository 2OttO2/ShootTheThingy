import styles from "./Spikes.module.css";

function Spikes({ x }){

  return(
  
  <>
    <div
    className={styles.spikesTop}
    style={{ left: `${x}px`}}
    >
    </div>

    <div
    className={styles.spikesBottom}
    style={{ left: `${x}px`}}

    >
    </div>

  </>

  )
}
export default Spikes;
