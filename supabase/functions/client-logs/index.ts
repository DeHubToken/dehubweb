import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimitByIp } from "../_shared/auth.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
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

        const rows = valid.map((l) => ({
            level: l.level || "error",
            component: l.component ? String(l.component).slice(0, 200) : l.component,
            message: String(l.message).slice(0, 2000),
            stack_trace: l.stack_trace ? String(l.stack_trace).slice(0, 4000) : l.stack_trace,
            metadata: l.metadata,
            user_address: l.user_address,
        }));

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
