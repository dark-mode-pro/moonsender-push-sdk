export type MoonsenderPushErrorCode =
  | 'not-initialized'
  | 'unsupported'
  | 'permission-blocked'
  | 'subscribe-failed'
  | 'request-failed'

/** Every SDK failure surfaces as this error; branch on `code`, not on message text. */
export class MoonsenderPushError extends Error {
  readonly code: MoonsenderPushErrorCode

  constructor(code: MoonsenderPushErrorCode, message: string) {
    super(message)
    this.name = 'MoonsenderPushError'
    this.code = code
  }
}
