import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { AppError } from '../middlewares/errorHandler.js';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const allowedMimeTypes = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

let client: S3Client | null = null;

function getStorageConfig() {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY || !env.S3_PUBLIC_BASE_URL) {
    throw new AppError('Image storage is not configured. Set the S3_* server environment variables.', 503);
  }
  return {
    bucket: env.S3_BUCKET,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL.replace(/\/$/, ''),
  };
}

function getClient() {
  if (!client) {
    const { S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_ENDPOINT } = env;
    if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new AppError('Image storage is not configured.', 503);
    client = new S3Client({
      region: S3_REGION,
      ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT } : {}),
      forcePathStyle: Boolean(S3_ENDPOINT),
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

function hasExpectedSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export async function uploadGymLogo(gymId: string, file: { buffer: Buffer; mimetype: string; size: number }) {
  return uploadTenantImage(`gyms/${gymId}/logo`, file);
}

/** Instructor photograph: tenant-scoped and validated like other profile images. */
export async function uploadInstructorPhoto(gymId: string, instructorId: string, file: { buffer: Buffer; mimetype: string; size: number }) {
  return uploadTenantImage(`gyms/${gymId}/instructors/${instructorId}/photo`, file);
}

/** Member photograph: same validation and storage rules as the gym logo. */
export async function uploadMemberPhoto(
  gymId: string,
  memberId: string,
  file: { buffer: Buffer; mimetype: string; size: number }
) {
  return uploadTenantImage(`gyms/${gymId}/members/${memberId}/photo`, file);
}

async function uploadTenantImage(prefix: string, file: { buffer: Buffer; mimetype: string; size: number }) {
  if (file.size <= 0 || file.size > MAX_LOGO_BYTES || file.buffer.length > MAX_LOGO_BYTES) {
    throw new AppError('Image must be no larger than 2 MB.', 413);
  }
  const extension = allowedMimeTypes.get(file.mimetype);
  if (!extension || !hasExpectedSignature(file.buffer, file.mimetype)) {
    throw new AppError('Image must be a valid PNG, JPEG, or WebP file.', 400);
  }
  const { bucket, publicBaseUrl } = getStorageConfig();
  const key = `${prefix}/${randomUUID()}.${extension}`;
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentLength: file.size,
    ContentType: file.mimetype,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { key, url: `${publicBaseUrl}/${key}` };
}
