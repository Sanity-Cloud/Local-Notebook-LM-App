import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from 'electron'
import { spawn, execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

// Register local-file:// as a privileged scheme so the renderer can load
// audio/video from the user's filesystem without hitting Electron's CSP block.
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { secure: true, supportFetchAPI: true, stream: true } },
])

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development'

// Get the app data directory for storing app data
const APP_DATA_DIR = app.getPath('userData')
const CONFIG_FILE = path.join(APP_DATA_DIR, 'config.json')
const DEFAULT_OUTPUT_DIR = path.join(APP_DATA_DIR, 'outputs')

// Default configuration
const DEFAULT_CONFIG = {
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
  defaultOutputDir: DEFAULT_OUTPUT_DIR,
}

// Ensure app directories exist
if (!fs.existsSync(APP_DATA_DIR)) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true })
}
if (!fs.existsSync(DEFAULT_OUTPUT_DIR)) {
  fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true })
}

// Load or create config
function loadConfig(): typeof DEFAULT_CONFIG {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      return { ...DEFAULT_CONFIG, ...saved }
    } catch {
      return DEFAULT_CONFIG
    }
  }
  saveConfig(DEFAULT_CONFIG)
  return DEFAULT_CONFIG
}

function saveConfig(config: typeof DEFAULT_CONFIG) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

type PythonCommand = {
  command: string
  args: string[]
}

