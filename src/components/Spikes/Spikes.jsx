import styles from "./Spikes.module.css";

function Spikes({ x }){

  return(

    <div
    className={styles.spikes}
    style={{ left: `${x}px`}}
    >
    </div>

  )
}
export default Spikes;
