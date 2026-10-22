import type { ReactNode } from 'react';

export function SectionHead({ n, title, aside, id }: { n: string; title: string; aside?: ReactNode; id?: string }) {
  return (
    <header className="section-head" id={id}>
      <h2 className="label"><span className="n">{n}</span><span>{title}</span></h2>
      {aside ? <div className="label muted">{aside}</div> : null}
    </header>
  );
}
