/** Wraps signed 16-bit mono PCM in a WAV header (same layout as internal Genie's pcm_s16le_to_wav). */
export function encodeWav(samples: Int16Array, sampleRate: number): Blob {
  const header = new DataView(new ArrayBuffer(44));
  const text = (offset: number, value: string) =>
    [...value].forEach((char, i) => header.setUint8(offset + i, char.charCodeAt(0)));
  const dataSize = samples.length * 2;
  text(0, "RIFF");
  header.setUint32(4, 36 + dataSize, true);
  text(8, "WAVE");
  text(12, "fmt ");
  header.setUint32(16, 16, true); // fmt chunk size
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true); // bytes per second
  header.setUint16(32, 2, true); // bytes per sample
  header.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  header.setUint32(40, dataSize, true);
  return new Blob([header.buffer, samples.buffer as ArrayBuffer], { type: "audio/wav" });
}

/** Joins PCM blocks into one array. */
export function joinSamples(blocks: Int16Array[]): Int16Array {
  const joined = new Int16Array(blocks.reduce((total, block) => total + block.length, 0));
  let offset = 0;
  for (const block of blocks) {
    joined.set(block, offset);
    offset += block.length;
  }
  return joined;
}
