/**
 * Annual budget requests (FR-03 to FR-12, FR-32; DRD 6.2 to 6.5). English (Canada) only,
 * like the rest of src/copy.
 */
export const annualCopy = {
  errors: {
    noOpenCycle: "There's no budget cycle open for submissions right now.",
    cycleNotOpen: "This budget cycle isn't open for submissions.",
    deadlinePassed: (when: string) =>
      `The deadline for this department was ${when}. Ask the accountant for an extension.`,
    chooseDepartment: "Choose your department.",
    otherNameRequired: "Type your department's name.",
    otherNameTooLong: "Keep department names to 80 characters or fewer.",
    departmentInactive: "This department isn't taking budget requests. Choose another one.",
    notLeader:
      "Only verified Group Leaders can represent a department. Ask the administrator to check your Planning Center record.",
    notFound: "This budget request doesn't exist, or you don't have access to it.",
    notDraft: "This request has already been submitted.",
    notEditable: "This request can't be changed any more.",
    noEditsLeft:
      "This request has used both of its edits. Ask the accountant if another change is needed.",
    titleRequired: "Give the request a title.",
    titleTooLong: "Keep the title to 120 characters or fewer.",
    justificationRequired: "Explain what the budget is for.",
    justificationTooLong: "Keep the justification to 2,000 characters or fewer.",
    linesRequired: "Add at least one item.",
    tooManyLines: "Add up to 200 items.",
    itemNameRequired: "Name the item.",
    itemNameTooLong: "Keep item names to 200 characters or fewer.",
    quantityInvalid: "Enter a whole number from 1 to 10,000.",
    unitPriceInvalid: "Enter a price before tax, like 1,025.00 (up to $1,000,000.00).",
    linkInvalid: "Enter a web address starting with http:// or https://.",
    notesTooLong: "Keep notes to 1,000 characters or fewer.",
    zeroPriceNeedsNote: "Explain a $0.00 item in its notes.",
    idempotencyKey: "Something went wrong. Reload the page and try again.",
    hasHistory: "This request has been submitted before, so it can't be deleted.",
    nothingChanged: "Nothing has changed, so no edit was used.",
  },
  tasks: {
    continueDraft: "Finish and submit your budget",
    respond: "Respond to the accountant's question",
    open: "Open",
  },
} as const;
