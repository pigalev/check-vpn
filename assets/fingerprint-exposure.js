function hex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function digestBytes(bytes, subtleCrypto = globalThis.crypto?.subtle) {
  if (!subtleCrypto?.digest) return null;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes?.buffer ?? bytes ?? []);
  try { return hex(await subtleCrypto.digest('SHA-256', view)); }
  catch { return null; }
}

export async function collectCanvasFingerprint(env = globalThis) {
  try {
    const canvas = env.document?.createElement?.('canvas');
    if (!canvas) return { status: 'unsupported', digest: null, modified: null, error: null };
    canvas.width = 180; canvas.height = 48;
    const ctx = canvas.getContext?.('2d', { willReadFrequently: true });
    if (!ctx) return { status: 'unsupported', digest: null, modified: null, error: null };
    ctx.textBaseline = 'top'; ctx.font = '16px Arial'; ctx.fillStyle = '#f60'; ctx.fillRect(4, 4, 72, 24); ctx.fillStyle = '#069'; ctx.fillText('VPN privacy 42', 8, 8);
    const image = ctx.getImageData?.(0, 0, canvas.width, canvas.height);
    const data = image?.data;
    if (!data?.length) return { status: 'blocked', digest: null, modified: true, error: null };
    let nonZero = 0;
    for (let i = 0; i < data.length; i += 1) if (data[i] !== 0) { nonZero += 1; if (nonZero > 8) break; }
    if (nonZero <= 8) return { status: 'blocked', digest: null, modified: true, error: null };
    const digest = await digestBytes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), env.crypto?.subtle);
    return { status: digest ? 'complete' : 'partial', digest, modified: false, error: null };
  } catch {
    return { status: 'blocked', digest: null, modified: true, error: null };
  }
}

export function collectWebGlFingerprint(env = globalThis) {
  try {
    const canvas = env.document?.createElement?.('canvas');
    if (!canvas) return { status: 'unsupported', version: null, vendor: null, renderer: null, debugRendererExposed: false, maxTextureSize: null, maxRenderbufferSize: null, extensionCount: 0, error: null };
    let gl = canvas.getContext?.('webgl2');
    let version = 'WebGL 2';
    if (!gl) { gl = canvas.getContext?.('webgl') ?? canvas.getContext?.('experimental-webgl'); version = 'WebGL 1'; }
    if (!gl) return { status: 'unsupported', version: null, vendor: null, renderer: null, debugRendererExposed: false, maxTextureSize: null, maxRenderbufferSize: null, extensionCount: 0, error: null };
    const debug = gl.getExtension?.('WEBGL_debug_renderer_info');
    const vendor = debug ? gl.getParameter?.(debug.UNMASKED_VENDOR_WEBGL) ?? null : null;
    const renderer = debug ? gl.getParameter?.(debug.UNMASKED_RENDERER_WEBGL) ?? null : null;
    return {
      status: 'complete', version, vendor, renderer, debugRendererExposed: Boolean(debug),
      maxTextureSize: gl.getParameter?.(gl.MAX_TEXTURE_SIZE) ?? null,
      maxRenderbufferSize: gl.getParameter?.(gl.MAX_RENDERBUFFER_SIZE) ?? null,
      extensionCount: gl.getSupportedExtensions?.()?.length ?? 0,
      error: null
    };
  } catch {
    return { status: 'error', version: null, vendor: null, renderer: null, debugRendererExposed: false, maxTextureSize: null, maxRenderbufferSize: null, extensionCount: 0, error: 'WebGL check failed.' };
  }
}

export async function collectWebGpuFingerprint(env = globalThis) {
  const gpu = env.navigator?.gpu;
  if (!gpu?.requestAdapter) return { status: 'unsupported', supported: false, adapter: null, error: null };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { status: 'unavailable', supported: true, adapter: null, error: 'WebGPU adapter unavailable.' };
    const info = adapter.info ?? {};
    return { status: 'complete', supported: true, adapter: { vendor: info.vendor || null, architecture: info.architecture || null, device: info.device || null, description: info.description || null }, error: null };
  } catch {
    return { status: 'unavailable', supported: true, adapter: null, error: 'WebGPU adapter unavailable.' };
  }
}

export async function collectAudioFingerprint(env = globalThis) {
  const OfflineAudioContextImpl = env.OfflineAudioContext ?? env.webkitOfflineAudioContext;
  if (typeof OfflineAudioContextImpl !== 'function') return { status: 'unsupported', digest: null, error: null };
  let context;
  try {
    context = new OfflineAudioContextImpl(1, 2048, 44100);
    const oscillator = context.createOscillator();
    const compressor = context.createDynamicsCompressor();
    oscillator.type = 'triangle'; oscillator.frequency.value = 10000;
    compressor.threshold.value = -50; compressor.knee.value = 40; compressor.ratio.value = 12; compressor.attack.value = 0; compressor.release.value = 0.25;
    oscillator.connect(compressor); compressor.connect(context.destination); oscillator.start(0);
    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0).slice(256, 1280);
    const digest = await digestBytes(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength), env.crypto?.subtle);
    return { status: digest ? 'complete' : 'partial', digest, error: null };
  } catch {
    return { status: 'blocked', digest: null, error: null };
  } finally {
    context = null;
  }
}

function finding(id, summary) { return { id, severity: 'info', category: 'fingerprint', summary, details: '', sources: ['browser'] }; }

export async function collectFingerprintExposure(env = globalThis) {
  const [canvas, webgpu, audio] = await Promise.all([collectCanvasFingerprint(env), collectWebGpuFingerprint(env), collectAudioFingerprint(env)]);
  const webgl = collectWebGlFingerprint(env);
  const findings = [];
  if (canvas.status === 'complete') findings.push(finding('canvas-exposed', 'Canvas fingerprint surface exposed'));
  if (webgl.renderer) findings.push(finding('webgl-renderer-exposed', 'WebGL renderer exposed'));
  if (audio.status === 'complete') findings.push(finding('audio-exposed', 'Audio fingerprint surface exposed'));
  const statuses = [canvas.status, webgl.status, webgpu.status, audio.status];
  return { status: statuses.some((value) => value === 'complete') ? 'complete' : statuses.every((value) => value === 'unsupported') ? 'unavailable' : 'partial', canvas, webgl, webgpu, audio, findings };
}
