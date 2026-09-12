import { RiArrowRightUpLine, RiHistoryLine } from "@remixicon/react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatUsdt } from "@/lib/deal"
import {
  eventPresentation,
  sortEvents,
  type ProtocolEvent,
} from "@/features/activity/presentation"

const shortAddress = (value: string) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—"

export function ActivityTimeline({ events }: { events: ProtocolEvent[] }) {
  const timeline = sortEvents(events)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RiHistoryLine aria-hidden="true" />
          Protocol activity
        </CardTitle>
        <CardDescription>
          Canonical agreement events indexed through Arkiv.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {timeline.map((event, index) => {
          const item = eventPresentation(event)
          return (
            <div
              key={`${item.transaction}:${item.block}:${index}`}
              className="flex flex-col gap-4"
            >
              {index > 0 ? <Separator /> : null}
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {shortAddress(item.escrow)} · Block {item.block || "—"}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {item.amount ? (
                    <span className="font-medium tabular-nums">
                      {formatUsdt(BigInt(item.amount))}
                    </span>
                  ) : (
                    <Badge variant="outline">Recorded</Badge>
                  )}
                  {item.transaction ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <RiArrowRightUpLine aria-hidden="true" />
                      {shortAddress(item.transaction)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
