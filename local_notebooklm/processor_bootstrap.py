from __future__ import annotations

"""Runtime compatibility loader for processor.py.

This keeps the CLI usable even if a text patch accidentally left literal
PowerShell newline/quote escape sequences in processor.py.
"""

from pathlib import Path
from types import ModuleType


_PROCESSOR_PATH = Path(__file__).with_name("processor.py")
_source = _PROCESSOR_PATH.read_text(encoding="utf-8")

# Fix accidental PowerShell escape text that breaks Python syntax.
_source = _source.replace(
    "from openai import OpenAI`nfrom .tts_providers import resolve_tts_provider",
    "from openai import OpenAI\nfrom .tts_providers import resolve_tts_provider",
)
_source = _source.replace("provider=\\\"voicebox\\\"", "provider=\"voicebox\"")

# Make the TTS client honor Electron-provided environment settings when present.
_source = _source.replace(
    'tts_config = resolve_tts_provider(provider="voicebox"); kokoro_client = OpenAI(base_url=tts_config.base_url, api_key=tts_config.api_key)  # Kokoro API',
    'tts_config = resolve_tts_provider(provider="voicebox", base_url=__import__("os").environ.get("TTS_API_URL") or None, model=__import__("os").environ.get("TTS_MODEL") or None, api_key=__import__("os").environ.get("TTS_API_KEY") or None); kokoro_client = OpenAI(base_url=tts_config.base_url, api_key=tts_config.api_key)  # Local TTS API',
)

_runtime_module = ModuleType("local_notebooklm._processor_runtime")
_runtime_module.__file__ = str(_PROCESSOR_PATH)
_runtime_module.__package__ = __package__

exec(compile(_source, str(_PROCESSOR_PATH), "exec"), _runtime_module.__dict__)

generate_audio = _runtime_module.generate_audio
