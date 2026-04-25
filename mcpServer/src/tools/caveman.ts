import Anthropic from '@anthropic-ai/sdk';

// ─── Compression ────────────────────────────────────────────────────────────

const FILLER_RE =
  /\b(just|really|basically|actually|simply|very|quite|rather|somewhat|perhaps|maybe|certainly|of course|happy to|sure|I think|I believe|it seems|it appears)\b\s*/gi;
const ARTICLE_RE = /\b(a|an|the)\s+/gi;
const WHITESPACE_RE = /\s{2,}/g;

export function compress(text: string): string {
  return text
    .replace(FILLER_RE, '')
    .replace(ARTICLE_RE, '')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

export function estimateSavings(text: string): {
  originalChars: number;
  compressedChars: number;
  savedChars: number;
  savedPct: number;
} {
  const compressed = compress(text);
  const savedChars = text.length - compressed.length;
  return {
    originalChars: text.length,
    compressedChars: compressed.length,
    savedChars,
    savedPct: Math.round((savedChars / text.length) * 100),
  };
}

// ─── Caveman Tool Definition ─────────────────────────────────────────────────

export interface CavemanToolInput {
  text: string;
  action: 'compress' | 'estimate_savings';
}

/**
 * Drop into any agent's `tools` array to give it caveman compression capability.
 * The model can call this to compress its own output or user-provided text.
 */
export const cavemanTool: Anthropic.Tool = {
  name: 'caveman',
  description:
    'Compress text to caveman style: drop articles (a/an/the), filler words, and hedging. ' +
    'Reduces token count while preserving full technical meaning.',
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
    },
    required: ['text', 'action'],
  },
};

/** Process a caveman tool_use block returned by the model. */
export function handleCavemanTool(input: CavemanToolInput): string {
  if (input.action === 'estimate_savings') {
    return JSON.stringify(estimateSavings(input.text));
  }
  return compress(input.text);
}

// ─── Behavior Injection ──────────────────────────────────────────────────────

type SystemBlock = Anthropic.Messages.TextBlockParam;
type MsgParams = Anthropic.Messages.MessageCreateParamsNonStreaming;

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

function compressLastUserMsg(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== 'user' || typeof last.content !== 'string') return messages;
  return [...messages.slice(0, -1), { ...last, content: compress(last.content) }];
}
