import { useRef } from 'react';
import { motion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { BookOpen01Icon, Idea01Icon, PaintBrush01Icon, SourceCodeIcon } from '@hugeicons/core-free-icons';
import LatticeLoader from './LatticeLoader';

/*
 * Welcome bento — the supplied MagicBento file was cut off before its main
 * component, so this is a lighter version with the same feel: cursor spotlight,
 * edge glow near the pointer and a ring that ripples out on click.
 */

const CARDS = [
  {
    key: 'explain',
    icon: BookOpen01Icon,
    title: 'Explain anything',
    text: 'Break down a tough topic in plain words, with examples.',
    prompt: 'Explain how WebSockets work in simple terms, with a small real-time chat example.',
    span: 2,
    visual: true
  },
  {
    key: 'code',
    icon: SourceCodeIcon,
    title: 'Write & debug code',
    text: 'Flask, Flutter, JS, whatever you are building.',
    prompt: 'Help me debug a Flask route that returns a 500 error. Ask me for the traceback first.'
  },
  {
    key: 'ideas',
    icon: Idea01Icon,
    title: 'Plan a project',
    text: 'Turn a rough idea into clear steps.',
    prompt: 'I want to build a student marketplace app. Give me a step by step build plan.'
  },
  {
    key: 'write',
    icon: PaintBrush01Icon,
    title: 'Polish my writing',
    text: 'Emails, posts and resumes that read well.',
    prompt: 'Write a short, confident LinkedIn post announcing my new project.',
    span: 2
  }
];

export default function Welcome({ name, onPick }) {
  const gridRef = useRef(null);

  const move = e => {
    const card = e.currentTarget;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  const ripple = (e, prompt) => {
    const card = e.currentTarget;
    const r = card.getBoundingClientRect();
    const ring = document.createElement('span');
    ring.className = 'bento__ring';
    ring.style.left = `${e.clientX - r.left}px`;
    ring.style.top = `${e.clientY - r.top}px`;
    card.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
    setTimeout(() => onPick(prompt), 140);
  };

  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="welcome">
      <motion.div
        className="welcome__hero"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      >
        <LatticeLoader label="" showTimer={false} pattern="spiral" cellSize={9} gap={3} color="#d4af6a" idleOpacity={0.2} />
        <h1>
          {greet}, <em>{name}</em>
        </h1>
        <p>What are we thinking about today?</p>
      </motion.div>

      <div className="bento" ref={gridRef}>
        {CARDS.map((c, i) => (
          <motion.button
            key={c.key}
            type="button"
            className="bento__card"
            data-span={c.span || 1}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 + i * 0.07, ease: [0.23, 1, 0.32, 1] }}
            onPointerMove={move}
            onClick={e => ripple(e, c.prompt)}
          >
            <span className="bento__spot" aria-hidden="true" />
            <span className="bento__icon">
              <HugeiconsIcon icon={c.icon} size={18} strokeWidth={1.7} />
            </span>
            <span className="bento__title">{c.title}</span>
            <span className="bento__text">{c.text}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
