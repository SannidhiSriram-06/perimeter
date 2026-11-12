# Perimeter Telegram Bot Setup & On-Call Dispatch Guide

This guide walks you through setting up a Telegram Bot for Perimeter's on-call paging system and testing it using `scripts/telegram_hello.py`.

---

## 1. Creating the Bot with BotFather

1. Open Telegram and search for the verified account **[@BotFather](https://t.me/BotFather)**.
2. Start a chat and send:
   ```text
   /newbot
   ```
3. Enter a friendly name for your bot (e.g. `Perimeter Alert Dev`).
4. Enter a username ending in `bot` (e.g. `perimeter_alert_dev_bot`).
5. BotFather will confirm creation and provide an HTTP API token formatted like:
   ```text
   7123456789:AAFnk...your_token_here...
   ```
6. **Save the token to your local `.env` file** (which is gitignored and must never be committed):
   ```bash
   TELEGRAM_BOT_TOKEN="7123456789:AAFnk...your_token_here..."
   ```

---

## 2. Finding Your Telegram Chat ID Safely

To send a message, the bot needs to know your chat ID. To prevent your secret bot token from being saved in your terminal shell history, read it directly from `.env`:

1. **Start the conversation with your bot:**
   - In Telegram, open the chat with your newly created bot (search for its username).
   - Click **Start** or send `/start` (or any message like "hello").
   *(Note: If adding to a group, add the bot to the group and send a message in that group).*

2. **Query the `getUpdates` API without leaving the token in your shell history:**

   Run the following Python one-liner in your terminal:
   ```bash
   python -c "import json, os, urllib.request; from scripts.telegram_hello import load_env_file; load_env_file(); token=os.environ.get('TELEGRAM_BOT_TOKEN'); res=json.loads(urllib.request.urlopen(f'https://api.telegram.org/bot{token}/getUpdates').read()); print('Your Chat ID is:', res['result'][-1]['message']['chat']['id'])"
   ```

3. Copy the numeric Chat ID printed by the command (e.g., `123456789` or `-100123456789` for groups) and save it to `.env`:
   ```bash
   TELEGRAM_DEFAULT_CHAT_ID="123456789"
   ```

---

## 3. Running the Hello Dispatch Script

Test that credentials and network access work end to end by executing:

```bash
python scripts/telegram_hello.py
```

### Expected Output
```text
Success: 'Hello from Perimeter' sent to chat 123456789 (message_id: 1).
```
Check your Telegram app—the bot will have sent `Hello from Perimeter`.

---

## 4. Error Handling and Security

- **Credential Leak Prevention:** `scripts/telegram_hello.py` redacts bot tokens from all error messages, console outputs, and exception traces.
- **Missing Credentials:** If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_DEFAULT_CHAT_ID` are missing or still set to `.env.example` placeholders, the script exits immediately with code `1` and prints a clear remediation instruction.
- **Reusability:** The core function `send_telegram_message(bot_token, chat_id, text)` can be imported by the future on-call router and alert notification services.
