from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

@dataclass(frozen=True)
class TtsProviderConfig:
    provider: str
    base_url: str
    model: str
    api_key: str

DEFAULT_TTS_PROVIDERS = {
    "openai": TtsProviderConfig(
        provider="openai",
        base_url="https://api.openai.com/v1",
        model="gpt-4o-mini-tts",
        api_key="",
    ),
    "kokoro": TtsProviderConfig(
        provider="kokoro",
        base_url="http://127.0.0.1:58888/v1",
        model="kokoro",
        api_key="not-needed",
    ),
    "voicebox": TtsProviderConfig(
        provider="voicebox",
        base_url="http://127.0.0.1:17493/v1",
        model="voicebox",
        api_key="not-needed",
    ),
}

def resolve_tts_provider(provider: str, base_url: Optional[str] = None, model: Optional[str] = None, api_key: Optional[str] = None) -> TtsProviderConfig:
    provider_key = (provider or "openai").strip().lower()
    if provider_key not in DEFAULT_TTS_PROVIDERS:
        raise ValueError(f"Unsupported TTS provider: {provider!r}")
    default = DEFAULT_TTS_PROVIDERS[provider_key]
    return TtsProviderConfig(
        provider=provider_key,
        base_url=(base_url or default.base_url).rstrip("/"),
        model=model or default.model,
        api_key=api_key or default.api_key,
    )

def ensure_absolute_output_path(output_path: str | Path) -> Path:
    path = Path(output_path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path
