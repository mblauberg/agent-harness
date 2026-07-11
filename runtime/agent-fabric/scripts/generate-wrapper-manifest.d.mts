export function createWrapperManifest(input: {
  entrypoint: string;
  outputPath: string;
  pathBase: string;
}): Promise<{ outputPath: string; fileCount: number; sha256: string }>;