function canRunPython(command: string, args: string[] = []): boolean {
  try {
    execSync([command, ...args, '--version'].join(' '), { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Get the bundled Python runtime path
function getBundledPythonPath(): string | null {
  // In packaged app, Python runtime is in resources/python-runtime
  if (app.isPackaged) {
    const runtimePath = path.join(process.resourcesPath, 'python-runtime')
    const pythonExe = process.platform === 'win32'
      ? path.join(runtimePath, 'python.exe')
      : path.join(runtimePath, 'bin', 'python3')

    if (fs.existsSync(pythonExe)) {
      return pythonExe
    }
  }

  // In development, check for locally bundled python-runtime
  const devRuntimePath = path.join(__dirname, '..', 'python-runtime')
  const devPythonExe = process.platform === 'win32'
    ? path.join(devRuntimePath, 'python.exe')
    : path.join(devRuntimePath, 'bin', 'python3')

  if (fs.existsSync(devPythonExe)) {
    return devPythonExe
  }

  return null
}

// Detect Python executable - prefer bundled, fallback to system
function getPythonCommand(): PythonCommand {
  // First try the bundled Python runtime
  const bundledPython = getBundledPythonPath()
  if (bundledPython && canRunPython(bundledPython)) {
    console.log('Using bundled Python:', bundledPython)
    return { command: bundledPython, args: [] }
  }

  // Fallback to system Python
  const candidates: PythonCommand[] = []

  if (process.platform === 'win32') {
    candidates.push(
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] }
    )
  } else {
    candidates.push(
      { command: 'python3', args: [] },
      { command: 'python', args: [] }
    )
  }

  for (const candidate of candidates) {
    if (canRunPython(candidate.command, candidate.args)) {
      console.log('Using system Python:', candidate.command)
      return candidate
    }
  }

  // Last resort - return a default that will fail with helpful error
  throw new Error(
    'Python not found. The app requires Python to be installed, or it should be bundled with the app.'
  )
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  protocol.handle('local-file', (request) => {
    const filePath = decodeURIComponent(request.url.slice('local-file://'.length))

    if (!fs.existsSync(filePath)) {
      return new Response('File not found', { status: 404 })
    }

    const stat = fs.statSync(filePath)
    const fileSize = stat.size

    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
    }
    const contentType = mimeTypes[ext] || 'application/octet-stream'

    const rangeHeader = request.headers.get('Range')
    let start = 0
    let end = fileSize - 1
    let status = 200

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      if (match) {
        start = match[1] ? parseInt(match[1]) : 0
        end = match[2] ? parseInt(match[2]) : fileSize - 1
        end = Math.min(end, fileSize - 1)
        status = 206
      }
    }

    const chunkSize = end - start + 1
    const buffer = Buffer.alloc(chunkSize)
    const fd = fs.openSync(filePath, 'r')
    fs.readSync(fd, buffer, 0, chunkSize, start)
    fs.closeSync(fd)

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': chunkSize.toString(),
      'Accept-Ranges': 'bytes',
    }
    if (status === 206) {
      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`
    }

    return new Response(buffer, { status, headers })
  })
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// IPC handlers
// Config IPC handlers
ipcMain.handle('get-config', () => {
  return loadConfig()
})

ipcMain.handle('save-config', (_, config) => {
  saveConfig(config)
  return { success: true }
})

ipcMain.handle('select-pdf', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    const stats = fs.statSync(filePath)
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
    }
  }
  return null
})

ipcMain.handle('select-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
  })

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('read-transcript', async (_, outputDir: string) => {
  const transcriptPath = path.join(outputDir, 'transcript.json')
  if (fs.existsSync(transcriptPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'))
      return { success: true, transcript: data }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }
  return { success: false, error: 'Transcript not found' }
})

ipcMain.handle('save-transcript', async (_, params: { outputDir: string; transcript: any[] }) => {
  const { outputDir, transcript } = params
  const transcriptPath = path.join(outputDir, 'transcript.json')
  fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2))
  return { success: true }
})

ipcMain.handle('generate-audio', async (event, params) => {
  const {
    pdfPath,
    outputDir,
    llmModel,
    language,
    formatType,
    style,
    length,
    numSpeakers,
    customPreferences,
    isVlm,
    transcriptFile,
    config,
  } = params

  const appConfig = config || loadConfig()

  // If outputDir is explicitly provided (e.g. regeneration), use it as-is.
  // Otherwise create a timestamped job subdir so each generation is isolated.
  let outputPath: string
  if (outputDir) {
    outputPath = outputDir
  } else {
    const jobId = Date.now().toString()
    outputPath = path.join(appConfig.defaultOutputDir, jobId)
  }

  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true })
  }

  // Get Python command - handle errors gracefully
  let python: PythonCommand
  try {
    python = getPythonCommand()
  } catch (error) {
    return {
      success: false,
      error: 'Python runtime not found. Please ensure Python is installed on your system, or use the bundled version of this app.',
    }
  }

  const args = [
    ...python.args,
    '-m', 'local_notebooklm.make_audio',
    '--pdf', pdfPath,
    '--output_dir', outputPath,
    '--llm_model', llmModel || 'gemini-3-flash-preview:cloud',
    '--language', language || 'english',
    '--format_type', formatType || 'podcast',
    '--style', style || 'normal',
    '--length', length || 'medium',
    '--num_speakers', String(numSpeakers || 2),
  ]

  if (isVlm) {
    args.push('--is-vlm')
  }

  if (customPreferences) {
    args.push('--custom_preferences', customPreferences)
  }

  if (transcriptFile) {
    args.push('--transcript_file', transcriptFile)
  }

  return new Promise((resolve, reject) => {
    // Determine Python paths
    const isBundled = !!getBundledPythonPath()
    const pythonPackagesDir = app.isPackaged
      ? path.join(process.resourcesPath, 'python-packages')
      : path.join(__dirname, '..', 'python-packages')

    const pythonPathEntries = [
      pythonPackagesDir,
      process.env.PYTHONPATH || '',
    ].filter(Boolean)

    // Set up environment
    const env: Record<string, string> = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONPATH: pythonPathEntries.join(path.delimiter),
      PYTHONNOUSERSITE: '1',
      LLM_API_URL: appConfig.llmApiUrl,
      LLM_API_KEY: appConfig.llmApiKey || 'not-needed',
      TTS_API_URL: appConfig.ttsApiUrl,
      TTS_API_KEY: appConfig.ttsApiKey || 'not-needed',
      TTS_MODEL: appConfig.ttsModel || 'kokoro',
      TTS_VOICE_MODEL: appConfig.ttsVoiceModel || 'alloy',
      SPEAKER_VOICES: JSON.stringify(appConfig.speakerVoices || {}),
    }

    // For bundled Python, set HOME to app data dir to avoid permission issues
    if (isBundled) {
      env.HOME = APP_DATA_DIR
      env.PYTHONHOME = app.isPackaged
        ? path.join(process.resourcesPath, 'python-runtime')
        : path.join(__dirname, '..', 'python-runtime')
    }

    const pythonProcess = spawn(python.command, args, { env, shell: false })

    let stdout = ''
    let stderr = ''

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString()
      const lines = data.toString().split('\n').filter((l: string) => l.trim())
      lines.forEach((line: string) => {
        event.sender.send('generation-progress', { type: 'info', message: line })
      })
    })

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString()
      const lines = data.toString().split('\n').filter((l: string) => l.trim())
      lines.forEach((line: string) => {
        event.sender.send('generation-progress', { type: 'error', message: line })
      })
    })

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // Find the generated audio file
        const files = fs.readdirSync(outputPath)
        const audioFiles = files.filter((f: string) =>
          f.endsWith('.wav') || f.endsWith('.mp3') || f.endsWith('.m4a')
        )

        if (audioFiles.length > 0) {
          const latestFile = audioFiles
            .map((f: string) => ({
              name: f,
              path: path.join(outputPath, f),
              mtime: fs.statSync(path.join(outputPath, f)).mtime,
            }))
            .sort((a: any, b: any) => b.mtime.getTime() - a.mtime.getTime())[0]

          resolve({
            success: true,
            outputPath: latestFile.path,
            fileName: latestFile.name,
            outputDir: outputPath,
          })
        } else {
          resolve({
            success: true,
            outputPath,
            outputDir: outputPath,
            message: 'Generation complete but no audio file found',
          })
        }
      } else {
        reject(new Error(`Process exited with code ${code}: ${stderr}`))
      }
    })

    pythonProcess.on('error', (error) => {
      reject(error)
    })
  })
})

ipcMain.handle('get-audio-file', async (_, filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      let mimeType = 'audio/wav'
      if (ext === '.mp3') mimeType = 'audio/mpeg'
      if (ext === '.m4a') mimeType = 'audio/mp4'

      return {
        success: true,
        data: data.toString('base64'),
        mimeType,
        fileName: path.basename(filePath),
      }
    }
    return { success: false, error: 'File not found' }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('export-audio', async (_, params: { sourcePath: string; format: 'wav' | 'mp3' }) => {
  const { sourcePath, format } = params

  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: `exported_audio.${format}`,
    filters: [
      { name: format.toUpperCase(), extensions: [format] },
    ],
  })

  if (!result.canceled && result.filePath) {
    try {
      // If same format, just copy. If different, would need conversion
      fs.copyFileSync(sourcePath, result.filePath)
      return { success: true, path: result.filePath }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }
  return { success: false, error: 'User cancelled' }
})

ipcMain.handle('open-in-folder', async (_, filePath: string) => {
  shell.showItemInFolder(filePath)
})
