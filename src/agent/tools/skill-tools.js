/**
 * SKILL TOOLS — on-demand access to the skill library.
 *
 * The build prompt inlines two skills: motion-graphics and the working half of
 * saas-explainer-motion. Everything else on disk — motion-audio, css-animations,
 * framer-motion, svg-shape-morphing, and anything the user drops into ~/.anymotion/skills —
 * is advertised through the catalogue but not loaded, because a 290KB system prompt takes so
 * long to upload on a cold cache that the stall guard kills the request before the model has
 * emitted a token.
 *
 * load_skill is what makes that safe: the model reads what the job turns out to need, when it
 * knows what the job is. list_skills is the discovery half — the build prompt advertises the
 * catalogue, and this tool lets the model re-check it mid-run.
 */

import { listSkills, readSkill } from '../skills.js';

// A skill is reference material, not a file to be dumped. Past this the model is better
// served by the sections it asked for than by the whole document, and a 250KB tool_result
// will crowd out the conversation it was meant to inform.
const MAX_SKILL_CHARS = 60_000;

export const skillTools = [
  {
    name: 'list_skills',
    description:
      'List every skill available on this machine, with a one-line description of what each covers. ' +
      'Skills are craft references — timing and easing conventions, library-specific patterns, sound design, ' +
      'CSS performance. Two are already loaded into your system prompt; this shows the rest. ' +
      'Call this when a request touches a technique that is not covered by the guidance you already have — ' +
      'React animation, SVG path morphing, and so on — to see whether a skill covers it before you improvise.',
    input_schema: {
      type: 'object',
      properties: {}
    },
    run() {
      const skills = listSkills();
      if (!skills.length) {
        return {
          content:
            'No skills found on the search path. Work from the guidance already in your system prompt.',
          meta: { count: 0 }
        };
      }

      const lines = skills.map(s => {
        const desc = s.description || '(no description)';
        return `- ${s.name} (${s.size}KB) — ${desc}`;
      });

      return {
        content:
          `${skills.length} skills available:\n${lines.join('\n')}\n\n` +
          `Call load_skill with one of these names to read it. Only load one you actually need — ` +
          `each costs real context.`,
        meta: { count: skills.length, names: skills.map(s => s.name) }
      };
    },
    summarize(input, result) {
      return `${result.meta.count} skills`;
    },
    label() { return 'ListSkills()'; }
  },

  {
    name: 'load_skill',
    description:
      'Read a specific skill by name and get its full guidance. Use this when the job needs craft knowledge ' +
      'your system prompt does not already carry: animating a React component (framer-motion), morphing one ' +
      'SVG path into another (svg-shape-morphing), or any skill list_skills turned up that fits the request. ' +
      'Load it BEFORE you write the code it would inform, not after — the point is to build on the skill, ' +
      'not to check your work against it. ' +
      'Do not load a skill you already have: motion-graphics and saas-explainer-motion are in your ' +
      'system prompt from the start. motion-audio and css-animations are NOT — load motion-audio when ' +
      'the piece needs sound design, and css-animations when you hit a performance problem or need ' +
      'GPU-acceleration specifics. Do not load more than two per run, and do not ' +
      'reload one you have already read in this run.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Exact skill name as reported by list_skills, e.g. "framer-motion".'
        }
      },
      required: ['name']
    },
    run(input, ctx) {
      const name = String(input.name || '').trim();
      if (!name) throw new Error('name is required. Call list_skills to see what is available.');

      const skill = readSkill(name);
      if (!skill) {
        const available = listSkills().map(s => s.name);
        throw new Error(
          `No skill named "${name}". Available: ${available.join(', ') || '(none)'}.`
        );
      }

      // `chosen: true` is what separates this from the two skills the prompt inlines on
      // every run. Those are announced too, but they are a fixed part of the prompt — the
      // agent did not pick them, and showing both the same way made every run look as
      // though the agent had considered its options when it had not.
      if (typeof ctx.emit === 'function') {
        ctx.emit({ type: 'skill', name: `${skill.name}/SKILL.md`, size: skill.size, chosen: true });
      }

      let text = skill.text;
      let truncated = false;
      if (text.length > MAX_SKILL_CHARS) {
        text = text.slice(0, MAX_SKILL_CHARS);
        truncated = true;
      }

      const header = `# SKILL: ${skill.name}\n`;
      const footer = truncated
        ? `\n\n[Truncated at ${MAX_SKILL_CHARS} characters. Use read_file on ${skill.path} ` +
          `if you need a later section.]`
        : '';

      return {
        content: header + text + footer,
        meta: { name: skill.name, size: skill.size, truncated }
      };
    },
    summarize(input, result) {
      return result.meta.truncated
        ? `${result.meta.name} (${result.meta.size}KB, truncated)`
        : `${result.meta.name} (${result.meta.size}KB)`;
    },
    label(input) {
      return `LoadSkill(${String(input?.name || '?')})`;
    }
  }
];
