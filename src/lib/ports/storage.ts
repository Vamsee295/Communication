/**
 * Object-storage port. Chat media is not implemented yet; profiles store avatar_url as a URL string.
 * Phase 6 will persist metadata (object key, MIME, size) outside PostgreSQL blobs.
 */
export type ObjectMetadata = {
  id: string;
  ownerId: string;
  conversationId?: string;
  objectKey: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export interface StorageService {
  publicUrl(bucket: string, objectKey: string): string | null;
}
