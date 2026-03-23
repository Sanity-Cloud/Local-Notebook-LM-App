import { useState, useEffect, useRef } from 'react'
import {
  Upload,
  FileText,
  Settings,
  Play,
  Pause,
  Download,
  FolderOpen,
  Mic2,
  Users,
  Sparkles,
  CheckCircle2,
  Music,
  ChevronRight,
  X,
  Save,
  Volume2,
  Sun,
  Wind,
  History,
  RefreshCw,
} from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Types
interface PdfFile {
  path: string
  name: string
  size: number
}

interface Config {
  llmApiUrl: string
  llmApiKey: string
  ttsApiUrl: string
  ttsApiKey: string
  ttsModel: string
  ttsVoiceModel: string
  speakerVoices?: Record<string, string>
  defaultOutputDir: string
}

interface GenerationSettings {
  llmModel: string
  language: string
  formatType: string
  style: string
  length: string
  numSpeakers: number
  customPreferences: string
  isVlm: boolean
}

interface GenerationProgress {
  type: 'info' | 'error'
  message: string
  timestamp: number
}

interface TranscriptEntry {
  speaker: string
  text: string
}

interface HistoryJob {
  id: string
  pdfName: string
  pdfPath: string
  outputDir: string
  audioPath?: string
  status: 'generating' | 'done' | 'error'
  timestamp: number
  settings: GenerationSettings
  errorMessage?: string
}

// Constants
const FORMAT_TYPES = [
  { value: 'podcast', label: 'Podcast', icon: Mic2, speakers: [2, 3] },
  { value: 'interview', label: 'Interview', icon: Users, speakers: [2] },
  { value: 'summary', label: 'Summary', icon: FileText, speakers: [1] },
  { value: 'narration', label: 'Narration', icon: Sparkles, speakers: [1] },
  { value: 'article', label: 'Article', icon: FileText, speakers: [1] },
  { value: 'lecture', label: 'Lecture', icon: Mic2, speakers: [1] },
  { value: 'tutorial', label: 'Tutorial', icon: CheckCircle2, speakers: [1, 2] },
  { value: 'panel-discussion', label: 'Panel', icon: Users, speakers: [3, 4, 5, 6] },
  { value: 'debate', label: 'Debate', icon: Users, speakers: [2, 3, 4] },
  { value: 'q-and-a', label: 'Q&A', icon: Mic2, speakers: [2] },
  { value: 'meeting', label: 'Meeting', icon: Users, speakers: [2, 3, 4, 5] },
  { value: 'analysis', label: 'Analysis', icon: FileText, speakers: [1, 2] },
]

const STYLES = ['normal', 'formal', 'casual', 'enthusiastic', 'serious', 'humorous', 'gen-z', 'technical']
const LENGTHS = ['short', 'medium', 'long']
const LANGUAGES = ['english', 'spanish', 'french', 'german', 'italian', 'portuguese', 'dutch', 'chinese', 'japanese', 'korean', 'arabic', 'hindi']

