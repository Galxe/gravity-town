import type { Entry } from '../store/useGameStore';

/**
 * Format a raw Entry into a narrative story sentence.
 * Returns { icon, narrative, color } for rendering.
 */
export interface NarrativeEvent {
  id: number;
  icon: string;
  narrative: string;
  color: 'red' | 'blue' | 'gold' | 'green' | 'purple' | 'cyan';
  timestamp: number;
  importance: number;
  category: string;
  raw: Entry;
}

// Exact category matches (highest priority)
const EXACT_CATEGORY: Record<string, { icon: string; color: NarrativeEvent['color'] }> = {
  debate:          { icon: '\u{1F4DC}', color: 'gold' },   // 📜
  support:         { icon: '\u2714', color: 'green' },      // ✔
  oppose:          { icon: '\u2718', color: 'red' },         // ✘
  chronicle:       { icon: '\u{1F4D6}', color: 'purple' },  // 📖
  summary:         { icon: '\u{1F4CB}', color: 'cyan' },    // 📋
};

// Keyword patterns — checked against category AND content (lower-cased)
const KEYWORD_RULES: { test: RegExp; icon: string; color: NarrativeEvent['color'] }[] = [
  // Combat / victory / defeat
  { test: /victory|conquer|captur|raid|attack|war|destroy|crush|fell|defeat|invad/i,
    icon: '\u2694', color: 'red' },       // ⚔
  // Defense / protection
  { test: /defend|protect|fortif|arsenal|shield|guard|repel/i,
    icon: '\u{1F6E1}', color: 'blue' },   // 🛡
  // Building / production / economy
  { test: /build|mine|product|expand|construct|industry|prosper|grow|operation/i,
    icon: '\u{1F3D7}', color: 'green' },   // 🏗
  // Diplomacy / alliance / threat
  { test: /alliance|diplomat|negotiat|treaty|pact|betray|threat|ultimat|surrender/i,
    icon: '\u{1F91D}', color: 'blue' },    // 🤝
  // Announcement / decree / proclamation
  { test: /announce|decree|proclaim|declar|loyal|citizen|people|domain/i,
    icon: '\u{1F4E3}', color: 'gold' },    // 📣
  // Strategy / scout / intelligence
  { test: /scout|strateg|intelligen|reconn|observ|plan|spy/i,
    icon: '\u{1F9E0}', color: 'cyan' },    // 🧠
  // Trade / economy
  { test: /trade|market|ore|wealth|resource|harvest/i,
    icon: '\u{1F4B0}', color: 'gold' },    // 💰
];

const DEFAULT_CONFIG = { icon: '\u{1F4DC}', color: 'cyan' as const }; // 📜

function classifyEntry(entry: Entry): { icon: string; color: NarrativeEvent['color'] } {
  // 1. Exact category match
  const exact = EXACT_CATEGORY[entry.category];
  if (exact) return exact;

  // 2. Keyword match on category + content
  const haystack = `${entry.category} ${entry.content}`;
  for (const rule of KEYWORD_RULES) {
    if (rule.test.test(haystack)) {
      return { icon: rule.icon, color: rule.color };
    }
  }

  return DEFAULT_CONFIG;
}

export function formatNarrative(
  entry: Entry,
  agents: Record<number, { name: string }>,
): NarrativeEvent {
  const config = classifyEntry(entry);
  const authorName = agents[entry.authorAgent]?.name || `Agent #${entry.authorAgent}`;

  let narrative: string;

  switch (entry.category) {
    case 'debate':
      narrative = `${authorName} declares: \u201C${truncate(entry.content, 80)}\u201D`;
      break;
    case 'support': {
      const target = resolveTarget(entry, agents);
      narrative = `${authorName} rallies behind ${target}: \u201C${truncate(entry.content, 60)}\u201D`;
      break;
    }
    case 'oppose': {
      const target = resolveTarget(entry, agents);
      narrative = `${authorName} speaks against ${target}: \u201C${truncate(entry.content, 60)}\u201D`;
      break;
    }
    case 'chronicle': {
      const stars = '\u2605'.repeat(Math.min(entry.importance, 5));
      narrative = `A new chapter is written: \u201C${truncate(entry.content, 60)}\u201D ${stars}`;
      break;
    }
    default:
      // For all other categories, build a narrative sentence from the content
      narrative = buildNarrative(authorName, entry);
  }

  return {
    id: entry.id,
    icon: config.icon,
    narrative,
    color: config.color,
    timestamp: entry.timestamp,
    importance: entry.importance,
    category: entry.category,
    raw: entry,
  };
}

/** Build a story-like sentence from freeform content */
function buildNarrative(author: string, entry: Entry): string {
  const cat = entry.category.toLowerCase();
  const content = truncate(entry.content, 90);

  // If content already starts with the author name, just use it
  if (entry.content.toLowerCase().startsWith(author.toLowerCase())) {
    return content;
  }

  // Match category to a narrative verb
  if (/victory|conquer|captur/.test(cat)) return `${author} claims victory \u2014 ${content}`;
  if (/defeat|retreat|lost/.test(cat))     return `${author} suffers defeat \u2014 ${content}`;
  if (/announce|decree/.test(cat))         return `${author} proclaims: \u201C${content}\u201D`;
  if (/threat|warning/.test(cat))          return `${author} issues a warning: \u201C${content}\u201D`;
  if (/build|production/.test(cat))        return `${author} reports: ${content}`;
  if (/diplomat|alliance/.test(cat))       return `${author} extends an offer: \u201C${content}\u201D`;

  // Default: wrap as a quote from the agent
  return `${author}: \u201C${content}\u201D`;
}

function resolveTarget(entry: Entry, agents: Record<number, { name: string }>): string {
  return entry.relatedAgents[0]
    ? (agents[entry.relatedAgents[0]]?.name || `#${entry.relatedAgents[0]}`)
    : 'the motion';
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

/** Format a unix timestamp as relative time like "2m ago" */
export function timeAgo(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Get a reputation label for a chronicle score */
export function reputationLabel(score: number): { text: string; color: string } {
  if (score >= 4) return { text: 'Legendary', color: 'text-cart-gold' };
  if (score >= 2) return { text: 'Renowned', color: 'text-cart-green' };
  if (score >= 1) return { text: 'Respected', color: 'text-cart-green' };
  if (score === 0) return { text: 'Unknown', color: 'text-ink-faded' };
  if (score >= -1) return { text: 'Questionable', color: 'text-cart-gold' };
  if (score >= -3) return { text: 'Notorious', color: 'text-cart-red' };
  return { text: 'Reviled', color: 'text-cart-red' };
}
