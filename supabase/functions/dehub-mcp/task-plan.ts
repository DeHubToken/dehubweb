import { z } from "zod";

export const AGENT_OWNER = "0x9324840523a5d17dd12a2f11a9472e5a199c1937";
export const agentOwnerAllowed = (wallet: unknown): boolean =>
  typeof wallet === "string" && wallet.toLowerCase() === AGENT_OWNER;

const tools = ["dehub_post_create", "dehub_follow", "dehub_vote", "dehub_comment", "dehub_update_profile", "dehub_view"] as const;
/** How far ahead a post window may end. Until then the task keeps checking for new posts. */
export const LIVE_WINDOW_MAX_DAYS = 31;
/** How often a window that ends in the future is checked for new posts. */
export const LIVE_WINDOW_RECHECK_MINUTES = 30;
export const windowSteps = (step: { audience: string }) => step.audience === "posts" || step.audience === "post_authors";
export const taskStepSchema = z.object({
  tool: z.enum(tools),
  arguments: z.record(z.unknown()),
  audience: z.enum(["single", "all_users", "post_authors", "posts", "selected_posts"]),
  from: z.string().datetime().nullable().default(null),
  to: z.string().datetime().nullable().default(null),
  topic: z.string().max(2000).nullable().default(null),
  recent_keywords: z.array(z.string().trim().min(2).max(40)).min(1).max(6).nullable().default(null),
  recent_limit: z.number().int().min(1).max(3).nullable().default(null),
  media_pool: z.array(z.object({ url: z.string().url(), type: z.enum(["image", "video"]), subject: z.string().min(3).max(200), caption: z.string().trim().min(1).max(480).optional(), thumbnail_url: z.string().url().optional() }).strict()).max(12).nullable().default(null),
}).strict();
export const taskPlanSchema = z.object({
  summary: z.string().min(1).max(1000),
  steps: z.array(taskStepSchema).min(1).max(12),
  interval_minutes: z.number().finite().min(30).max(525600).nullable(),
}).strict().superRefine((plan, ctx) => {
  plan.steps.forEach((step, index) => {
    const invalid = (message: string) => ctx.addIssue({ code: "custom", message, path: ["steps", index] });
    if (step.audience === "all_users" && step.tool !== "dehub_follow") invalid("All users supports following only.");
    if (step.audience === "post_authors" && step.tool !== "dehub_follow") invalid("Post authors supports following only.");
    if (step.audience === "posts" && !["dehub_vote", "dehub_comment", "dehub_view"].includes(step.tool)) invalid("Posts supports views, reactions and comments only.");
    if (step.tool === "dehub_view" && !["single", "posts"].includes(step.audience)) invalid("Views are for one post or every post in a time window.");
    if (step.audience === "selected_posts" && (step.tool !== "dehub_vote" || step.arguments.vote_type !== "like" || !step.recent_keywords || !step.recent_limit || step.from || step.to)) invalid("Selected recent posts require a like, keywords, and a limit of up to three.");
    if (step.audience !== "selected_posts" && (step.recent_keywords || step.recent_limit)) invalid("Recent-post selection is only for selected posts.");
    if (["posts", "post_authors"].includes(step.audience) && (!step.from || !step.to)) invalid("Choose a start and end time for the posts.");
    if (step.from && step.to && Date.parse(step.from) >= Date.parse(step.to)) invalid("The start must precede the end.");
    if (step.topic && step.tool !== "dehub_post_create" && !(step.tool === "dehub_comment" && step.audience === "posts")) invalid("Topics are for generated posts and replies to every post in a window.");
    if (step.media_pool && (step.tool !== "dehub_post_create" || !step.topic)) invalid("Curated media is for generated posts.");
    if (step.media_pool?.some(media => media.type === "video" && !media.thumbnail_url)) invalid("Videos need a thumbnail URL.");
    if (plan.interval_minutes && step.tool === "dehub_post_create" && step.arguments.media_url) invalid("Recurring posts need a curated media pool so the same file is not repeated.");
    if (step.audience !== "single" && step.tool === "dehub_follow" && step.arguments.action === "unfollow") invalid("Unfollowing requires a specific user.");
  });
  if (plan.interval_minutes !== null && plan.steps.some(step => !["single", "selected_posts"].includes(step.audience))) {
    ctx.addIssue({ code: "custom", message: "Bulk tasks use a fixed time window. Schedule individual actions or topic posts instead." });
  }
  const posts = plan.steps.filter(step => step.tool === "dehub_post_create").length;
  if (plan.interval_minutes && posts * 60 / plan.interval_minutes > 2) {
    ctx.addIssue({ code: "custom", message: "The schedule exceeds two posts per hour." });
  }
});
export type TaskPlan = z.infer<typeof taskPlanSchema>;
export type TaskStep = z.infer<typeof taskStepSchema>;

