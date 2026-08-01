import { useState } from 'preact/hooks';

interface CreateStashFormProps {
  onCreate: (opts: { message?: string; keepIndex: boolean; includeUntracked: boolean }) => void;
}

export function CreateStashForm({ onCreate }: CreateStashFormProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [keepIndex, setKeepIndex] = useState(false);
  const [includeUntracked, setIncludeUntracked] = useState(false);

  if (!open) {
    return (
      <button class="stash-new-button" onClick={() => setOpen(true)}>
        <span class="codicon codicon-add"></span> Stash Changes…
      </button>
    );
  }

  const submit = () => {
    onCreate({ message: message.trim() || undefined, keepIndex, includeUntracked });
    setMessage('');
    setKeepIndex(false);
    setIncludeUntracked(false);
    setOpen(false);
  };

  return (
    <div class="create-stash-form">
      <input
        type="text"
        placeholder="Stash message (optional)"
        value={message}
        onInput={(e) => setMessage((e.target as HTMLInputElement).value)}
      />
      <label>
        <input type="checkbox" checked={keepIndex} onChange={(e) => setKeepIndex((e.target as HTMLInputElement).checked)} />
        Keep index
      </label>
      <label>
        <input
          type="checkbox"
          checked={includeUntracked}
          onChange={(e) => setIncludeUntracked((e.target as HTMLInputElement).checked)}
        />
        Include untracked
      </label>
      <div class="create-stash-actions">
        <button onClick={submit}>Create Stash</button>
        <button class="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
