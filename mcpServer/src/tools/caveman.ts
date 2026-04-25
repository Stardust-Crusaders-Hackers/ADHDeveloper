type CacheControl = { type: "ephemeral" };

interface CavemanTextBlockParam {
  type: "text";
  text: string;
  cache_control?: CacheControl;
}

interface CavemanContentBlockParam {
  type?: string;
  text?: unknown;
  [key: string]: unknown;
}

interface CavemanToolParam {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface CavemanMessageParam {
  role: "user" | "assistant";
  content: string | CavemanContentBlockParam[] | unknown;
}

interface CavemanMessageCreateParamsNonStreaming {
  system?: string | CavemanTextBlockParam[];
  tools?: CavemanToolParam[];
  messages: CavemanMessageParam[];
  [key: string]: unknown;
}

// ─── Compression ────────────────────────────────────────────────────────────

const WHITESPACE_RE = /\s{2,}/g;
const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const CODE_BLOCK_PLACEHOLDER_PREFIX = "__CAVEMAN_CODE_BLOCK_";

type LanguageProfile = {
  id: string;
  aliases: string[];
  articles: string[];
  fillers: string[];
};

const LANGUAGE_PROFILES: LanguageProfile[] = [
  {
    id: "en",
    aliases: ["en", "eng", "english"],
    articles: ["a", "an", "the"],
    fillers: [
      "just",
      "really",
      "basically",
      "actually",
      "simply",
      "very",
      "quite",
      "rather",
      "somewhat",
      "perhaps",
      "maybe",
      "certainly",
      "of course",
      "happy to",
      "sure",
      "I think",
      "I believe",
      "it seems",
      "it appears",
    ],
  },
  {
    id: "es",
    aliases: ["es", "spa", "spanish", "espanol", "español"],
    articles: ["el", "la", "los", "las", "un", "una", "unos", "unas", "al", "del"],
    fillers: [
      "solo",
      "solamente",
      "realmente",
      "básicamente",
      "basicamente",
      "en realidad",
      "simplemente",
      "muy",
      "bastante",
      "quizá",
      "quizas",
      "quizás",
      "tal vez",
      "seguramente",
      "por supuesto",
      "creo",
      "me parece",
    ],
  },
  {
    id: "fr",
    aliases: ["fr", "fra", "french", "francais", "français"],
    articles: ["le", "la", "les", "un", "une", "des", "du", "de", "l'"],
    fillers: [
      "juste",
      "vraiment",
      "essentiellement",
      "en fait",
      "simplement",
      "très",
      "tres",
      "assez",
      "peut-être",
      "peut etre",
      "sûrement",
      "surement",
      "bien sûr",
      "bien sur",
      "je pense",
      "je crois",
      "il semble",
      "il paraît",
      "il parait",
    ],
  },
  {
    id: "de",
    aliases: ["de", "ger", "german", "deutsch"],
    articles: ["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "eines"],
    fillers: [
      "nur",
      "wirklich",
      "eigentlich",
      "einfach",
      "sehr",
      "ziemlich",
      "vielleicht",
      "vermutlich",
      "sicherlich",
      "natürlich",
      "natuerlich",
      "ich denke",
      "ich glaube",
      "es scheint",
    ],
  },
  {
    id: "it",
    aliases: ["it", "ita", "italian", "italiano"],
    articles: ["il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "l'"],
    fillers: [
      "solo",
      "solamente",
      "realmente",
      "praticamente",
      "semplicemente",
      "molto",
      "abbastanza",
      "forse",
      "sicuramente",
      "certo",
      "penso",
      "credo",
      "sembra",
    ],
  },
  {
    id: "pt",
    aliases: ["pt", "por", "portuguese", "portugues", "português"],
    articles: ["o", "a", "os", "as", "um", "uma", "uns", "umas", "do", "da", "dos", "das"],
    fillers: [
      "só",
      "so",
      "realmente",
      "basicamente",
      "simplesmente",
      "muito",
      "bastante",
      "talvez",
      "certamente",
      "claro",
      "acho",
      "penso",
      "parece",
    ],
  },
  {
    id: "nl",
    aliases: ["nl", "dut", "dutch", "nederlands"],
    articles: ["de", "het", "een"],
    fillers: ["echt", "eigenlijk", "simpelweg", "heel", "best", "misschien", "zeker", "natuurlijk", "ik denk"],
  },
  {
    id: "sv",
    aliases: ["sv", "swe", "swedish", "svenska"],
    articles: ["en", "ett", "den", "det", "de"],
    fillers: ["bara", "verkligen", "egentligen", "enkelt", "mycket", "ganska", "kanske", "säkert", "självklart"],
  },
  {
    id: "no",
    aliases: ["no", "nor", "norwegian", "norsk"],
    articles: ["en", "ei", "et", "den", "det", "de"],
    fillers: ["bare", "virkelig", "egentlig", "enkelt", "veldig", "ganske", "kanskje", "sikkert", "selvfølgelig"],
  },
  {
    id: "da",
    aliases: ["da", "dan", "danish", "dansk"],
    articles: ["en", "et", "den", "det", "de"],
    fillers: ["bare", "virkelig", "egentlig", "enkelt", "meget", "ret", "måske", "sikkert", "selvfølgelig"],
  },
];

const LANGUAGE_LOOKUP = new Map(
  LANGUAGE_PROFILES.flatMap((profile) => [profile.id, ...profile.aliases].map((alias) => [alias, profile] as const))
);

export function compress(text: string, language?: string): string {
  const { text: protectedText, placeholders } = extractCodeBlocks(text);
  const compressedNaturalText = compressNaturalText(protectedText, language);
  return restoreCodeBlocks(compressedNaturalText, placeholders);
}

export function estimateSavings(text: string, language?: string): {
  originalChars: number;
  compressedChars: number;
  savedChars: number;
  savedPct: number;
} {
  const compressed = compress(text, language);
  const savedChars = text.length - compressed.length;
  return {
    originalChars: text.length,
    compressedChars: compressed.length,
    savedChars,
    savedPct: text.length === 0 ? 0 : Math.round((savedChars / text.length) * 100),
  };
}

// ─── Caveman Tool Definition ─────────────────────────────────────────────────

export interface CavemanToolInput {
  text: string;
  action: 'compress' | 'estimate_savings';
  language?: string;
}

/**
 * Drop into any agent's `tools` array to give it caveman compression capability.
 * The model can call this to compress its own output or user-provided text.
 */
export const cavemanTool: CavemanToolParam = {
  name: 'caveman',
  description:
    'Compress text to caveman style: drop language-specific articles, filler words, and hedging. ' +
    'Code blocks stay unchanged. Reduces token count while preserving full technical meaning.',
  input_schema: {
    type: 'object' as const,
    properties: {
      text: {
        type: 'string',
        description: 'Text to process',
      },
      action: {
        type: 'string',
        enum: ['compress', 'estimate_savings'],
        description:
          'compress → return compressed text. estimate_savings → return char/token count comparison.',
      },
      language: {
        type: 'string',
        description: 'Optional language hint such as en, es, fr, de, it, pt. Auto-detected if omitted.',
      },
    },
    required: ['text', 'action'],
  },
};

/** Process a caveman tool_use block returned by the model. */
export function handleCavemanTool(input: CavemanToolInput): string {
  if (input.action === 'estimate_savings') {
    return JSON.stringify(estimateSavings(input.text, input.language));
  }
  return compress(input.text, input.language);
}

// ─── Behavior Injection ──────────────────────────────────────────────────────

type SystemBlock = CavemanTextBlockParam;
type MsgParams = CavemanMessageCreateParamsNonStreaming;

/**
 * Caveman system instruction injected as a cached block.
 * Cached after the first turn → no input cost on subsequent calls with same system.
 */
const CAVEMAN_SYSTEM_BLOCK: SystemBlock = {
  type: 'text',
  text: [
    'CAVEMAN BEHAVIOR RULES:',
    '- Drop articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries, hedging.',
    '- Fragments OK. Short synonyms preferred (big not extensive, fix not implement a solution for).',
    '- Technical terms: exact. Code blocks: unchanged.',
    '- Pattern: [thing] [action] [reason]. [next step].',
  ].join('\n'),
  cache_control: { type: 'ephemeral' },
};

export interface WithCavemanOptions {
  /**
   * Compress the last user message before sending (default: true).
   * Disable if message content is already structured/controlled.
   */
  compressLastUserMessage?: boolean;
}

/**
 * Wrap any MessageCreateParams to make any agent a caveman.
 *
 * What this does:
 *  1. Injects caveman behavior rules into system prompt (as a cached block)
 *  2. Caches the existing system prompt so repeated calls skip re-tokenisation
 *  3. Appends `cavemanTool` to the tools array
 *  4. Optionally compresses the last user message
 *
 * @example
 * const reply = await client.messages.create(
 *   withCaveman({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages })
 * );
 */
export function withCaveman(params: MsgParams, options: WithCavemanOptions = {}): MsgParams {
  const system = buildSystem(params.system);
  const tools = [...(params.tools ?? []), cavemanTool];
  const messages =
    options.compressLastUserMessage !== false
      ? compressLastUserMsg(params.messages)
      : params.messages;

  return { ...params, system, tools, messages };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSystem(existing: MsgParams['system']): SystemBlock[] {
  const blocks: SystemBlock[] = [];

  if (!existing) {
    // No existing system — just add caveman block
  } else if (typeof existing === 'string') {
    // Promote string to cached block so it's reused across turns
    blocks.push({ type: 'text', text: existing, cache_control: { type: 'ephemeral' } });
  } else {
    // Preserve existing blocks as-is (caller controls their cache_control)
    blocks.push(...(existing as SystemBlock[]));
  }

  blocks.push(CAVEMAN_SYSTEM_BLOCK);
  return blocks;
}

function compressLastUserMsg(messages: CavemanMessageParam[]): CavemanMessageParam[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== 'user') return messages;

  if (typeof last.content === 'string') {
    return [...messages.slice(0, -1), { ...last, content: compress(last.content) }];
  }

  if (!Array.isArray(last.content)) return messages;

  const compressedContent = last.content.map((block) => {
    if (block?.type !== 'text' || typeof block.text !== 'string') {
      return block;
    }

    return {
      ...block,
      text: compress(block.text),
    };
  });

  return [...messages.slice(0, -1), { ...last, content: compressedContent }];
}

function compressNaturalText(text: string, language?: string): string {
  const profile = resolveLanguageProfile(text, language);
  let output = text;

  for (const regex of buildProfileRegexes(profile)) {
    output = output.replace(regex, '$1');
  }

  return output.replace(WHITESPACE_RE, ' ').trim();
}

function extractCodeBlocks(text: string): { text: string; placeholders: string[] } {
  const placeholders: string[] = [];
  const stripped = text.replace(CODE_BLOCK_RE, (match) => {
    const token = `${CODE_BLOCK_PLACEHOLDER_PREFIX}${placeholders.length}__`;
    placeholders.push(match);
    return token;
  });

  return { text: stripped, placeholders };
}

function restoreCodeBlocks(text: string, placeholders: string[]): string {
  let output = text;

  placeholders.forEach((block, index) => {
    output = output.replaceAll(`${CODE_BLOCK_PLACEHOLDER_PREFIX}${index}__`, block);
  });

  return output;
}

function resolveLanguageProfile(text: string, language?: string): LanguageProfile {
  const normalized = normalizeLanguage(language);
  if (normalized) {
    const explicit = LANGUAGE_LOOKUP.get(normalized);
    if (explicit) return explicit;
  }

  let bestProfile = LANGUAGE_PROFILES[0];
  let bestScore = -1;

  for (const profile of LANGUAGE_PROFILES) {
    const score = scoreLanguageProfile(text, profile);
    if (score > bestScore) {
      bestScore = score;
      bestProfile = profile;
    }
  }

  return bestProfile;
}

function scoreLanguageProfile(text: string, profile: LanguageProfile): number {
  const regexes = buildProfileRegexes(profile);
  return regexes.reduce((sum, regex) => sum + (text.match(regex)?.length ?? 0), 0);
}

function buildProfileRegexes(profile: LanguageProfile): RegExp[] {
  const articles = profile.articles.length > 0 ? [buildRemovalRegex(profile.articles)] : [];
  const fillers = profile.fillers.length > 0 ? [buildRemovalRegex(profile.fillers)] : [];
  return [...articles, ...fillers];
}

function buildRemovalRegex(terms: string[]): RegExp {
  const escaped = [...terms]
    .sort((a, b) => b.length - a.length)
    .map((term) => {
      const body = term.split(/\s+/).map(escapeRegex).join('\\s+');
      const needsLetterLookahead = /['’]\s*$/.test(term);
      return needsLetterLookahead
        ? `(?:${body})(?=\\p{L})`
        : `(?:${body})(?=$|[^\\p{L}\\p{N}_])`;
    })
    .join('|');
  return new RegExp(`(^|[^\\p{L}\\p{N}_])(?:${escaped})\\s*`, 'giu');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLanguage(language?: string): string | undefined {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized.split(/[-_]/)[0];
}
