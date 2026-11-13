// Turns microphone audio into 16 kHz mono PCM16 (FR-R2), the format internal Genie sends to the
// transcription model. Runs on the audio thread; posts 100 ms of samples at a time.
// Loaded by app/app/_components/use-recorder.ts.

const TARGET_RATE = 16000;
const BLOCK = 1600; // 100 ms

class Pcm16Recorder extends AudioWorkletProcessor {
  constructor() {
    super();
    // sampleRate is the AudioContext's rate (usually 44.1 or 48 kHz)
    this.step = sampleRate / TARGET_RATE;
    this.position = 0;
    this.sum = 0;
    this.count = 0;
    this.block = new Int16Array(BLOCK);
    this.filled = 0;
    this.recording = true;
    this.port.onmessage = ({ data }) => {
      if (data.type === "pause") this.recording = false;
      if (data.type === "resume") this.recording = true;
      if (data.type === "flush") {
        this.post(this.filled);
        this.port.postMessage({ type: "flushed" });
      }
    };
  }

  post(length) {
    if (length === 0) return;
    const samples = this.block.slice(0, length);
    this.port.postMessage({ type: "pcm", samples }, [samples.buffer]);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || !this.recording) return true;
    for (let i = 0; i < channel.length; i++) {
      // Averaging each output sample's window filters out what 16 kHz cannot hold
      this.sum += channel[i];
      this.count += 1;
      this.position += 1;
      if (this.position >= this.step) {
        this.position -= this.step;
        const value = Math.max(-1, Math.min(1, this.sum / this.count));
        this.block[this.filled++] = value < 0 ? value * 0x8000 : value * 0x7fff;
        this.sum = 0;
        this.count = 0;
        if (this.filled === BLOCK) this.post(BLOCK);
      }
    }
    return true;
  }
}

registerProcessor("pcm16-recorder", Pcm16Recorder);
