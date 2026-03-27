import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  ChevronRight,
  X,
  Volume2,
  History,
  ChevronDown,
  Trash2,
  AlertCircle,
  Folder,
  Mic,
  Brain,
  Key,
  Link,
  Home,
  Github,
  Heart,
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
  speakerVoices: Record<string, string>
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

// Constants - All options from processor.py
const FORMAT_TYPES = [
  { value: 'podcast', label: 'Podcast', icon: Mic2, speakers: [2, 3] },
  { value: 'interview', label: 'Interview', icon: Users, speakers: [2] },
  { value: 'summary', label: 'Summary', icon: FileText, speakers: [1] },
  { value: 'narration', label: 'Narration', icon: Sparkles, speakers: [1] },
  { value: 'article', label: 'Article', icon: FileText, speakers: [1] },
  { value: 'lecture', label: 'Lecture', icon: Mic2, speakers: [1] },
  { value: 'tutorial', label: 'Tutorial', icon: CheckCircle2, speakers: [1, 2] },
  { value: 'panel-discussion', label: 'Panel', icon: Users, speakers: [3, 4, 5, 6] },
  { value: 'q-and-a', label: 'Q&A', icon: Mic2, speakers: [2] },
  { value: 'debate', label: 'Debate', icon: Users, speakers: [2, 3, 4] },
  { value: 'meeting', label: 'Meeting', icon: Users, speakers: [2, 3, 4, 5] },
  { value: 'analysis', label: 'Analysis', icon: FileText, speakers: [1, 2] },
]

const STYLES = ['normal', 'formal', 'casual', 'enthusiastic', 'serious', 'humorous', 'gen-z', 'technical']
const LENGTHS = ['short', 'medium', 'long']
const LANGUAGES = [
  'english', 'spanish', 'french', 'german', 'italian', 'portuguese', 'dutch',
  'chinese', 'japanese', 'korean', 'arabic', 'hindi', 'russian', 'turkish',
  'polish', 'swedish', 'norwegian', 'danish', 'finnish', 'czech'
]

// Style descriptions from processor.py
const STYLE_DESCRIPTIONS: Record<string, string> = {
  normal: 'Balanced and natural conversational style',
  formal: 'Professional and polished tone with proper grammar',
  casual: 'Informal and relaxed with colloquial expressions',
  enthusiastic: 'Energetic and engaging tone to captivate',
  serious: 'Solemn and focused for important topics',
  humorous: 'Light humor and wit to entertain while informing',
  'gen-z': 'Gen Z slang, memes, and TikTok-era references',
  technical: 'Precise, domain-specific language for experts'
}

// Length descriptions
const LENGTH_DESCRIPTIONS: Record<string, string> = {
  short: '2-5 minutes, concise and to the point',
  medium: '5-10 minutes, balanced and informative',
  long: '10+ minutes, comprehensive details'
}

// Auto Theme Hook - follows system preference
function useAutoTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDark(e.matches)
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
    }

    // Set initial
    document.documentElement.setAttribute('data-theme', mediaQuery.matches ? 'dark' : 'light')

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return isDark
}

