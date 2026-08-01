interface CommitMessageBoxProps {
  subject: string;
  body: string;
  subjectLimit: number;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
}

export function CommitMessageBox({ subject, body, subjectLimit, onSubjectChange, onBodyChange }: CommitMessageBoxProps) {
  const overLimit = subject.length > subjectLimit;
  return (
    <div class="commit-message-box">
      <input
        type="text"
        placeholder="Commit message"
        value={subject}
        onInput={(e) => onSubjectChange((e.target as HTMLInputElement).value)}
      />
      <div class={`subject-counter ${overLimit ? 'warning' : ''}`}>
        {subject.length}/{subjectLimit}
      </div>
      <textarea
        placeholder="Description (optional)"
        rows={4}
        value={body}
        onInput={(e) => onBodyChange((e.target as HTMLTextAreaElement).value)}
      />
    </div>
  );
}
