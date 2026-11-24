import { StrictMode, lazy, Component, ReactNode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
// Self-hosted fonts: no third-party request ever sees a player's address.
import '@fontsource/unbounded/latin-500.css';
import '@fontsource/unbounded/latin-700.css';
import '@fontsource/unbounded/latin-900.css';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import './styles/app.css';
import { StoreProvider } from './lib/store';
import { Shell } from './components/Shell';
import { Intro } from './components/Intro';
import { reportError } from './lib/api';
import { Empty } from './components/ui';

const Home = lazy(() => import('./pages/Home'));
const D = () => import('./pages/Discover');
const Discover = lazy(() => D().then((m) => ({ default: m.Discover })));
const GameDetail = lazy(() => D().then((m) => ({ default: m.GameDetail })));
const Daily = lazy(() => D().then((m) => ({ default: m.Daily })));
const Leaderboards = lazy(() => D().then((m) => ({ default: m.Leaderboards })));
const P = () => import('./pages/Play');
const Play = lazy(() => P().then((m) => ({ default: m.Play })));
const Challenge = lazy(() => P().then((m) => ({ default: m.Challenge })));
const Rooms = lazy(() => P().then((m) => ({ default: m.Rooms })));
const Room = lazy(() => P().then((m) => ({ default: m.Room })));
const A = () => import('./pages/Account');
const Login = lazy(() => A().then((m) => ({ default: m.Login })));
const Register = lazy(() => A().then((m) => ({ default: m.Register })));
const Welcome = lazy(() => A().then((m) => ({ default: m.Welcome })));
const Forgot = lazy(() => A().then((m) => ({ default: m.Forgot })));
const Reset = lazy(() => A().then((m) => ({ default: m.Reset })));
const Verify = lazy(() => A().then((m) => ({ default: () => <m.TokenAction kind="verify" /> })));
const ParentConsent = lazy(() => A().then((m) => ({ default: () => <m.TokenAction kind="parent" /> })));
const Settings = lazy(() => A().then((m) => ({ default: m.Settings })));
const DevOutbox = lazy(() => A().then((m) => ({ default: m.DevOutbox })));
const S = () => import('./pages/Social');
const Me = lazy(() => S().then((m) => ({ default: m.Me })));
const PublicProfile = lazy(() => S().then((m) => ({ default: m.PublicProfile })));
const Friends = lazy(() => S().then((m) => ({ default: m.Friends })));
const Missions = lazy(() => S().then((m) => ({ default: m.Missions })));
const Shop = lazy(() => S().then((m) => ({ default: m.Shop })));
const L = () => import('./pages/Lounge');
const Lounge = lazy(() => L().then((m) => ({ default: m.Lounge })));
const LoungeGame = lazy(() => L().then((m) => ({ default: m.LoungeGame })));
const LoungePlay = lazy(() => L().then((m) => ({ default: m.LoungePlay })));
const Admin = lazy(() => import('./pages/Admin'));
const Support = lazy(() => import('./pages/Support').then((m) => ({ default: m.Support })));
const SupportTicket = lazy(() => import('./pages/Support').then((m) => ({ default: m.SupportTicket })));
import { Notifications } from './pages/Engage';
const Legal = lazy(() => import('./pages/Legal'));

class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { reportError(String(err?.message ?? err), location.pathname); }
  render() { return this.state.err ? <Crash err={this.state.err} /> : this.props.children; }
}

function Crash({ err }: { err: Error }) {
  const chunk = /dynamically imported module|module script|Failed to fetch|Unable to preload/i.test(err.message);
  return (
    <div className="empty panel" style={{ maxWidth: 520, margin: '10vh auto' }} role="alert">
      <h3 style={{ marginBottom: 8 }}>{chunk ? 'A new version is available' : 'Something went wrong'}</h3>
      <p className="muted" style={{ marginBottom: 16 }}>{chunk ? 'Reload to get the latest PLAYZO.' : 'The error was reported. You can reload or head home.'}</p>
      <div className="row" style={{ justifyContent: 'center' }}><button className="btn btn-primary" onClick={() => location.reload()}>Reload</button><a className="btn" href="/">Home</a></div>
    </div>
  );
}

/** The router catches page crashes before Boundary can: show the real error screen and report it. */
function RouteError() {
  const e = useRouteError();
  const notFound = isRouteErrorResponse(e) && e.status === 404;
  const err = e instanceof Error ? e : new Error(String((e as any)?.statusText ?? e));
  useEffect(() => { if (!notFound) reportError(err.message, location.pathname); }, [notFound, err.message]);
  return notFound ? <NotFound /> : <Crash err={err} />;
}

const NotFound = () => <Empty icon="compass" title="Page not found"><Link to="/" className="btn btn-primary" style={{ marginTop: 12 }}>Go home</Link></Empty>;

const router = createBrowserRouter([
  {
    element: <Shell />,
    errorElement: <RouteError />,
    // Page errors replace only the page: the header and navigation stay usable.
    children: [{ errorElement: <RouteError />, children: [
      { path: '/', element: <Home /> },
      { path: '/games', element: <Discover /> },
      { path: '/games/:id', element: <GameDetail /> },
      { path: '/play/:id', element: <Play /> },
      { path: '/daily', element: <Daily /> },
      { path: '/leaderboards', element: <Leaderboards /> },
      { path: '/rooms', element: <Rooms /> },
      { path: '/room/:code', element: <Room /> },
      { path: '/challenge/:id', element: <Challenge /> },
      { path: '/missions', element: <Missions /> },
      { path: '/me', element: <Me /> },
      { path: '/u/:id', element: <PublicProfile /> },
      { path: '/friends', element: <Friends /> },
      { path: '/shop', element: <Shop /> },
      { path: '/settings', element: <Settings /> },
      { path: '/notifications', element: <Notifications /> },
      { path: '/support', element: <Support /> },
      { path: '/support/:id', element: <SupportTicket /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/welcome', element: <Welcome /> },
      { path: '/forgot', element: <Forgot /> },
      { path: '/reset', element: <Reset /> },
      { path: '/verify', element: <Verify /> },
      { path: '/parent-consent', element: <ParentConsent /> },
      { path: '/dev/outbox', element: <DevOutbox /> },
      { path: '/lounge', element: <Lounge /> },
      { path: '/lounge/:id', element: <LoungeGame /> },
      { path: '/lounge/play/:id', element: <LoungePlay /> },
      { path: '/admin', element: <Admin /> },
      { path: '/legal/:doc', element: <Legal /> },
      { path: '*', element: <NotFound /> },
    ] }],
  },
]);

window.addEventListener('error', (e) => {
  // Resource load errors (img/script) and benign browser notices are not app crashes.
  if (!(e instanceof ErrorEvent)) return;
  if (/ResizeObserver loop/.test(e.message)) return;
  const err = e.error as any;
  const detail = err?.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ') : err !== undefined && err !== null ? String(err) : '';
  reportError(`${e.message || 'Uncaught error'}${detail ? ` :: ${detail}` : ''}`.slice(0, 480), `${location.pathname} ${e.filename ? `${e.filename.split('/').pop()}:${e.lineno}:${e.colno}` : 'window'}`);
});
// Service worker: production builds only (dev uses Vite's live reload).
if (import.meta.env.PROD && 'serviceWorker' in navigator) addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
window.addEventListener('unhandledrejection', (e) => { const m = String((e.reason as any)?.message ?? e.reason); if (!/abort/i.test(m)) reportError(m, 'promise'); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <Boundary>
        <Intro />
        <RouterProvider router={router} />
      </Boundary>
    </StoreProvider>
  </StrictMode>,
);
