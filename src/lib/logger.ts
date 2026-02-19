/**
 * Client-Side Logging Utility
 * ===========================
 * Sends logs to Supabase Edge Functions for server-side monitoring.
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

/**
 * Send a log entry to the backend
 */
export async function logToBackend(data: LogData) {
    // Always log to console as well
    const consoleMethod = data.level === 'error' ? 'error' : data.level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`[${data.component}] ${data.message}`, data.metadata || '');

    // Skip backend call for info/debug — console-only, saves ~87% of edge function invocations
    if (data.level === 'info' || data.level === 'debug') return;

    try {
        const { error } = await supabase.functions.invoke('client-logs', {
            body: data,
        });

        if (error) {
            // Don't use logger recursively if it fails
            console.warn('[Logger] Failed to send log to backend:', error);
        }
    } catch (err) {
        console.warn('[Logger] Network error sending log:', err);
    }
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
