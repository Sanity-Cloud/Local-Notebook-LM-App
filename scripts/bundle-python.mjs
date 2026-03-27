import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, createWriteStream, chmodSync, createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'
import { createGunzip } from 'node:zlib'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.dirname(__dirname)
const outputDir = path.join(rootDir, 'python-packages')
const pythonDir = path.join(rootDir, 'python-runtime')
const requirementsFile = path.join(rootDir, 'local_notebooklm', 'requirements.txt')

// Python Build Standalone versions - using 2025 releases for Python 3.13
const PYTHON_VERSION = '3.13.0'
const PYTHON_RELEASE_TAG = '20241016'  // Release tag for Python 3.13 builds
const PYTHON_BUILD_RELEASES = {
  darwin: {
    arm64: `https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_RELEASE_TAG}/cpython-${PYTHON_VERSION}+${PYTHON_RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz`,
    x64: `https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_RELEASE_TAG}/cpython-${PYTHON_VERSION}+${PYTHON_RELEASE_TAG}-x86_64-apple-darwin-install_only.tar.gz`,
  },
  linux: {
    x64: `https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_RELEASE_TAG}/cpython-${PYTHON_VERSION}+${PYTHON_RELEASE_TAG}-x86_64-unknown-linux-gnu-install_only.tar.gz`,
  },
  win32: {
    x64: `https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_RELEASE_TAG}/cpython-${PYTHON_VERSION}+${PYTHON_RELEASE_TAG}-x86_64-pc-windows-msvc-install_only.tar.gz`,
  },
}

function commandExists(command, args = []) {
  const result = spawnSync(command, [...args, '--version'], {
    stdio: 'ignore',
    shell: false,
  })
  return result.status === 0
}

function resolveBuildPythonCommand() {
  const envCommand = process.env.PYTHON_BIN
  if (envCommand) {
    return { command: envCommand, args: [] }
  }

  const candidates = process.platform === 'win32'
    ? [
        { command: 'py', args: ['-3'] },
        { command: 'python', args: [] },
        { command: 'python3', args: [] },
      ]
    : [
        { command: 'python3', args: [] },
        { command: 'python', args: [] },
      ]

  for (const candidate of candidates) {
    if (commandExists(candidate.command, candidate.args)) {
      return candidate
    }
  }

  throw new Error(
    'Unable to find a Python executable for building. Set PYTHON_BIN to a working Python command and try again.'
  )
}

function getPlatformInfo() {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin') {
    return { platform: 'darwin', arch: arch === 'arm64' ? 'arm64' : 'x64' }
  } else if (platform === 'linux') {
    return { platform: 'linux', arch: 'x64' }
  } else if (platform === 'win32') {
    return { platform: 'win32', arch: 'x64' }
  }
  throw new Error(`Unsupported platform: ${platform}`)
}

