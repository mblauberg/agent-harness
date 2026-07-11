export function canonicaliseSchemaDirectory(
  inputDirectory: string,
  outputPath: string,
): Promise<{ outputPath: string; fileCount: number; sha256: string }>;
