import { useState } from 'react';
import { useChatStore, type ToolActivity } from '../../store/chatStore';

const LABELS: Record<string, string> = {
  get_file_info: 'Info',
  list_dir: 'List',
  read_text_file: 'Read',
  load_file: 'Load file',
  activate_skill: 'Skill',
  run_command: 'Run'
};

const ICONS: Record<ToolActivity['status'], string> = {
  running: '⟳',
  ok: '✓',
  error: '⚠'
};

function pathOf(input: unknown): string {
  if (input && typeof input === 'object' && 'path' in input) {
    return String((input as { path: unknown }).path ?? '');
  }
  return '';
}

function commandOf(input: unknown): string {
  if (input && typeof input === 'object' && 'command' in input) {
    return String((input as { command: unknown }).command ?? '');
  }
  return '';
}

function nameOf(input: unknown): string {
  if (input && typeof input === 'object' && 'name' in input) {
    return String((input as { name: unknown }).name ?? '');
  }
  return '';
}

export function ToolCall({ tool }: { tool: ToolActivity }) {
  const verb = LABELS[tool.name] ?? tool.name;
  const path = pathOf(tool.input);
  const command = commandOf(tool.input);
  const name = nameOf(tool.input);
  const respondToCommand = useChatStore((s) => s.respondToCommand);
  const awaiting = tool.pendingCommand !== undefined;
  const [expanded, setExpanded] = useState(false);

  // Once a command is no longer waiting for approval, clicking the row
  // expands it to reveal exactly what was run.
  const canExpand = command !== '' && !awaiting;

  return (
    <div className={`toolcall toolcall--${tool.status} ${awaiting ? 'toolcall--awaiting' : ''}`}>
      <div
        className="toolcall__line"
        style={canExpand ? { cursor: 'pointer' } : undefined}
        onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
      >
        <span className="toolcall__icon">{ICONS[tool.status]}</span>
        <span className="toolcall__verb">{verb}</span>
        {canExpand && <span className="toolcall__caret">{expanded ? '▾' : '▸'}</span>}
        {name && (
          <span className="toolcall__path" title={name}>
            {name}
          </span>
        )}
        {path && (
          <span className="toolcall__path" title={path}>
            {path}
          </span>
        )}
        {tool.status === 'error' && tool.preview && (
          <span className="toolcall__err">{tool.preview}</span>
        )}
      </div>

      {awaiting && (
        <div className="toolcall__approve">
          <code className="toolcall__ask">{tool.pendingCommand}</code>
          <div className="toolcall__buttons">
            <button
              className="btn btn--small btn--approve"
              onClick={() => respondToCommand(tool.id, true)}
            >
              הרץ
            </button>
            <button
              className="btn btn--small btn--deny"
              onClick={() => respondToCommand(tool.id, false)}
            >
              דחה
            </button>
          </div>
        </div>
      )}

      {canExpand && expanded && <code className="toolcall__ask">{command}</code>}
    </div>
  );
}
