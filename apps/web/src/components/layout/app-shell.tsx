import type { ReactNode } from "react"
import { Link, NavLink, useLocation } from "react-router"
import {
  RiAddLine,
  RiDashboardLine,
  RiPresentationLine,
  RiFileList3Line,
  RiPulseLine,
  RiSearchEyeLine,
  RiShieldCheckLine,
} from "@remixicon/react"
import { useAccount } from "wagmi"

import { MilestonePayLogo } from "@/components/MilestonePayLogo"
import { MilestonePayIcon } from "@/components/MilestonePayIcon"
import { WalletButton } from "@/components/wallet-button"
import { Button } from "@/components/ui/button"
import { WalletAddress } from "@/components/ui/financial"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const navigation = [
  { label: "Demo", to: "/demo", icon: RiPresentationLine },
  { label: "Dashboard", to: "/", icon: RiDashboardLine },
  { label: "Deals", to: "/deals", icon: RiFileList3Line },
  { label: "Activity", to: "/activity", icon: RiPulseLine },
  { label: "Explorer", to: "/explorer", icon: RiSearchEyeLine },
  { label: "Reputation", to: "/reputation", icon: RiShieldCheckLine },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { address } = useAccount()
  const { pathname } = useLocation()

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="p-3 group-data-[collapsible=icon]:p-1">
          <Link
            aria-label="MilestonePay dashboard"
            className="flex h-12 items-center justify-center group-data-[collapsible=icon]:size-10"
            to="/"
          >
            <MilestonePayLogo
              height={48}
              className="max-w-full group-data-[collapsible=icon]:hidden"
            />
            <MilestonePayIcon
              size={40}
              className="hidden group-data-[collapsible=icon]:block"
            />
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <SidebarGroup className="p-0">
            <SidebarMenu>
              {navigation.map(({ label, to, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    isActive={
                      to === "/" ? pathname === to : pathname.startsWith(to)
                    }
                    render={<NavLink end={to === "/"} to={to} />}
                    tooltip={label}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3 group-data-[collapsible=icon]:hidden">
          <SidebarSeparator />
          <div className="flex flex-col gap-2 px-2 py-2">
            <span className="text-xs text-muted-foreground">
              Connected account
            </span>
            <WalletAddress address={address} />
            <WalletButton />
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:px-8">
          <SidebarTrigger />
          <span className="hidden text-sm text-muted-foreground md:block">
            Avalanche Fuji · Testnet
          </span>
          <Button
            nativeButton={false}
            render={<Link to="/deals/new" />}
            size="sm"
          >
            <RiAddLine data-icon="inline-start" />
            New agreement
          </Button>
        </header>
        <div className="px-5 pt-6 md:hidden">
          <Link
            aria-label="MilestonePay dashboard"
            className="flex h-13 w-fit items-center"
            to="/"
          >
            <MilestonePayLogo height={52} />
          </Link>
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </SidebarProvider>
  )
}
