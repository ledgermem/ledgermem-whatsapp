import type { LedgerMem } from "@ledgermem/memory";
import type { WhatsAppClient } from "./whatsapp.js";

export interface MemoryClient {
  search: LedgerMem["search"];
  add: LedgerMem["add"];
}

export interface SearchHit {
  id: string;
  content: string;
  score?: number;
}

export interface IncomingMessage {
  from: string;
  text: string;
  messageId: string;
}

export interface HandlerDeps {
  memory: MemoryClient;
  whatsapp: Pick<WhatsAppClient, "sendText">;
}

const TOP_K = 3;
const RECALL_PREFIX = "/recall ";

export async function processIncomingMessage(
  msg: IncomingMessage,
  deps: HandlerDeps,
): Promise<string> {
  const text = msg.text.trim();
  if (!text) {
    return "ignored:empty";
  }

  if (text.toLowerCase().startsWith(RECALL_PREFIX)) {
    const query = text.slice(RECALL_PREFIX.length).trim();
    if (!query) {
      await deps.whatsapp.sendText(msg.from, "Usage: /recall <query>");
      return "recall:usage";
    }
    const hits = (await deps.memory.search(query, { limit: TOP_K })) as SearchHit[];
    if (!hits || hits.length === 0) {
      await deps.whatsapp.sendText(msg.from, `No matches for "${query}".`);
      return "recall:empty";
    }
    const lines = hits.map(
      (h, i) => `${i + 1}. ${h.content}\n   id: ${h.id}`,
    );
    await deps.whatsapp.sendText(
      msg.from,
      `Top ${hits.length} matches for "${query}":\n${lines.join("\n")}`,
    );
    return "recall:ok";
  }

  await deps.memory.add(text, {
    metadata: {
      source: "whatsapp",
      threadId: msg.from,
      userId: msg.from,
      messageId: msg.messageId,
    },
  });
  await deps.whatsapp.sendText(msg.from, "Saved to memory.");
  return "remember:ok";
}

export interface WhatsAppWebhookEntry {
  changes?: Array<{
    value?: {
      messages?: Array<{
        from?: string;
        id?: string;
        type?: string;
        text?: { body?: string };
      }>;
    };
  }>;
}

export interface WhatsAppWebhookBody {
  entry?: WhatsAppWebhookEntry[];
}

export function extractMessages(body: WhatsAppWebhookBody): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        if (m.type !== "text") continue;
        if (!m.from || !m.id || !m.text?.body) continue;
        out.push({ from: m.from, messageId: m.id, text: m.text.body });
      }
    }
  }
  return out;
}
