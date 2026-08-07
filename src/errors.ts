export type MoonsenderPushErrorCode =
  | 'not-initialized'
  | 'invalid-config'
  | 'unsupported'
  | 'permission-blocked'
  | 'permission-dismissed'
  | 'subscribe-failed'
  | 'request-failed'

export interface MoonsenderPushErrorOptions {
  /** HTTP status of the failing response. Absent when the request never reached the server. */
  status?: number
}

/** Every SDK failure surfaces as this error; branch on `code`, not on message text. */
export class MoonsenderPushError extends Error {
  readonly code: MoonsenderPushErrorCode
  /**
   * Set on `request-failed` when the server answered: 404 means the project slug is unknown (or
   * is a Firebase project, which has no public subscribe endpoint), 5xx is server-side. Absent
   * when the request never got a response at all — that is the offline case.
   */
  readonly status?: number

  constructor(
    code: MoonsenderPushErrorCode,
    message: string,
    options?: MoonsenderPushErrorOptions,
  ) {
    super(message)
    this.name = 'MoonsenderPushError'
    this.code = code
    // Left genuinely absent rather than present-and-undefined (exactOptionalPropertyTypes).
    if (options?.status !== undefined) this.status = options.status
  }
}
