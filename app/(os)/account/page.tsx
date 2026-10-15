'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, useAccount, type SiteAccount } from '@/components/site';

const ROLES = ['Operator', 'Approver', 'Developer', 'Compliance', 'Founder or executive', 'Student or researcher'];
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

type Form = { name: string; title: string; phone: string; location: string; company: string; role: string; website: string; bio: string };
const FIELDS: (keyof Form)[] = ['name', 'title', 'phone', 'location', 'company', 'role', 'website', 'bio'];
const toForm = (a: SiteAccount): Form => ({
  name: a.name,
  title: a.title ?? '',
  phone: a.phone ?? '',
  location: a.location ?? '',
  company: a.company ?? '',
  role: a.role ?? ROLES[0],
  website: a.website ?? '',
  bio: a.bio ?? '',
});

/** Centre-crop any picture to a 320px square JPEG, small enough to store with the account. */
async function squarePhoto(file: File): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error('Choose an image file (JPG, PNG or WebP).');
  if (file.size > 12 * 1024 * 1024) throw new Error('That picture is over 12 MB. Choose a smaller one.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error('That file could not be read as a picture.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = 320;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 320, 320);
    for (const q of [0.88, 0.78, 0.65]) {
      const out = c.toDataURL('image/jpeg', q);
      if (out.length < 380_000) return out;
    }
    throw new Error('That picture is too detailed to store. Try another one.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AccountPage() {
  const router = useRouter();
  const [account, setAccount] = useAccount();
  const [f, setF] = useState<Form | null>(null);
  const [state, setState] = useState<{ busy?: boolean; error?: string; saved?: boolean }>({});
  const [photo, setPhoto] = useState<{ busy?: boolean; error?: string }>({});
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (account) setF(toForm(account));
  }, [account]);

  const dirty = useMemo(() => !!(account && f && FIELDS.some((k) => f[k] !== toForm(account)[k])), [account, f]);
  const filled = account ? [account.avatar_v, account.title, account.phone, account.location, account.company, account.website, account.bio].filter(Boolean).length : 0;
  const pct = Math.round(((filled + 1) / 8) * 100);

  if (account === undefined || (account && !f)) return <main className="page muted">Loading your profile…</main>;
  if (!account || !f)
    return (
      <main className="page">
        <div className="acct-empty panel">
          <p className="kicker">Your profile</p>
          <h1 className="page-title">Your session has ended.</h1>
          <p className="page-sub">Sign in again to see and edit your profile.</p>
          <div className="row" style={{ gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <Link className="btn btn-solid" href="/login?next=/account">
              Sign in
            </Link>
          </div>
        </div>
      </main>
    );

  const post = async (patch: Partial<Form> & { avatar?: string }) => {
    const r = await fetch('/api/auth/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { account?: SiteAccount; error?: string }) : { error: 'You seem to be offline.' };
    if (r?.ok && j.account) {
      setAccount(j.account);
      router.refresh(); // the bar's photo and name follow
      return null;
    }
    return j.error ?? 'Could not save.';
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ busy: true });
    const error = await post(f);
    setState(error ? { error } : { saved: true });
  };
  const pick = async (file?: File | null) => {
    if (!file) return;
    setPhoto({ busy: true });
    try {
      const error = await post({ avatar: await squarePhoto(file) });
      setPhoto(error ? { error } : {});
    } catch (err) {
      setPhoto({ error: (err as Error).message });
    }
    if (fileRef.current) fileRef.current.value = '';
  };
  const removePhoto = async () => {
    setPhoto({ busy: true });
    const error = await post({ avatar: '' });
    setPhoto(error ? { error } : {});
  };
  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setAccount(null);
    router.replace('/');
    router.refresh();
  };
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setF({ ...f, [k]: e.target.value });
    setState({});
  };
  const line = [account.title, account.company].filter(Boolean).join(' · ');

  return (
    <main className="page pf">
      <section className="pf-hero panel">
        <div
          className={`pf-photo ${drag ? 'drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void pick(e.dataTransfer.files?.[0]);
          }}
        >
          <button type="button" className="pf-av" onClick={() => fileRef.current?.click()} aria-label={account.avatar_v ? 'Change your photo' : 'Add a photo'} disabled={photo.busy}>
            <Avatar account={account} />
            <span className="pf-av-cam" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <div className="pf-photo-act">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={photo.busy}>
              {photo.busy ? 'Saving…' : account.avatar_v ? 'Change photo' : 'Upload photo'}
            </button>
            {account.avatar_v ? (
              <button type="button" className="pf-link" onClick={removePhoto} disabled={photo.busy}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <div className="pf-who">
          <p className="kicker">Your profile</p>
          <h1 className="pf-name">{account.name}</h1>
          {line && <p className="pf-line">{line}</p>}
          <ul className="pf-meta">
            <li>{account.email}</li>
            {account.location && <li>{account.location}</li>}
            <li>Member since {new Date(account.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</li>
          </ul>
          {photo.error && (
            <p className="acct-msg bad" role="alert">
              {photo.error}
            </p>
          )}
          <p className="pf-hint">JPG, PNG or WebP. We crop it to a square; drop a picture on the circle or click it.</p>
        </div>
        <div className="pf-hero-side">
          <div className="pf-meter" role="img" aria-label={`Profile ${pct}% complete`}>
            <div className="pf-meter-top">
              <span>Profile</span>
              <b>{pct}%</b>
            </div>
            <i>
              <em style={{ width: `${pct}%` }} />
            </i>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </section>

      <div className="acct-grid">
        <form className="pf-form" onSubmit={save}>
          <section className="panel pf-sec">
            <header>
              <h2>Personal details</h2>
              <p>How you appear to your team and on approvals you sign.</p>
            </header>
            <div className="acct-two">
              <label className="field">
                Full name
                <input value={f.name} onChange={set('name')} minLength={2} maxLength={80} required autoComplete="name" />
              </label>
              <label className="field">
                Job title
                <input value={f.title} onChange={set('title')} maxLength={80} placeholder="Head of risk" autoComplete="organization-title" />
              </label>
              <label className="field">
                Phone
                <input value={f.phone} onChange={set('phone')} maxLength={30} placeholder="+91 98xxx xxxxx" type="tel" autoComplete="tel" />
              </label>
              <label className="field">
                City
                <input value={f.location} onChange={set('location')} maxLength={80} placeholder="Ghaziabad, India" autoComplete="address-level2" />
              </label>
            </div>
          </section>

          <section className="panel pf-sec">
            <header>
              <h2>Work</h2>
              <p>The company you would connect, and how you use Abhed.</p>
            </header>
            <div className="acct-two">
              <label className="field">
                Company
                <input value={f.company} onChange={set('company')} maxLength={80} autoComplete="organization" />
              </label>
              <label className="field">
                How you use Abhed
                <select value={f.role} onChange={set('role')}>
                  {[...new Set([f.role, ...ROLES])].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="field pf-wide">
                Website or LinkedIn
                <input value={f.website} onChange={set('website')} maxLength={200} placeholder="https://" type="url" autoComplete="url" />
              </label>
            </div>
          </section>

          <section className="panel pf-sec">
            <header>
              <h2>About you</h2>
              <p>A line or two for your teammates.</p>
            </header>
            <label className="field">
              <span className="pf-count">
                Bio <em>{f.bio.length}/400</em>
              </span>
              <textarea value={f.bio} onChange={set('bio')} maxLength={400} rows={4} placeholder="I approve refunds above ₹50,000 for the payments team." />
            </label>
          </section>

          <div className={`pf-bar ${dirty || state.error || state.saved ? 'show' : ''} ${dirty ? 'stick' : ''}`} aria-live="polite">
            <span className={state.error ? 'bad' : state.saved && !dirty ? 'ok' : ''}>{state.error ?? (dirty ? 'You have unsaved changes.' : state.saved ? 'All changes saved.' : 'Up to date.')}</span>
            <div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!dirty || state.busy}
                onClick={() => {
                  setF(toForm(account));
                  setState({});
                }}
              >
                Discard
              </button>
              <button className="btn btn-solid btn-sm" disabled={!dirty || state.busy}>
                {state.busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>

        <aside className="acct-side">
          <div className="panel">
            <div className="panel-title">
              <span>
                <b>Sign-in &amp; security</b>
              </span>
            </div>
            <dl className="acct-dl">
              <dt>Email</dt>
              <dd>{account.email}</dd>
              <dt>Password</dt>
              <dd>Stored only as a bcrypt hash</dd>
              <dt>Last sign-in</dt>
              <dd>{when(account.last_login_at)}</dd>
              <dt>Session</dt>
              <dd>This device, for 7 days</dd>
            </dl>
          </div>
          <div className="panel">
            <div className="panel-title">
              <span>
                <b>Next steps</b>
              </span>
            </div>
            <nav className="acct-links">
              <Link href="/integrate">
                <b>Connect your website</b>
                <span>Step by step: base URL, key, first governed action</span>
              </Link>
              <Link href="/approver">
                <b>Become an approver</b>
                <span>Sign big moves from your phone</span>
              </Link>
              <Link href="/fleet">
                <b>Watch the fleet</b>
                <span>Every governed action, live</span>
              </Link>
            </nav>
          </div>
        </aside>
      </div>
    </main>
  );
}
