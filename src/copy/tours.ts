import type { TourId } from "@/domain/tours/tours";

type StepCopy = {
  title: string;
  body: string;
  /** Shown instead of `body` while the lit-up part isn't on screen yet. */
  waiting?: string;
};

/** The guided tours (decided 2026-11-12): every word they show. */
export const toursCopy = {
  names: {
    annual: "Your first annual budget",
    expense: "A new expense",
  } satisfies Record<TourId, string>,
  descriptions: {
    annual: "Pick your department, add your items and send your budget to the accountant.",
    expense:
      "Ask before you buy or claim back what you paid, see what's left and send it for approval.",
  } satisfies Record<TourId, string>,

  offer: {
    eyebrow: "New here?",
    title: {
      annual: "Let us show you how to send your budget",
      expense: "Let us show you how to ask for money",
    } satisfies Record<TourId, string>,
    body: {
      annual:
        "A short guided tour walks you through the real form, one step at a time. You fill it in as you go.",
      expense:
        "A short guided tour walks you through a new expense, one step at a time. You fill it in as you go.",
    } satisfies Record<TourId, string>,
    start: "Show me how",
    later: "Not now",
  },

  showMeHow: "Show me how",
  stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
  next: "Next",
  back: "Back",
  finish: "Finish",
  end: "End tour",
  takeMeThere: "Take me there",
  dialogLabel: (name: string) => `Guided tour: ${name}`,
  finishedNote: "Tour finished. You can take it again from Help → Guided tours.",

  help: {
    heading: "Guided tours",
    intro: "Walk through the real form one step at a time. You fill it in as you go.",
    start: "Start the tour",
    again: "Take it again",
    finished: "Finished",
  },

  steps: {
    annual: {
      department: {
        title: "Pick your department",
        body: "Choose the ministry this budget is for. Yours are marked. If yours isn't listed, choose Other and type its name.",
      },
      continue: {
        title: "Press Continue",
        body: "This opens your budget form. If your department already has a budget this year, it opens that one instead.",
      },
      details: {
        title: "Give it a title and say why",
        body: "A short title, then a few sentences on what the money is for. The accountant reads this first.",
        waiting: "Open your budget's first step, Request information, to carry on.",
      },
      next: {
        title: "Press Next",
        body: "Next takes you to your budget items. Your draft saves itself as you type.",
      },
      items: {
        title: "One line per item",
        body: "Type the item, how many, and the price before tax. The line total works itself out. Add item gives you another line.",
        waiting: "Go to Budget items to carry on.",
      },
      summary: {
        title: "Tax and total are done for you",
        body: "The sales tax and the total update as you type. Your draft saves itself, so you can leave and come back from Home.",
      },
      preview: {
        title: "Press Preview",
        body: "When your items are in, Preview shows the whole budget once more before you send it.",
      },
      submit: {
        title: "Check it, then send",
        body: "Read it through. Confirm submission sends it to the accountant. You can still change it up to twice after sending.",
        waiting:
          "Fill in your items and press Preview. This tip comes back on the last step, ready to send.",
      },
    },
    expense: {
      type: {
        title: "Before or after you buy?",
        body: "Not bought yet? Choose Purchase request and get approval first. Already paid? Choose Expense claim to be paid back.",
      },
      department: {
        title: "Which budget pays?",
        body: "Pick the department and the budget year it comes out of. Only departments with an approved budget are listed.",
      },
      continue: {
        title: "Press Continue",
        body: "This opens the form. It asks one question at a time.",
      },
      budget: {
        title: "See what's left",
        body: "This shows how much of your department's budget is left. Once you add amounts, it shows what's left after this expense.",
      },
      question: {
        title: "One question at a time",
        body: "Answer the question on screen. Say what it's for and why. The accountant and the Board Chair read this.",
      },
      next: {
        title: "Press Next",
        body: "Next checks this step and saves your draft. Back takes you to the step before.",
      },
      tax: {
        title: "Sales tax: on or off",
        body: "Enter prices before tax. Leave sales tax on for most purchases. Turn it off for an honorarium, money sent to a person, or anything sold without tax.",
        waiting: "Go to What are you buying? to carry on.",
      },
      send: {
        title: "Check and send",
        body: "Check everything, then Confirm submission. It goes to the accountant and the Board Chair, and you're emailed when it's decided.",
        waiting:
          "Keep answering and pressing Next. This tip comes back on the last step, Check and send.",
      },
    },
  } satisfies Record<TourId, Record<string, StepCopy>>,
} as const;
