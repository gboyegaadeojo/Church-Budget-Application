import type { EmailMessage, EmailSender, SendResult } from "./sender";

/**
 * The sender for tests and local development: keeps every email in memory. Queue
 * answers with `answerNext` to rehearse rate limits and failures.
 */
export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  private readonly answers: SendResult[] = [];

  answerNext(...results: SendResult[]): this {
    this.answers.push(...results);
    return this;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const answer = this.answers.shift() ?? {
      kind: "sent",
      providerMessageId: `fake-${message.id}`,
    };
    if (answer.kind === "sent") this.sent.push(message);
    return answer;
  }
}
