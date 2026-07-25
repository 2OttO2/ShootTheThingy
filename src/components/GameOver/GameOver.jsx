import styles from "./GameOver.module.css";

function GameOver({ onRestart }){

  return(
    <>
      <div className={styles.deadMessage}>
      morreu de morte morrida
      </div>
    </>
  )
};

export default GameOver;
