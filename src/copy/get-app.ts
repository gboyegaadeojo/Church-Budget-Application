/** Get the app: installing it on a phone or computer, and phone alerts (docs/decisions.md 2026-10-22). */
export const getAppCopy = {
  title: "Get the app",
  intro:
    "Put Church Budget on your phone's home screen and get alerts like any other app. It's free and takes a minute.",
  navLabel: "Get the app",
  manifest: {
    name: "IFC Church Budget",
    shortName: "IFC Budget",
    description: "Ask for, approve and follow ministry budgets and expenses.",
  },
  install: {
    heading: "Install on this device",
    installed: "Installed. You're using the app.",
    installedHint: "Open it from your home screen any time.",
    button: "Install the app",
    iphone: {
      label: "On iPhone or iPad",
      steps: [
        "Open this page in Safari.",
        "Tap the Share button (the square with an arrow pointing up).",
        "Scroll down and tap Add to Home Screen, then Add.",
        "Open Church Budget from your home screen and sign in.",
      ],
    },
    android: {
      label: "On an Android phone",
      steps: [
        "Open this page in Chrome.",
        "Tap Install the app above, or tap the menu (three dots) and choose Install app or Add to Home screen.",
        "Open Church Budget from your home screen.",
      ],
    },
    computer: {
      label: "On a computer",
      steps: [
        "In Chrome or Edge, select the install icon at the right of the address bar, or Install the app above.",
        "Church Budget opens in its own window and appears with your other apps.",
      ],
    },
  },
  alerts: {
    heading: "Alerts on this device",
    hint: "The same news as your bell and your emails: approvals waiting, decisions, payments and reminders. Emails still come. Alerts stay on; only a System Administrator can turn them off.",
    turnOn: "Turn on alerts",
    turningOn: "Turning on…",
    on: "On",
    off: "Off",
    onHint: "Alerts are on for this device.",
    test: "Send a test alert",
    iphoneFirst:
      "On iPhone and iPad, install the app first (steps above), then open it from your home screen and come back to this page.",
    unsupported:
      "This browser can't show alerts. Try Chrome, Edge, Firefox or Safari, or install the app.",
    blocked:
      "Alerts are blocked for this site. Allow notifications for Church Budget in your phone's or browser's settings, then come back.",
    notSetUp: "Alerts aren't set up on this site yet. Ask the System Administrator.",
    churchOff: "Phone alerts are turned off for the church by the System Administrator.",
    personOff: "The System Administrator has turned phone alerts off for you.",
    declined: "Alerts weren't allowed. You can try again any time.",
    lockScreen:
      'Alerts show a short line, such as "An expense needs your approval", on your lock screen. Amounts and details stay in the app.',
  },
  devices: {
    heading: "Your devices with alerts",
    added: (date: string) => `Added ${date}`,
    lastAlert: (date: string) => `last alert ${date}`,
    lost: "Lost a phone or stopped using a computer? Ask the System Administrator to remove it.",
  },
  prompt: {
    heading: "Allow alerts on this device",
    body: "Church Budget sends alerts for approvals, decisions, payments and reminders. Tap Allow to get them here.",
    button: "Allow alerts",
    blocked:
      "Alerts are blocked on this device. Open your phone's Settings, find Church Budget (or this browser), and allow notifications.",
  },
  test: {
    title: "Alerts are working",
    body: "This is how Church Budget will let you know when something needs you.",
    sent: (n: number) => (n === 1 ? "Test alert sent." : `Test alert sent to ${n} devices.`),
    none: "No device received it. Turn alerts off and on again on this device.",
  },
  errors: {
    signedOut: "Your session has ended. Sign in again.",
    save: "Alerts couldn't be turned on. Try again.",
  },
  notificationsPrompt: "Get these on your phone",
} as const;