/** Exact commands need no model round trip; other wording uses the planner. */
export function explicitTaskPlan(prompt: string, now = new Date(), timezone = "UTC"): TaskPlan | null {
  const text = prompt.trim();
  // Universal likes are a time-window task, never a keyword-limited selection.
  const universal = text.toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ').match(
    /^(like|view) (?:all|every) posts? (?:from |in |for |over |during )?(?:the )?(today|last 24 hours|past 24 hours|last day|past day|last 7 days|past 7 days|today in last day)(?: (?:in |across )?(?:all|every) categor(?:y|ies|hy))?$/,
  );
  if (universal) {
    let from = now.getTime() - (/7 days/.test(universal[2]) ? 7 : 1) * 86400000;
    if (universal[2] === 'today') {
      // Solve local midnight against the zone offset, including DST boundaries.
      const parts = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(date).map(part => [part.type, part.value]));
      const local = parts(now);
      const midnight = Date.UTC(+local.year, +local.month - 1, +local.day);
      from = midnight;
      for (let attempt = 0; attempt < 4; attempt++) {
        const at = parts(new Date(from));
        const represented = Date.UTC(+at.year, +at.month - 1, +at.day, +at.hour, +at.minute, +at.second);
        const next = from + midnight - represented;
        if (next === from) break;
        from = next;
      }
    }
    return everyPostPlan(new Date(from).toISOString(), now.toISOString(), universal[1]);
  }
  const daily = text.match(/^Post once per day about: ([^\n]+)\nStyle: ([^\n]+)\nLike up to ([1-3]) recent posts per day about: ([^\n]+)$/i);
  if (daily) {
    const keywords = daily[4].split(',').map(value => value.trim()).filter(Boolean);
    const topic = `${daily[1].trim()} Voice: ${daily[2].trim()}`;
    return taskPlanSchema.parse({ summary: `Post daily about ${daily[1].trim()} and like up to ${daily[3]} relevant recent posts.`, interval_minutes: 1440,
      steps: [
        { tool: 'dehub_vote', arguments: { vote_type: 'like' }, audience: 'selected_posts', from: null, to: null, topic: null, recent_keywords: keywords, recent_limit: Number(daily[3]) },
        { tool: 'dehub_post_create', arguments: {}, audience: 'single', from: null, to: null, topic },
      ] });
  }
  const window = text.match(/^Every post from (\S+) to (\S+)\nActions: ([a-z, ]+)(?:\nReply style: ([^\n]{1,500}))?$/i);
  if (window) return everyPostPlan(window[1], window[2], window[3], window[4]);
  const follow = text.match(/^follow\s+(@[a-z0-9_]{3,20}|0x[a-f0-9]{40})(?:\s+once)?[.!]?$/i);
  if (follow) return taskPlanSchema.parse({ summary: `Follow ${follow[1]} once.`, interval_minutes: null,
    steps: [{ tool: 'dehub_follow', arguments: { target_wallet: follow[1].replace(/^@/, ''), action: 'follow' }, audience: 'single', from: null, to: null, topic: null }] });
  if (/^follow\s+(?:every user|everyone|all users)(?:\s+once)?[.!]?$/i.test(text)) return taskPlanSchema.parse({
    summary: 'Follow every user in the public directory once.', interval_minutes: null,
    steps: [{ tool: 'dehub_follow', arguments: { action: 'follow' }, audience: 'all_users', from: null, to: null, topic: null }],
  });
  const posts = text.match(/^(?:post|publish)\s+(\d+)\s+(?:times|posts?)\s+(?:per day|a day|daily)\s+about\s+([\s\S]+)$/i);
  if (!posts) return null;
  const count = Number(posts[1]);
  if (count < 1 || count > 48) throw new Error('Choose between 1 and 48 posts per day (at most two per hour).');
  const topic = posts[2].trim();
  if (topic.length > 2000) throw new Error('Keep the posting topic within 2,000 characters.');
  return taskPlanSchema.parse({ summary: `Post ${count} times per day about ${topic}`, interval_minutes: 1440 / count,
    steps: [{ tool: 'dehub_post_create', arguments: {}, audience: 'single', from: null, to: null, topic }] });
}

/** A readable UTC time for task summaries, e.g. "17 Oct 2026 12:00 UTC". */
export const readableTime = (value: string | number | Date) =>
  new Date(value).toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "") + " UTC";

