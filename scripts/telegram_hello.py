#!/usr/bin/env python3
"""Perimeter Telegram Bot Hello & Dispatch Utility.

Reads TELEGRAM_BOT_TOKEN and TELEGRAM_DEFAULT_CHAT_ID from the environment
or a local .env file and dispatches a test message using the Telegram Bot API.
Tokens are strictly protected and never printed, logged, or included in error traces.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Mapping

PLACEHOLDER_TOKENS = {
    "",
    "your_telegram_bot_token_here",
    "change_me",
}

PLACEHOLDER_CHAT_IDS = {
    "",
    "your_chat_id_here",
    "change_me",
}


def load_env_file(env_path: Path | None = None) -> None:
    """Populates os.environ from a local .env file if variables are not already set."""
    if env_path is None:
        # Default: repository root .env
        env_path = Path(__file__).resolve().parents[1] / ".env"

    if not env_path.is_file():
        return

    try:
        content = env_path.read_text(encoding="utf-8")
    except OSError:
        return

    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip("'\"")
            if key and key not in os.environ:
                os.environ[key] = val


def send_telegram_message(
    bot_token: str,
    chat_id: str | int,
    text: str,
    timeout: int = 15,
) -> dict[str, Any]:
    """Sends a message via the Telegram Bot API sendMessage endpoint.

    Args:
        bot_token: Telegram bot token issued by BotFather.
        chat_id: Target Telegram chat ID or channel/group identifier.
        text: Message body to transmit.
        timeout: Network timeout in seconds.

    Returns:
        The parsed Telegram API JSON response dict.

    Raises:
        ValueError: If token, chat_id, or text is invalid or a placeholder.
        RuntimeError: If the Telegram API returns an error or network fails.
            NOTE: Exception messages redact the token to prevent secret leaks.
    """
    token = str(bot_token).strip()
    chat = str(chat_id).strip()
    msg = str(text).strip()

    if not token or token in PLACEHOLDER_TOKENS:
        raise ValueError("Invalid or placeholder TELEGRAM_BOT_TOKEN")
    if not chat or chat in PLACEHOLDER_CHAT_IDS:
        raise ValueError("Invalid or placeholder TELEGRAM_DEFAULT_CHAT_ID")
    if not msg:
        raise ValueError("Message text cannot be empty")

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat, "text": msg}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            res_body = response.read().decode("utf-8")
            data: dict[str, Any] = json.loads(res_body)
            if not data.get("ok"):
                desc = data.get("description", "Unknown Telegram API error")
                raise RuntimeError(f"Telegram API responded with error: {desc}")
            return data
    except urllib.error.HTTPError as exc:
        err_desc = exc.reason
        try:
            err_data = json.loads(exc.read().decode("utf-8"))
            err_desc = err_data.get("description", err_desc)
        except Exception:
            pass
        raise RuntimeError(f"Telegram API HTTP {exc.code} error: {err_desc}") from None
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Failed to connect to Telegram API: {exc.reason}") from None


def main(env: Mapping[str, str] | None = None) -> int:
    """CLI entrypoint: loads credentials and sends hello message."""
    load_env_file()
    source_env = os.environ if env is None else env

    token = source_env.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = source_env.get("TELEGRAM_DEFAULT_CHAT_ID", "").strip()

    if not token or token in PLACEHOLDER_TOKENS:
        print(
            "Error: TELEGRAM_BOT_TOKEN is missing or not configured in your .env file.\n"
            "Please follow the BotFather setup guide in docs/telegram-bot.md "
            "to generate a bot token and add it to your local .env.",
            file=sys.stderr,
        )
        return 1

    if not chat_id or chat_id in PLACEHOLDER_CHAT_IDS:
        print(
            "Error: TELEGRAM_DEFAULT_CHAT_ID is missing or not configured in your .env file.\n"
            "Please start a chat with your bot and set your chat ID in your local .env.",
            file=sys.stderr,
        )
        return 1

    try:
        res = send_telegram_message(
            bot_token=token,
            chat_id=chat_id,
            text="Hello from Perimeter",
        )
        msg_id = res.get("result", {}).get("message_id")
        print(f"Success: 'Hello from Perimeter' sent to chat {chat_id} (message_id: {msg_id}).")
        return 0
    except Exception as exc:
        print(f"Error sending Telegram message: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
