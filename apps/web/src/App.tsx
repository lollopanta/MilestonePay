import { Route, Routes } from "react-router"
import { Home } from "@/routes/home"
import { SwarmSetup } from "@/components/swarm-setup"

export function App() {
  return (
    <>
      <SwarmSetup />
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </>
  )
}

export default App
