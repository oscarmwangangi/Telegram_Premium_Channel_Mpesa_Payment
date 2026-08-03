import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";

export function AnnouncementsPage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const { data } = await api.post<{ recipientCount: number }>("/admin/notifications/announcements", {
        subject,
        bodyHtml: `<p>${body}</p>`,
      });
      setResult(`Sent to ${data.recipientCount} active subscribers.`);
      setSubject("");
      setBody("");
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Could not send announcement.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-2xl font-semibold">Announcements</h2>
        <p className="text-muted text-sm mt-1">
          Broadcasts by email to every active subscriber who has an email on file.
        </p>
      </div>

      <form onSubmit={submit} className="card p-5 space-y-4">
        <div>
          <label className="label-eyebrow block mb-1.5">Subject</label>
          <input className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </div>
        <div>
          <label className="label-eyebrow block mb-1.5">Message</label>
          <textarea
            className="input w-full min-h-32"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
        {result && <p className="text-sm text-signal">{result}</p>}
        <button type="submit" disabled={sending} className="btn-primary">
          {sending ? "Sending…" : "Send announcement"}
        </button>
      </form>
    </div>
  );
}
