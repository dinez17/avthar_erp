import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { ValidationError } from '@tiles-erp/shared';
import { CONFIG_TOKEN, type AppConfig } from '../config/configuration';

export interface StoredFile {
  originalName: string;
  storedName: string;
  path: string;
  mimeType: string;
  size: number;
}

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Local-disk file storage helper with size and MIME validation. */
@Injectable()
export class UploadService {
  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {}

  async store(
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    subdir = '',
  ): Promise<StoredFile> {
    if (file.size > this.config.upload.maxFileSize) {
      throw new ValidationError('File exceeds maximum allowed size');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new ValidationError(`Unsupported file type: ${file.mimetype}`);
    }

    const targetDir = join(this.config.upload.dir, subdir);
    await mkdir(targetDir, { recursive: true });
    const storedName = `${randomUUID()}${extname(file.originalname)}`;
    const fullPath = join(targetDir, storedName);
    await writeFile(fullPath, file.buffer);

    return {
      originalName: file.originalname,
      storedName,
      path: fullPath,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
