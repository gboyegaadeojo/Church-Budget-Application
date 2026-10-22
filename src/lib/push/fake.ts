import type { PushMessage, PushResult, PushSender, PushTarget } from "./sender";

/** Records alerts instead of sending them (tests, local development). */
export class FakePushSender implements PushSender {
  readonly sent: { target: PushTarget; message: PushMessage }[] = [];
  /** Endpoints the fake push service treats as gone (the device removed the app). */
  readonly gone = new Set<string>();

  async send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    if (this.gone.has(target.endpoint)) return "gone";
    this.sent.push({ target, message });
    return "sent";
  }
}
