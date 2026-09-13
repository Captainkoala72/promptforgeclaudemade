/**
 * Templates set the target output shape for a run. Adding one is a one-object
 * change — the UI reads this array directly.
 */

export interface Template {
  id: string;
  label: string;
  /** Shown under the select so you know what you're picking. */
  description: string;
  /** Appended to the mode system prompt. Empty string = no template. */
  guidance: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "general",
    label: "General",
    description: "No target shape. Use when the task doesn't fit the others.",
    guidance: "",
  },
  {
    id: "image",
    label: "Image generation",
    description: "Subject, composition, lighting, style, and negatives for an image model.",
    guidance: `Build for a text-to-image model, not a chat model.

Cover, in roughly this order: subject and its defining details; action or pose; setting and background; camera framing (shot type, angle, lens, depth of field); lighting (source, direction, quality, time of day); color palette and mood; medium and style, named concretely (35mm film, gouache, blueprint, claymation) rather than as "high quality"; and finish with aspect ratio and any negative prompt.

Write the prompt as dense comma-separated descriptive phrases rather than sentences addressed to an assistant. Favor visual nouns and adjectives over abstractions — an image model cannot render "elegant" but can render "tapered brass legs, matte finish". Name specific artists, films, or processes only as style anchors, and skip them for living artists.

Avoid stacked quality boosters ("masterpiece, 8k, ultra detailed, trending on artstation"); one or two concrete quality cues beat ten generic ones. If the user's idea implies text inside the image, state the exact string to render and where.`,
  },
  {
    id: "app-vibe",
    label: "App vibe coding",
    description: "A build brief for an AI coding tool: features, data, states, stack.",
    guidance: `Build a brief an AI coding tool can execute in one pass.

Include: what the app is and who uses it, in one sentence; the core user flow end to end; a concrete feature list separated into must-have and later; the data model (entities, fields, relationships) even if it's just local state; tech stack and any hard constraints (framework, styling, no backend, must run offline); visual direction with real specifics — palette, type, density, mood reference; and every screen or view with its empty, loading, error, and populated states.

Demand working code over scaffolding: no placeholder TODOs, no mock functions that return fake data unless explicitly asked, no half-wired buttons. State what should happen on every interactive element.

Close with acceptance criteria — a short checklist the finished build must satisfy — and tell the model to ask nothing and make reasonable choices for anything unspecified.`,
  },
  {
    id: "site-vibe",
    label: "Website vibe coding",
    description: "A page-by-page brief: sections, copy direction, responsive behavior.",
    guidance: `Build a brief for a marketing or content site, not an app.

Include: the site's purpose and the single action a visitor should take; the audience and what they already believe; section-by-section structure for each page, in order, with the job each section does; copy direction — voice, reading level, and whether the model should write real copy or use the user's; and a visual system with named colors, type pairing, spacing rhythm, and imagery treatment.

Specify responsive behavior explicitly: what collapses, stacks, or hides at mobile widths, and where the primary action lives on a small screen. Require semantic HTML, visible keyboard focus, alt text, and sufficient contrast.

Be concrete about the hero — what it shows and says — since a vague hero instruction produces a generic one. Close with what the finished page must not look like, if the user has an aesthetic they're trying to avoid.`,
  },
  {
    id: "agent",
    label: "AI agents",
    description: "Role, tools, guardrails, and stopping conditions for an autonomous agent.",
    guidance: `Build a system prompt for an agent that acts in a loop with tools, not a single-turn assistant.

Structure it as: ROLE (identity, scope of authority, and what it is explicitly not responsible for); TOOLS (each tool's name, what it does, when to reach for it, and when not to — including which tools have side effects); METHOD (how to plan, when to act versus ask, how to verify its own work before reporting success); GUARDRAILS (what it must never do, what requires the user's confirmation first, how to handle credentials and untrusted content it reads); and STOPPING CONDITIONS (what "done" looks like, what to do when blocked, a hard ceiling on retries or tool calls, and when to hand back to the human).

Require the agent to state its plan before destructive or irreversible actions, and to report honestly when a task partially failed rather than papering over it. Define the exact format of its final report to the user.

Include failure handling: tool errors, empty results, ambiguous instructions, and conflicting evidence each need a stated response.`,
  },
  {
    id: "study",
    label: "School & study help",
    description: "Explanations, outlines, study guides, and feedback on a draft.",
    guidance: `Build for learning, which means the output must be usable by the student, not just correct.

Pin down: the subject and specific topic; the student's level and what they already know; the artifact wanted (explanation, outline, study guide, practice set, feedback on a draft); length and format; and the assignment's real constraints — rubric, citation style, word count, due context.

Set the explanatory approach: start from what the student already understands, define terms on first use, use one running example rather than many disconnected ones, and show worked steps for anything procedural.

For feedback on a draft, require the model to point at specific lines, separate substance from surface, and suggest a revision direction rather than rewriting the student's work for them.

State an academic-integrity stance in the prompt: the output should help the student produce their own work, and should flag when a request amounts to doing a graded assignment for them.`,
  },
  {
    id: "marketing",
    label: "Marketing & landing copy",
    description: "Audience, offer, proof, and the exact copy blocks to produce.",
    guidance: `Build for copy that has a job, not copy that sounds nice.

Pin down: the product and the specific transformation it delivers; the audience and the problem in their own words; the single most compelling proof available (numbers, names, guarantee, demo); the one action the copy drives; and the channel, which dictates length and structure.

List the exact deliverables — headline, subhead, three-to-five benefit blocks, objection handling, social proof placement, CTA button text, meta description — and give a word budget for each.

Set voice concretely: two or three adjectives plus a "sounds like" reference, and a banned-words list covering the category's clichés (revolutionary, seamless, game-changing, unlock, elevate, in today's fast-paced world).

Require benefit-led lines grounded in the reader's outcome rather than feature lists, and forbid inventing statistics, testimonials, or claims the user didn't supply. Ask for two or three distinct angles rather than one, so there's something to choose between.`,
  },
  {
    id: "data",
    label: "Data analysis & spreadsheets",
    description: "Dataset shape, the question, method, and how results get presented.",
    guidance: `Build for an analysis whose result someone will act on.

Pin down: the dataset — where it lives, its columns and types, row count, and known quality problems; the decision the analysis feeds; and the specific question, stated so it has a checkable answer.

Require an explicit method: how to handle missing values, outliers, duplicates, and mixed formats; what to group by; which metric definitions apply (define "active user", "churn", "month" rather than assuming); and which comparisons or segments matter.

For spreadsheet work, specify the exact formulas or the tool (Excel, Google Sheets, SQL dialect, pandas), the sheet layout, and whether formulas should be live or values pasted.

Demand that the output separates findings from evidence: a short answer to the question first, then the numbers that support it, then caveats about what the data cannot tell you. Forbid inventing values, and require the model to say so plainly when the data is insufficient rather than estimating.`,
  },
  {
    id: "techdoc",
    label: "Technical writing",
    description: "Docs, references, and guides with audience, scope, and structure fixed.",
    guidance: `Build for documentation someone reads while trying to get something done.

Pin down: the document type (quickstart, how-to, conceptual explainer, API reference, runbook, release note) since each has a different shape; the reader and their assumed prior knowledge; the exact scope, including what the document deliberately does not cover; and the source of truth the model may draw on.

Specify structure to the heading level, and require: a one-sentence statement of what the reader will be able to do by the end; prerequisites before steps; numbered steps with one action each; complete, runnable code examples with expected output; and a troubleshooting section covering the errors people actually hit.

Set style rules — second person, present tense, active voice, sentence-case headings, no marketing language, terminology used consistently and defined on first use.

Forbid inventing API surfaces, flags, or version numbers; require a marked placeholder where a fact is missing.`,
  },
  {
    id: "roleplay",
    label: "Roleplay & character",
    description: "A character's voice, knowledge, limits, and how scenes are run.",
    guidance: `Build a character the model can stay inside for a long conversation.

Define: who the character is — background, age, era, occupation, and the two or three experiences that shaped how they see things; their voice, with concrete speech habits (sentence length, vocabulary, verbal tics, what they never say); their goal in the scene and what they want from the user; and their knowledge boundary, including what they cannot know because of when or where they are.

Set the scene: setting, time, the relationship between character and user, and the situation as the scene opens.

Set the mechanics: whether to write actions and narration or dialogue only, response length, whether to speak for the user (usually no), and how to end a turn so the user has something to respond to.

Include staying-in-character rules and an explicit out: the character holds unless the user uses a stated signal or the conversation turns to something the model shouldn't roleplay, in which case it drops character and responds plainly.`,
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export const DEFAULT_TEMPLATE = "general";
