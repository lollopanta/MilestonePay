import { Route, Routes } from "react-router"
import { Home } from "@/routes/home"
import { CreateDeal } from "@/routes/create-deal"
import { Deal } from "@/routes/deal"

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateDeal />} />
        <Route path="/deal/:address" element={<Deal />} />
      </Routes>
    </>
  )
}

export default App
