import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Attachment01Icon,
  Delete02Icon,
  Globe02Icon,
  Menu01Icon,
  PencilEdit02Icon,
  PlusSignIcon
} from '@hugeicons/core-free-icons';

import PromptBar from './components/PromptBar';
import Sidebar from './components/Sidebar';
import Message from './components/Message';
import Welcome from './components/Welcome';
import SettingsModal from './components/SettingsModal';
import AuthScreen from './components/AuthScreen';
import LatticeLoader from './components/LatticeLoader';
import { logout, watchAuth } from './lib/firebase';
import { streamChat } from './lib/api';
import {
  exportChats,
  loadChats,
  loadSettings,
  makeChat,
  saveChats,
  saveSettings,
  titleFrom,
  uid
} from './lib/store';

const MODELS = [{ key: 'llama-3.3-70b-instruct', name: 'Llama 3.3 70B', tag: 'NVIDIA' }];
const EFFORTS = ['Low', 'High', 'Max'];

const SOURCES = [
  { key: 'files', name: 'Photos & files', description: 'Text and code files, up to 200 KB', icon: Attachment01Icon, attach: true },
  { key: 'web', name: 'Web search', description: 'Look things up live', icon: Globe02Icon, toggle: true }
];

const COMMANDS = [
  { key: 'explain', name: '/explain', description: 'Explain it simply, with an example', template: t => `Explain this in simple terms with a short example:\n\n${t}` },
  { key: 'summarize', name: '/summarize', description: 'Short summary of what you paste', template: t => `Summarize this in a few clear bullet points:\n\n${t}` },
  { key: 'fix', name: '/fix', description: 'Find and fix the bug', template: t => `Find the bug in this and give me the fixed version, with a one line reason:\n\n${t}` },
  { key: 'translate', name: '/translate', description: 'Translate to Tamil', template: t => `Translate this to natural, spoken Tamil:\n\n${t}` }
];

const expandCommand = text => {
  const m = /^\/(\w+)\s+([\s\S]+)$/.exec(text);
  const cmd = m && COMMANDS.find(c => c.key === m[1].toLowerCase());
  return cmd ? cmd.template(m[2]) : text;
};

const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const sanitize = chats =>
  chats.map(c => ({
    ...c,
    messages: (c.messages || []).map(m =>
      m.status === 'streaming'
        ? { ...m, status: m.content ? 'done' : 'error', error: m.content ? undefined : 'This reply was interrupted. Try again.' }
        : m
    )
  }));

const toApi = messages =>
  messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && m.content.trim())
    .map(m => ({ role: m.role, content: m.content }));

