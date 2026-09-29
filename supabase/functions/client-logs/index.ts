import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimitByIp } from "../_shared/auth.ts";
import { isOwnOrigin } from "../_shared/own-origins.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
};

// metadata is caller-controlled JSONB and used to be stored exactly as sent,
// so one crafted row could outweigh every legitimate log in the table. Serialize
// and cap it; a truncated payload beats an unbounded column.
const METADATA_MAX_CHARS = 4000;
function capMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== "object") return null;
    try {
        const json = JSON.stringify(metadata);
        if (json.length <= METADATA_MAX_CHARS) return metadata;
        return JSON.parse(JSON.stringify({ truncated: json.slice(0, METADATA_MAX_CHARS) }));
    } catch {
        return null;
    }
}

function originHost(origin: string | null): string | null {
    if (!origin) return null;
    try {
        return new URL(origin).hostname.slice(0, 253) || null;
    } catch {
        return null;
    }
}

// Any site can load a copy of the web build, and its errors would land here
// looking like ours. Browsers always send Origin, so those are dropped with a
// quiet 204 (see _shared/own-origins.ts). The drop still leaves one warning per
// host per isolate in the function logs, so a copy going live is noticed. The
// cap matters: this runs before the rate limit, and a script can forge Origin.
const FOREIGN_HOSTS_LOGGED_MAX = 100;
const foreignHostsLogged = new Set<string>();
function noteForeignHost(host: string | null) {
    if (!host || foreignHostsLogged.has(host)) return;
    if (foreignHostsLogged.size >= FOREIGN_HOSTS_LOGGED_MAX) return;
    foreignHostsLogged.add(host);
    console.warn(`[client-logs] foreign origin ${host}`);
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const origin = req.headers.get("origin");
    if (!isOwnOrigin(origin)) {
        noteForeignHost(originHost(origin));
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    const limited = await rateLimitByIp(req, "client-logs", { limit: 300, windowMs: 60 * 60 * 1000 });
    if (limited) return limited;

    try {
        const body = await req.json();

        // Support both single log and batched logs
        const logs: Array<{
            level?: string;
            component?: string;
            message?: string;
            stack_trace?: string;
            metadata?: Record<string, unknown>;
            user_address?: string;
        }> = Array.isArray(body.logs) ? body.logs : [body];

        // Filter out entries without a message; cap batch size to bound abuse
        const valid = logs.filter((l) => l.message).slice(0, 50);
        if (valid.length === 0) {
            return new Response(
                JSON.stringify({ error: "No valid log entries" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                },
            );
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        // Stamped here rather than trusted from the payload: page script cannot
        // set Origin, so this is the one reliable record of which site a web row
        // came from. Native requests carry no Origin and keep their metadata as is.
        const host = originHost(origin);

        const rows = valid.map((l) => {
            const metadata = capMetadata(l.metadata);
            return {
                level: l.level || "error",
                component: l.component ? String(l.component).slice(0, 200) : l.component,
                message: String(l.message).slice(0, 2000),
                stack_trace: l.stack_trace ? String(l.stack_trace).slice(0, 4000) : l.stack_trace,
                metadata: host ? { ...(metadata ?? {}), origin_host: host } : metadata,
                user_address: l.user_address,
            };
        });

        const { error } = await supabase
            .from("client_error_logs")
            .insert(rows);

        if (error) {
            console.error("[client-logs] DB Insert error:", error);
            return new Response(
                JSON.stringify({ error: "Failed to save logs" }),
                {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                },
            );
        }

        return new Response(
            JSON.stringify({ success: true, count: rows.length }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    } catch (error) {
        console.error("[client-logs] Error:", error);
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }
});
