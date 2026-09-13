import { Route, Routes, useParams } from "react-router"
import { Home } from "@/routes/home"
import { CreateDeal } from "@/routes/create-deal"
import { Deal } from "@/routes/deal"
import { AppShell } from "@/components/layout/app-shell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ActivityPage } from "@/pages/Activity"
import { ReputationPage } from "@/pages/Reputation"
import { ExplorerPage } from "@/pages/Explorer"
import { SwarmIdentity } from "@/routes/swarm-identity"
import { Demo } from "@/routes/demo"
import { ArkivPage } from "@/pages/Arkiv"

function ReputationRoute() {
  const { address } = useParams()
  return <ReputationPage address={address} />
}

export function App() {
  return (
    <TooltipProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/deals" element={<Home />} />
          <Route path="/deals/new" element={<CreateDeal />} />
          <Route path="/deals/:address" element={<Deal />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/reputation" element={<ReputationPage />} />
          <Route path="/reputation/:address" element={<ReputationRoute />} />
          <Route path="/create" element={<CreateDeal />} />
          <Route path="/swarm-identity" element={<SwarmIdentity />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/arkiv" element={<ArkivPage />} />
          <Route path="/deal/:address" element={<Deal />} />
        </Routes>
      </AppShell>
    </TooltipProvider>
  )
}

export default App
