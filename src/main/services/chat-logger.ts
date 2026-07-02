import type { BetaMessage, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta';

/**
 * Renders the tool-runner conversation as a readable transcript so you can follow
 * exactly what the model saw and did: each assistant turn, every tool call with its
 * input, the tool results fed back, token usage, and the stop reason.
 *
 * Toggle with the CHAT_LOG env var (set to "0"/"false" to silence).
 */
const ENABLED = !['0', 'false', 'off'].includes((process.env.CHAT_LOG ?? '1').toLowerCase());

const truncate = (s: string, n = 500): string =>
  s.length > n ? `${s.slice(0, n)}… [+${s.length - n} chars]` : s;

const stringify = (v: unknown): string => {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
};

/** One logger per conversation; keeps a turn counter and a transcript prefix. */
export function createChatLogger(conversationId: string) {
  const tag = `[chat ${conversationId.slice(0, 8)}]`;
  let turn = 0;

  const line = (s = ''): void => {
    if (ENABLED) console.log(s ? `${tag} ${s}` : tag);
  };

  return {
    /** Log the request before the loop starts: system prompt + the user messages. */
    start(system: string, messages: BetaMessageParam[]): void {
      line('━━━━━━━━━━ chat start ━━━━━━━━━━');
      line(`system: ${truncate(system, 800)}`);
      for (const m of messages) renderMessage(m, line);
    },

    /** Log one assistant turn (text + tool calls + stop reason + usage). */
    assistant(msg: BetaMessage): void {
      turn += 1;
      line(`──────── turn ${turn} · assistant (${msg.model}) ────────`);
      for (const block of msg.content) {
        if (block.type === 'text') {
          line(`  text: ${truncate(block.text)}`);
        } else if (block.type === 'tool_use') {
          line(`  🔧 tool_use ${block.name}(${truncate(stringify(block.input), 300)})  id=${block.id}`);
        } else if (block.type === 'thinking') {
          line(`  💭 thinking: ${truncate(block.thinking, 300)}`);
        }
      }
      const u = msg.usage;
      line(`  stop=${msg.stop_reason} · in=${u.input_tokens} out=${u.output_tokens}` +
        (u.cache_read_input_tokens ? ` · cacheRead=${u.cache_read_input_tokens}` : ''));
    },

    /** Log the tool_result message the runner feeds back to the model. */
    toolResults(message: BetaMessageParam): void {
      renderMessage(message, line);
    },

    done(stopReason: string): void {
      line(`━━━━━━━━━━ chat done (${stopReason}) ━━━━━━━━━━`);
    },

    error(message: string): void {
      line(`✖ error: ${message}`);
    }
  };
}

function renderMessage(m: BetaMessageParam, line: (s?: string) => void): void {
  if (typeof m.content === 'string') {
    line(`  ${m.role}: ${truncate(m.content)}`);
    return;
  }
  for (const block of m.content) {
    if (typeof block === 'string') {
      line(`  ${m.role}: ${truncate(block)}`);
    } else if (block.type === 'text') {
      line(`  ${m.role}: ${truncate(block.text)}`);
    } else if (block.type === 'tool_result') {
      const body = Array.isArray(block.content)
        ? block.content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join(' ')
        : stringify(block.content);
      line(`  ↩ tool_result ${block.is_error ? '(error) ' : ''}id=${block.tool_use_id}: ${truncate(body, 300)}`);
    }
  }
}
