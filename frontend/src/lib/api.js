// Streams a reply from /api/chat (Server-Sent Events over fetch).
// onEvent receives: meta | notice | sources | reasoning | token | error | done
export async function streamChat({ messages, effort, web, instructions, signal, onEvent }) {
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, effort: (effort || '').toLowerCase(), web, instructions }),
      signal
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    onEvent({ type: 'error', message: 'Can’t reach the Thinko server. Check your connection and try again.' });
    return;
  }

  if (!res.ok || !res.body) {
    let message = `Server error (${res.status}).`;
    try {
      const j = await res.json();
      if (j.error) message = j.error;
    } catch {
      /* not json */
    }
    onEvent({ type: 'error', message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = frame.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      try {
        const evt = JSON.parse(line.slice(5).trim());
        if (evt.type === 'done' || evt.type === 'error') finished = true;
        onEvent(evt);
      } catch {
        /* ignore a broken frame */
      }
    }
  }
  if (!finished) onEvent({ type: 'done' });
}
