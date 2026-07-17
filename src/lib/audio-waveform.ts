/**
 * Audio waveform generation and slicing utilities
 */

export interface WaveformData {
  peaks: number[];
  duration: number;
}

/**
 * Generate waveform data from an audio blob
 */
export async function generateWaveformFromBlob(blob: Blob, numSamples: number = 100): Promise<WaveformData> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / numSamples);
    const peaks: number[] = [];
    
    for (let i = 0; i < numSamples; i++) {
      const start = i * blockSize;
      const end = start + blockSize;
      let max = 0;
      
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > max) max = abs;
      }
      
      peaks.push(max);
    }
    
    // Normalize peaks to 0-1 range
    const maxPeak = Math.max(...peaks);
    const normalizedPeaks = peaks.map(p => maxPeak > 0 ? p / maxPeak : 0);
    
    return {
      peaks: normalizedPeaks,
      duration: audioBuffer.duration,
    };
  } finally {
    await audioContext.close();
  }
}

/**
 * Slice an audio blob to a specific time range
 */
export async function sliceAudioBlob(
  blob: Blob,
  startTime: number,
  endTime: number
): Promise<Blob> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.floor(endTime * sampleRate);
    const numSamples = endSample - startSample;
    const numChannels = audioBuffer.numberOfChannels;
    
    // Create offline context for rendering
    const offlineContext = new OfflineAudioContext(
      numChannels,
      numSamples,
      sampleRate
    );
    
    // Create new buffer with sliced data
    const newBuffer = offlineContext.createBuffer(numChannels, numSamples, sampleRate);
    
    for (let channel = 0; channel < numChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const destData = newBuffer.getChannelData(channel);
      
      for (let i = 0; i < numSamples; i++) {
        destData[i] = sourceData[startSample + i] || 0;
      }
    }
    
    // Play the buffer through the offline context
    const source = offlineContext.createBufferSource();
    source.buffer = newBuffer;
    source.connect(offlineContext.destination);
    source.start();
    
    const renderedBuffer = await offlineContext.startRendering();
    
    // Convert to WAV blob
    return audioBufferToWav(renderedBuffer);
  } finally {
    await audioContext.close();
  }
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Interleave channels and write samples
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      const intSample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, intSample < 0 ? intSample * 0x8000 : intSample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Format seconds to mm:ss
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
