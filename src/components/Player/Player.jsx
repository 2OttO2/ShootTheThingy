import styles from "./Player.module.css";

function Player({drawY}) {

  return (
    <div
      className={styles.player}
      style={{ top: `${drawY}px` }}
    />
  );
}

export default Player;
