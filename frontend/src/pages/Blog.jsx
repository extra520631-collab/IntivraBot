import { Link } from 'react-router-dom'
import { ArrowRight, Clock } from 'lucide-react'
import PublicNavbar from '../components/layout/PublicNavbar'
import Logo from '../components/ui/Logo'
import Reveal from '../components/ui/Reveal'
import { useHomePath } from '../lib/useHomePath'

const posts = [
  {
    tag: 'Hiring',
    title: 'How AI removes bias from the first round of recruitment',
    excerpt: 'Structured, objective scoring means every candidate is judged on the same criteria — here’s how IntivraBot does it.',
    date: 'Aug 4, 2026',
    read: '5 min read',
    featured: true,
  },
  {
    tag: 'Product',
    title: 'Face & voice verification, explained simply',
    excerpt: 'What we check, what we store, and how consent keeps candidates in control of their own data.',
    date: 'Jul 28, 2026',
    read: '4 min read',
  },
  {
    tag: 'ATS',
    title: '5 resume mistakes that hurt your match score',
    excerpt: 'Small fixes that make a big difference when an ATS parses your CV against a job description.',
    date: 'Jul 19, 2026',
    read: '6 min read',
  },
  {
    tag: 'Guides',
    title: 'Preparing for an AI interview: a candidate’s checklist',
    excerpt: 'Lighting, audio, and mindset — a quick guide to putting your best self forward on camera.',
    date: 'Jul 10, 2026',
    read: '3 min read',
  },
  {
    tag: 'Engineering',
    title: 'Inside our emotion analysis pipeline',
    excerpt: 'A look at how we measure confidence, stress, and engagement — responsibly and transparently.',
    date: 'Jun 30, 2026',
    read: '7 min read',
  },
]

export default function Blog() {
  const [featured, ...rest] = posts
  const home = useHomePath()
  return (
    <div className="min-h-screen bg-white">
      <PublicNavbar />

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Reveal className="mb-10 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            The IntivraBot Blog
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-ink-900">
            Ideas on <span className="text-brand-600">smarter, fairer hiring</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-500">
            Product updates, hiring guides, and a look under the hood of AI-driven recruitment.
          </p>
        </Reveal>

        {/* Featured post */}
        <Reveal className="mb-8">
          <article className="grid overflow-hidden rounded-2xl border border-ink-200 shadow-card md:grid-cols-2">
            <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden bg-brand-600 p-8">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-12 -left-8 h-44 w-44 rounded-full bg-white/10" />
              <div className="relative text-center text-white">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-3xl font-extrabold">iB</div>
                <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-brand-100">Featured read</p>
              </div>
            </div>
            <div className="p-7">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">{featured.tag}</span>
              <h2 className="mt-2 text-2xl font-bold text-ink-900">{featured.title}</h2>
              <p className="mt-3 text-ink-500">{featured.excerpt}</p>
              <div className="mt-4 flex items-center gap-3 text-xs text-ink-400">
                <span>{featured.date}</span>
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{featured.read}</span>
              </div>
              <button className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
                Read article <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </article>
        </Reveal>

        {/* Grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p, i) => (
            <Reveal as="article" key={p.title} delay={i * 70} className="card-base hover-lift flex flex-col p-6 hover:shadow-soft">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">{p.tag}</span>
              <h3 className="mt-2 text-lg font-semibold text-ink-900">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm text-ink-500">{p.excerpt}</p>
              <div className="mt-4 flex items-center gap-3 text-xs text-ink-400">
                <span>{p.date}</span>
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{p.read}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 sm:flex-row sm:px-6">
          <Link to={home}><Logo /></Link>
          <p className="text-sm text-ink-400">© 2026 IntivraBot · Final Year Project</p>
        </div>
      </footer>
    </div>
  )
}
