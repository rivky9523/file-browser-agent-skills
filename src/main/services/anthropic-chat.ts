import path from 'node:path';
import { homedir } from 'node:os';
import Anthropic from '@anthropic-ai/sdk';
import type { BrowserWindow } from 'electron';
import type { ChatMessage, ChatStreamEvent, SelectionContext } from '@shared/types';
import { getApiKey } from '../secrets';
import { getSelection } from './selection-state';
import { describeSelection } from './selection-context';
import { makeTools } from './agent-tools';
import { FILES_BETA } from './file-attachments';
import { createChatLogger } from './chat-logger';


// Default model. Swap to 'claude-opus-4-8' for heavier tasks.
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 20; // safety bound on the tool loop (skills run several commands)

const controllers = new Map<string, AbortController>();

type Emit = (e: ChatStreamEvent) => void;


/**
 * The folder where run_command runs by default: the selected folder, or the
 * folder containing the selected file. Falls back to the user's home directory.
 */
function workDirFor(sel: SelectionContext): string {
  if (!sel.path) return homedir();
  return sel.kind === 'directory' ? sel.path : path.dirname(sel.path);
}


function buildSystemPrompt(metadata: string): string {
  return (
    'You are an assistant embedded in a Windows file browser.\n\n' +
    'You are given METADATA about the user\'s current selection (below) plus tools. ' +
    'Choose the cheapest path that answers the question:\n' +
    '- Answer directly from the metadata when you can (names, sizes, types, modified times, folder contents).\n' +
    '- Use get_file_info / list_dir / read_text_file for more detail on folders and text files.\n' +
    '- Call load_file ONLY when you must see a file\'s actual content (read a PDF or image, summarize a document). ' +
    'It is token-expensive — avoid it when metadata or a cheaper tool suffices.\n\n' +
    'Paths are absolute Windows paths. Be concise.\n\n' +
    '== Current selection metadata ==\n' +
    metadata
  );
}


/** Runs the agent: metadata-first context + load-on-demand tools, streamed to the UI. */
export async function runChat(
  win: BrowserWindow,
  conversationId: string,
  messages: ChatMessage[]
): Promise<void> {
  const emit: Emit = (e) => win.webContents.send('chat:event', e);

  const apiKey = await getApiKey();
  if (!apiKey) {
    emit({ type: 'error', message: 'No API key set.' });
    return;
  }

  const client = new Anthropic({ apiKey });
  const controller = new AbortController();
  controllers.set(conversationId, controller);
  const log = createChatLogger(conversationId);

  try {
    const selection = getSelection();
    const workDir = workDirFor(selection);
    const metadata = await describeSelection(selection);

    const systemPropmt = buildSystemPrompt(metadata);
    const initialMessages = messages.map((m) => ({ role: m.role, content: m.content }));
    log.start(systemPropmt, initialMessages);

    const runner = client.beta.messages.toolRunner(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        max_iterations: MAX_ITERATIONS,
        betas: [FILES_BETA], // lets tool results reference uploaded files by file_id
        system: systemPropmt,
        messages: initialMessages,
        tools: makeTools(emit, client, workDir),
        stream: true
      },
      { signal: controller.signal }
    );

    // Tracks how many messages we've already logged, so each turn we only print
    // the tool_result message(s) the runner just appended to the conversation.
    let logged = runner.params.messages.length;

    for await (const messageStream of runner) {
      for await (const event of messageStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          emit({ type: 'text', delta: event.delta.text });
        }
      }

      // Full assistant turn: text, tool calls + inputs, stop reason, usage.
      log.assistant(await messageStream.finalMessage());

      // Any tool_result messages the runner fed back since the last turn.
      const all = runner.params.messages;
      for (; logged < all.length; logged++) {
        if (all[logged].role === 'user') log.toolResults(all[logged]);
      }
    }

    log.done('end_turn');
    emit({ type: 'done', stopReason: 'end_turn' });
  } catch (err) {
    if (controller.signal.aborted) {
      log.done('aborted');
      emit({ type: 'done', stopReason: 'aborted' });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      log.error(message);
      emit({ type: 'error', message });
    }
  } finally {
    controllers.delete(conversationId);
  }
}

export function abortChat(conversationId: string): void {
  controllers.get(conversationId)?.abort();
}
