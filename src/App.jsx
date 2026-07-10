import { useState, useEffect } from 'react'
import Player from "./components/Player/Player.jsx";
import Spikes from "./components/Spikes/Spikes.jsx";

import './App.css'

function App() {


  return (
    <>
      <div className="game">

      <Player/>
      <Spikes/>

      </div>
    </>
  )
}

export default App