/** "Every post from A to B" from the task form: exact, so it never goes through the planner. */
function everyPostPlan(from: string, to: string, list: string, style?: string): TaskPlan {
  const start = new Date(from), end = new Date(to);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error("Choose a valid start and end time.");
  const actions = [...new Set(list.toLowerCase().split(",").map(value => value.trim()).filter(Boolean))];
  if (!actions.length || actions.some(action => !["view", "like", "reply"].includes(action))) throw new Error("Choose view, like or reply.");
  if (actions.includes("reply") && !style?.trim()) throw new Error("Describe how the agent should reply.");
  const window = { audience: "posts", from: start.toISOString(), to: end.toISOString(), topic: null };
  const steps = [
    ...(actions.includes("view") ? [{ ...window, tool: "dehub_view", arguments: {} }] : []),
    ...(actions.includes("like") ? [{ ...window, tool: "dehub_vote", arguments: { vote_type: "like" } }] : []),
    ...(actions.includes("reply") ? [{ ...window, tool: "dehub_comment", arguments: {}, topic: style!.trim() }] : []),
  ];
  const names = actions.map(action => ({ view: "view", like: "like", reply: "reply to" })[action]).join(", ").replace(/, ([^,]*)$/, " and $1");
  return taskPlanSchema.parse({ summary: `${names[0].toUpperCase()}${names.slice(1)} every post from ${readableTime(start)} to ${readableTime(end)}.`, interval_minutes: null, steps });
}

export const PLAN_TOOL = {
  type: "function",
  function: {
    name: "plan_agent_task",
    description: "Translate the owner's request into actions, or return a clarification if it cannot be represented exactly.",
    parameters: {
      type: "object",
      properties: {
        clarification: { type: ["string", "null"], description: "Null for a supported task. Otherwise explain what is needed and set plan to null." },
        plan: {
          type: ["object", "null"],
          properties: {
            summary: { type: "string" },
            interval_minutes: { type: ["number", "null"], description: "Null for once. For N posts/day use 1440/N, minimum 30. Each run executes every step." },
            steps: { type: "array", items: {
              type: "object",
              properties: {
                tool: { type: "string", enum: tools },
                arguments: { type: "object", description: "Only arguments for the selected tool. Omit irrelevant fields. For bulk omit the target: the runner supplies it.",
                  properties: {
                    target_wallet: { type: "string" }, action: { type: "string", enum: ["follow", "unfollow"] },
                    token_id: { type: "string" }, vote_type: { type: "string", enum: ["like", "dislike"] },
                    content: { type: "string" }, title: { type: "string" }, category: { type: "string" },
                    media_url: { type: "string" }, media_type: { type: "string", enum: ["text", "image", "video"] },
                    reply_to_comment_id: { type: "string" }, bio: { type: "string" }, display_name: { type: "string" },
                    avatar_url: { type: "string" }, banner_url: { type: "string" },
                  }, additionalProperties: false,
                },
                audience: { type: "string", enum: ["single", "all_users", "post_authors", "posts", "selected_posts"] },
                from: { type: ["string", "null"], description: "Inclusive ISO UTC start of a bulk post time window." },
                to: { type: ["string", "null"], description: `Exclusive ISO UTC end of a bulk post time window. May be up to ${LIVE_WINDOW_MAX_DAYS} days ahead; new posts are then covered as they appear.` },
                topic: { type: ["string", "null"], description: "Instructions for an original post on each run, or for a reply written to each post in a window; null for literal supplied content." },
                recent_keywords: { type: ["array", "null"], items: { type: "string" }, description: "One to six exact interests for selected_posts; null otherwise." },
                recent_limit: { type: ["integer", "null"], description: "Maximum one to three matching recent posts to like each run; null otherwise." },
                media_pool: { type: ["array", "null"], description: "Owner-supplied or licensed media for recurring posts. Each asset is used once. An optional caption is posted verbatim; otherwise a new caption is written from the subject. Videos also need a thumbnail_url.", items: { type: "object", properties: { url: { type: "string" }, type: { type: "string", enum: ["image", "video"] }, subject: { type: "string" }, caption: { type: "string" }, thumbnail_url: { type: "string" } }, required: ["url", "type", "subject"], additionalProperties: false } },
              },
              required: ["tool", "arguments", "audience", "from", "to", "topic"],
              additionalProperties: false,
            } },
          },
          required: ["summary", "steps", "interval_minutes"],
          additionalProperties: false,
        },
      },
      required: ["plan", "clarification"],
      additionalProperties: false,
    },
  },
};

export function parseTaskPlan(output: unknown): TaskPlan {
  const envelope = z.object({ plan: z.unknown(), clarification: z.string().nullable().optional() }).safeParse(output);
  if (!envelope.success) throw new Error('Could not prepare a complete task. Try stating one action and its schedule.');
  if (envelope.data.clarification) throw new Error(envelope.data.clarification);
  const parsed = taskPlanSchema.safeParse(envelope.data.plan);
  if (!parsed.success) throw new Error('Could not prepare a complete task. Try stating one action and its schedule.');
  return parsed.data;
}

export function nextScheduledRun(previous: string, minutes: number, now: number): string {
  const interval = minutes * 60000;
  const prior = Date.parse(previous);
  return new Date(prior + Math.max(1, Math.floor((now - prior) / interval) + 1) * interval).toISOString();
}
