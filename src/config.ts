export interface AppConfig {
  phoneNumberId: string;
  accessToken: string;
  webhookSecret: string;
  verifyToken: string;
  ledgermemApiKey: string;
  ledgermemWorkspaceId: string;
  port: number;
  graphApiVersion: string;
  // Allowlist of WhatsApp E.164 sender numbers (without `+`) permitted to
  // write to memory. Empty = unrestricted (single-user self-hosted setups).
  allowedSenders: Set<string>;
}

const REQUIRED = [
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_WEBHOOK_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "LEDGERMEM_API_KEY",
  "LEDGERMEM_WORKSPACE_ID",
] as const;

function loadAllowedSenders(): Set<string> {
  const raw = process.env.ALLOWED_SENDERS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().replace(/^\+/, ""))
      .filter(Boolean),
  );
}

export function loadConfig(): AppConfig {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID as string,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN as string,
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET as string,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN as string,
    ledgermemApiKey: process.env.LEDGERMEM_API_KEY as string,
    ledgermemWorkspaceId: process.env.LEDGERMEM_WORKSPACE_ID as string,
    port: Number(process.env.PORT ?? 8080),
    graphApiVersion: process.env.GRAPH_API_VERSION ?? "v20.0",
    allowedSenders: loadAllowedSenders(),
  };
}
