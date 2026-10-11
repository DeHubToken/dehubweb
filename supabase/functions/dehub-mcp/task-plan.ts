import { z } from "zod";

export const AGENT_OWNER = "0x9324840523a5d17dd12a2f11a9472e5a199c1937";
export const agentOwnerAllowed = (wallet: unknown): boolean =>
  typeof wallet === "string" && wallet.toLowerCase() === AGENT_OWNER;

const tools = ["dehub_post_create", "dehub_follow", "dehub_vote", "dehub_comment", "dehub_update_profile"] as const;
export const taskStepSchema = z.object({
  tool: z.enum(tools),
  arguments: z.record(z.unknown()),
  audience: z.enum(["single", "all_users", "post_authors", "posts"]),
  from: z.string().datetime().nullable().default(null),
  to: z.string().datetime().nullable().default(null),
  topic: z.string().max(2000).nullable().default(null),
}).strict();
export const taskPlanSchema = z.object({
  summary: z.string().min(1).max(1000),
  steps: z.array(taskStepSchema).min(1).max(12),
  interval_minutes: z.number().int().min(30).max(525600).nullable(),
}).strict().superRefine((plan, ctx) => {
  plan.steps.forEach((step, index) => {
    const invalid = (message: string) => ctx.addIssue({ code: "custom", message, path: ["steps", index] });
    if (step.audience === "all_users" && step.tool !== "dehub_follow") invalid("All users supports following only.");
    if (step.audience === "post_authors" && step.tool !== "dehub_follow") invalid("Post authors supports following only.");
    if (step.audience === "posts" && !["dehub_vote", "dehub_comment"].includes(step.tool)) invalid("Posts supports reactions and comments only.");
    if (["posts", "post_authors"].includes(step.audience) && (!step.from || !step.to)) invalid("Choose a start and end time for the posts.");
    if (step.from && step.to && Date.parse(step.from) >= Date.parse(step.to)) invalid("The start must precede the end.");
    if (step.topic && step.tool !== "dehub_post_create") invalid("Topics are for generated posts.");
    if (step.audience !== "single" && step.tool === "dehub_follow" && step.arguments.action === "unfollow") invalid("Unfollowing requires a specific user.");
  });
  if (plan.interval_minutes !== null && plan.steps.some(step => step.audience !== "single")) {
    ctx.addIssue({ code: "custom", message: "Bulk tasks use a fixed time window. Schedule individual actions or topic posts instead." });
  }
  const posts = plan.steps.filter(step => step.tool === "dehub_post_create").length;
  if (plan.interval_minutes && posts * 60 / plan.interval_minutes > 2) {
    ctx.addIssue({ code: "custom", message: "The schedule exceeds two posts per hour." });
  }
});
export type TaskPlan = z.infer<typeof taskPlanSchema>;
export type TaskStep = z.infer<typeof taskStepSchema>;

export const PLAN_TOOL = {
  type: "function",
  function: {
    name: "plan_agent_task",
    description: "Translate the owner's request into actions, or return a clarification if it cannot be represented exactly.",
    parameters: {
      type: "object",
      properties: {
        clarification: { type: "string", description: "Set this instead of plan if information or an unsupported capability is needed." },
        plan: {
          type: "object",
          properties: {
            summary: { type: "string" },
            interval_minutes: { type: ["integer", "null"], description: "Null for once. For N posts/day use 1440/N, minimum 30. Each run executes every step." },
            steps: { type: "array", items: {
              type: "object",
              properties: {
                tool: { type: "string", enum: tools },
                arguments: { type: "object", description: "Exact MCP arguments. For bulk leave the target out: the runner supplies it." },
                audience: { type: "string", enum: ["single", "all_users", "post_authors", "posts"] },
                from: { type: ["string", "null"], description: "Inclusive ISO UTC start of a bulk post time window." },
                to: { type: ["string", "null"], description: "Exclusive ISO UTC end of a bulk post time window, no later than now." },
                topic: { type: ["string", "null"], description: "Instructions for an original post on each run; null for literal supplied content." },
              },
              required: ["tool", "arguments", "audience", "from", "to", "topic"],
            } },
          },
          required: ["summary", "steps", "interval_minutes"],
        },
      },
    },
  },
};

export function nextScheduledRun(previous: string, minutes: number, now: number): string {
  const interval = minutes * 60000;
  const prior = Date.parse(previous);
  return new Date(prior + Math.max(1, Math.floor((now - prior) / interval) + 1) * interval).toISOString();
}
