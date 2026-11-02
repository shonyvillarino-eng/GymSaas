export class SupabaseError extends Error {
  readonly code?: string
  readonly message: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'SupabaseError'
    this.message = message
    this.code = code
  }
}
