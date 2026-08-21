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
 *
 * Both descriptions below are deliberately written as "load every one that applies" rather than
 * "load one if you must". The earlier wording capped loads at two per run and named motion-audio
 * and css-animations as the examples, which is exactly what the agent then did — audio on almost
 * every run, and framer-motion and svg-shape-morphing effectively never, however well they fit.
 */

import { listSkills, readSkill, PRIMARY_SKILLS } from '../skills.js';

// Skills are reference material and craft guidance. Full length is provided with no truncation.
const MAX_SKILL_CHARS = 500_000;

/** "motion-graphics and saas-explainer-motion", built from the one list that defines them. */
const PRIMARY_LIST = PRIMARY_SKILLS.join(' and ');

function executeSkillRead(input, ctx = {}) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('name is required. Call list_skills to see what is available.');

  if (!ctx.loadedSkills) {
    ctx.loadedSkills = new Set();
  }

  const skill = readSkill(name, { reference: input.reference, section: input.section, stripSourceFiles: false });
  if (!skill) {
    const available = listSkills().map(s => s.name);
    throw new Error(
      `No skill named "${name}". Available: ${available.join(', ') || '(none)'}.`
    );
  }

  ctx.loadedSkills.add(skill.name);

  if (typeof ctx.emit === 'function') {
    const displayName = input.reference ? `${skill.name}/${input.reference}` : (name.includes('/') ? name : `${skill.name}/SKILL.md`);
    ctx.emit({ type: 'skill', name: displayName, size: skill.size, chosen: true });
  }

  let text = skill.text;
  let truncated = false;
  if (text.length > MAX_SKILL_CHARS) {
    text = text.slice(0, MAX_SKILL_CHARS);
    truncated = true;
  }

  const header = `# SKILL: ${skill.name}${input.reference ? ` (${input.reference})` : ''} (${skill.size}KB)\n\n`;
  const footer = truncated
    ? `\n\n[Truncated at ${MAX_SKILL_CHARS} characters. Use load_skill with section: "<topic>" to jump to specific sections.]`
    : '';

  return {
    content: header + text + footer,
    meta: { name: skill.name, size: skill.size, truncated: false }
  };
}

export const skillTools = [
  {
    name: 'list_skills',
    description:
      'List every skill available on this machine, with a description of what each covers. ' +
      'Skills are comprehensive craft references — timing, Liquid Glass UI, sound design, ' +
      'CSS performance, SVG morphing, UI/UX systems, etc. ' +
      'Call this whenever you need to check available skills before loading them.',
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
        const tag = PRIMARY_SKILLS.includes(s.name) ? ' [inlined in prompt]' : '';
        return `- ${s.name} (${s.size}KB)${tag} — ${desc}`;
      });

      const loadable = skills.map(s => s.name);

      return {
        content:
          `${skills.length} skills available:\n${lines.join('\n')}\n\n` +
          `Call load_skill("<skill-name>") or read_skill("<skill-name>") at any time to read any skill completely.`,
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
      'Load and completely read any skill (or specific reference guide inside a skill) by name for deep domain guidance and code patterns.\n' +
      'You can call load_skill whenever you want to inspect, verify, or execute a skill completely without truncation.\n' +
      'Examples:\n' +
      '  • load_skill({ name: "ui-ux-pro-max" })\n' +
      '  • load_skill({ name: "motion-audio" })\n' +
      '  • load_skill({ name: "frontend-design" })\n' +
      '  • load_skill({ name: "saas-explainer-motion", reference: "references/liquid-glass.md" })\n' +
      '  • load_skill({ name: "svg-shape-morphing" })\n' +
      '  • load_skill({ name: "css-animations" })',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Skill name or path (e.g. "ui-ux-pro-max", "saas-explainer-motion", "motion-audio", "frontend-design").'
        },
        reference: {
          type: 'string',
          description: 'Optional path to a reference file inside the skill folder (e.g. "references/liquid-glass.md").'
        },
        section: {
          type: 'string',
          description: 'Optional section heading or topic to jump to.'
        }
      },
      required: ['name']
    },
    run(input, ctx = {}) {
      return executeSkillRead(input, ctx);
    },
    summarize(input, result) {
      return `${result.meta.name} (${result.meta.size}KB, 100% loaded)`;
    },
    label(input) {
      return `LoadSkill(${String(input?.name || '?')})`;
    }
  },

  {
    name: 'read_skill',
    description:
      'Alias for load_skill. Read any skill completely by name on demand.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Skill name or path.'
        },
        reference: {
          type: 'string',
          description: 'Optional reference sub-path.'
        },
        section: {
          type: 'string',
          description: 'Optional section topic.'
        }
      },
      required: ['name']
    },
    run(input, ctx = {}) {
      return executeSkillRead(input, ctx);
    },
    summarize(input, result) {
      return `${result.meta.name} (${result.meta.size}KB, 100% loaded)`;
    },
    label(input) {
      return `ReadSkill(${String(input?.name || '?')})`;
    }
  }
];
