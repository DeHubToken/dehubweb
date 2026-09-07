const CALL_NOTICE_PREFIX = /^(?:📞|📹|📵)/u;

/** Only messages emitted by the call flow should use the centred notice pill. */
export function isDmCallNotice(content: string | null | undefined): boolean {
  return CALL_NOTICE_PREFIX.test(content || '');
}
