// Leave room for the encoder's final packet beneath the server's 30s limit.
export const VOICE_RECORDING_SECONDS = 29;

export function createVoiceRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
    .find(type => MediaRecorder.isTypeSupported(type));
  try {
    return new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    throw error;
  }
}

export function voiceRecordingBlob(chunks: Blob[], recorderType: string): Blob {
  // Upload endpoints accept container MIME types, without codec parameters.
  const type = (recorderType || chunks.find(chunk => chunk.type)?.type || '').split(';')[0].trim().toLowerCase();
  return new Blob(chunks, { type });
}

export function voiceRecordingFilename(type: string): string {
  const mime = type.split(';')[0].trim().toLowerCase();
  const ext = mime === 'audio/mp4' || mime === 'audio/m4a' || mime === 'audio/x-m4a' ? 'm4a'
    : mime === 'audio/ogg' || mime === 'audio/opus' ? 'ogg'
    : mime === 'audio/mpeg' ? 'mp3' : mime === 'audio/wav' ? 'wav' : 'webm';
  return `voice-${Date.now()}.${ext}`;
}

export function voiceRecordingFile(blob: Blob): File {
  return new File([blob], voiceRecordingFilename(blob.type), { type: blob.type });
}
