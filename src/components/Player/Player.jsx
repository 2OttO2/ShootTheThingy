import { useState,useEffect,useRef } from "react";
import styles from "./Player.module.css";
function Player(){
 
  const [playerY,setPlayerY] = useState(250);
  const [speed,setSpeed] = useState(0);
  const animationRef = useRef();

  const gameLoop = () => {

    setSpeed(v => {
        const novaVelocidade = v + 0.3;

        setPlayerY(y => y + novaVelocidade);

        return novaVelocidade;
    });

    animationRef.current = requestAnimationFrame(gameLoop);
  }
  useEffect(() => {

  animationRef.current = requestAnimationFrame(gameLoop);

  return () => cancelAnimationFrame(animationRef.current);

  }, []);

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

    <div className={styles.player}
      style={{ top : `${playerY}px`}}
      >
    </div>

  </>

  )

}
export default Player;
