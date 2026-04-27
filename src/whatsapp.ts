export interface WhatsAppClientOptions {
  phoneNumberId: string;
  accessToken: string;
  graphApiVersion: string;
  fetchImpl?: typeof fetch;
}

export class WhatsAppClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: WhatsAppClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async sendText(to: string, body: string): Promise<void> {
    const url = `https://graph.facebook.com/${this.opts.graphApiVersion}/${this.opts.phoneNumberId}/messages`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.opts.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WhatsApp send failed: ${res.status} ${text}`);
    }
  }
}
