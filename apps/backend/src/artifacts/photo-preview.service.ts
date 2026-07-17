import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { UploadedArtifactFile } from './uploaded-artifact-file.js';

export const previewMaxSide = 1280;
export const previewJpegQuality = 80;

export interface GeneratedPhotoPreview {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  extension: 'jpg';
  width: number;
  height: number;
}

@Injectable()
export class PhotoPreviewService {
  async generate(file: UploadedArtifactFile): Promise<GeneratedPhotoPreview | null> {
    const { data, info } = await sharp(file.buffer, { failOn: 'error' })
      .rotate()
      .flatten({ background: '#f5f6f7' })
      .resize({
        width: previewMaxSide,
        height: previewMaxSide,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: previewJpegQuality,
        progressive: true,
        chromaSubsampling: '4:2:0',
      })
      .toBuffer({ resolveWithObject: true });

    if (data.length >= file.size) return null;

    return {
      buffer: data,
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: info.width,
      height: info.height,
    };
  }
}
