/**
 * Client-Side Logging Utility
 * ===========================
 * Sends logs to Supabase Edge Functions for server-side monitoring.
 * Batches error/warn logs and flushes every 30s or on page unload.
 */

import { supabase } from "@/integrations/supabase/client";

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogData {
    level: LogLevel;
    component: string;
    message: string;
    stack_trace?: string;
    metadata?: Record<string, any>;
    user_address?: string;
}

// ============================================================================
// BATCHING
// ============================================================================

const LOG_QUEUE: LogData[] = [];
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds
let flushTimer: ReturnType<typeof setInterval> | null = null;

async function flushLogs() {
    if (LOG_QUEUE.length === 0) return;

    // Drain the queue
    const batch = LOG_QUEUE.splice(0);

    try {
        const { error } = await supabase.functions.invoke('client-logs', {
            body: { logs: batch },
        });

        if (error) {
            console.warn('[Logger] Failed to flush log batch:', error);
        }
    } catch (err) {
        console.warn('[Logger] Network error flushing logs:', err);
    }
}

/**
 * Flush on the way out of the page.
 *
 * `supabase.functions.invoke` is an ordinary fetch, and an ordinary fetch is
 * cancelled the instant the document goes away — so the flush wired to
 * beforeunload has never actually delivered anything. That silently threw away
 * the rows that matter most: the failures people escape by hitting refresh
 * (a wallet that connects and then never asks for a signature is the whole
 * genre) are, by definition, the ones where the tab is about to be replaced.
 * We have been reading a table with a hole in it exactly where the bug is.
 *
 * `keepalive` is what lets the request outlive the document. The endpoint and
 * auth headers are read off the live client so this cannot drift from the
 * generated Supabase config; if either is somehow absent, fall back to the
 * normal path rather than dropping the batch.
 */
function flushLogsOnExit() {
    if (LOG_QUEUE.length === 0) return;

    const fns = (supabase as unknown as { functions?: { url?: string; headers?: Record<string, string> } }).functions;
    const url = fns?.url;
    if (!url) {
        flushLogs();
        return;
    }

    const batch = LOG_QUEUE.splice(0);
    try {
        fetch(`${url}/client-logs`, {
            method: 'POST',
            keepalive: true,
            headers: { ...(fns.headers || {}), 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs: batch }),
        }).catch(() => { /* the page is going away; there is nobody to tell */ });
    } catch {
        /* ignore */
    }
}

function ensureFlushTimer() {
    if (flushTimer) return;
    flushTimer = setInterval(flushLogs, FLUSH_INTERVAL_MS);

    // Flush on page hide (covers tab close, navigation, mobile background)
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                flushLogsOnExit();
            }
        });
        window.addEventListener('beforeunload', () => {
            flushLogsOnExit();
        });
    }
}

/**
 * client_error_logs has a user_address column and, until now, nothing ever
 * filled it: every caller goes through createLogger below, which has no way to
 * pass one. So a support question as ordinary as "why can this specific wallet
 * not post" could only be answered by matching timestamps by eye and hoping.
 *
 * The signed-in wallet is already sitting in localStorage, so read it here
 * rather than asking two dozen call sites to remember. An explicit
 * user_address on the entry still wins.
 */
function signedInWallet(): string | undefined {
    try {
        return localStorage.getItem('dehub_wallet') || undefined;
    } catch {
        return undefined;
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Send a log entry to the backend (batched for error/warn, console-only for info/debug)
 */
export async function logToBackend(data: LogData) {
    // Always log to console
    const consoleMethod = data.level === 'error' ? 'error' : data.level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`[${data.component}] ${data.message}`, data.metadata || '');

    // Skip backend call for info/debug — console-only
    if (data.level === 'info' || data.level === 'debug') return;

    // Queue for batched flush.
    //
    // client_time is stamped HERE, not at insert. client_error_logs.created_at
    // is the row's insert time, and these flush in 30s batches — so every entry
    // in a batch lands on the same created_at and the order they actually
    // happened in is lost. Debugging a report of "it asked me twice, two
    // minutes apart" against four rows sharing one timestamp is guesswork.
    LOG_QUEUE.push({
        ...data,
        user_address: data.user_address ?? signedInWallet(),
        metadata: { ...(data.metadata || {}), client_time: new Date().toISOString() },
    });
    ensureFlushTimer();
}

/**
 * Predefined logger for common components
 */
export const createLogger = (component: string) => ({
    error: (message: string, metadata?: Record<string, any>, error?: any) =>
        logToBackend({
            level: 'error',
            component,
            message,
            metadata,
            stack_trace: error?.stack
        }),

    warn: (message: string, metadata?: Record<string, any>) =>
        logToBackend({ level: 'warn', component, message, metadata }),

    info: (message: string, metadata?: Record<string, any>) =>
        logToBackend({ level: 'info', component, message, metadata }),
});
