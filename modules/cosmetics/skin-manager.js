export const MAX_SKIN_FILE_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Validate the Minecraft skin PNG header before passing bytes to the image decoder/API. */
export function inspectMinecraftSkin(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (buffer.length < 33) throw new Error('The selected file is not a complete PNG image.');
  if (buffer.length > MAX_SKIN_FILE_BYTES) throw new Error('Skin PNG must be 5 MB or smaller.');
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Choose a PNG skin file. JPEG and WebP images are not supported.');
  const ihdrLength = buffer.readUInt32BE(8);
  const ihdrType = buffer.toString('ascii', 12, 16);
  if (ihdrLength !== 13 || ihdrType !== 'IHDR') throw new Error('The PNG header is invalid.');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!((width === 64 && height === 64) || (width === 64 && height === 32))) {
    throw new Error(`Minecraft skins must be 64×64 or legacy 64×32 PNG files. This image is ${width}×${height}.`);
  }
  return { width, height, legacy: height === 32, variant: 'classic' };
}

export function normalizeSkinVariant(value, legacy = false) {
  if (legacy) return 'classic';
  const variant = String(value || 'classic').toLowerCase();
  if (variant !== 'classic' && variant !== 'slim') throw new Error('Choose the Classic (Steve) or Slim (Alex) model.');
  return variant;
}
