// Audio graph wiring lives here in slice 2+. Slice 1 just establishes the
// boot path can decode samples into AudioBuffers.

export interface DecodedKit {
  audioCtx: AudioContext;
  buffers: AudioBuffer[];
}

export async function decodeKit(sampleBytes: Uint8Array[]): Promise<DecodedKit> {
  const audioCtx = new AudioContext();
  const buffers = await Promise.all(
    sampleBytes.map((bytes) => {
      // decodeAudioData mutates/detaches the ArrayBuffer in some engines, so
      // pass a fresh copy.
      const copy = bytes.slice().buffer;
      return audioCtx.decodeAudioData(copy);
    }),
  );
  return { audioCtx, buffers };
}
