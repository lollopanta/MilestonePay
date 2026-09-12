export function transactionError(error: unknown, action: "submit" | "approve") {
  const message = error instanceof Error ? error.message : ""
  if (/rejected|denied|cancelled/i.test(message)) return "Transaction cancelled"
  if (/chain|network/i.test(message)) return "Switch to Avalanche Fuji first."
  if (/Unauthorized/i.test(message))
    return "This wallet is not allowed to perform this action."
  if (
    /InvalidState|InvalidMilestoneState|NotCurrentMilestone|InvalidMilestone/i.test(
      message
    )
  ) {
    return `This milestone can no longer be ${action === "submit" ? "submitted" : "approved"}.`
  }
  return `Could not ${action} this milestone. Check your connection and try again.`
}
