export const SUPPORTED_LEGACY_VERSIONS = Object.freeze(['1.8.9', '1.12.2', '1.16.5']);

export function isLoaderCompatible(version, loader) {
  if (typeof version !== 'string' || !/^\d+\.\d+(?:\.\d+)?$/.test(version)) return false;
  const [major, minor, patch = 0] = version.split('.').map(Number);
  if (loader === 'vanilla' || loader === 'forge') return true;
  if (loader === 'fabric' || loader === 'quilt') return major > 1 || (major === 1 && minor >= 14);
  if (loader === 'neoforge') return major > 1 || (major === 1 && (minor > 20 || (minor === 20 && patch >= 2)));
  return false;
}

export function validateLaunchRequest(request, settings = {}) {
  if (!request || typeof request !== 'object') throw new Error('A launch profile is required.');
  const version = String(request.version || settings.minecraftVersion || '');
  const loader = String(request.loader || settings.loader || 'vanilla').toLowerCase();
  const loaderVersion = String(request.loaderVersion || settings.loaderVersion || '').trim();
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Invalid Minecraft version.');
  if (!['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(loader)) throw new Error('Unsupported loader.');
  if (!isLoaderCompatible(version, loader)) throw new Error(`${loader} is not compatible with Minecraft ${version} in this profile.`);
  if (loader !== 'vanilla' && (!loaderVersion || loaderVersion.length > 48 || !/^[a-zA-Z0-9._+-]+$/.test(loaderVersion))) {
    throw new Error(`A valid ${loader} loader build is required.`);
  }
  return { version, loader, loaderVersion };
}
