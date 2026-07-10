import { useState,useEffect } from "react";
import styles from "./Player.module.css";
function Player(){
 
  const [playerY,setPlayerY] = useState(250);
  const [speed,setSpeed] = useState(0);

  useEffect(() => {
    
    const intervalo = setInterval (() => {

      setSpeed(v => v + 0.5);

      setPlayerY(y => y + speed);

    },16);
    return() => clearInterval(intervalo);

  },[speed]);

  useEffect(() => {
    const pular = (e) =>{
      if(e.code === "Space"){
        setSpeed(-8);
      }
    }
    window.addEventListener("keydown",pular);
    return () => window.removeEventListener("keydown",pular);
  },[]);

  return(  

  <>

    <div className={styles.player}>
    </div>

  </>

  )

}
export default Player;
