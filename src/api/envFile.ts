import { existsSync } from 'node:fs';
import process from 'node:process';

export interface LoadEnvFileOptions {
  envFilePath?: string;
  exists?: (path: string) => boolean;
  loadEnvFile?: (path: string) => void;
}

export function loadEnvFileIfPresent(options: LoadEnvFileOptions = {}): boolean {
  const envFilePath = options.envFilePath ?? '.env';
  const exists = options.exists ?? existsSync;
  const loadEnvFile = options.loadEnvFile ?? process.loadEnvFile;

  if (!exists(envFilePath)) {
    return false;
  }

  loadEnvFile(envFilePath);
  return true;
}
