import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Lock } from './Icons';
import { EASE } from '../lib/motion';

/**
 * The password form. Server-side gates only: this component never decides
 * anything, it asks and reports. On a wrong answer the box shakes once; on
 * the right one a red rule sweeps across the top and the parent swaps the
 * content in. Reduced motion gets neither and loses nothing.
 */
export function Gate({ title, body, onSubmit, state, retryIn, autoFocus = true, hint, headingLevel = 2 }: {
  title: string; body?: string; onSubmit: (password: string) => Promise<void> | void;
  state: 'idle' | 'checking' | 'wrong' | 'limited' | 'error' | 'ok'; retryIn?: number; autoFocus?: boolean; hint?: string; headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    if (state === 'wrong') { setShake(true); const t = setTimeout(() => setShake(false), 600); input.current?.select(); return () => clearTimeout(t); }
  }, [state]);

  const submit = (e: FormEvent) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); };

  return (
    <form className={`gate ${shake ? 'shake' : ''}`} onSubmit={submit} aria-busy={state === 'checking'}>
      {state === 'checking' ? <span className="gate-checking" aria-hidden="true" /> : null}
      {state === 'ok' ? <motion.span className="gate-sweep" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduce ? 0 : 0.8, ease: EASE }} aria-hidden="true" /> : null}
      <div className="gate-head">
        <span className="label"><span className="signal">Private</span> <span className="muted">{hint ?? 'Password protected'}</span></span>
        <Lock />
      </div>
      <Heading className="t-h2 balance">{title}</Heading>
      {body ? <p className="secondary t-small measure">{body}</p> : null}
      <div className="gate-form">
        <label className="field">
          <span>Password</span>
          <input
            ref={input}
            className="input"
            type="password"
            name="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="four words, with hyphens"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={state === 'wrong'}
            aria-describedby="gate-msg"
            disabled={state === 'checking' || state === 'limited'}
          />
        </label>
        <button className="btn inverse" type="submit" disabled={state === 'checking' || state === 'limited' || !value.trim()}>{state === 'checking' ? 'Checking' : 'Open'}</button>
      </div>
      <p id="gate-msg" className={`t-caption ${state === 'wrong' || state === 'limited' || state === 'error' ? 'error' : 'muted'}`} aria-live="polite">
        {state === 'wrong' ? 'That is not it. Check the message the link came with.' : null}
        {state === 'limited' ? `Too many tries. Wait ${retryIn ?? 60} seconds.` : null}
        {state === 'error' ? 'Could not reach the gate. Try again in a moment.' : null}
        {state === 'idle' || state === 'checking' || state === 'ok' ? 'Case, spaces and punctuation are forgiven.' : null}
      </p>
    </form>
  );
}
