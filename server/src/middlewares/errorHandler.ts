import type { Request, Response, NextFunction } from 'express'

/**
 * Clase de error personalizada para la aplicación.
 * Permite establecer un código de estado HTTP específico y datos adicionales.
 */
export class AppError extends Error {
  public readonly status: number
  public readonly code?: string
  public readonly details?: unknown

  constructor(
    message: string,
    status?: number,
    options?: { code?: string; details?: unknown } & Record<string, unknown>,
  ) {
    super(message)
    this.status = status ?? 500
    // Dos formas de llamada conviven en el código: `AppError(msg, 400, details)`
    // (objeto de detalles posicional, usado por las validaciones) y
    // `AppError(msg, 403, { code, details })` (opciones con nombre). Ambas
    // conservan la información sin cambiar a los llamadores.
    if (options) {
      if ('code' in options || 'details' in options) {
        this.code = options.code
        this.details = options.details
      } else {
        this.details = options
      }
    }
    this.name = 'AppError'
  }
}

export function errorHandler(err: unknown, req: Request & { requestId?: string }, res: Response, _next: NextFunction): void {
  console.error(JSON.stringify({
    level: 'error',
    event: 'unhandled_error',
    error: err instanceof Error ? err.message : 'unknown',
    stack: err instanceof Error ? err.stack : undefined,
    timestamp: new Date().toISOString(),
  }))

  const status = (err instanceof Error && 'status' in err ? (err as { status: number }).status : 500) as number
  const code = err instanceof AppError ? err.code : undefined
  const details = err instanceof AppError ? err.details : undefined
  res.status(status).json({
    error: true,
    message: err instanceof Error ? err.message : 'Error interno del servidor',
    // Campos adicionales solo cuando existen: la respuesta anterior
    // { error, message } sigue siendo válida para los clientes.
    ...(code !== undefined ? { code } : {}),
    ...(details !== undefined ? { details } : {}),
  })
}