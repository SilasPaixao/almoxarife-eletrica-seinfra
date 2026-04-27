import fs from 'fs-extra';
import path from 'path';

export class StorageService {
  static async uploadFile(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<string> {
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', bucket);
      await fs.ensureDir(uploadDir);
      
      const filePath = path.join(uploadDir, path.basename(key));
      await fs.writeFile(filePath, buffer);
      
      return `/uploads/${bucket}/${path.basename(key)}`;
    } catch (error) {
      console.error('Storage Error:', error);
      // Fallback or rethrow
      throw error;
    }
  }
}
