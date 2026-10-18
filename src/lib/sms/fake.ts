import type { SendResult, SmsMessage, SmsSender } from "./sender";

/**
 * The sender for tests and local development: keeps every text in memory. Queue answers
 * with `answerNext` to rehearse a STOP or an outage.
 */
export class FakeSmsSender implements SmsSender {
  readonly sent: SmsMessage[] = [];
  private readonly answers: SendResult[] = [];

  answerNext(...results: SendResult[]): this {
    this.answers.push(...results);
    return this;
  }

  async send(message: SmsMessage): Promise<SendResult> {
    const answer = this.answers.shift() ?? {
      kind: "sent",
      providerMessageId: `fake-sms-${message.id}`,
    };
    if (answer.kind === "sent") this.sent.push(message);
    return answer;
  }
}
