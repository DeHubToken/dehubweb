import { MilestoneContentMap } from './types';
import { milestones2021 } from './2021';
import { milestones2022 } from './2022';
import { milestones2023 } from './2023';
import { milestones2024 } from './2024';
import { milestones2025 } from './2025';

export type { MilestoneContent, MilestoneContentMap } from './types';

/**
 * Slug-keyed article bodies for the milestone archive. See ./types.ts for the
 * two hard constraints (`###`/`####` headings only, no italics or tables).
 *
 * A milestone with no entry here falls back to the generated summary in
 * blogPosts.ts, which is deliberately short and states only what the roadmap
 * bullet says — the nine shared templates it used to fall back to are gone.
 */
export const MILESTONE_CONTENT: MilestoneContentMap = {
  ...milestones2021,
  ...milestones2022,
  ...milestones2023,
  ...milestones2024,
  ...milestones2025,
};
