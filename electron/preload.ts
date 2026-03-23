import { contextBridge, ipcRenderer } from 'electron'

export interface Config {
  llmApiUrl: string
  llmApiKey: string
  ttsApiUrl: string
  ttsApiKey: string
  ttsModel: string
  ttsVoiceModel: string
  speakerVoices?: Record<string, string>
  defaultOutputDir: string
}

export interface TranscriptEntry {
  speaker: string
  text: string
}

export interface ElectronAPI {
  selectPdf: () => Promise<{ path: string; name: string; size: number } | null>
  selectOutputDir: () => Promise<string | null>
  generateAudio: (params: GenerateParams) => Promise<GenerateResult>
  getAudioFile: (filePath: string) => Promise<AudioFileResult>
  exportAudio: (params: { sourcePath: string; format: 'wav' | 'mp3' }) => Promise<ExportResult>
  openInFolder: (filePath: string) => Promise<void>
  onGenerationProgress: (callback: (event: any, data: ProgressData) => void) => () => void
  getConfig: () => Promise<Config>
  saveConfig: (config: Config) => Promise<{ success: boolean }>
  readTranscript: (outputDir: string) => Promise<{ success: boolean; transcript?: TranscriptEntry[]; error?: string }>
  saveTranscript: (outputDir: string, transcript: TranscriptEntry[]) => Promise<{ success: boolean }>
}

export interface GenerateParams {
  pdfPath: string
  outputDir?: string
  llmModel?: string
  language?: string
  formatType?: string
  style?: string
  length?: string
  numSpeakers?: number
  customPreferences?: string
  isVlm?: boolean
  transcriptFile?: string
  config?: Config
}

export interface GenerateResult {
  success: boolean
  outputPath?: string
  fileName?: string
  outputDir?: string
  message?: string
}

export interface AudioFileResult {
  success: boolean
  data?: string
  mimeType?: string
  fileName?: string
  error?: string
}

export interface ExportResult {
  success: boolean
  path?: string
  error?: string
}

export interface ProgressData {
  type: 'info' | 'error'
  message: string
}

const api: ElectronAPI = {
  selectPdf: () => ipcRenderer.invoke('select-pdf'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  generateAudio: (params) => ipcRenderer.invoke('generate-audio', params),
  getAudioFile: (filePath) => ipcRenderer.invoke('get-audio-file', filePath),
  exportAudio: (params) => ipcRenderer.invoke('export-audio', params),
  openInFolder: (filePath) => ipcRenderer.invoke('open-in-folder', filePath),
  onGenerationProgress: (callback) => {
    const handler = (event: any, data: ProgressData) => callback(event, data)
    ipcRenderer.on('generation-progress', handler)
    return () => ipcRenderer.removeListener('generation-progress', handler)
  },
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  readTranscript: (outputDir) => ipcRenderer.invoke('read-transcript', outputDir),
  saveTranscript: (outputDir, transcript) => ipcRenderer.invoke('save-transcript', { outputDir, transcript }),
}

contextBridge.exposeInMainWorld('electronAPI', api)
