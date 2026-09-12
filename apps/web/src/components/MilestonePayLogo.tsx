interface MilestonePayLogoProps {
  height?: number | string
  width?: number | string
  className?: string
}

export function MilestonePayLogo({
  height = 40,
  width = "auto",
  className = "",
}: MilestonePayLogoProps) {
  return (
    <img
      src="/logo.svg"
      alt="MilestonePay Logo"
      className={className}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width: typeof width === "number" ? `${width}px` : width,
      }}
    />
  )
}

export default MilestonePayLogo
