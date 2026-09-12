interface MilestonePayIconProps {
  size?: number | string
  className?: string
}

export function MilestonePayIcon({
  size = 32,
  className = "",
}: MilestonePayIconProps) {
  const sizePx = typeof size === "number" ? `${size}px` : size
  return (
    <img
      src="/icon.svg"
      alt="MilestonePay Icon"
      className={className}
      style={{ height: sizePx, width: sizePx }}
    />
  )
}

export default MilestonePayIcon
