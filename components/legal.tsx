/** A long-form legal page: a sticky contents list beside numbered sections. */
export function Legal({ kicker, title, intro, updated, sections }: { kicker: string; title: React.ReactNode; intro: React.ReactNode; updated: string; sections: [string, React.ReactNode][] }) {
  const id = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <section className="st-legal">
      <div className="st-legal-head">
        <p className="st-kicker">{kicker}</p>
        <h1 className="st-h1 sm">{title}</h1>
        <p className="st-lede">{intro}</p>
        <p className="st-small">Last updated {updated}</p>
      </div>
      <div className="st-legal-body">
        <nav className="st-toc" aria-label="Contents">
          {sections.map(([h], i) => (
            <a key={h} href={`#${id(h)}`}>
              <span>{String(i + 1).padStart(2, '0')}</span> {h}
            </a>
          ))}
        </nav>
        <div className="st-legal-text">
          {sections.map(([h, body], i) => (
            <section key={h} id={id(h)}>
              <h2>
                <span>{String(i + 1).padStart(2, '0')}</span> {h}
              </h2>
              {body}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
