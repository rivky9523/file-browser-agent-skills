// Before the agent runs a shell command, the user has to approve it.
// The run_command tool calls waitForApproval() and pauses there; the IPC
// handler calls answerApproval() when the user clicks a button in the UI.

type Resolver = (approved: boolean) => void;

// Maps a command id to the function that un-pauses the waiting tool.
const pending = new Map<string, Resolver>();

/** Pause until the user approves (true) or denies (false) this command. */
export function waitForApproval(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    pending.set(id, resolve);
  });
}

/** Called when the user answers an approval request from the UI. */
export function answerApproval(id: string, approved: boolean): void {
  const resolve = pending.get(id);
  if (!resolve) return;
  pending.delete(id);
  resolve(approved);
}
