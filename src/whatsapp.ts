export interface WhatsAppClientOptions {
  phoneNumberId: string;
  accessToken: string;
  graphApiVersion: string;
  fetchImpl?: typeof fetch;
}

// WhatsApp Cloud API rejects text messages whose body exceeds 4096 chars
// (error 131009 / 100). Without this clamp a long recall reply silently
// fails to deliver and the user gets no feedback.
const WHATSAPP_TEXT_LIMIT = 4096;
const TRUNCATION_SUFFIX = "\n…(truncated)";

export function clampForWhatsApp(body: string): string {
  if (body.length <= WHATSAPP_TEXT_LIMIT) return body;
  const room = WHATSAPP_TEXT_LIMIT - TRUNCATION_SUFFIX.length;
  return `${body.slice(0, room)}${TRUNCATION_SUFFIX}`;
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
        text: { body: clampForWhatsApp(body) },
      }),
    });
    if (!res.ok) {
      // Don't echo upstream body — Graph error responses include the
      // request id and access-token-fingerprint metadata that shouldn't
      // surface to callers downstream.
      throw new Error(`WhatsApp send failed: ${res.status}`);
    }
  }
}
