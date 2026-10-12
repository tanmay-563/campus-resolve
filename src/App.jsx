import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clock3,
  Filter,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import './App.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
function isPublishableKey(key) {
  if (key.startsWith('sb_publishable_')) return true
  if (key.startsWith('sb_secret_')) return false
  try {
    const payload = key.split('.')[1]
    return Boolean(payload && JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon')
  } catch {
    return false
  }
}

let supabase = null
if (supabaseUrl && supabaseKey && isPublishableKey(supabaseKey)) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  } catch {
    supabase = null
  }
}

const statuses = ['Open', 'In Progress', 'Resolved']
const categories = ['Academic', 'Facilities', 'IT Support', 'Administration', 'Other']
const priorities = ['Low', 'Medium', 'High']

const emptyForm = {
  student_name: '',
  roll_number: '',
  title: '',
  category: 'Academic',
  priority: 'Medium',
  description: '',
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'S'
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [authMode, setAuthMode] = useState('signin')
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [queries, setQueries] = useState([])
  const [loading, setLoading] = useState(true)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [priorityFilter, setPriorityFilter] = useState('All priorities')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingQuery, setEditingQuery] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const authEventReceived = useRef(false)

  useEffect(() => {
    if (!supabase) return undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived.current = true
      setSession(nextSession)
      setAuthError('')
      setAuthMessage('')
      if (_event === 'INITIAL_SESSION' || _event === 'SIGNED_IN' || _event === 'SIGNED_OUT') {
        setQueries([])
        setLoadError('')
        setLoading(Boolean(nextSession))
      }
    })
    let active = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setAuthError(error.message)
      if (!authEventReceived.current) setSession(data.session)
      setAuthLoading(false)
    }).catch((error) => {
      if (!active) return
      setAuthError(error instanceof Error ? error.message : 'Could not restore your sign-in session.')
      setAuthLoading(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) return undefined
    let active = true
    async function fetchQueries() {
      setLoadError('')
      try {
        const { data, error } = await supabase
          .from('student_queries')
          .select('*')
          .order('created_at', { ascending: false })
        if (!active) return
        if (error) {
          setLoadError(error.message)
          setQueries([])
          return
        }
        if (data.length === 0) {
          const { error: seedError } = await supabase.rpc('seed_demo_queries_if_empty')
          if (!active) return
          if (seedError) {
            setLoadError(`Could not check or add the optional sample records: ${seedError.message}`)
            setQueries([])
            return
          }
          const { data: refreshed, error: refreshError } = await supabase
            .from('student_queries')
            .select('*')
            .order('created_at', { ascending: false })
          if (!active) return
          if (refreshError) {
            setLoadError(refreshError.message)
            setQueries([])
          } else {
            setQueries(refreshed)
          }
        } else {
          setQueries(data)
        }
      } catch (error) {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : 'Could not load your queries.')
        setQueries([])
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchQueries()
    return () => { active = false }
  }, [session, reloadVersion])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const counts = useMemo(() => ({
    total: queries.length,
    open: queries.filter((query) => query.status === 'Open').length,
    progress: queries.filter((query) => query.status === 'In Progress').length,
    resolved: queries.filter((query) => query.status === 'Resolved').length,
  }), [queries])

  const visibleQueries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return queries.filter((query) => {
      const matchesSearch = !normalizedSearch || [
        query.title,
        query.student_name,
        query.roll_number,
        query.description,
      ].some((value) => value?.toLowerCase().includes(normalizedSearch))
      return matchesSearch
        && (statusFilter === 'All statuses' || query.status === statusFilter)
        && (categoryFilter === 'All categories' || query.category === categoryFilter)
        && (priorityFilter === 'All priorities' || query.priority === priorityFilter)
    })
  }, [queries, search, statusFilter, categoryFilter, priorityFilter])

  async function handleAuthSubmit(event) {
    event.preventDefault()
    if (!supabase) return
    setAuthError('')
    setAuthMessage('')
    setAuthSubmitting(true)
    try {
      const result = authMode === 'signin'
        ? await supabase.auth.signInWithPassword(authForm)
        : await supabase.auth.signUp(authForm)
      if (result.error) {
        setAuthError(result.error.message)
      } else if (authMode === 'signup' && !result.data.session) {
        setAuthMessage('Check your inbox to confirm your email, then sign in.')
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication could not be completed.')
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) setNotice({ type: 'error', message: `Could not sign out: ${error.message}` })
    } catch (error) {
      setNotice({ type: 'error', message: `Could not sign out: ${error instanceof Error ? error.message : 'Unknown error'}` })
    }
    setMenuOpen(false)
  }

  function openCreateModal() {
    setEditingQuery(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEditModal(query) {
    setEditingQuery(query)
    setForm({
      student_name: query.student_name,
      roll_number: query.roll_number,
      title: query.title,
      category: query.category,
      priority: query.priority,
      description: query.description,
    })
    setModalOpen(true)
  }

  async function handleSaveQuery(event) {
    event.preventDefault()
    if (!supabase || !session?.user) return
    setSaving(true)
    const payload = { ...form, user_id: session.user.id }
    try {
      const result = editingQuery
        ? await supabase.from('student_queries').update(payload).eq('id', editingQuery.id).select().single()
        : await supabase.from('student_queries').insert(payload).select().single()
      if (result.error) {
        setNotice({ type: 'error', message: `Could not ${editingQuery ? 'update' : 'create'} query: ${result.error.message}` })
      } else {
        setQueries((current) => editingQuery
          ? current.map((query) => query.id === editingQuery.id ? result.data : query)
          : [result.data, ...current])
        setNotice({ type: 'success', message: editingQuery ? 'Query updated successfully.' : 'Query submitted successfully.' })
        setModalOpen(false)
      }
    } catch (error) {
      setNotice({ type: 'error', message: `Could not ${editingQuery ? 'update' : 'create'} query: ${error instanceof Error ? error.message : 'Unknown error'}` })
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(query, status) {
    if (query.status === status) return
    try {
      const { data, error } = await supabase
        .from('student_queries')
        .update({ status })
        .eq('id', query.id)
        .select()
        .single()
      if (error) {
        setNotice({ type: 'error', message: `Could not update status: ${error.message}` })
      } else {
        setQueries((current) => current.map((item) => item.id === query.id ? data : item))
        setNotice({ type: 'success', message: `Status changed to ${status}.` })
      }
    } catch (error) {
      setNotice({ type: 'error', message: `Could not update status: ${error instanceof Error ? error.message : 'Unknown error'}` })
    }
  }

  async function deleteQuery(query) {
    if (!window.confirm(`Delete "${query.title}"? This action cannot be undone.`)) return
    try {
      const { data, error } = await supabase
        .from('student_queries')
        .delete()
        .eq('id', query.id)
        .select('id')
        .single()
      if (error) {
        setNotice({ type: 'error', message: `Could not delete query: ${error.message}` })
      } else {
        setQueries((current) => current.filter((item) => item.id !== data.id))
        setNotice({ type: 'success', message: 'Query deleted.' })
      }
    } catch (error) {
      setNotice({ type: 'error', message: `Could not delete query: ${error instanceof Error ? error.message : 'Unknown error'}` })
    }
  }

  function setStatusAndClose(status) {
    setStatusFilter(status)
    setMobileNavOpen(false)
  }

  if (!supabase) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <div className="brand-mark"><GraduationCap size={23} /></div>
          <span className="eyebrow">CAMPUSRESOLVE SETUP</span>
          <h1>Connect your campus workspace</h1>
          <p>CampusResolve needs a valid Supabase project URL and browser-safe publishable key to load and securely save queries.</p>
          <div className="setup-steps">
            <div><span>1</span><p>Create a <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Supabase project</a>.</p></div>
            <div><span>2</span><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code>. Use only a publishable/anon key, never a secret/service-role key.</p></div>
            <div><span>3</span><p>Run the SQL in <code>supabase/schema.sql</code>, then restart the app.</p></div>
          </div>
          <p className="setup-note"><ShieldCheck size={16} /> No records are simulated or saved until Supabase is configured.</p>
        </section>
      </main>
    )
  }

  if (authLoading) {
    return <main className="auth-loading"><span className="spinner" />Checking your session…</main>
  }

  if (!session) {
    return (
      <main className="auth-screen">
        <div className="auth-art">
          <div className="auth-art-brand"><div className="brand-mark"><GraduationCap size={22} /></div><span>CampusResolve</span></div>
          <div className="auth-art-copy">
            <span className="eyebrow">A BETTER CAMPUS, TOGETHER</span>
            <h1>Every concern deserves a clear path forward.</h1>
            <p>A simple, transparent place to raise campus queries and keep track of what happens next.</p>
            <div className="auth-proof"><span className="proof-icon"><Check size={15} /></span> Private to your account, powered by secure access</div>
          </div>
          <span className="auth-art-footer">Made for a more connected campus.</span>
        </div>
        <section className="auth-panel">
          <div className="auth-mobile-brand"><div className="brand-mark"><GraduationCap size={22} /></div><span>CampusResolve</span></div>
          <div className="auth-box">
            <span className="eyebrow">{authMode === 'signin' ? 'WELCOME BACK' : 'GET STARTED'}</span>
            <h2>{authMode === 'signin' ? 'Sign in to your account' : 'Create your account'}</h2>
            <p className="auth-subtitle">Use your campus email to manage your queries.</p>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label>Email address<input type="email" required autoComplete="email" placeholder="you@university.edu" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} /></label>
              <label>Password<input type="password" required minLength={6} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} placeholder="At least 6 characters" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} /></label>
              {authError && <p className="form-alert"><AlertCircle size={16} />{authError}</p>}
              {authMessage && <p className="form-success"><Check size={16} />{authMessage}</p>}
              <button className="button button-primary auth-submit" type="submit" disabled={authSubmitting}>{authSubmitting ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account'}{!authSubmitting && <ArrowUp size={16} className="auth-arrow" />}</button>
            </form>
            <p className="auth-switch">{authMode === 'signin' ? 'New to CampusResolve?' : 'Already have an account?'} <button type="button" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthError(''); setAuthMessage('') }}>{authMode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
            <div className="auth-security"><ShieldCheck size={16} /> Your account keeps your queries private</div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#dashboard" onClick={() => setMobileNavOpen(false)}>
          <div className="brand-mark"><GraduationCap size={23} strokeWidth={2.2} /></div>
          <span>Campus<span className="brand-light">Resolve</span></span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <button className={`nav-item ${statusFilter === 'All statuses' ? 'nav-active' : ''}`} onClick={() => setStatusAndClose('All statuses')}>
            <LayoutDashboard size={18} /><span>Overview</span>
          </button>
          <button className={`nav-item ${statusFilter === 'Open' ? 'nav-active' : ''}`} onClick={() => setStatusAndClose('Open')}>
            <CircleHelp size={18} /><span>Open queries</span><span className="nav-count">{counts.open}</span>
          </button>
          <button className={`nav-item ${statusFilter === 'In Progress' ? 'nav-active' : ''}`} onClick={() => setStatusAndClose('In Progress')}>
            <Clock3 size={18} /><span>In progress</span><span className="nav-count">{counts.progress}</span>
          </button>
          <button className={`nav-item ${statusFilter === 'Resolved' ? 'nav-active' : ''}`} onClick={() => setStatusAndClose('Resolved')}>
            <CheckCheck size={18} /><span>Resolved</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><div className="help-icon"><BookOpen size={17} /></div><strong>Need a hand?</strong><p>Reach out to your campus support team.</p></div>
          <button className="nav-item sidebar-account" onClick={handleSignOut}><LogOut size={17} /><span>Sign out</span></button>
          <div className="sidebar-foot">CAMPUS SUPPORT, MADE SIMPLE <span>v1.0</span></div>
        </div>
      </aside>
      {mobileNavOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <main className="main-area" id="dashboard">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>Overview</strong></div>
          <div className="topbar-right">
            <span className="today-label"><span className="online-dot" /> Student support portal</span>
            <div className="account-wrap">
              <button className="account-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
                <span className="avatar">{initials(session.user.email)}</span>
                <span className="account-email">{session.user.email}</span><ChevronDown size={15} />
              </button>
              {menuOpen && <div className="account-menu"><span className="menu-email">{session.user.email}</span><button onClick={handleSignOut}><LogOut size={16} /> Sign out</button></div>}
            </div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="welcome-kicker"><Sparkles size={14} /> YOUR CAMPUS, IN THE LOOP</div>
              <h1>Good to see you<span className="heading-period">.</span></h1>
              <p>Stay on top of every question and keep things moving.</p>
            </div>
            <button className="button button-primary create-button" onClick={openCreateModal}><Plus size={18} /> New query</button>
          </section>

          <section className="stats-grid" aria-label="Query summary">
            <article className="stat-card stat-total">
              <div className="stat-top"><span>Total queries</span><span className="stat-icon purple"><LayoutDashboard size={18} /></span></div>
              <div className="stat-number">{counts.total}</div>
              <div className="stat-bottom"><span>All your submitted queries</span><span className="stat-mini">{counts.total ? 'TRACKING' : 'READY'}</span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Open queries</span><span className="stat-icon amber"><CircleHelp size={18} /></span></div>
              <div className="stat-number">{counts.open}</div>
              <div className="stat-bottom"><span>Waiting for a response</span><span className="stat-dot amber-dot" /></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>In progress</span><span className="stat-icon blue"><Clock3 size={18} /></span></div>
              <div className="stat-number">{counts.progress}</div>
              <div className="stat-bottom"><span>Being looked into</span><span className="stat-dot blue-dot" /></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Resolved</span><span className="stat-icon green"><CheckCheck size={18} /></span></div>
              <div className="stat-number">{counts.resolved}</div>
              <div className="stat-bottom"><span>Successfully taken care of</span><span className="stat-dot green-dot" /></div>
            </article>
          </section>

          <section className="queries-section">
            <div className="section-heading">
              <div>
                <div className="section-title-row"><h2>Your queries</h2><span className="result-count">{visibleQueries.length}</span></div>
                <p>Everything you’ve raised, all in one place.</p>
              </div>
              <button className="button button-outline desktop-create" onClick={openCreateModal}><Plus size={17} /> Submit a query</button>
            </div>

            <div className="filters">
              <label className="search-field"><Search size={17} /><input aria-label="Search queries" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title, student, roll no..." />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}</label>
              <div className="filter-selects">
                <label className="select-wrap"><Filter size={15} /><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={14} /></label>
                <label className="select-wrap"><select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={14} /></label>
                <label className="select-wrap"><select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>All priorities</option>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select><ChevronDown size={14} /></label>
              </div>
            </div>

            {loadError && <div className="load-error"><AlertCircle size={17} /><span>{loadError}</span><button onClick={() => { setLoading(true); setReloadVersion((version) => version + 1) }}>Try again</button></div>}
            <div className="table-wrap">
              <table>
                <thead><tr><th>QUERY</th><th>CATEGORY</th><th>PRIORITY</th><th>STATUS</th><th>SUBMITTED</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="6"><div className="table-loading"><span className="spinner" />Loading your queries…</div></td></tr>
                  ) : loadError ? (
                    <tr><td colSpan="6"><div className="empty-state"><span className="empty-icon"><AlertCircle size={22} /></span><h3>Queries couldn’t be loaded</h3><p>Your records will appear here once the database request succeeds.</p></div></td></tr>
                  ) : visibleQueries.length ? visibleQueries.map((query) => (
                    <tr key={query.id}>
                      <td><div className="query-cell"><span className={`query-icon query-${query.category.toLowerCase().replaceAll(' ', '-')}`}><CircleHelp size={17} /></span><div className="query-info"><strong>{query.title}</strong><span className="query-byline">{query.student_name} <i>·</i> {query.roll_number}</span><span className="query-description" title={query.description}>{query.description}</span></div></div></td>
                      <td><span className="category-label">{query.category}</span></td>
                      <td><span className={`priority priority-${query.priority.toLowerCase()}`}><span />{query.priority}</span></td>
                      <td><label className={`status-select status-${query.status.toLowerCase().replaceAll(' ', '-')}`}><span className="status-indicator" /><select aria-label={`Status for ${query.title}`} value={query.status} onChange={(event) => updateStatus(query, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={13} /></label></td>
                      <td><span className="date-cell">{new Date(query.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</span></td>
                      <td><div className="row-actions"><button title="Edit query" aria-label={`Edit ${query.title}`} onClick={() => openEditModal(query)}><Settings2 size={16} /></button><button title="Delete query" aria-label={`Delete ${query.title}`} onClick={() => deleteQuery(query)}><X size={16} /></button></div></td>
                    </tr>
                  )) : (
                    <tr><td colSpan="6">
                      <div className="empty-state">
                        <span className="empty-icon">{queries.length ? <Search size={22} /> : <CircleHelp size={22} />}</span>
                        <h3>{queries.length ? 'No matching queries' : 'Nothing here just yet'}</h3>
                        <p>{queries.length ? 'Try a different search or adjust your filters.' : 'When you raise a campus query, you’ll be able to follow its progress here.'}</p>
                        {queries.length ? <button className="button button-outline" onClick={() => { setSearch(''); setStatusFilter('All statuses'); setCategoryFilter('All categories'); setPriorityFilter('All priorities') }}>Clear filters</button> : <button className="button button-primary" onClick={openCreateModal}><Plus size={17} /> Submit your first query</button>}
                      </div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span>Showing <strong>{visibleQueries.length}</strong> of <strong>{queries.length}</strong> queries</span><span className="secure-caption"><ShieldCheck size={14} /> Visible only to you</span></div>
          </section>
          <footer className="page-footer"><span>CampusResolve <span>·</span> Making campus support simpler.</span><span><span className="footer-dot" /> Your workspace is up to date</span></footer>
        </div>
      </main>

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false) }}>
        <section className="query-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-heading"><div><span className="eyebrow">{editingQuery ? 'UPDATE DETAILS' : 'CAMPUS SUPPORT'}</span><h2 id="modal-title">{editingQuery ? 'Edit your query' : 'Submit a new query'}</h2><p>{editingQuery ? 'Make changes to your submitted query.' : 'Tell us what’s going on and we’ll help get it sorted.'}</p></div><button className="icon-button" aria-label="Close dialog" onClick={() => setModalOpen(false)}><X size={19} /></button></div>
          <form className="query-form" onSubmit={handleSaveQuery}>
            <div className="form-grid">
              <label>Student name<input required maxLength="100" value={form.student_name} onChange={(event) => setForm({ ...form, student_name: event.target.value })} placeholder="Your full name" /></label>
              <label>Roll number<input required maxLength="30" value={form.roll_number} onChange={(event) => setForm({ ...form, roll_number: event.target.value })} placeholder="e.g. CS2024018" /></label>
            </div>
            <label>Query title<input required maxLength="180" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="A short summary of your query" /></label>
            <div className="form-grid">
              <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
            </div>
            <label>Description<textarea required maxLength="2000" rows="4" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Share a few details so we can point you in the right direction…" /></label>
            <div className="form-footnote"><ShieldCheck size={15} /> Your query is private to your account.</div>
            <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving && <span className="button-spinner" />}{saving ? 'Saving…' : editingQuery ? 'Save changes' : 'Submit query'} {!saving && <ArrowDown size={15} className="submit-arrow" />}</button></div>
          </form>
        </section>
      </div>}

      {notice && <div className={`toast toast-${notice.type}`} role="status"><span className="toast-icon">{notice.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}</span>{notice.message}<button aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button></div>}
    </div>
  )
}

export default App
