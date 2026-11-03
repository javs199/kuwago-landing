import type { Locale, Provenance } from '../../../../packages/contracts/src/models.js';

export const mediaStates = ['quarantine', 'validated', 'approved', 'rejected', 'retired', 'deleted'] as const;
export type MediaState = typeof mediaStates[number];
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export const imagePolicy = {
  maxBytes: 2_097_152, maxDimension: 4096, maxPixels: 8_000_000,
  maxImagesPerRevision: 8, uploadTimeoutSeconds: 30,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as readonly ImageMime[],
} as const;
// Private storage DTO; never serialize this as PublicMediaAsset.
export type PrivateMediaRecord = {
  id: string; state: MediaState; provenance: Provenance;
  privateObjectKey: string; derivativeObjectKey: string | null;
  sha256: string | null; mimeType: ImageMime | null; byteSize: number | null;
  width: number | null; height: number | null;
  uploadedBy: string; reviewedBy: string | null;
  usageApproval: 'pending' | 'approved';
};
export type RevisionMedia = { mediaId: string; sortOrder: number; alt: Record<Locale, string> };
export type MediaPermission = 'media:upload' | 'media:read-private' | 'media:approve' | 'media:cleanup';
export interface PrivateImageStorage {
  // Trusted server creates the record/key only AFTER authentication and authorization.
  quarantine(input: { generatedId: string; principalId: string; body: ReadableStream<Uint8Array>; declaredMime: ImageMime }): Promise<PrivateMediaRecord>;
  readAuthorized(id: string, principalId: string): Promise<{ body: ReadableStream<Uint8Array>; mimeType: ImageMime }>;
  // Planning only: cleanup implementation must re-check all references immediately before deletion.
  planCleanup(now: string): Promise<readonly { mediaId: string; reason: 'expired-quarantine' | 'unreferenced-retired' }[]>;
}
export function privateObjectKey(generatedId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(generatedId)) throw new Error('invalid_generated_media_id');
  return `development/quarantine/${generatedId}`;
}
// Only a trusted, fully decoding/normalizing server implementation may construct this input.
// This validates its result metadata; it does not decode files or validate client-supplied claims.
export type DecodedImageResult = {
  mimeType: string; byteSize: number; width: number; height: number;
  fullyDecoded: boolean; metadataStripped: boolean;
};
export function validateDecodedImage(result: DecodedImageResult): readonly string[] {
  const errors: string[] = [];
  if (!imagePolicy.allowedMimeTypes.includes(result.mimeType as ImageMime)) errors.push('unsupported_mime');
  if (!Number.isSafeInteger(result.byteSize) || result.byteSize < 1 || result.byteSize > imagePolicy.maxBytes) errors.push('invalid_byte_size');
  if (![result.width, result.height].every(v => Number.isSafeInteger(v) && v > 0 && v <= imagePolicy.maxDimension) || result.width * result.height > imagePolicy.maxPixels) errors.push('invalid_dimensions');
  if (!result.fullyDecoded || !result.metadataStripped) errors.push('decoder_verification_required');
  return errors;
}
export function canTransitionMedia(from: MediaState, to: MediaState): boolean {
  const allowed: Record<MediaState, readonly MediaState[]> = {
    quarantine: ['validated', 'rejected'], validated: ['approved', 'rejected'],
    approved: ['retired'], rejected: ['deleted'], retired: ['deleted'], deleted: [],
  };
  return allowed[from].includes(to);
}
