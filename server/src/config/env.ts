declare global {
  interface ProcessEnv {
    NODE_ENV?: string
    PORT?: string
    DATABASE_URL?: string
    JWT_SECRET?: string
    JWT_EXPIRES_IN?: string
    CORS_ORIGIN?: string
    LOG_LEVEL?: string
    ENABLE_METRICS?: string
    HEALTH_READINESS_TIMEOUT_MS?: string

    JWT_COOKIE_NAME?: string
    JWT_COOKIE_SECURE?: string

    S3_BUCKET?: string
    S3_ACCESS_KEY_ID?: string
    S3_SECRET_ACCESS_KEY?: string
    S3_PUBLIC_BASE_URL?: string
    S3_REGION?: string
    S3_ENDPOINT?: string
    S3_SIGNED_URL_EXPIRATION_SECONDS?: string

    AZURE_STORAGE_CONNECTION_STRING?: string
    AZURE_STORAGE_CONTAINER_NAME?: string
    AZURE_STORAGE_PUBLIC_BASE_URL?: string
  }
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT) || 3001,
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  ENABLE_METRICS: process.env.ENABLE_METRICS !== 'false',
  HEALTH_READINESS_TIMEOUT_MS: (process.env.HEALTH_READINESS_TIMEOUT_MS && Number(process.env.HEALTH_READINESS_TIMEOUT_MS)) || 5000,
  JWT_COOKIE_NAME: process.env.JWT_COOKIE_NAME ?? 'session',
  JWT_COOKIE_SECURE: process.env.JWT_COOKIE_SECURE !== 'false',
  S3_BUCKET: process.env.S3_BUCKET,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
  S3_REGION: process.env.S3_REGION,
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_SIGNED_URL_EXPIRATION_SECONDS: process.env.S3_SIGNED_URL_EXPIRATION_SECONDS,
  AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING,
  AZURE_STORAGE_CONTAINER_NAME: process.env.AZURE_STORAGE_CONTAINER_NAME,
  AZURE_STORAGE_PUBLIC_BASE_URL: process.env.AZURE_STORAGE_PUBLIC_BASE_URL,
  isProd: process.env.NODE_ENV === 'production',
  
  get isConfigured(): boolean {
    return Boolean(this.DATABASE_URL && this.JWT_SECRET);
  },
}

if (!env.isConfigured) {
  console.warn('⚠️  Variables de entorno no configuradas correctamente');
  console.warn('   DATABASE_URL y JWT_SECRET son requeridas');
}
