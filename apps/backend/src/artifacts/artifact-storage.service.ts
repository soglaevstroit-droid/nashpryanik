import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { Client } from 'minio';
import { AppConfigService } from '../config/app-config.service.js';
import { UploadedArtifactFile } from './uploaded-artifact-file.js';

@Injectable()
export class ArtifactStorageService {
  private readonly bucket: string;
  private readonly client: Client;
  private bucketReady = false;

  constructor(config: AppConfigService) {
    const minio = config.minio;

    this.bucket = minio.bucket;
    this.client = new Client({
      endPoint: minio.endPoint,
      port: minio.port,
      useSSL: minio.useSSL,
      accessKey: minio.accessKey,
      secretKey: minio.secretKey,
    });
  }

  async uploadPhoto(storageKey: string, file: UploadedArtifactFile): Promise<void> {
    await this.ensureBucket();
    await this.client.putObject(this.bucket, storageKey, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });
  }

  async getObject(storageKey: string): Promise<Readable> {
    return this.client.getObject(this.bucket, storageKey);
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, storageKey);
  }

  generatePhotoStorageKey(userId: string, originalFileName: string): string {
    const extension = safeExtension(originalFileName);

    return `photos/${userId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
  }

  generatePreviewStorageKey(originalStorageKey: string): string {
    const extensionIndex = originalStorageKey.lastIndexOf('.');
    const base =
      extensionIndex > originalStorageKey.lastIndexOf('/')
        ? originalStorageKey.slice(0, extensionIndex)
        : originalStorageKey;
    return `${base}.preview.jpg`;
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) {
      return;
    }

    const exists = await this.client.bucketExists(this.bucket);

    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }

    this.bucketReady = true;
  }
}

function safeExtension(fileName: string): string {
  const extension = extname(fileName).toLowerCase();

  if (
    extension === '.jpg' ||
    extension === '.jpeg' ||
    extension === '.png' ||
    extension === '.webp'
  ) {
    return extension;
  }

  return '';
}
