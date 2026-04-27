import { useCallback, useEffect, useMemo, useState } from 'react'

type VoiceboxProfile = {
  id: string
  name?: string
  description?: string | null
  language?: string
  default_engine?: string | null
  preset_engine?: string | null
  preset_voice_id?: string | null
}

type VoiceboxModelStatus = {
  model_name: string
  display_name?: string
  downloaded?: boolean
  downloading?: boolean
  loaded?: boolean
}

type AppConfig = {
  ttsProvider?: string
  ttsApiUrl?: string
  ttsApiKey?: string
  ttsModel?: string
  ttsVoiceModel?: string
  speakerVoices?: Record<string, string>
  [key: string]: unknown
}

const VOICEBOX_ENGINES = [
  'qwen',
  'qwen_custom_voice',
  'luxtts',
  'chatterbox',
  'chatterbox_turbo',
  'tada',
  'kokoro',
]

const DEFAULT_VOICEBOX_URL = 'http://127.0.0.1:17493'

function normalizeVoiceboxBaseUrl(value?: string) {
  const trimmed = (value || DEFAULT_VOICEBOX_URL).trim().replace(/\/+$/, '')
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3).replace(/\/+$/, '') : trimmed
}

function getElectronAPI() {
  return (window as any).electronAPI
}

export default function VoiceboxSettingsPanel() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [profiles, setProfiles] = useState<VoiceboxProfile[]>([])
  const [models, setModels] = useState<VoiceboxModelStatus[]>([])
  const [status, setStatus] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [baseUrlDraft, setBaseUrlDraft] = useState(DEFAULT_VOICEBOX_URL)

  const baseUrl = useMemo(
    () => normalizeVoiceboxBaseUrl(baseUrlDraft || config?.ttsApiUrl),
    [baseUrlDraft, config?.ttsApiUrl]
  )

  const selectedVoice = config?.ttsVoiceModel || ''
  const selectedModel = config?.ttsModel || 'qwen'
  const shouldShow = config?.ttsProvider === 'voicebox' || normalizeVoiceboxBaseUrl(config?.ttsApiUrl).includes('17493')

  const loadConfig = useCallback(async () => {
    const api = getElectronAPI()
    if (!api?.getConfig) return
    try {
      const loaded = await api.getConfig()
      setConfig(loaded)
      setBaseUrlDraft(normalizeVoiceboxBaseUrl(loaded?.ttsApiUrl))
    } catch (error) {
      setStatus(`Could not read app config: ${String(error)}`)
    }
  }, [])

  const saveConfig = useCallback(async (patch: Partial<AppConfig>) => {
    const api = getElectronAPI()
    if (!api?.saveConfig) return

    const nextConfig: AppConfig = {
      ...(config || {}),
      ...patch,
      ttsProvider: 'voicebox',
      ttsApiUrl: normalizeVoiceboxBaseUrl(String(patch.ttsApiUrl ?? baseUrl)),
      ttsApiKey: '',
    }

    await api.saveConfig(nextConfig)
    setConfig(nextConfig)
    setStatus('Voicebox settings saved.')
  }, [baseUrl, config])

  const refreshVoicebox = useCallback(async () => {
    setIsLoading(true)
    setStatus('Refreshing Voicebox voices and models...')
    try {
      const [profileResp, modelResp] = await Promise.all([
        fetch(`${baseUrl}/profiles`),
        fetch(`${baseUrl}/models/status`).catch(() => null),
      ])

      if (!profileResp.ok) {
        throw new Error(`GET /profiles failed with HTTP ${profileResp.status}`)
      }

      const profilePayload = await profileResp.json()
      const nextProfiles = Array.isArray(profilePayload) ? profilePayload : []
      setProfiles(nextProfiles)

      if (modelResp?.ok) {
        const modelPayload = await modelResp.json()
        setModels(Array.isArray(modelPayload?.models) ? modelPayload.models : [])
      } else {
        setModels([])
      }

      setStatus(`Loaded ${nextProfiles.length} Voicebox profile(s).`)
    } catch (error) {
      setProfiles([])
      setModels([])
      setStatus(`Voicebox refresh failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    loadConfig()
    const timer = window.setInterval(loadConfig, 2500)
    return () => window.clearInterval(timer)
  }, [loadConfig])

  useEffect(() => {
    if (shouldShow) refreshVoicebox()
  }, [refreshVoicebox, shouldShow])

  if (!shouldShow) return null

  const saveSelectedVoice = async (voiceId: string) => {
    const speakerVoices = {
      ...(config?.speakerVoices || {}),
      'Speaker 1': voiceId,
      'Speaker 2': voiceId,
      'Speaker 3': voiceId,
      'Speaker 4': voiceId,
      'Speaker 5': voiceId,
      'Speaker 6': voiceId,
      default: voiceId,
    }
    await saveConfig({ ttsVoiceModel: voiceId, speakerVoices })
  }

  const modelOptions = VOICEBOX_ENGINES.map(engine => {
    const matchingStatus = models.find(model => model.model_name === engine || model.model_name.includes(engine))
    const suffix = matchingStatus
      ? ` — ${matchingStatus.loaded ? 'loaded' : matchingStatus.downloaded ? 'downloaded' : matchingStatus.downloading ? 'downloading' : 'not downloaded'}`
      : ''
    return { value: engine, label: `${engine}${suffix}` }
  })

  return (
    <div className="fixed bottom-4 right-4 z-[99999] w-[380px] rounded-2xl border border-white/20 bg-white/85 p-4 text-sm shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-black/75">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Voicebox</div>
          <div className="font-semibold text-foreground">Voice + model selector</div>
        </div>
        <button
          type="button"
          onClick={refreshVoicebox}
          disabled={isLoading}
          className="rounded-lg border border-white/30 px-2 py-1 text-xs hover:bg-white/40 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-foreground-tertiary">Voicebox URL</span>
          <input
            value={baseUrlDraft}
            onChange={event => setBaseUrlDraft(event.target.value)}
            onBlur={() => saveConfig({ ttsApiUrl: baseUrlDraft })}
            className="w-full rounded-xl border border-white/30 bg-white/40 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-accent/50 dark:border-white/10 dark:bg-white/5"
            placeholder={DEFAULT_VOICEBOX_URL}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-foreground-tertiary">Voice profile</span>
          <select
            value={selectedVoice}
            onChange={event => saveSelectedVoice(event.target.value)}
            className="w-full rounded-xl border border-white/30 bg-white/40 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-accent/50 dark:border-white/10 dark:bg-white/5"
          >
            <option value="">Default Voicebox binding</option>
            {profiles.map(profile => (
              <option key={profile.id} value={profile.id}>
                {profile.name ? `${profile.name} (${profile.id})` : profile.id}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-foreground-tertiary">Voicebox engine / model</span>
          <select
            value={selectedModel}
            onChange={event => saveConfig({ ttsModel: event.target.value })}
            className="w-full rounded-xl border border-white/30 bg-white/40 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-accent/50 dark:border-white/10 dark:bg-white/5"
          >
            {modelOptions.map(model => (
              <option key={model.value} value={model.value}>{model.label}</option>
            ))}
          </select>
        </label>

        {status && <div className="rounded-xl bg-black/5 px-3 py-2 text-xs text-foreground-secondary dark:bg-white/5">{status}</div>}
      </div>
    </div>
  )
}
