# TeleBotHost installation (manual, not an invented import format)

Do not activate until backend tests/readiness are checked. No bot token is included.

1. Create the bot with BotFather and keep its token private. Branding/photo can be set manually; this repository does not assume a sparkle logo file exists.
2. Add the bot in TeleBotHost using that token. TeleBotHost owns incoming Telegram updates. Do **not** register a Django Telegram webhook, poll getUpdates, or attach another bot framework.
3. In TeleBotHost dashboard ENV settings set `BAHARNAJ_BACKEND_URL=https://your-backend-host` (origin only) and `BAHARNAJ_INTEGRATION_SECRET` to a dedicated random secret of at least 32 bytes. This must equal Django `TELEGRAM_INTEGRATION_SECRET`, not the bot token.
4. Add these exact commands: `*`, `/start`, `/help`, `/settings`, `/stop`. For **each**, leave Answer empty and paste all of `router.js` into Logic. No wait-for-reply or public web mode. `*` is the fallback for exact callback payloads such as `home`, `settings`, `link:<token>`, `pref:marketing:0`, and `ack:<delivery-id>`. It also handles unknown text with help. Explicit commands handle Telegram command/deep-link parameters. No conversation database is needed.
5. In BotFather set commands: `start - شروع`, `help - راهنما`, `settings - تنظیمات پیام‌ها`, `stop - توقف پیام‌ها`. Set the menu button to the command menu. Test private chats only; groups are ignored.
6. Confirm `/start <token>` shows a confirmation button before contacting redemption. `/start` alone never resubscribes. Use an authenticated admin's website Telegram settings to link a test recipient, and explicitly enable manager reports for that account.
7. Test HTTP response handling, callbacks, ENV/crypto support in the actual TeleBotHost account before activation. These files are locally mock-tested, **not live-verified** on TeleBotHost.

## Request contract v1

`POST /api/v1/telegram/bot/`, exact UTF-8 JSON bytes, content type application/json:

`{"update_id":"123","actor":123456,"chat_id":123456,"chat_type":"private","username":"","operation":"home","token":""}`

Headers: `X-Timestamp` (Unix seconds), `X-Nonce` (32 random hex characters), `X-Signature` (hex HMAC-SHA256).

Signed string: `timestamp + "\n" + nonce + "\n" + SHA256(rawBody).hex()`.
Key: dedicated integration secret. Timestamp tolerance 300 seconds. The immutable Telegram update ID is the durable idempotency/replay key. Reuse with changed body is rejected. Retrying the identical update returns its original response without repeating effects. Never reuse a Telegram update ID for a different operation. The nonce and exact body are signature-bound; the backend does not trust customer IDs supplied by the bot. Only allowlisted operations execute.

Response is HTTPS JSON `{payload, signature}`. `payload` is an exact JSON string containing `{text, keyboard, actor}`; response `signature` is hex HMAC-SHA256 of `"response\n" + update_id + "\n" + payload`, using the integration secret. TBL verifies it before parsing or displaying the keyboard. This binds each response to its request update ID, in addition to HTTPS authentication. 400/403/429 are failures and must not be treated as successful linking. No generic outbound-message relay exists.

`contract.json` is a shared signing fixture used by backend and local TBL tests (its secret is a public fixture, never a deployment secret).

## Platform documentation checked 2026-09-14

- [HTTP requests](https://docs.telebothost.com/http-instance/making-requests/) and [response shape](https://docs.telebothost.com/http-instance/responses/): awaited `HTTP.post`, JSON/body, headers, `res.ok`/`res.data`.
- [Crypto](https://docs.telebothost.com/modules/crypto/): synchronous SHA256/HMAC/randomBytes, ENV configuration.
- [Callbacks](https://docs.telebothost.com/getting-started-with-tbl/handling-callbacks/): callback payload command matching, prompt answerCallbackQuery, editing existing messages.
- [Global webhook](https://docs.telebothost.com/webhook-instance/global-webhook/) and [limits/security](https://docs.telebothost.com/webhook-instance/limits-and-security/): no relay needed for the direct outbound design. Documented combined inbound webhook/webapp/public-web limits: Free 15/min and 5,000/day; Freemium 30/min and 5,000/day; Premium 60/min and 10,000/day; Elite 120/min and 20,000/day. These are **not Telegram sending quotas**. The [official pricing page](https://telebothost.com/pricing/) currently lists different HTTP quotas: Free 5/min, 3,000/day; Freemium 10/min, 5,000/day; Premium 50/min, 30,000/day; Elite 100/min, 60,000/day. It says Free includes ads and paid tiers disable them. These sources disagree on quotas; verify the actual account dashboard/provider limits before activation. No plan was purchased, and no unlimited or ad-free behavior was live-verified.
- [Telegram API](https://core.telegram.org/bots/api), [deep links](https://core.telegram.org/bots/features#deep-linking), [FAQ](https://core.telegram.org/bots/faq): private chat must be started by the user, deep-link payload at most 64 characters, callbacks at most 64 bytes. Token payload here is 32 URL-safe characters. Worker rate defaults to 20/minute, conservative global batching; no paid broadcasts.