export default function App() {
  // State
  const [pdfFile, setPdfFile] = useState<PdfFile | null>(null)
  const [settings, setSettings] = useState<GenerationSettings>({
    llmModel: 'gemini-3-flash-preview:cloud',
    language: 'english',
    formatType: 'podcast',
    style: 'normal',
    length: 'medium',
    numSpeakers: 2,
    customPreferences: '',
    isVlm: false,
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress[]>([])
  const [generatedAudio, setGeneratedAudio] = useState<{ path: string; name: string; outputDir?: string; pdfPath?: string } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [activeTab, setActiveTab] = useState<'upload' | 'settings' | 'player' | 'history'>('upload')
  const [history, setHistory] = useState<HistoryJob[]>(() => {
    try {
      const saved = localStorage.getItem('notebooklm-history')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [transcript, setTranscript] = useState<TranscriptEntry[] | null>(null)
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false)
  const [isSavingTranscript, setIsSavingTranscript] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [config, setConfig] = useState<Config>({
    llmApiUrl: 'http://localhost:11434/v1',
    llmApiKey: '',
    ttsApiUrl: 'http://localhost:8880/v1',
    ttsApiKey: '',
    ttsModel: 'kokoro',
    ttsVoiceModel: 'alloy',
    speakerVoices: {
      'Speaker 1': 'af_bella(1.4)+af_sky(0.8)',
      'Speaker 2': 'am_michael+am_fenrir',
      'Speaker 3': 'am_echo',
      'Speaker 4': 'af_aoede(1)+af_kore(1)+af_sky(1.6)',
      'Speaker 5': 'am_adam',
      'Speaker 6': 'af_nova+af_jadzia',
      default: 'af_nova',
    },
    defaultOutputDir: '',
  })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressEndRef = useRef<HTMLDivElement | null>(null)

  // Load config on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getConfig().then((loadedConfig) => {
        setConfig(loadedConfig)
      })
    }
  }, [])

  // Setup IPC listeners
  useEffect(() => {
    if (window.electronAPI) {
      const unsubscribe = window.electronAPI.onGenerationProgress((_, data) => {
        setProgress(prev => [...prev, { ...data, timestamp: Date.now() }])
      })
      return unsubscribe
    }
  }, [])

  // Auto-scroll progress
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [progress])

  // Persist history to localStorage
  useEffect(() => {
    localStorage.setItem('notebooklm-history', JSON.stringify(history))
  }, [history])

  // Load transcript when outputDir changes
  useEffect(() => {
    if (generatedAudio?.outputDir && window.electronAPI) {
      setIsLoadingTranscript(true)
      setTranscript(null)
      window.electronAPI.readTranscript(generatedAudio.outputDir)
        .then(result => {
          if (result.success && result.transcript) {
            setTranscript(result.transcript)
          }
        })
        .finally(() => setIsLoadingTranscript(false))
    } else {
      setTranscript(null)
    }
  }, [generatedAudio?.outputDir])

  // Handlers
  const handleSelectPdf = async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.selectPdf()
    if (result) {
      setPdfFile(result)
      setActiveTab('settings')
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0 && files[0].name.endsWith('.pdf')) {
      const file = files[0]
      setPdfFile({
        path: (file as any).path || file.name,
        name: file.name,
        size: file.size,
      })
      setActiveTab('settings')
    }
  }

  const handleGenerate = async () => {
    if (!pdfFile || !window.electronAPI) return

    const jobId = Date.now().toString()
    const newJob: HistoryJob = {
      id: jobId,
      pdfName: pdfFile.name,
      pdfPath: pdfFile.path,
      outputDir: '',
      status: 'generating',
      timestamp: Date.now(),
      settings: { ...settings },
    }
    setHistory(prev => [newJob, ...prev])
    setIsGenerating(true)
    setProgress([])
    setGeneratedAudio(null)
    setTranscript(null)
    setActiveTab('player')

    try {
      const result = await window.electronAPI.generateAudio({
        pdfPath: pdfFile.path,
        ...settings,
        config,
      })

      if (result.success && result.outputPath) {
        setGeneratedAudio({
          path: result.outputPath,
          name: result.fileName || 'generated_audio.wav',
          outputDir: result.outputDir,
          pdfPath: pdfFile.path,
        })
        setHistory(prev => prev.map(j => j.id === jobId ? {
          ...j,
          outputDir: result.outputDir || '',
          audioPath: result.outputPath,
          status: 'done',
        } : j))
      } else {
        setHistory(prev => prev.map(j => j.id === jobId ? {
          ...j,
          status: 'error',
          errorMessage: result.message || 'Generation failed',
        } : j))
        setProgress(prev => [...prev, {
          type: 'error',
          message: result.message || 'Generation failed',
          timestamp: Date.now()
        }])
      }
    } catch (error) {
      setHistory(prev => prev.map(j => j.id === jobId ? {
        ...j,
        status: 'error',
        errorMessage: String(error),
      } : j))
      setProgress(prev => [...prev, {
        type: 'error',
        message: String(error),
        timestamp: Date.now()
      }])
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
      setDuration(audioRef.current.duration || 0)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const handleExport = async (format: 'wav' | 'mp3') => {
    if (!generatedAudio || !window.electronAPI) return

    const result = await window.electronAPI.exportAudio({
      sourcePath: generatedAudio.path,
      format,
    })

    if (result.success) {
      setShowExportMenu(false)
    }
  }

  const handleOpenInFolder = () => {
    if (generatedAudio && window.electronAPI) {
      window.electronAPI.openInFolder(generatedAudio.path)
    }
  }

  const handleSaveConfig = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.saveConfig(config)
    setShowConfigModal(false)
  }

  const handleSelectDefaultOutputDir = async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.selectOutputDir()
    if (result) {
      setConfig(prev => ({ ...prev, defaultOutputDir: result }))
    }
  }

  const handleOpenJob = (job: HistoryJob) => {
    if (!job.audioPath) return
    const name = job.audioPath.split('/').pop() || 'audio.wav'
    setGeneratedAudio({ path: job.audioPath, name, outputDir: job.outputDir, pdfPath: job.pdfPath })
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    setProgress([])
    setActiveTab('player')
  }

  const handleSaveTranscript = async () => {
    if (!transcript || !generatedAudio?.outputDir || !window.electronAPI) return
    setIsSavingTranscript(true)
    await window.electronAPI.saveTranscript(generatedAudio.outputDir, transcript)
    setIsSavingTranscript(false)
  }

  const handleRegenerate = async () => {
    if (!generatedAudio?.outputDir || !window.electronAPI) return

    setIsRegenerating(true)
    setIsGenerating(true)
    setProgress([])

    // Save edited transcript to disk first
    if (transcript) {
      await window.electronAPI.saveTranscript(generatedAudio.outputDir, transcript)
    }

    const transcriptFile = generatedAudio.outputDir + '/transcript.json'

    try {
      const result = await window.electronAPI.generateAudio({
        pdfPath: generatedAudio.pdfPath || '',
        outputDir: generatedAudio.outputDir,
        transcriptFile,
        ...settings,
        config,
      })

      if (result.success && result.outputPath) {
        const name = result.outputPath.split('/').pop() || 'audio.wav'
        setGeneratedAudio(prev => prev ? { ...prev, path: result.outputPath!, name } : null)
        setCurrentTime(0)
        setDuration(0)
        setIsPlaying(false)
      } else {
        setProgress(prev => [...prev, {
          type: 'error',
          message: result.message || 'Regeneration failed',
          timestamp: Date.now()
        }])
      }
    } catch (error) {
      setProgress(prev => [...prev, {
        type: 'error',
        message: String(error),
        timestamp: Date.now()
      }])
    } finally {
      setIsGenerating(false)
      setIsRegenerating(false)
    }
  }

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const validSpeakerCounts = FORMAT_TYPES.find(f => f.value === settings.formatType)?.speakers || [1, 2]
  const hasError = !isGenerating && !generatedAudio && progress.some(p => p.type === 'error')
  const lastError = hasError ? [...progress].reverse().find(p => p.type === 'error')?.message : null

  return (
    <div className="min-h-screen bg-[#0c0a09] text-[#fafaf9] selection:bg-orange-500/30">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden ring-1 ring-orange-500/20">
                <img
                  src="logo.jpeg"
                  alt="Local NotebookLM"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Local NotebookLM</h1>
                <p className="text-xs text-stone-500">by Gökdeniz Gülmez</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {['upload', 'settings', 'player', 'history'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5",
                    activeTab === tab
                      ? "text-orange-400 bg-orange-500/10"
                      : "text-stone-500 hover:text-stone-300"
                  )}
                >
                  {tab === 'history' && <History className="w-3.5 h-3.5" />}
                  <span className="capitalize">{tab}</span>
                  {tab === 'history' && history.length > 0 && (
                    <span className="text-xs bg-stone-700 text-stone-400 rounded-full px-1.5 py-0.5 leading-none">
                      {history.length}
                    </span>
                  )}
                </button>
              ))}
              <div className="w-px h-6 bg-white/10 mx-2" />
              <button
                onClick={() => setShowConfigModal(true)}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors text-stone-400 hover:text-orange-400"
                title="API Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative pt-24 pb-8 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Upload Section */}
          {activeTab === 'upload' && (
            <div className="animate-fadeIn">
              <div className="text-center mb-12">
                <p className="text-stone-600 text-sm mb-2 tracking-wide uppercase">Gökdeniz Gülmez Presents</p>
                <h2 className="text-4xl font-light tracking-tight mb-3">
                  Local <span className="gradient-text font-medium">NotebookLM</span>
                </h2>
                <p className="text-stone-500">Turn PDFs into engaging audio conversations</p>
              </div>

              <div
                onClick={handleSelectPdf}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "relative cursor-pointer rounded-3xl border-2 border-dashed p-20 transition-all duration-300",
                  dragOver
                    ? "border-orange-500/60 bg-orange-500/5"
                    : "border-stone-800 bg-stone-900/30 hover:border-stone-700 hover:bg-stone-900/50"
                )}
              >
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-orange-400" />
                  </div>
                  <p className="text-lg font-medium text-stone-300 mb-1">Drop your PDF here</p>
                  <p className="text-sm text-stone-600 mb-6">or click to browse</p>
                  <button className="btn-primary px-6 py-2.5 rounded-xl text-sm font-medium">
                    Select File
                  </button>
                </div>
              </div>

              {pdfFile && (
                <div className="mt-8 animate-fadeIn">
                  <div className="glass-card rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-stone-200 truncate">{pdfFile.name}</h4>
                      <p className="text-sm text-stone-600">{formatFileSize(pdfFile.size)}</p>
                    </div>
                    <button
                      onClick={() => setPdfFile(null)}
                      className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-stone-500" />
                    </button>
                    <button
                      onClick={() => setActiveTab('settings')}
                      className="btn-primary px-5 py-2 rounded-lg text-sm flex items-center gap-2"
                    >
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Generation Status Banner */}
              {isGenerating && (
                <div className="mt-4 animate-fadeIn glass-card rounded-2xl p-4 flex items-center gap-4 border border-orange-500/20">
                  <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                    <div className="w-4 h-4 spinner-sunrise" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-orange-400">Generating audio...</p>
                    <p className="text-xs text-stone-600 truncate">
                      {progress.length > 0 ? progress[progress.length - 1].message : 'Starting up'}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('player')}
                    className="px-4 py-2 rounded-xl text-sm text-orange-400 hover:bg-orange-500/10 transition-colors shrink-0"
                  >
                    View progress
                  </button>
                </div>
              )}

              {!isGenerating && generatedAudio && (
                <div className="mt-4 animate-fadeIn glass-card rounded-2xl p-4 flex items-center gap-4 border border-green-500/20">
                  <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-400">Audio ready</p>
                    <p className="text-xs text-stone-600 truncate">{generatedAudio.name}</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('player')}
                    className="px-4 py-2 rounded-xl text-sm text-green-400 hover:bg-green-500/10 transition-colors shrink-0 flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Listen
                  </button>
                </div>
              )}

              {hasError && (
                <div className="mt-4 animate-fadeIn glass-card rounded-2xl p-4 flex items-center gap-4 border border-red-500/20">
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                    <X className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-400">Generation failed</p>
                    <p className="text-xs text-stone-600 truncate">{lastError}</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('player')}
                    className="px-4 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  >
                    View log
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Settings Section */}
          {activeTab === 'settings' && pdfFile && (
            <div className="animate-fadeIn space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-light tracking-tight">Configure</h2>
                  <p className="text-sm text-stone-500">Customize your audio generation</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="px-4 py-2 rounded-xl text-sm text-stone-500 hover:text-stone-300 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="btn-primary px-6 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <div className="w-4 h-4 spinner-sunrise" />
                    ) : (
                      <Sun className="w-4 h-4" />
                    )}
                    Generate
                  </button>
                </div>
              </div>

              {/* Format Selection */}
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-sm font-medium text-stone-400 mb-4 uppercase tracking-wider">Format</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {FORMAT_TYPES.map((format) => {
                    const Icon = format.icon
                    return (
                      <button
                        key={format.value}
                        onClick={() => setSettings(s => ({
                          ...s,
                          formatType: format.value,
                          numSpeakers: format.speakers.includes(s.numSpeakers)
                            ? s.numSpeakers
                            : format.speakers[0]
                        }))}
                        className={cn(
                          "p-4 rounded-xl border transition-all text-center selection-ring",
                          settings.formatType === format.value
                            ? "border-orange-500 bg-orange-500/10 text-orange-400"
                            : "border-stone-800 hover:border-stone-700 text-stone-500"
                        )}
                      >
                        <Icon className="w-5 h-5 mx-auto mb-2" />
                        <p className="text-xs font-medium">{format.label}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Settings Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card rounded-2xl p-5">
                  <h3 className="text-sm font-medium text-stone-400 mb-3">Style</h3>
                  <div className="space-y-1">
                    {STYLES.map((style) => (
                      <button
                        key={style}
                        onClick={() => setSettings(s => ({ ...s, style }))}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg text-sm text-left capitalize transition-all",
                          settings.style === style
                            ? "text-orange-400 bg-orange-500/10"
                            : "text-stone-500 hover:text-stone-300 hover:bg-white/5"
                        )}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="glass-card rounded-2xl p-5">
                  <h3 className="text-sm font-medium text-stone-400 mb-3">Length</h3>
                  <div className="space-y-2">
                    {LENGTHS.map((length) => (
                      <button
                        key={length}
                        onClick={() => setSettings(s => ({ ...s, length }))}
                        className={cn(
                          "w-full px-4 py-3 rounded-xl text-left capitalize transition-all",
                          settings.length === length
                            ? "bg-orange-500/10 border border-orange-500/30 text-orange-400"
                            : "border border-transparent text-stone-500 hover:bg-white/5"
                        )}
                      >
                        {length}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="glass-card rounded-2xl p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-stone-400 mb-2">Speakers</h3>
                    <div className="flex gap-2">
                      {validSpeakerCounts.map((num) => (
                        <button
                          key={num}
                          onClick={() => setSettings(s => ({ ...s, numSpeakers: num }))}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                            settings.numSpeakers === num
                              ? "bg-orange-500 text-white"
                              : "bg-stone-800/50 text-stone-500 hover:bg-stone-800"
                          )}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-stone-800">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-stone-400">Vision Mode</span>
                      <button
                        onClick={() => setSettings(s => ({ ...s, isVlm: !s.isVlm }))}
                        className={cn(
                          "w-10 h-5 rounded-full transition-colors relative",
                          settings.isVlm ? "bg-orange-500" : "bg-stone-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-3 h-3 rounded-full bg-white transition-all",
                          settings.isVlm ? "left-6" : "left-1"
                        )} />
                      </button>
                    </label>
                  </div>
                </div>
              </div>

              {/* Advanced Options */}
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-sm font-medium text-stone-400 mb-4">Advanced</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-stone-600 mb-1.5 block">Language</label>
                    <select
                      value={settings.language}
                      onChange={(e) => setSettings(s => ({ ...s, language: e.target.value }))}
                      className="w-full bg-stone-900/50 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-300 focus:outline-none focus:border-orange-500/50"
                    >
                      {LANGUAGES.map(lang => (
                        <option key={lang} value={lang} className="bg-stone-900 capitalize">
                          {lang}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-stone-600 mb-1.5 block">LLM Model</label>
                    <input
                      type="text"
                      value={settings.llmModel}
                      onChange={(e) => setSettings(s => ({ ...s, llmModel: e.target.value }))}
                      className="w-full bg-stone-900/50 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-300 focus:outline-none focus:border-orange-500/50"
                      placeholder="Model name"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-xs text-stone-600 mb-1.5 block">Custom Instructions</label>
                  <input
                    type="text"
                    value={settings.customPreferences}
                    onChange={(e) => setSettings(s => ({ ...s, customPreferences: e.target.value }))}
                    placeholder="Focus on specific topics..."
                    className="w-full bg-stone-900/50 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-300 placeholder:text-stone-700 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Player Section */}
          {activeTab === 'player' && (
            <div className="animate-fadeIn space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-light tracking-tight">
                    {isGenerating ? 'Generating...' : generatedAudio ? 'Ready' : 'Player'}
                  </h2>
                  <p className="text-sm text-stone-500">
                    {isGenerating ? 'Processing your PDF' : generatedAudio ? 'Your audio is ready' : 'Generate to listen'}
                  </p>
                </div>
                {!isGenerating && (
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="px-4 py-2 rounded-xl text-sm text-stone-500 hover:text-stone-300 transition-colors"
                  >
                    Back
                  </button>
                )}
              </div>

              {/* Player Card */}
              <div className="glass-card rounded-3xl p-8 relative overflow-hidden">
                {/* Visualizer Background */}
                <div className="absolute inset-0 flex items-end justify-center gap-1 pb-8 opacity-20">
                  {isGenerating || isPlaying ? (
                    [...Array(24)].map((_, i) => (
                      <div
                        key={i}
                        className="w-1.5 bg-gradient-to-t from-orange-500 to-amber-400 rounded-full transition-all duration-150"
                        style={{
                          height: isGenerating
                            ? `${20 + Math.random() * 60}%`
                            : `${20 + Math.random() * 40}%`,
                          animationDelay: `${i * 0.05}s`,
                        }}
                      />
                    ))
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-16 h-16 text-stone-800" />
                    </div>
                  )}
                </div>

                <div className="relative">
                  {/* Progress */}
                  {generatedAudio && (
                    <>
                      <audio
                        ref={audioRef}
                        src={`local-file://${generatedAudio.path}`}
                        onLoadedMetadata={() => {
                          const d = audioRef.current?.duration
                          if (d && isFinite(d)) setDuration(d)
                        }}
                        onDurationChange={() => {
                          const d = audioRef.current?.duration
                          if (d && isFinite(d)) setDuration(d)
                        }}
                        onTimeUpdate={handleTimeUpdate}
                        onEnded={() => setIsPlaying(false)}
                      />

                      <div className="space-y-6">
                        {/* Time Display */}
                        <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
                          <span>{formatTime(currentTime)}</span>
                          <span className="text-stone-700">/</span>
                          <span>{formatTime(duration)}</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="relative">
                          <input
                            type="range"
                            min={0}
                            max={duration || 0}
                            value={currentTime}
                            onChange={handleSeek}
                            className="w-full h-1.5 bg-stone-800 rounded-full appearance-none cursor-pointer accent-orange-500"
                          />
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-center gap-4">
                          <button
                            onClick={() => {
                              if (audioRef.current) {
                                audioRef.current.currentTime = Math.max(0, currentTime - 15)
                              }
                            }}
                            className="p-3 hover:bg-white/5 rounded-full transition-colors text-stone-500 hover:text-stone-300"
                          >
                            <span className="text-xs font-medium">-15s</span>
                          </button>

                          <button
                            onClick={handlePlayPause}
                            className="w-16 h-16 btn-primary rounded-full flex items-center justify-center glow-orange"
                          >
                            {isPlaying ? (
                              <Pause className="w-6 h-6" />
                            ) : (
                              <Play className="w-6 h-6 ml-1" />
                            )}
                          </button>

                          <button
                            onClick={() => {
                              if (audioRef.current) {
                                audioRef.current.currentTime = Math.min(duration, currentTime + 15)
                              }
                            }}
                            className="p-3 hover:bg-white/5 rounded-full transition-colors text-stone-500 hover:text-stone-300"
                          >
                            <span className="text-xs font-medium">+15s</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {isGenerating && (
                    <div className="flex flex-col items-center py-8">
                      <div className="w-12 h-12 spinner-sunrise mb-4" />
                      <p className="text-stone-500 animate-pulse">Generating audio...</p>
                    </div>
                  )}
                </div>
              </div>

              {/* File Info & Actions */}
              {generatedAudio && (
                <div className="glass-card rounded-2xl p-5 overflow-visible">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center">
                      <Volume2 className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-stone-200 truncate">{generatedAudio.name}</h4>
                      <p className="text-xs text-stone-600">Generated successfully</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleOpenInFolder}
                        className="p-2.5 hover:bg-white/5 rounded-xl transition-colors text-stone-500 hover:text-stone-300"
                        title="Show in folder"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setShowExportMenu(!showExportMenu)}
                          className="btn-secondary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 text-stone-300"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                        {showExportMenu && (
                          <div className="absolute right-0 top-full mt-2 glass-card rounded-xl p-1.5 min-w-[140px] z-50">
                            <button
                              onClick={() => handleExport('wav')}
                              className="w-full px-4 py-2 text-left text-sm text-stone-300 hover:text-orange-400 hover:bg-white/5 rounded-lg transition-colors"
                            >
                              Export as WAV
                            </button>
                            <button
                              onClick={() => handleExport('mp3')}
                              className="w-full px-4 py-2 text-left text-sm text-stone-300 hover:text-orange-400 hover:bg-white/5 rounded-lg transition-colors"
                            >
                              Export as MP3
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Transcript Editor */}
              {generatedAudio && !isGenerating && (
                <div className="glass-card rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-stone-400">Transcript</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveTranscript}
                        disabled={isSavingTranscript || !transcript}
                        className="px-3 py-1.5 rounded-lg text-xs text-stone-400 hover:text-stone-200 hover:bg-white/5 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {isSavingTranscript ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleRegenerate}
                        disabled={isGenerating || !transcript}
                        className="btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-40"
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", isRegenerating && "animate-spin")} />
                        Regenerate Audio
                      </button>
                    </div>
                  </div>

                  {isLoadingTranscript ? (
                    <p className="text-stone-600 text-sm text-center py-4">Loading transcript...</p>
                  ) : transcript ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {transcript.map((entry, i) => (
                        <div key={i} className="flex gap-3">
                          <span className="text-xs text-orange-400/70 w-20 shrink-0 pt-2.5 font-medium truncate">
                            {entry.speaker}
                          </span>
                          <textarea
                            value={entry.text}
                            onChange={e => setTranscript(prev =>
                              prev ? prev.map((t, j) => j === i ? { ...t, text: e.target.value } : t) : null
                            )}
                            className="flex-1 bg-stone-900/50 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-300 focus:outline-none focus:border-orange-500/50 resize-none leading-relaxed"
                            rows={2}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-stone-600 text-sm text-center py-4">No transcript available</p>
                  )}
                </div>
              )}

              {/* Log */}
              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    isGenerating ? "bg-orange-400 animate-pulse" : generatedAudio ? "bg-green-400" : "bg-stone-600"
                  )} />
                  <h3 className="text-sm font-medium text-stone-400">Log</h3>
                </div>
                <div className="h-48 overflow-y-auto space-y-1.5 pr-2 font-mono text-xs">
                  {progress.length === 0 ? (
                    <p className="text-stone-700 text-center py-8">
                      {isGenerating ? 'Starting...' : 'Waiting to start'}
                    </p>
                  ) : (
                    progress.map((item, i) => (
                      <div
                        key={i}
                        className={cn(
                          "py-1.5 px-2 rounded",
                          item.type === 'error'
                            ? "text-red-400 bg-red-500/10"
                            : "text-stone-500"
                        )}
                      >
                        <span className="text-stone-700 mr-2">{new Date(item.timestamp).toLocaleTimeString(undefined, {hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                        {item.message}
                      </div>
                    ))
                  )}
                  <div ref={progressEndRef} />
                </div>
              </div>
            </div>
          )}
          {/* History Section */}
          {activeTab === 'history' && (
            <div className="animate-fadeIn space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-light tracking-tight">History</h2>
                  <p className="text-sm text-stone-500">All generation jobs</p>
                </div>
                {history.length > 0 && (
                  <button
                    onClick={() => setHistory([])}
                    className="px-3 py-1.5 rounded-lg text-xs text-stone-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="glass-card rounded-3xl p-16 text-center">
                  <History className="w-10 h-10 text-stone-800 mx-auto mb-4" />
                  <p className="text-stone-600">No generation jobs yet</p>
                  <p className="text-xs text-stone-700 mt-1">Jobs will appear here after you generate audio</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map(job => (
                    <div key={job.id} className="glass-card rounded-2xl p-5">
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "w-2 h-2 rounded-full mt-1.5 shrink-0",
                          job.status === 'done' ? "bg-green-400" :
                          job.status === 'error' ? "bg-red-400" :
                          "bg-orange-400 animate-pulse"
                        )} />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-stone-200 truncate">{job.pdfName}</h4>
                          <p className="text-xs text-stone-600 mt-0.5">
                            {new Date(job.timestamp).toLocaleString()} · {job.settings.formatType} · {job.settings.style} · {job.settings.length}
                          </p>
                          {job.status === 'error' && job.errorMessage && (
                            <p className="text-xs text-red-400 mt-1.5 line-clamp-2">{job.errorMessage}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn(
                            "text-xs px-2 py-1 rounded-full capitalize",
                            job.status === 'done' ? "text-green-400 bg-green-500/10" :
                            job.status === 'error' ? "text-red-400 bg-red-500/10" :
                            "text-orange-400 bg-orange-500/10"
                          )}>
                            {job.status}
                          </span>
                          {job.status === 'done' && job.audioPath && (
                            <button
                              onClick={() => handleOpenJob(job)}
                              className="btn-primary px-4 py-1.5 rounded-xl text-xs flex items-center gap-1.5"
                            >
                              <Play className="w-3 h-3" />
                              Open
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative text-center py-4 px-6 border-t border-white/[0.04]">
        <p className="text-xs text-stone-700">
          UI for{' '}
          <a
            href="https://github.com/Goekdeniz-Guelmez/Local-NotebookLM"
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-500 hover:text-orange-400 transition-colors underline underline-offset-2"
          >
            Local-NotebookLM
          </a>
          {' '}by Gökdeniz Gülmez
        </p>
      </footer>

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowConfigModal(false)}
          />
          <div className="relative glass-panel rounded-3xl p-8 w-full max-w-lg max-h-[80vh] flex flex-col animate-slideUp">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">API Configuration</h2>
                  <p className="text-xs text-stone-500">Configure your endpoints</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            <div className="overflow-y-auto pr-2 space-y-5">
              {/* LLM Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-orange-400">
                  <Wind className="w-4 h-4" />
                  <h3 className="text-sm font-medium">LLM (OpenAI API)</h3>
                </div>
                <div>
                  <label className="text-xs text-stone-500 mb-1.5 block">Base URL</label>
                  <input
                    type="text"
                    value={config.llmApiUrl}
                    onChange={(e) => setConfig(prev => ({ ...prev, llmApiUrl: e.target.value }))}
                    className="w-full bg-stone-900/50 border border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-300 focus:outline-none focus:border-orange-500/50"
                    placeholder="http://localhost:11434/v1"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 mb-1.5 block">API Key (optional)</label>
                  <input
                    type="password"
                    value={config.llmApiKey}
                    onChange={(e) => setConfig(prev => ({ ...prev, llmApiKey: e.target.value }))}
                    className="w-full bg-stone-900/50 border border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-300 focus:outline-none focus:border-orange-500/50"
                    placeholder="not-needed"
                  />
                </div>
              </div>

              <div className="divider-sunrise" />

              {/* TTS Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-amber-400">
                  <Volume2 className="w-4 h-4" />
                  <h3 className="text-sm font-medium">TTS (OpenAI API)</h3>
                </div>
                <div>
                  <label className="text-xs text-stone-500 mb-1.5 block">Base URL</label>
                  <input
                    type="text"
                    value={config.ttsApiUrl}
                    onChange={(e) => setConfig(prev => ({ ...prev, ttsApiUrl: e.target.value }))}
                    className="w-full bg-stone-900/50 border border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-300 focus:outline-none focus:border-orange-500/50"
                    placeholder="http://localhost:8880/v1"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 mb-1.5 block">API Key (optional)</label>
                  <input
                    type="password"
                    value={config.ttsApiKey}
                    onChange={(e) => setConfig(prev => ({ ...prev, ttsApiKey: e.target.value }))}
                    className="w-full bg-stone-900/50 border border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-300 focus:outline-none focus:border-orange-500/50"
                    placeholder="not-needed"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 mb-1.5 block">TTS Model</label>
                  <input
                    type="text"
                    value={config.ttsModel}
                    onChange={(e) => setConfig(prev => ({ ...prev, ttsModel: e.target.value }))}
                    className="w-full bg-stone-900/50 border border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-300 focus:outline-none focus:border-orange-500/50"
                    placeholder="kokoro"
                  />
                  <p className="text-xs text-stone-600 mt-1.5">e.g., kokoro, tts-1, tts-1-hd</p>
                </div>
                <div className="pt-2 border-t border-stone-800">
                  <label className="text-xs text-stone-500 mb-2 block">Speaker Voices</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Speaker 1', 'Speaker 2', 'Speaker 3', 'Speaker 4', 'Speaker 5', 'Speaker 6'].map((speaker) => (
                      <div key={speaker} className="flex items-center gap-2">
                        <span className="text-xs text-stone-500 w-16">{speaker}</span>
                        <input
                          type="text"
                          value={config.speakerVoices?.[speaker] || ''}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            speakerVoices: { ...prev.speakerVoices, [speaker]: e.target.value }
                          }))}
                          className="flex-1 bg-stone-900/50 border border-stone-800 rounded-lg px-2 py-1.5 text-xs text-stone-300 focus:outline-none focus:border-orange-500/50"
                          placeholder={speaker === 'Speaker 1' ? 'af-alloy' : speaker === 'Speaker 2' ? 'am-echo' : 'voice'}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-stone-600 mt-2">e.g., af-alloy, am-echo, af-fable, am-onyx, af-nova, af-shimmer</p>
                </div>
              </div>

              <div className="divider-sunrise" />

              {/* Default Output */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-stone-500" />
                    <h3 className="text-sm font-medium text-stone-400">Output Directory</h3>
                  </div>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, defaultOutputDir: '' }))}
                    className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    Reset to App Directory
                  </button>
                </div>
                <div className="p-3 bg-stone-900/50 border border-stone-800 rounded-xl">
                  <p className="text-xs text-stone-500 mb-2">Current output location:</p>
                  <p className="text-sm text-stone-400 font-mono truncate">
                    {config.defaultOutputDir || 'App Directory (~/Library/Application Support/Local NotebookLM/outputs)'}
                  </p>
                </div>
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={config.defaultOutputDir}
                    onChange={(e) => setConfig(prev => ({ ...prev, defaultOutputDir: e.target.value }))}
                    className="flex-1 bg-stone-900/50 border border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-300 focus:outline-none focus:border-orange-500/50"
                    placeholder="Custom directory path..."
                  />
                  <button
                    onClick={handleSelectDefaultOutputDir}
                    className="px-4 py-3 bg-stone-800/50 hover:bg-stone-800 rounded-xl transition-colors"
                    title="Browse"
                  >
                    <FolderOpen className="w-4 h-4 text-stone-400" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setShowConfigModal(false)}
                className="flex-1 px-6 py-3 rounded-xl text-sm font-medium text-stone-500 hover:text-stone-300 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                className="flex-1 btn-primary px-6 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
