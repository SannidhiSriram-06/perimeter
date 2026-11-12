"""Unit tests for the Telegram bot hello and dispatch script."""

from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import urllib.error

import pytest

# Ensure repository root is on sys.path so scripts can be imported cleanly
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.telegram_hello import load_env_file, main, send_telegram_message  # noqa: E402


class DummyHTTPResponse:
    """Mock context manager for urllib.request.urlopen response."""

    def __init__(self, data: dict, status: int = 200):
        self._payload = json.dumps(data).encode("utf-8")
        self.status = status

    def read(self) -> bytes:
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False


def test_send_telegram_message_success():
    """Verify successful dispatch via Telegram sendMessage endpoint."""
    mock_response = DummyHTTPResponse(
        {"ok": True, "result": {"message_id": 999, "text": "Hello from Perimeter"}}
    )

    with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
        result = send_telegram_message(
            bot_token="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
            chat_id="987654321",
            text="Hello from Perimeter",
        )

        assert result["ok"] is True
        assert result["result"]["message_id"] == 999
        mock_urlopen.assert_called_once()
        req = mock_urlopen.call_args[0][0]
        assert req.full_url == "https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/sendMessage"
        assert req.get_method() == "POST"
        body = json.loads(req.data.decode("utf-8"))
        assert body["chat_id"] == "987654321"
        assert body["text"] == "Hello from Perimeter"


def test_send_telegram_message_validation_errors():
    """Ensure invalid or placeholder tokens and chat IDs are rejected."""
    # Placeholder or empty bot token
    with pytest.raises(ValueError, match="TELEGRAM_BOT_TOKEN"):
        send_telegram_message("", "12345", "test")

    with pytest.raises(ValueError, match="TELEGRAM_BOT_TOKEN"):
        send_telegram_message("your_telegram_bot_token_here", "12345", "test")

    # Placeholder or empty chat ID
    with pytest.raises(ValueError, match="TELEGRAM_DEFAULT_CHAT_ID"):
        send_telegram_message("valid_token", "", "test")

    with pytest.raises(ValueError, match="TELEGRAM_DEFAULT_CHAT_ID"):
        send_telegram_message("valid_token", "your_chat_id_here", "test")

    # Empty message
    with pytest.raises(ValueError, match="cannot be empty"):
        send_telegram_message("valid_token", "12345", "   ")


def test_send_telegram_message_api_error_response():
    """Handle 200 OK HTTP responses where Telegram returns ok=false."""
    mock_response = DummyHTTPResponse({"ok": False, "description": "Chat not found"})

    with patch("urllib.request.urlopen", return_value=mock_response):
        with pytest.raises(RuntimeError, match="Chat not found"):
            send_telegram_message("valid_token", "12345", "Hello")


def test_send_telegram_message_http_error():
    """Verify HTTPError is caught and redacted without leaking the bot token."""
    err_body = io.BytesIO(b'{"ok": false, "error_code": 401, "description": "Unauthorized"}')
    http_error = urllib.error.HTTPError(
        url="https://api.telegram.org/botSECRET_TOKEN/sendMessage",
        code=401,
        msg="Unauthorized",
        hdrs=MagicMock(),
        fp=err_body,
    )

    with patch("urllib.request.urlopen", side_effect=http_error):
        with pytest.raises(RuntimeError) as exc_info:
            send_telegram_message("SECRET_TOKEN", "12345", "Hello")

        # The error must mention the HTTP code and description, but NEVER the secret token
        assert "401" in str(exc_info.value)
        assert "Unauthorized" in str(exc_info.value)
        assert "SECRET_TOKEN" not in str(exc_info.value)


def test_send_telegram_message_url_error():
    """Verify network connection failures raise a clean RuntimeError."""
    url_error = urllib.error.URLError("Connection refused")

    with patch("urllib.request.urlopen", side_effect=url_error):
        with pytest.raises(RuntimeError, match="Failed to connect to Telegram API"):
            send_telegram_message("valid_token", "12345", "Hello")


def test_load_env_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test loading environment variables from a .env file."""
    monkeypatch.delenv("TEST_ENV_VAR_1", raising=False)
    monkeypatch.delenv("TEST_ENV_VAR_2", raising=False)

    fake_env = tmp_path / ".env"
    fake_env.write_text(
        "# Comment line\n"
        "TEST_ENV_VAR_1=perimeter_val_1\n"
        "TEST_ENV_VAR_2=\"perimeter_val_2\"\n"
        "EMPTY_LINE=\n",
        encoding="utf-8",
    )

    load_env_file(fake_env)
    assert os.environ.get("TEST_ENV_VAR_1") == "perimeter_val_1"
    assert os.environ.get("TEST_ENV_VAR_2") == "perimeter_val_2"


def test_main_missing_env(capsys: pytest.CaptureFixture):
    """CLI fails with exit code 1 when credentials are missing or default."""
    exit_code = main(env={})
    assert exit_code == 1
    captured = capsys.readouterr()
    assert "TELEGRAM_BOT_TOKEN is missing" in captured.err

    exit_code = main(env={"TELEGRAM_BOT_TOKEN": "some_token"})
    assert exit_code == 1
    captured = capsys.readouterr()
    assert "TELEGRAM_DEFAULT_CHAT_ID is missing" in captured.err


def test_main_success(capsys: pytest.CaptureFixture):
    """CLI succeeds and prints message ID when dispatch succeeds."""
    mock_payload = {"ok": True, "result": {"message_id": 101}}

    with patch("scripts.telegram_hello.send_telegram_message", return_value=mock_payload):
        exit_code = main(
            env={
                "TELEGRAM_BOT_TOKEN": "test_bot_token",
                "TELEGRAM_DEFAULT_CHAT_ID": "test_chat_id",
            }
        )
        assert exit_code == 0
        captured = capsys.readouterr()
        assert "Success: 'Hello from Perimeter' sent" in captured.out
        assert "101" in captured.out


def test_main_send_error(capsys: pytest.CaptureFixture):
    """CLI returns non-zero when dispatch encounters an API error."""
    with patch(
        "scripts.telegram_hello.send_telegram_message",
        side_effect=RuntimeError("Telegram API error: Bad Request"),
    ):
        exit_code = main(
            env={
                "TELEGRAM_BOT_TOKEN": "test_bot_token",
                "TELEGRAM_DEFAULT_CHAT_ID": "test_chat_id",
            }
        )
        assert exit_code == 1
        captured = capsys.readouterr()
        assert "Error sending Telegram message" in captured.err
