import { MoonsenderPushError } from './errors'

/** The copy-paste config shown on the Moonsender control panel's project page. */
export interface MoonsenderConfig {
  /** Base URL of your Moonsender server's public push host, e.g. "https://links.example.com". */
  baseUrl: string
  /** Push project slug. */
  project: string
  /** Path of the service worker on YOUR origin. Defaults to "/moonsender-sw.js". */
  serviceWorkerPath?: string
}

export interface ResolvedConfig {
  baseUrl: string
  project: string
  serviceWorkerPath: string
}

let current: ResolvedConfig | null = null

/** Stores the config for all subsequent calls. Call once, before getToken(). */
export function init(config: MoonsenderConfig): void {
  const baseUrl = (config.baseUrl ?? '').trim().replace(/\/+$/, '')
  const project = (config.project ?? '').trim()
  if (baseUrl === '') {
    throw new MoonsenderPushError('invalid-config', 'init requires a non-empty baseUrl')
  }
  if (project === '') {
    throw new MoonsenderPushError('invalid-config', 'init requires a non-empty project')
  }

  current = {
    baseUrl,
    project,
    serviceWorkerPath: config.serviceWorkerPath ?? '/moonsender-sw.js',
  }
}

export function requireConfig(): ResolvedConfig {
  if (current === null) {
    throw new MoonsenderPushError('not-initialized', 'call init({ baseUrl, project }) first')
  }

  return current
}

export function resetForTests(): void {
  current = null
}
