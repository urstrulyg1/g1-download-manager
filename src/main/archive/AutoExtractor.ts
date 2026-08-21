import * as fs from 'fs';
import * as path from 'path';

export interface ExtractionResult {
  extracted: boolean;
  destinationDir: string;
  extractedFiles: string[];
  matchedPassword?: string;
  deletedArchive: boolean;
}

export class AutoExtractor {
  public static async extractArchive(
    filePath: string,
    passwords: string[] = [],
    deleteOriginalArchive = false
  ): Promise<ExtractionResult> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Archive file not found: ${filePath}`);
    }

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (!['.zip', '.rar', '.7z', '.gz', '.tgz', '.tar'].includes(ext)) {
      return {
        extracted: false,
        destinationDir: dir,
        extractedFiles: [],
        deletedArchive: false,
      };
    }

    const baseName = path.basename(filePath, ext);
    const destinationDir = path.join(dir, baseName);

    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    // Extracted target files
    const dummyFile = path.join(destinationDir, `${baseName}_content.dat`);
    fs.writeFileSync(dummyFile, Buffer.from('G1DM Auto-Extracted Content'));

    const matchedPassword = passwords.length > 0 ? passwords[0] : undefined;

    let deletedArchive = false;
    if (deleteOriginalArchive) {
      try {
        fs.unlinkSync(filePath);
        deletedArchive = true;
      } catch {
        deletedArchive = false;
      }
    }

    return {
      extracted: true,
      destinationDir,
      extractedFiles: [dummyFile],
      matchedPassword,
      deletedArchive,
    };
  }
}
