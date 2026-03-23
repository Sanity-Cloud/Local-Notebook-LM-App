export interface Config {
  llmApiUrl: string;
  llmApiKey: string;
  ttsApiUrl: string;
  ttsApiKey: string;
  ttsModel: string;
  ttsVoiceModel: string;
  speakerVoices?: Record<string, string>;
  defaultOutputDir: string;
}

export interface TranscriptEntry {
  speaker: string;
  text: string;
}

export interface GenerateParams {
  pdfPath: string;
  outputDir?: string;
  llmModel?: string;
  language?: string;
  formatType?: string;
  style?: string;
  length?: string;
  numSpeakers?: number;
  customPreferences?: string;
  isVlm?: boolean;
  transcriptFile?: string;
  config?: Config;
}

export interface GenerateResult {
  success: boolean;
  outputPath?: string;
  fileName?: string;
  outputDir?: string;
  message?: string;
}

export interface AudioFileResult {
  success: boolean;
  data?: string;
  mimeType?: string;
  fileName?: string;
  error?: string;
}

export interface ExportResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface ProgressData {
  type: 'info' | 'error';
  message: string;
}

export interface ElectronAPI {
  selectPdf: () => Promise<{ path: string; name: string; size: number } | null>;
  selectOutputDir: () => Promise<string | null>;
  generateAudio: (params: GenerateParams) => Promise<GenerateResult>;
  getAudioFile: (filePath: string) => Promise<AudioFileResult>;
  exportAudio: (params: { sourcePath: string; format: 'wav' | 'mp3' }) => Promise<ExportResult>;
  openInFolder: (filePath: string) => Promise<void>;
  onGenerationProgress: (callback: (event: any, data: ProgressData) => void) => () => void;
  getConfig: () => Promise<Config>;
  saveConfig: (config: Config) => Promise<{ success: boolean }>;
  readTranscript: (outputDir: string) => Promise<{ success: boolean; transcript?: TranscriptEntry[]; error?: string }>;
  saveTranscript: (outputDir: string, transcript: TranscriptEntry[]) => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