function Chat({ user, onLogout }) {
  const [chats, setChats] = useState(() => sanitize(loadChats(user.uid)));
  const [activeId, setActiveId] = useState(null);
  const [settings, setSettings] = useState(loadSettings);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 860 : true));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [info, setInfo] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const stick = useRef(true);
  const toastTimer = useRef(0);

  const active = chats.find(c => c.id === activeId) || null;
  const messages = active?.messages ?? [];
  const lastMsg = messages[messages.length - 1];

  // ---------- persistence
  useEffect(() => {
    const t = setTimeout(() => saveChats(user.uid, chats), 400);
    return () => clearTimeout(t);
  }, [chats, user.uid]);
  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const showToast = useCallback(msg => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const updateSettings = patch => setSettings(s => ({ ...s, ...patch }));

  // ---------- sidebar meta (so token streaming doesn't re-render the tree)
  const sig = chats.map(c => `${c.id}|${c.title}|${c.updatedAt}`).join('~');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const meta = useMemo(() => chats.map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, createdAt: c.createdAt, messages: [] })), [sig]);

  // ---------- streaming
  const streamReply = useCallback(
    async (chatId, apiMessages, effort, assistantId) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      const t0 = performance.now();
      let thinkMs = null;
      const patch = fn =>
        setChats(cs =>
          cs.map(c => (c.id === chatId ? { ...c, messages: c.messages.map(m => (m.id === assistantId ? fn(m) : m)) } : c))
        );
      const mark = () => {
        if (thinkMs == null) thinkMs = performance.now() - t0;
        return thinkMs;
      };

      try {
        await streamChat({
          messages: apiMessages,
          effort,
          web: settings.webSearch,
          instructions: settings.instructions,
          signal: ctrl.signal,
          onEvent: evt => {
            switch (evt.type) {
              case 'meta':
                patch(m => ({ ...m, model: evt.model.split('/').pop(), fallback: evt.fallback }));
                break;
              case 'notice':
                patch(m => ({ ...m, notice: evt.message }));
                break;
              case 'sources':
                patch(m => ({ ...m, sources: evt.items }));
                break;
              case 'reasoning':
                patch(m => ({ ...m, reasoning: (m.reasoning || '') + evt.delta }));
                break;
              case 'token': {
                const ms = mark();
                patch(m => ({ ...m, content: m.content + evt.delta, thinkMs: m.thinkMs ?? ms }));
                break;
              }
              case 'error': {
                const ms = mark();
                patch(m => ({ ...m, status: 'error', error: evt.message, thinkMs: m.thinkMs ?? ms }));
                break;
              }
              case 'done': {
                const ms = mark();
                patch(m => ({ ...m, status: m.status === 'error' ? 'error' : 'done', thinkMs: m.thinkMs ?? ms }));
                break;
              }
              default:
            }
          }
        });
      } catch (e) {
        const ms = mark();
        if (e.name === 'AbortError') {
          patch(m => ({
            ...m,
            status: m.content ? 'done' : 'error',
            error: m.content ? undefined : 'Stopped before a reply came back.',
            thinkMs: m.thinkMs ?? ms
          }));
        } else {
          patch(m => ({ ...m, status: 'error', error: 'Something went wrong while streaming. Please try again.', thinkMs: m.thinkMs ?? ms }));
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [settings.webSearch, settings.instructions]
  );

  const send = (text, { attachments = [], effort } = {}) => {
    if (busy) return;
    stick.current = true;
    const files = attachments.filter(a => a && a.text != null);
    const fileBlock = files.map(f => `\n\n[Attached file: ${f.name}]\n\`\`\`\n${f.text}\n\`\`\``).join('');
    const userMsg = {
      id: uid(),
      role: 'user',
      content: expandCommand(text || 'Please look at the attached file.') + fileBlock,
      display: text || '(attachment)',
      files: files.map(f => f.name)
    };
    const asst = { id: uid(), role: 'assistant', content: '', reasoning: '', status: 'streaming' };

    let chat = chatsRef.current.find(c => c.id === activeId);
    const isNew = !chat;
    if (isNew) chat = makeChat();
    const history = [...chat.messages, userMsg];
    const next = {
      ...chat,
      title: chat.messages.length === 0 ? titleFrom(text || files[0]?.name || 'New chat') : chat.title,
      updatedAt: Date.now(),
      messages: [...history, asst]
    };
    setChats(cs => (isNew ? [next, ...cs] : cs.map(c => (c.id === chat.id ? next : c))));
    setActiveId(chat.id);
    streamReply(chat.id, toApi(history), effort, asst.id);
  };

  const regenerate = () => {
    if (busy || !active) return;
    const msgs = active.messages;
    let end = msgs.length;
    while (end > 0 && msgs[end - 1].role === 'assistant') end -= 1;
    const history = msgs.slice(0, end);
    if (!history.length) return;
    const asst = { id: uid(), role: 'assistant', content: '', reasoning: '', status: 'streaming' };
    stick.current = true;
    setChats(cs => cs.map(c => (c.id === active.id ? { ...c, updatedAt: Date.now(), messages: [...history, asst] } : c)));
    streamReply(active.id, toApi(history), settings.effort, asst.id);
  };

  const stop = () => abortRef.current?.abort();

  // ---------- chat management
  const newChat = useCallback(() => {
    setActiveId(null);
    setRenaming(false);
    if (window.innerWidth <= 860) setSidebarOpen(false);
  }, []);

  const selectChat = id => {
    setActiveId(id);
    setRenaming(false);
    setConfirmDelete(false);
    stick.current = true;
    if (window.innerWidth <= 860) setSidebarOpen(false);
  };

  const deleteActive = () => {
    if (!active) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    if (busy) stop();
    setChats(cs => cs.filter(c => c.id !== active.id));
    setActiveId(null);
    setConfirmDelete(false);
  };

  const rename = value => {
    const t = value.trim();
    if (t && active) setChats(cs => cs.map(c => (c.id === active.id ? { ...c, title: t.slice(0, 80) } : c)));
    setRenaming(false);
  };

  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newChat]);

  // ---------- scrolling
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (el && settings.autoScroll && stick.current && messages.length > 0) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMsg?.content, lastMsg?.reasoning, lastMsg?.error, activeId, settings.autoScroll]);

  // ---------- prompt bar helpers
  const pickFiles = () =>
    new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py,.html,.css,.java,.dart,.c,.cpp,.go,.rs,.sql,.yaml,.yml,.xml,.log,.sh,.env,.ini,.toml';
      input.onchange = async () => {
        const out = [];
        for (const f of Array.from(input.files || [])) {
          if (f.size > 200 * 1024) {
            showToast(`${f.name} is over 200 KB, skipped.`);
            continue;
          }
          try {
            out.push({ name: f.name, text: await f.text() });
          } catch {
            showToast(`Couldn't read ${f.name}.`);
          }
        }
        resolve(out);
      };
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });

  const dictate = SpeechRecognition
    ? () =>
        new Promise((resolve, reject) => {
          const r = new SpeechRecognition();
          r.lang = navigator.language || 'en-IN';
          r.interimResults = false;
          r.onresult = e => resolve(e.results[0][0].transcript);
          r.onerror = () => {
            showToast('Microphone not available.');
            reject(new Error('mic'));
          };
          r.onend = () => resolve('');
          r.start();
        })
    : undefined;

  const name = (user.displayName || user.email?.split('@')[0] || 'there').split(' ')[0];
  const title = active?.title || 'New chat';

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? 'always' : 'user'}>
      <div className="app" data-sidebar={sidebarOpen ? 'open' : 'closed'} data-reduce={settings.reduceMotion ? '' : undefined}>
        <div className="scrim" onClick={() => setSidebarOpen(false)} />
        <Sidebar
          chats={meta}
          activeId={activeId}
          user={user}
          onNew={newChat}
          onSelect={selectChat}
          onSettings={() => setSettingsOpen(true)}
          onLogout={onLogout}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="main">
          <header className="topbar">
            <button type="button" className="icon-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle sidebar">
              <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.7} />
            </button>

            {renaming ? (
              <input
                className="topbar__rename"
                autoFocus
                defaultValue={title}
                maxLength={80}
                onBlur={e => rename(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') rename(e.currentTarget.value);
                  if (e.key === 'Escape') setRenaming(false);
                }}
              />
            ) : (
              <h2 className="topbar__title" title={title}>
                {title}
              </h2>
            )}

            <div className="topbar__right">
              {active ? (
                <>
                  <button type="button" className="icon-btn" onClick={() => setRenaming(true)} aria-label="Rename chat">
                    <HugeiconsIcon icon={PencilEdit02Icon} size={18} strokeWidth={1.7} />
                  </button>
                  <button type="button" className="icon-btn" data-danger={confirmDelete ? '' : undefined} onClick={deleteActive} aria-label="Delete chat">
                    <HugeiconsIcon icon={Delete02Icon} size={18} strokeWidth={1.7} />
                    {confirmDelete ? <span>Delete?</span> : null}
                  </button>
                </>
              ) : null}
              <button type="button" className="icon-btn" onClick={newChat} aria-label="New chat">
                <HugeiconsIcon icon={PlusSignIcon} size={20} strokeWidth={1.8} />
              </button>
            </div>
          </header>

          <div className="scroll" ref={scrollRef} onScroll={onScroll}>
            {messages.length === 0 ? (
              <Welcome name={name} onPick={text => send(text, { effort: settings.effort })} />
            ) : (
              <div className="thread">
                {messages.map((m, i) => (
                  <Message
                    key={m.id}
                    msg={m}
                    streaming={m.status === 'streaming'}
                    isLast={i === messages.length - 1}
                    onRegenerate={regenerate}
                    showReasoning={settings.showReasoning}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="dock">
            <PromptBar
              placeholder="Message Thinko"
              width={780}
              radius={22}
              background="#1a1714"
              color="#efe9df"
              menuBackground="#221e1a"
              sparkColor="#d4af6a"
              sparks={settings.sparks}
              sources={SOURCES}
              activeSources={settings.webSearch ? ['web'] : []}
              onSource={key => key === 'web' && updateSettings({ webSearch: !settings.webSearch })}
              commands={COMMANDS}
              models={[{ key: 'auto', name: 'NVIDIA Auto', tag: '' }]}
              defaultModel="auto"
              efforts={EFFORTS}
              defaultEffort={settings.effort}
              onEffortChange={effort => updateSettings({ effort })}
              busy={busy}
              onSend={send}
              onStop={stop}
              onAttach={pickFiles}
              onDictate={dictate}
              autoFocus={typeof window !== 'undefined' && window.innerWidth > 860}
            />
            <p className="fineprint">NVIDIA Auto (Best Available) • Thinko can make mistakes. Check anything important.</p>
          </div>
        </main>

        <SettingsModal
          open={settingsOpen}
          settings={settings}
          info={info}
          chatCount={chats.length}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
          onExport={() => exportChats(chats)}
          onClearAll={() => {
            setChats([]);
            setActiveId(null);
            showToast('All chats deleted.');
          }}
        />

        {toast ? (
          <div className="toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>
    </MotionConfig>
  );
}

export default function App() {
  const [auth, setAuth] = useState({ ready: false, user: null });
  const [guest, setGuest] = useState(() => {
    try {
      return localStorage.getItem('thinko:guest') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => watchAuth(u => setAuth({ ready: true, user: u })), []);

  const enterGuest = () => {
    try {
      localStorage.setItem('thinko:guest', '1');
    } catch {
      /* ignore */
    }
    setGuest(true);
  };

  const leave = async () => {
    try {
      localStorage.removeItem('thinko:guest');
    } catch {
      /* ignore */
    }
    setGuest(false);
    await logout();
  };

  if (!auth.ready && !guest) {
    return (
      <div className="splash">
        <LatticeLoader label="" showTimer={false} pattern="spiral" cellSize={10} gap={3} color="#d4af6a" />
      </div>
    );
  }

  const user = auth.user
    ? { uid: auth.user.uid, displayName: auth.user.displayName, email: auth.user.email, photoURL: auth.user.photoURL }
    : guest
      ? { uid: 'guest', displayName: '', isGuest: true }
      : null;

  if (!user) return <AuthScreen onGuest={enterGuest} />;
  return <Chat key={user.uid} user={user} onLogout={leave} />;
}
