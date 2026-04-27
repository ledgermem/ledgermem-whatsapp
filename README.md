# LedgerMem WhatsApp

WhatsApp connector for [LedgerMem](https://ledgermem.dev) using the [WhatsApp Business Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api) directly via `fetch` — no third-party SDK.

## Features

- Express webhook at `POST /webhook` validating Meta's `X-Hub-Signature-256`
- Webhook verification challenge at `GET /webhook`
- Forward-message-to-bot: any incoming text becomes a memory with `source: whatsapp`
- `/recall <query>` — message the bot to search memories; replies with the top 3 matches
- Health check at `GET /healthz`

## Setup

1. Create a Meta for Developers app and add the **WhatsApp** product
2. Note your **Phone Number ID** and generate a permanent or temporary access token
3. Configure the webhook callback URL (e.g., `https://your-host.com/webhook`) and a verify token of your choice
4. Subscribe to the `messages` field on the WhatsApp business account
5. Generate an **App Secret** in Settings → Basic; this is the `WHATSAPP_WEBHOOK_SECRET`

_Screenshots: `docs/meta-webhook-config.png` (placeholder)_

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | yes | Numeric phone number id from Meta dashboard |
| `WHATSAPP_ACCESS_TOKEN` | yes | Bearer token for the Graph API |
| `WHATSAPP_WEBHOOK_SECRET` | yes | App secret used to validate `X-Hub-Signature-256` |
| `WHATSAPP_VERIFY_TOKEN` | yes | The verify token you set in the webhook config |
| `LEDGERMEM_API_KEY` | yes | LedgerMem API key |
| `LEDGERMEM_WORKSPACE_ID` | yes | LedgerMem workspace id |
| `PORT` | no | Server port (default `8080`) |
| `GRAPH_API_VERSION` | no | Graph API version (default `v20.0`) |

## Run

```bash
cp .env.example .env
npm install
npm run dev
npm test
```

## Deploy

- **Docker:** `docker build -t ledgermem-whatsapp . && docker run --env-file .env -p 8080:8080 ledgermem-whatsapp`
- **Fly.io / Render / Railway:** push the image, expose port 8080 over HTTPS
- **AWS Lambda + API Gateway:** wrap `buildApp()` with [`serverless-http`](https://www.npmjs.com/package/serverless-http) and deploy as a function

## License

MIT
