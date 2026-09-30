/** Setup and long frames must never consume an unseen opening flight. */
export function flightClock(offset = 0) {
  let previous: number | undefined;
  let elapsed = offset;
  return (now: number) => {
    if (previous !== undefined) elapsed += Math.min(40, Math.max(0, now - previous));
    previous = now;
    return elapsed;
  };
}
