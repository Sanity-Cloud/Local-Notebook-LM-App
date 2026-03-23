import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.dirname(__dirname)
const outputDir = path.join(rootDir, 'python-packages')
const requirementsFile = path.join(rootDir, 'local_notebooklm', 'requirements.txt')

function commandExists(command, args = []) {
  const result = spawnSync(command, [...args, '--version'], {
    stdio: 'ignore',
    shell: false,
  })

  return result.status === 0
}

function resolvePythonCommand() {
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
    'Unable to find a Python executable. Set PYTHON_BIN to a working Python command and try again.'
  )
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

function run() {
  const python = resolvePythonCommand()

  console.log(`Bundling Python packages into ${outputDir}...`)

  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })

  const installResult = spawnSync(
    python.command,
    [
      ...python.args,
      '-m',
      'pip',
      'install',
      '--target',
      outputDir,
      '--upgrade',
      '-r',
      requirementsFile,
    ],
    {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
    }
  )

  if (installResult.status !== 0) {
    process.exit(installResult.status ?? 1)
  }

  pruneCompiledArtifacts(outputDir)

  console.log('Done. Packages bundled to python-packages/')
}

run()