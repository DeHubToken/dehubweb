export type ScreenCapture = { ready: Promise<MediaStream>; dispose: () => void };

/** Keep display, microphone and mixer ownership together while permission is pending. */
export function startScreenCapture(microphone: boolean, isCurrent: () => boolean): ScreenCapture {
  const tracks = new Set<MediaStreamTrack>();
  const nodes: AudioNode[] = [];
  let context: AudioContext | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const track of tracks) if (track.readyState !== "ended") track.stop();
    for (const node of nodes) node.disconnect();
    void context?.close().catch(() => {});
  };
  const own = (stream: MediaStream) => {
    for (const track of stream.getTracks()) {
      tracks.add(track);
      if (disposed && track.readyState !== "ended") track.stop();
    }
    return stream;
  };
  const check = (display?: MediaStream) => {
    if (disposed || !isCurrent() || (display && !display.getVideoTracks().some(track => track.readyState === "live"))) {
      throw new DOMException("Screen capture no longer belongs to this take", "AbortError");
    }
  };
  const ready = (async () => {
    try {
      // Call the browser picker before awaiting anything to retain the user's activation.
      const options: DisplayMediaStreamOptions & { systemAudio: "include" } = {
        video: { frameRate: 30 }, audio: true, systemAudio: "include",
      };
      const display = own(await navigator.mediaDevices.getDisplayMedia(options));
      check(display);
      const inputs = [...display.getAudioTracks()];
      if (microphone) {
        const voice = own(await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }, video: false,
        }));
        check(display);
        if (!voice.getAudioTracks().some(track => track.readyState === "live")) throw new Error("Microphone unavailable");
        inputs.push(...voice.getAudioTracks());
      }
      if (inputs.length <= 1) return own(new MediaStream([...display.getVideoTracks(), ...inputs]));

      context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      nodes.push(destination);
      own(destination.stream);
      for (const track of inputs) {
        const source = context.createMediaStreamSource(new MediaStream([track]));
        const gain = context.createGain();
        // Average the inputs into one audio track rather than dropping a second track on encode.
        gain.gain.value = 1 / inputs.length;
        source.connect(gain); gain.connect(destination);
        nodes.push(source, gain);
      }
      await context.resume();
      check(display);
      if (context.state !== "running") throw new Error("Audio mixer unavailable");
      return own(new MediaStream([...display.getVideoTracks(), ...destination.stream.getAudioTracks()]));
    } catch (error) {
      dispose();
      throw error;
    }
  })();
  return { ready, dispose };
}
