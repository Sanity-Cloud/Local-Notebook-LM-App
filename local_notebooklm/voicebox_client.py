from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional


class VoiceboxError(RuntimeError):
    pass


@dataclass
class VoiceboxSpeechResponse:
    audio: bytes

    def read(self) -> bytes:
        return self.audio


class VoiceboxSpeechApi:
    def __init__(self, client: "VoiceboxClient") -> None:
        self._client = client

    def create(self, model: str, voice: str, input: str) -> VoiceboxSpeechResponse:
        audio = self._client.speak(text=input, voice=voice, engine=model)
        return VoiceboxSpeechResponse(audio=audio)


class VoiceboxAudioApi:
    def __init__(self, client: "VoiceboxClient") -> None:
        self.speech = VoiceboxSpeechApi(client)


class VoiceboxClient:
    """Small compatibility wrapper for the native Voicebox REST API.

    The rest of Local-NotebookLM-Suite expects an OpenAI-style object with
    ``client.audio.speech.create(...).read()``. Voicebox 0.5.0 does not expose
    OpenAI-compatible ``/v1/audio/speech``. It exposes ``POST /speak`` and
    generated audio through ``GET /audio/{generation_id}``, so this wrapper
    adapts Voicebox to the existing processor pipeline.
    """

    def __init__(self, base_url: str, api_key: str = "not-needed", timeout: float = 180.0) -> None:
        self.base_url = base_url.rstrip("/")
        if self.base_url.endswith("/v1"):
            self.base_url = self.base_url[:-3].rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.audio = VoiceboxAudioApi(self)

    def _request_json(self, method: str, path: str, body: Optional[dict[str, Any]] = None) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if self.api_key and self.api_key != "not-needed":
            headers["Authorization"] = f"Bearer {self.api_key}"

        req = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = resp.read()
                return json.loads(payload.decode("utf-8")) if payload else {}
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            raise VoiceboxError(f"Voicebox {method} {path} failed: HTTP {exc.code}: {details}") from exc

    def _request_bytes(self, method: str, path: str) -> bytes:
        headers = {"Accept": "audio/wav, audio/*, application/octet-stream"}
        if self.api_key and self.api_key != "not-needed":
            headers["Authorization"] = f"Bearer {self.api_key}"
        req = urllib.request.Request(f"{self.base_url}{path}", headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            raise VoiceboxError(f"Voicebox {method} {path} failed: HTTP {exc.code}: {details}") from exc

    @staticmethod
    def _is_probably_voicebox_profile(voice: str) -> bool:
        if not voice or voice == "alloy" or voice == "default":
            return False
        # Kokoro voice expressions such as af_bella(1.4)+af_sky(0.8) are not
        # Voicebox profile IDs. Let Voicebox fall back to its default binding.
        return not any(ch in voice for ch in "()+, ")

    def speak(self, text: str, voice: str, engine: str = "qwen") -> bytes:
        payload: dict[str, Any] = {
            "text": text,
            "engine": engine or "qwen",
            "language": "en",
        }
        if self._is_probably_voicebox_profile(voice):
            payload["profile"] = voice

        result = self._request_json("POST", "/speak", payload)
        generation_id = result.get("id")
        if not generation_id:
            raise VoiceboxError(f"Voicebox /speak did not return a generation id: {result!r}")

        status = result.get("status")
        deadline = time.time() + self.timeout
        while status not in {"completed", "complete", "done", "success"}:
            if status in {"failed", "error", "cancelled", "canceled"}:
                raise VoiceboxError(f"Voicebox generation {generation_id} failed: {result!r}")
            if time.time() >= deadline:
                raise VoiceboxError(f"Timed out waiting for Voicebox generation {generation_id}")
            time.sleep(0.75)
            result = self._request_json("GET", f"/history/{generation_id}")
            status = result.get("status", status)

        return self._request_bytes("GET", f"/audio/{generation_id}")