async function downloadFile(url, dest) {
  console.log(`Downloading Python runtime from ${url}...`)
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    https.get(url, { timeout: 120000 }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close()
        rmSync(dest, { force: true })
        downloadFile(response.headers.location, dest).then(resolve).catch(reject)
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`))
        return
      }
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      rmSync(dest, { force: true })
      reject(err)
    })
  })
}

async function extractPythonRuntime() {
  const { platform, arch } = getPlatformInfo()

  // Skip download if python-runtime already has a working Python binary
  const existingPythonExe = platform === 'win32'
    ? path.join(pythonDir, 'python.exe')
    : path.join(pythonDir, 'bin', 'python3.13')
  if (existsSync(existingPythonExe)) {
    console.log('Existing Python runtime found — skipping download.')
    return
  }

  const url = PYTHON_BUILD_RELEASES[platform]?.[arch]

  if (!url) {
    throw new Error(`No Python runtime available for ${platform} ${arch}`)
  }

  const downloadPath = path.join(rootDir, 'python-runtime.tar.gz')

  // Download if not already cached
  if (!existsSync(downloadPath)) {
    await downloadFile(url, downloadPath)
  } else {
    console.log('Using cached Python runtime...')
  }

  // Clean up existing runtime
  if (existsSync(pythonDir)) {
    rmSync(pythonDir, { recursive: true, force: true })
  }
  mkdirSync(pythonDir, { recursive: true })

  // Extract using platform tar command
  console.log('Extracting Python runtime...')

  const extractResult = spawnSync(
    platform === 'win32' ? 'tar' : 'tar',
    ['-xzf', downloadPath, '-C', pythonDir, '--strip-components=1'],
    { stdio: 'inherit', shell: false }
  )

  if (extractResult.status !== 0) {
    // Fallback: try with Node.js built-in zlib + manual extraction
    console.log('Trying fallback extraction...')
    const tarPath = path.join(rootDir, 'python-runtime.tar')

    // Decompress .gz
    await new Promise((resolve, reject) => {
      const gunzip = createGunzip()
      const source = createReadStream(downloadPath)
      const dest = createWriteStream(tarPath)

      source.pipe(gunzip).pipe(dest)
      dest.on('finish', resolve)
      dest.on('error', reject)
      gunzip.on('error', reject)
    })

    // Extract tar
    const tarResult = spawnSync('tar', ['-xf', tarPath, '-C', pythonDir, '--strip-components=1'], {
      stdio: 'inherit',
      shell: false,
    })

    rmSync(tarPath, { force: true })

    if (tarResult.status !== 0) {
      throw new Error('Failed to extract Python runtime')
    }
  }

  // Clean up
  rmSync(downloadPath, { force: true })

  // Make python executable on Unix
  if (platform !== 'win32') {
    const pythonExe = path.join(pythonDir, 'bin', 'python3')
    if (existsSync(pythonExe)) {
      chmodSync(pythonExe, 0o755)
    }
  }

  console.log('Python runtime extracted.')
}

function getBundledPythonCommand() {
  const { platform } = getPlatformInfo()
  if (platform === 'win32') {
    return path.join(pythonDir, 'python.exe')
  }
  return path.join(pythonDir, 'bin', 'python3')
}

function pruneCompiledArtifacts(directory) {
  if (!existsSync(directory)) {
    return
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === '__pycache__') {
        rmSync(entryPath, { recursive: true, force: true })
        continue
      }
      pruneCompiledArtifacts(entryPath)
      continue
    }

    if (entry.name.endsWith('.pyc')) {
      rmSync(entryPath, { force: true })
    }
  }
}

async function installPackages() {
  const pythonCmd = getBundledPythonCommand()

  console.log(`Installing packages into ${outputDir}...`)

  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })

  // First ensure pip is available
  const ensurePipResult = spawnSync(
    pythonCmd,
    ['-m', 'ensurepip', '--upgrade'],
    { stdio: 'inherit', shell: false }
  )

  // Install packages using the bundled Python
  const installResult = spawnSync(
    pythonCmd,
    [
      '-m', 'pip',
      'install',
      '--target', outputDir,
      '--upgrade',
      '-r', requirementsFile,
    ],
    {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
    }
  )

  if (installResult.status !== 0) {
    throw new Error(`Package installation failed with code ${installResult.status}`)
  }

  pruneCompiledArtifacts(outputDir)
}

async function run() {
  try {
    // Step 1: Download and extract standalone Python
    await extractPythonRuntime()

    // Step 2: Install packages
    await installPackages()

    // Step 3: Copy local_notebooklm module to output
    const localModuleSrc = path.join(rootDir, 'local_notebooklm')
    const localModuleDst = path.join(outputDir, 'local_notebooklm')

    // Use cp -r for copying (cross-platform via Node's fs or shell)
    const cpResult = spawnSync(
      process.platform === 'win32' ? 'xcopy' : 'cp',
      process.platform === 'win32'
        ? ['/s', '/e', '/i', localModuleSrc, localModuleDst]
        : ['-r', localModuleSrc, localModuleDst],
      { stdio: 'ignore', shell: false }
    )

    console.log('Done. Python runtime and packages bundled.')
    console.log(`  Python: ${pythonDir}`)
    console.log(`  Packages: ${outputDir}`)
  } catch (error) {
    console.error('Error bundling Python:', error.message)
    process.exit(1)
  }
}

run()