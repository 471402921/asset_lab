export const SUPPORTED_EXPORT_VERSION = '2.0';

export function assertExportVersion(meta) {
  const v = meta?.export_version;
  if (v !== SUPPORTED_EXPORT_VERSION) {
    throw new Error(
      `Unknown pixellab export_version: ${v}. asset-lab 仅支持 ${SUPPORTED_EXPORT_VERSION}, 请升级 loader 或检查 metadata.json`
    );
  }
}
