import { memo, useState } from 'react';
import { motion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  ArrowDown01Icon,
  Copy01Icon,
  Globe02Icon,
  RefreshIcon,
  Tick02Icon,
  Attachment01Icon
} from '@hugeicons/core-free-icons';
import LatticeLoader from './LatticeLoader';
import Markdown, { copyText } from './Markdown';

const GOLD = '#d4af6a';

function Reasoning({ msg, streaming }) {
  const [open, setOpen] = useState(false);
  const thinking = streaming && !msg.content;
  const status = msg.error && !msg.content ? 'error' : thinking ? 'working' : 'done';
  return (
    <div className="reasoning" data-open={open ? '' : undefined}>
      <button type="button" className="reasoning__head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <LatticeLoader
          status={status}
          label="Thinking"
          doneLabel="Thought for"
          errorLabel="Stopped after"
          elapsed={status === 'working' ? undefined : (msg.thinkMs ?? 0) / 1000}
          color={GOLD}
          doneColor={GOLD}
          pattern="orbit"
          cellSize={5}
          gap={2}
          fontSize={13}
        />
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.9} className="reasoning__chev" />
      </button>
      {open ? <div className="reasoning__body">{msg.reasoning}</div> : null}
    </div>
  );
}

function Message({ msg, streaming, isLast, onRegenerate, showReasoning }) {
  const [copied, setCopied] = useState(false);

  if (msg.role === 'user') {
    return (
      <motion.div className="msg msg--user" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}>
        <div className="bubble">
          {msg.files?.length ? (
            <div className="bubble__files">
              {msg.files.map((f, i) => (
                <span key={i} className="filechip">
                  <HugeiconsIcon icon={Attachment01Icon} size={12} strokeWidth={1.9} />
                  {f}
                </span>
              ))}
            </div>
          ) : null}
          {msg.display ?? msg.content}
        </div>
      </motion.div>
    );
  }

  const hasReasoning = Boolean(msg.reasoning) && showReasoning;
  const waiting = streaming && !msg.content && !msg.reasoning && !msg.error;

  const copy = async () => {
    if (await copyText(msg.content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.div className="msg msg--ai" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}>
      <div className="msg__avatar" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="msg__main">
        {hasReasoning ? <Reasoning msg={msg} streaming={streaming} /> : null}

        {waiting ? (
          <div className="thinking-line">
            <LatticeLoader label="Thinking" color={GOLD} pattern="orbit" cellSize={5} gap={2} fontSize={13} />
          </div>
        ) : null}

        {msg.sources?.length ? (
          <div className="sources">
            {msg.sources.map(s => (
              <a key={s.link} href={s.link} target="_blank" rel="noopener noreferrer" title={s.title}>
                <HugeiconsIcon icon={Globe02Icon} size={12} strokeWidth={1.9} />
                <span>{s.title}</span>
              </a>
            ))}
          </div>
        ) : null}

        {msg.content ? <Markdown text={msg.content} /> : null}

        {msg.notice ? <div className="notice">{msg.notice}</div> : null}

        {msg.error ? (
          <div className="errorcard" role="alert">
            <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={1.8} />
            <div>
              <p>{msg.error}</p>
              {isLast ? (
                <button type="button" onClick={onRegenerate}>
                  Try again
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!streaming && msg.content ? (
          <div className="msg__actions">
            <button type="button" onClick={copy} aria-label="Copy reply">
              <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={15} strokeWidth={1.8} />
              {copied ? 'Copied' : 'Copy'}
            </button>
            {isLast ? (
              <button type="button" onClick={onRegenerate} aria-label="Regenerate reply">
                <HugeiconsIcon icon={RefreshIcon} size={15} strokeWidth={1.8} />
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export default memo(Message);
