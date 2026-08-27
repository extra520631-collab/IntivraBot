// Mic capture + PCM encoding shared by the interview's voice checks and the
// Profile page's voiceprint enrollment. The backend and the Python voice model
// both expect 16 kHz mono Int16 as base64.

export const TARGET_SAMPLE_RATE = 16000

/** Linear-resample Float32 samples at `srcSR` down to 16 kHz Int16. */
export function toInt16_16k(input, srcSR) {
  const ratio = srcSR / TARGET_SAMPLE_RATE
  const outLen = Math.max(0, Math.floor(input.length / ratio))
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio
    const i0 = Math.floor(idx)
    const frac = idx - i0
    const s = input[i0] * (1 - frac) + (input[i0 + 1] || 0) * frac
    out[i] = Math.max(-1, Math.min(1, s)) * 32767
  }
  return out
}

/** Int16 PCM -> base64, chunked so long clips don't blow the call stack. */
export function int16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** Peak amplitude (0..1) of a Float32 buffer — drives the level meter. */
export function peakLevel(samples) {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i])
    if (v > peak) peak = v
  }
  return peak
}

/**
 * Records mono PCM from the mic until stopped.
 *
 * const rec = await createRecorder({ onLevel })
 * ...
 * const { base64, sampleRate, seconds } = rec.stop()
 *
 * Throws if the mic is missing or the user denies permission — callers should
 * surface that as a message rather than failing silently.
 */
export async function createRecorder({ onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  })
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  const srcSampleRate = ctx.sampleRate
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)

  let chunks = []
  processor.onaudioprocess = (e) => {
    const data = new Float32Array(e.inputBuffer.getChannelData(0))
    chunks.push(data)
    if (onLevel) onLevel(peakLevel(data))
  }
  source.connect(processor)
  processor.connect(ctx.destination)

  const release = () => {
    try { processor.disconnect() } catch { /* already gone */ }
    try { source.disconnect() } catch { /* already gone */ }
    try { ctx.close() } catch { /* already closed */ }
    stream.getTracks().forEach((t) => t.stop())
  }

  return {
    /** Stops the mic and returns the clip, or null if nothing was captured. */
    stop() {
      release()
      const total = chunks.reduce((n, c) => n + c.length, 0)
      if (!total) return null
      const merged = new Float32Array(total)
      let off = 0
      for (const c of chunks) { merged.set(c, off); off += c.length }
      chunks = []
      const pcm16 = toInt16_16k(merged, srcSampleRate)
      return {
        base64: int16ToBase64(pcm16),
        sampleRate: TARGET_SAMPLE_RATE,
        seconds: pcm16.length / TARGET_SAMPLE_RATE,
      }
    },
    /** Abandons the recording without producing a clip. */
    cancel() {
      release()
      chunks = []
    },
  }
}
