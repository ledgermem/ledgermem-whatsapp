import "dotenv/config";
import express, { type Request, type Response } from "express";
import { LedgerMem } from "@ledgermem/memory";
import { loadConfig } from "./config.js";
import { verifyMetaSignature } from "./signature.js";
import { WhatsAppClient } from "./whatsapp.js";
import {
  extractMessages,
  processIncomingMessage,
  type WhatsAppWebhookBody,
} from "./handlers.js";

export function buildApp(): express.Express {
  const cfg = loadConfig();
  const memory = new LedgerMem({
    apiKey: cfg.ledgermemApiKey,
    workspaceId: cfg.ledgermemWorkspaceId,
  });
  const whatsapp = new WhatsAppClient({
    phoneNumberId: cfg.phoneNumberId,
    accessToken: cfg.accessToken,
    graphApiVersion: cfg.graphApiVersion,
  });

  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.get("/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === cfg.verifyToken) {
      return res.status(200).send(String(challenge ?? ""));
    }
    return res.sendStatus(403);
  });

  app.post("/webhook", async (req: Request, res: Response) => {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (
      !raw ||
      !verifyMetaSignature(
        raw,
        req.header("x-hub-signature-256"),
        cfg.webhookSecret,
      )
    ) {
      return res.sendStatus(401);
    }
    const body = req.body as WhatsAppWebhookBody;
    const messages = extractMessages(body);
    // Ack fast — process async to keep webhook latency low.
    res.sendStatus(200);
    for (const msg of messages) {
      try {
        await processIncomingMessage(msg, { memory, whatsapp });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("processIncomingMessage failed:", err);
      }
    }
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  const app = buildApp();
  app.listen(cfg.port, () => {
    // eslint-disable-next-line no-console
    console.log(`LedgerMem WhatsApp connector listening on :${cfg.port}`);
  });
}