// Format file size
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Format time
function formatTime(seconds: number) {
  if (!isFinite(seconds) || isNaN(seconds)) return '--:--'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Frosted Glass Card Component
function GlassCard({ children, className, hover = true, intensity = 'medium' }: {
  children: React.ReactNode
  className?: string
  hover?: boolean
  intensity?: 'light' | 'medium' | 'heavy'
}) {
  const intensityStyles = {
    light: 'backdrop-blur-[20px] bg-white/60 dark:bg-black/40',
    medium: 'backdrop-blur-[40px] bg-white/70 dark:bg-black/50',
    heavy: 'backdrop-blur-[60px] bg-white/80 dark:bg-black/60',
  }

  return (
    <div className={cn(
      "rounded-2xl border border-white/20 dark:border-white/10 shadow-glass",
      intensityStyles[intensity],
      hover && "transition-all duration-300 hover:shadow-glass-lg hover:scale-[1.01] hover:bg-white/80 dark:hover:bg-black/70",
      className
    )}>
      {children}
    </div>
  )
}

// Frosted Glass Button
function GlassButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className,
  icon: Icon
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  className?: string
  icon?: React.ElementType
}) {
  const variants = {
    primary: cn(
      "bg-accent text-white shadow-lg shadow-accent/25",
      "hover:shadow-accent/40 hover:scale-[1.02]",
      "active:scale-[0.98]"
    ),
    secondary: cn(
      "bg-white/50 dark:bg-white/10 border border-white/30 dark:border-white/20",
      "text-foreground hover:bg-white/70 dark:hover:bg-white/20"
    ),
    ghost: "text-foreground-secondary hover:text-foreground hover:bg-white/30 dark:hover:bg-white/10",
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm",
        "transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  )
}

// Input with glass effect
function GlassInput({ label, value, onChange, type = 'text', placeholder, icon: Icon }: {
  label: string
  value: string
  onChange: (val: string) => void
  type?: string
  placeholder?: string
  icon?: React.ElementType
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-foreground-tertiary uppercase tracking-wider">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full px-4 py-2.5 rounded-xl text-sm",
            "bg-white/40 dark:bg-white/5",
            "border border-white/30 dark:border-white/10",
            "placeholder:text-foreground-muted",
            "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50",
            "transition-all duration-200"
          )}
        />
      </div>
    </div>
  )
}

// Select dropdown with glass effect
function GlassSelect({ options, value, onChange, label, icon: Icon }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  label?: string
  icon?: React.ElementType
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const selected = options.find(o => o.value === value)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
        zIndex: 99999,
      })
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen) {
      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
      return () => {
        window.removeEventListener('scroll', updatePosition, true)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [isOpen, updatePosition])

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="flex items-center gap-1.5 text-xs font-medium text-foreground-tertiary uppercase tracking-wider mb-1.5">
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full px-4 py-2.5 rounded-xl text-sm text-left",
          "bg-white/40 dark:bg-white/5",
          "border border-white/30 dark:border-white/10",
          "flex items-center justify-between",
          "hover:bg-white/60 dark:hover:bg-white/10",
          "transition-all duration-200",
          isOpen && "ring-2 ring-accent/50 border-accent/50"
        )}
      >
        <span className="capitalize text-foreground">{selected?.label}</span>
        <ChevronDown className={cn("w-4 h-4 text-foreground-muted transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && createPortal(
        <div
          style={{
            ...dropdownStyle,
            background: 'rgba(255, 255, 255, 0.62)',
            backdropFilter: 'blur(60px) saturate(220%) brightness(1.08)',
            WebkitBackdropFilter: 'blur(60px) saturate(220%) brightness(1.08)',
            border: '1px solid rgba(255, 255, 255, 0.55)',
            borderTop: '1px solid rgba(255, 255, 255, 0.8)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
            borderRadius: '16px',
            overflow: 'hidden',
          }}
          className="animate-scale-in"
        >
          {options.map(option => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              style={value === option.value ? {
                background: 'rgba(0, 122, 255, 0.1)',
              } : undefined}
              className={cn(
                "w-full px-4 py-3 text-left text-sm transition-all duration-150",
                "hover:bg-white/40",
                value === option.value
                  ? "text-accent font-semibold"
                  : "text-foreground"
              )}
            >
              <span className="capitalize">{option.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

// Main App
export default function App() {
  useAutoTheme() // Auto-detect system theme
  const [activeTab, setActiveTab] = useState<'upload' | 'settings' | 'player'>('upload')
  const [showHistory, setShowHistory] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [activeConfigTab, setActiveConfigTab] = useState<'llm' | 'tts' | 'voices' | 'general'>('llm')

  // File & Generation State
  const [pdfFile, setPdfFile] = useState<PdfFile | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress[]>([])
  const [generatedAudio, setGeneratedAudio] = useState<{ path: string; name: string; outputDir?: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Settings
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
      default: 'af_nova'
    },
    defaultOutputDir: '',
  })

  const [history, setHistory] = useState<HistoryJob[]>(() => {
    try {
      const saved = localStorage.getItem('notebooklm-history')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  // Load config
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getConfig().then((loadedConfig) => {
        setConfig(prev => ({ ...prev, ...loadedConfig }))
      })
    }
  }, [])

  // Persist history
  useEffect(() => {
    localStorage.setItem('notebooklm-history', JSON.stringify(history))
  }, [history])

  // Progress listener
  useEffect(() => {
    if (window.electronAPI) {
      return window.electronAPI.onGenerationProgress((_, data) => {
        setProgress(prev => [...prev, { ...data, timestamp: Date.now() }])
      })
    }
  }, [])

  // Handlers
  const handleSelectPdf = async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.selectPdf()
    if (result) {
      setPdfFile(result)
      setActiveTab('settings')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0 && files[0].name.endsWith('.pdf')) {
      setPdfFile({
        path: (files[0] as any).path || files[0].name,
        name: files[0].name,
        size: files[0].size,
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
          name: result.fileName || 'audio.wav',
          outputDir: result.outputDir,
        })
        setHistory(prev => prev.map(j =>
          j.id === jobId ? { ...j, status: 'done', audioPath: result.outputPath, outputDir: result.outputDir || '' } : j
        ))
      } else {
        throw new Error(result.message || 'Generation failed')
      }
    } catch (error) {
      setHistory(prev => prev.map(j =>
        j.id === jobId ? { ...j, status: 'error', errorMessage: String(error) } : j
      ))
      setProgress(prev => [...prev, { type: 'error', message: String(error), timestamp: Date.now() }])
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveConfig = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.saveConfig(config)
    setShowConfig(false)
  }

  const handleSelectOutputDir = async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.selectOutputDir()
    if (result) {
      setConfig(c => ({ ...c, defaultOutputDir: result }))
    }
  }

  const validSpeakers = FORMAT_TYPES.find(f => f.value === settings.formatType)?.speakers || [1, 2]

  const updateSpeakerVoice = (speaker: string, voice: string) => {
    setConfig(c => ({
      ...c,
      speakerVoices: { ...c.speakerVoices, [speaker]: voice }
    }))
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Frosted Glass Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-accent/20 blur-[120px] opacity-60" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-success/20 blur-[100px] opacity-50" />
        <div className="absolute top-[40%] left-[60%] w-[400px] h-[400px] rounded-full bg-warning/10 blur-[80px] opacity-40" />
      </div>

      {/* Header - Frosted Glass */}
      <header className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setActiveTab('upload'); setPdfFile(null) }}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/25">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg tracking-tight">Local-NotebookLM-App</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setActiveTab('upload'); setPdfFile(null) }}
              className="p-2.5 rounded-xl text-foreground-secondary hover:text-foreground hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
              title="Home"
            >
              <Home className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="p-2.5 rounded-xl text-foreground-secondary hover:text-foreground hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
              title="History"
            >
              <History className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowConfig(true)}
              className="p-2.5 rounded-xl text-foreground-secondary hover:text-foreground hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative pt-24 pb-12 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="animate-fade-in space-y-6">
              <div className="text-center mb-12">
                <h1 className="text-4xl font-semibold tracking-tight mb-3">
                  Turn PDFs into <span className="gradient-text">audio</span>
                </h1>
                <p className="text-foreground-secondary text-lg">
                  Upload a PDF and we'll create a podcast-style conversation
                </p>
                <p className="text-sm text-foreground-muted mt-2">
                  Built on top of <a href="https://github.com/Goekdeniz-Guelmez/Local-NotebookLM" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Local-NotebookLM</a> by Gökdeniz Gülmez
                </p>
              </div>

              <GlassCard className="p-12" intensity="medium">
                <div
                  onClick={handleSelectPdf}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300",
                    dragOver
                      ? "border-accent bg-accent/10 scale-[1.02]"
                      : "border-white/30 dark:border-white/20 hover:border-accent/50 hover:bg-white/30 dark:hover:bg-white/10"
                  )}
                >
                  <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-accent/10 flex items-center justify-center backdrop-blur-sm">
                    <Upload className="w-7 h-7 text-accent" />
                  </div>
                  <p className="text-lg font-medium mb-1">Drop your PDF here</p>
                  <p className="text-foreground-muted text-sm mb-6">or click to browse files</p>
                  <GlassButton>Select File</GlassButton>
                </div>
              </GlassCard>

              {pdfFile && (
                <GlassCard className="p-4 flex items-center gap-4 animate-slide-up" intensity="light">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center backdrop-blur-sm">
                    <FileText className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{pdfFile.name}</p>
                    <p className="text-sm text-foreground-muted">{formatFileSize(pdfFile.size)}</p>
                  </div>
                  <GlassButton variant="ghost" onClick={() => setPdfFile(null)}>
                    <X className="w-5 h-5" />
                  </GlassButton>
                  <GlassButton onClick={() => setActiveTab('settings')} icon={ChevronRight}>
                    Configure
                  </GlassButton>
                </GlassCard>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && pdfFile && (
            <div className="animate-fade-in space-y-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-semibold">Configure</h2>
                  <p className="text-foreground-secondary">Customize your audio</p>
                </div>
                <div className="flex gap-2">
                  <GlassButton variant="secondary" onClick={() => setActiveTab('upload')}>
                    Back
                  </GlassButton>
                  <GlassButton onClick={handleGenerate} disabled={isGenerating} icon={isGenerating ? undefined : Sparkles}>
                    {isGenerating ? 'Generating...' : 'Generate'}
                  </GlassButton>
                </div>
              </div>

              {/* Format Selection */}
              <GlassCard className="p-6" intensity="medium">
                <h3 className="text-sm font-medium text-foreground-tertiary uppercase tracking-wider mb-4">Format</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {FORMAT_TYPES.map(format => {
                    const Icon = format.icon
                    const isActive = settings.formatType === format.value
                    return (
                      <button
                        key={format.value}
                        onClick={() => setSettings(s => ({
                          ...s,
                          formatType: format.value,
                          numSpeakers: format.speakers.includes(s.numSpeakers) ? s.numSpeakers : format.speakers[0]
                        }))}
                        className={cn(
                          "p-4 rounded-xl border transition-all text-center backdrop-blur-sm",
                          isActive
                            ? "border-accent bg-accent/10 text-accent shadow-lg shadow-accent/10"
                            : "border-white/20 dark:border-white/10 hover:border-accent/30 hover:bg-white/20 dark:hover:bg-white/5"
                        )}
                      >
                        <Icon className="w-5 h-5 mx-auto mb-2" />
                        <p className="text-sm font-medium">{format.label}</p>
                      </button>
                    )
                  })}
                </div>
              </GlassCard>

              {/* Settings Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 overflow-visible">
                <GlassCard className="p-5 overflow-visible" intensity="light">
                  <GlassSelect
                    label="Style"
                    icon={Sparkles}
                    options={STYLES.map(s => ({ value: s, label: s }))}
                    value={settings.style}
                    onChange={style => setSettings(s => ({ ...s, style }))}
                  />
                  <p className="mt-2 text-xs text-foreground-muted">
                    {STYLE_DESCRIPTIONS[settings.style]}
                  </p>
                </GlassCard>

                <GlassCard className="p-5 overflow-visible" intensity="light">
                  <GlassSelect
                    label="Length"
                    options={LENGTHS.map(l => ({ value: l, label: l }))}
                    value={settings.length}
                    onChange={length => setSettings(s => ({ ...s, length }))}
                  />
                  <p className="mt-2 text-xs text-foreground-muted">
                    {LENGTH_DESCRIPTIONS[settings.length]}
                  </p>
                </GlassCard>

                <GlassCard className="p-5 overflow-visible" intensity="light">
                  <GlassSelect
                    label="Language"
                    options={LANGUAGES.map(l => ({ value: l, label: l }))}
                    value={settings.language}
                    onChange={language => setSettings(s => ({ ...s, language }))}
                  />
                </GlassCard>

                <GlassCard className="p-5" intensity="light">
                  <label className="block text-xs font-medium text-foreground-tertiary uppercase tracking-wider mb-3">
                    Speakers
                  </label>
                  <div className="flex gap-2">
                    {validSpeakers.map(num => (
                      <button
                        key={num}
                        onClick={() => setSettings(s => ({ ...s, numSpeakers: num }))}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all backdrop-blur-sm",
                          settings.numSpeakers === num
                            ? "bg-accent text-white shadow-lg shadow-accent/25"
                            : "bg-white/30 dark:bg-white/10 text-foreground-secondary hover:bg-white/50 dark:hover:bg-white/20"
                        )}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </GlassCard>
              </div>

              {/* Advanced Options */}
              <GlassCard className="p-6" intensity="medium">
                <h3 className="text-sm font-medium text-foreground-tertiary uppercase tracking-wider mb-4">Advanced</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <GlassInput
                    label="LLM Model"
                    value={settings.llmModel}
                    onChange={val => setSettings(s => ({ ...s, llmModel: val }))}
                    placeholder="Model name"
                    icon={Brain}
                  />
                  <GlassInput
                    label="Custom Instructions"
                    value={settings.customPreferences}
                    onChange={val => setSettings(s => ({ ...s, customPreferences: val }))}
                    placeholder="Focus on specific topics..."
                  />
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="vlm"
                    checked={settings.isVlm}
                    onChange={e => setSettings(s => ({ ...s, isVlm: e.target.checked }))}
                    className="w-5 h-5 rounded border-white/30 dark:border-white/20 text-accent focus:ring-accent bg-white/30"
                  />
                  <label htmlFor="vlm" className="text-sm text-foreground-secondary">
                    Enable Vision Mode (extract images from PDF)
                  </label>
                </div>
              </GlassCard>
            </div>
          )}

          {/* Player Tab */}
          {activeTab === 'player' && (
            <div className="animate-fade-in space-y-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {isGenerating ? 'Generating...' : generatedAudio ? 'Ready' : 'Player'}
                  </h2>
                  <p className="text-foreground-secondary">
                    {isGenerating ? 'Processing your PDF' : generatedAudio ? 'Your audio is ready' : 'Generate to listen'}
                  </p>
                </div>
                {!isGenerating && (
                  <GlassButton variant="secondary" onClick={() => setActiveTab('upload')}>
                    Back
                  </GlassButton>
                )}
              </div>

              <GlassCard className="p-8 sm:p-12" intensity="heavy">
                {isGenerating ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 mx-auto mb-8 rounded-full border-4 border-white/20 dark:border-white/10 border-t-accent animate-spin backdrop-blur-sm" />
                    <p className="text-lg font-medium mb-2">Generating audio...</p>
                    <p className="text-foreground-muted">
                      {progress.length > 0 ? progress[progress.length - 1].message : 'Starting up...'}
                    </p>
                  </div>
                ) : generatedAudio ? (
                  <AudioPlayer audioPath={generatedAudio.path} fileName={generatedAudio.name} />
                ) : (
                  <div className="text-center py-12 text-foreground-muted">
                    <Volume2 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Generate audio to see the player</p>
                  </div>
                )}
              </GlassCard>

              {progress.length > 0 && (
                <GlassCard className="p-4" intensity="light">
                  <h3 className="text-sm font-medium text-foreground-tertiary mb-3">Progress Log</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {progress.map((p, i) => (
                      <div key={i} className={cn(
                        "text-sm px-3 py-2 rounded-lg backdrop-blur-sm",
                        p.type === 'error' ? "bg-error/10 text-error" : "bg-white/20 dark:bg-white/5 text-foreground-secondary"
                      )}>
                        {p.message}
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}
            </div>
          )}
        </div>
      </main>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fade-in">
          <GlassCard className="w-full max-w-2xl p-6 max-h-[80vh] overflow-hidden flex flex-col animate-scale-in" intensity="heavy">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">History</h2>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/20 dark:hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {history.length === 0 ? (
                <p className="text-center text-foreground-muted py-8">No history yet</p>
              ) : (
                history.map(job => (
                  <GlassCard key={job.id} className="p-4 flex items-center gap-4" intensity="light" hover={false}>
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 backdrop-blur-sm",
                      job.status === 'done' ? "bg-success/20 text-success" :
                      job.status === 'error' ? "bg-error/20 text-error" :
                      "bg-accent/20 text-accent"
                    )}>
                      {job.status === 'done' ? <CheckCircle2 className="w-5 h-5" /> :
                       job.status === 'error' ? <AlertCircle className="w-5 h-5" /> :
                       <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{job.pdfName}</p>
                      <p className="text-sm text-foreground-muted">
                        {new Date(job.timestamp).toLocaleDateString()} · {job.settings.formatType}
                      </p>
                    </div>
                    {job.status === 'done' && job.audioPath && (
                      <GlassButton variant="secondary" onClick={() => {
                        setGeneratedAudio({ path: job.audioPath!, name: job.pdfName.replace('.pdf', '.wav'), outputDir: job.outputDir })
                        setActiveTab('player')
                        setShowHistory(false)
                      }}>
                        <Play className="w-4 h-4" />
                      </GlassButton>
                    )}
                    <button
                      onClick={() => setHistory(prev => prev.filter(j => j.id !== job.id))}
                      className="p-2 hover:bg-error/20 hover:text-error rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </GlassCard>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Config Modal - Enhanced with all settings */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fade-in">
          <GlassCard className="w-full max-w-2xl p-0 overflow-hidden animate-scale-in" intensity="heavy">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/10 dark:border-white/5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Settings</h2>
              <button onClick={() => setShowConfig(false)} className="p-2 hover:bg-white/20 dark:hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/10 dark:border-white/5">
              {[
                { id: 'llm', label: 'LLM', icon: Brain },
                { id: 'tts', label: 'TTS', icon: Mic },
                { id: 'voices', label: 'Voices', icon: Users },
                { id: 'general', label: 'General', icon: Settings },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveConfigTab(tab.id as typeof activeConfigTab)}
                  className={cn(
                    "flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors",
                    activeConfigTab === tab.id
                      ? "text-accent border-b-2 border-accent bg-accent/5"
                      : "text-foreground-secondary hover:text-foreground hover:bg-white/10"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {/* LLM Settings */}
              {activeConfigTab === 'llm' && (
                <div className="space-y-4 animate-fade-in">
                  <GlassInput
                    label="LLM API Base URL"
                    value={config.llmApiUrl}
                    onChange={val => setConfig(c => ({ ...c, llmApiUrl: val }))}
                    placeholder="http://localhost:11434/v1"
                    icon={Link}
                  />
                  <GlassInput
                    label="LLM API Key"
                    value={config.llmApiKey}
                    onChange={val => setConfig(c => ({ ...c, llmApiKey: val }))}
                    type="password"
                    placeholder="your-api-key"
                    icon={Key}
                  />
                  <div className="pt-2">
                    <p className="text-xs text-foreground-muted">
                      Configure your LLM provider (Ollama, OpenAI, etc.)
                    </p>
                  </div>
                </div>
              )}

              {/* TTS Settings */}
              {activeConfigTab === 'tts' && (
                <div className="space-y-4 animate-fade-in">
                  <GlassInput
                    label="TTS API Base URL"
                    value={config.ttsApiUrl}
                    onChange={val => setConfig(c => ({ ...c, ttsApiUrl: val }))}
                    placeholder="http://localhost:8880/v1"
                    icon={Link}
                  />
                  <GlassInput
                    label="TTS API Key"
                    value={config.ttsApiKey}
                    onChange={val => setConfig(c => ({ ...c, ttsApiKey: val }))}
                    type="password"
                    placeholder="your-api-key"
                    icon={Key}
                  />
                  <GlassInput
                    label="TTS Model Name"
                    value={config.ttsModel}
                    onChange={val => setConfig(c => ({ ...c, ttsModel: val }))}
                    placeholder="kokoro"
                    icon={Mic}
                  />
                </div>
              )}

              {/* Voice Settings */}
              {activeConfigTab === 'voices' && (
                <div className="space-y-4 animate-fade-in">
                  {['Speaker 1', 'Speaker 2', 'Speaker 3', 'Speaker 4', 'Speaker 5', 'Speaker 6'].map(speaker => (
                    <GlassInput
                      key={speaker}
                      label={speaker}
                      value={config.speakerVoices[speaker] || ''}
                      onChange={val => updateSpeakerVoice(speaker, val)}
                      placeholder="voice-name"
                      icon={Mic}
                    />
                  ))}
                  <div className="pt-2">
                    <p className="text-xs text-foreground-muted">
                      Configure voice assignments for each speaker
                    </p>
                  </div>
                </div>
              )}

              {/* General Settings */}
              {activeConfigTab === 'general' && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-foreground-tertiary uppercase tracking-wider mb-1.5">
                      <Folder className="w-3.5 h-3.5" />
                      Default Output Directory
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={config.defaultOutputDir}
                        readOnly
                        placeholder="Select a directory..."
                        className={cn(
                          "flex-1 px-4 py-2.5 rounded-xl text-sm",
                          "bg-white/40 dark:bg-white/5",
                          "border border-white/30 dark:border-white/10",
                          "placeholder:text-foreground-muted"
                        )}
                      />
                      <GlassButton variant="secondary" onClick={handleSelectOutputDir} icon={FolderOpen}>
                        Browse
                      </GlassButton>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-white/10 dark:border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <a
                  href="https://github.com/Goekdeniz-Guelmez/Local-NotebookLM"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-foreground-secondary hover:text-foreground transition-colors"
                >
                  <Github className="w-4 h-4" />
                  Local-NotebookLM
                </a>
                <a
                  href="https://github.com/sponsors/Goekdeniz-Guelmez"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-500/10 text-pink-500 hover:bg-pink-500/20 transition-colors text-sm font-medium"
                >
                  <Heart className="w-3.5 h-3.5" />
                  Sponsor
                </a>
              </div>
              <div className="flex gap-3">
                <GlassButton variant="secondary" onClick={() => setShowConfig(false)}>
                  Cancel
                </GlassButton>
                <GlassButton onClick={handleSaveConfig}>
                  Save Settings
                </GlassButton>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 py-3 px-6 text-center">
        <div className="flex items-center justify-center gap-4 text-xs text-foreground-muted">
          <span>Local-NotebookLM-App by Gökdeniz Gülmez</span>
          <span>·</span>
          <a
            href="https://github.com/Goekdeniz-Guelmez/Local-NotebookLM"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Backend on GitHub
          </a>
          <span>·</span>
          <a
            href="https://github.com/sponsors/Goekdeniz-Guelmez"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-pink-500 transition-colors"
          >
            <Heart className="w-3 h-3" />
            Sponsor
          </a>
        </div>
      </footer>
    </div>
  )
}

// Audio Player Component
function AudioPlayer({ audioPath, fileName }: { audioPath: string; fileName: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const togglePlay = () => {
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

  const handleExport = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.exportAudio({ sourcePath: audioPath, format: 'wav' })
  }

  const handleOpenFolder = () => {
    if (!window.electronAPI) return
    window.electronAPI.openInFolder(audioPath)
  }

  return (
    <div className="space-y-6">
      <audio
        ref={audioRef}
        src={`local-file://${audioPath}`}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="text-center">
        <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-accent/10 flex items-center justify-center backdrop-blur-sm shadow-glass">
          {isPlaying ? (
            <div className="flex gap-1">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-8 bg-accent rounded-full animate-pulse"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          ) : (
            <Volume2 className="w-10 h-10 text-accent" />
          )}
        </div>
        <p className="font-medium text-lg mb-1">{fileName}</p>
        <p className="text-foreground-muted text-sm">
          {formatTime(currentTime)} / {formatTime(duration)}
        </p>
      </div>

      <div className="space-y-4">
        <input
          type="range"
          min={0}
          max={duration || 1}
          value={currentTime}
          onChange={handleSeek}
          className="liquid-slider"
        />

        <div className="flex items-center justify-center gap-4">
          <GlassButton variant="secondary" onClick={handleOpenFolder} icon={FolderOpen}>
            Show Folder
          </GlassButton>
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent-hover hover:scale-105 transition-all shadow-lg shadow-accent/30"
          >
            {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
          </button>
          <GlassButton variant="secondary" onClick={handleExport} icon={Download}>
            Export
          </GlassButton>
        </div>
      </div>
    </div>
  )
}
