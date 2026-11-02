import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { arSA } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  getDiscoverProfilesQueryKey, getGetMyProfileQueryKey, getGetSocialSummaryQueryKey, getHealthCheckQueryKey,
  getListBlockedProfilesQueryKey, getListConversationMessagesQueryKey,
  getListConversationsQueryKey, getListMySocialPostsQueryKey, getListProfileSocialPostsQueryKey,
  getGetPublicProfileQueryKey, getListRoomMessagesQueryKey, getListRoomsQueryKey, getListSocialPostFeedQueryKey,
  useBlockProfile, useCreateRoom, useDiscoverProfiles, useFindRandomMatch,
  useCreateSocialPost, useDeleteSocialPost, useGetMyProfile, useGetPublicProfile, useGetSocialSummary, useHealthCheck, useJoinRoom,
  useLeaveRoom, useListBlockedProfiles, useListConversationMessages,
  useListConversations, useListMySocialPosts, useListProfileSocialPosts, useListRoomMessages, useListRooms, useListSocialPostFeed, useReportProfile,
  useRequestUploadUrl, useTranslateText,
  useSaveMyProfile, useSendConversationMessage, useSendRoomMessage,
  useStartConversation, useUnblockProfile,
} from '@workspace/api-client-react';
import type { Conversation, MatchInput, Profile, ProfileInput, ReportInput, RoomInput } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, Compass, Eye, EyeOff, Languages, Play, Upload, Video, Trash2,
  Flag, Globe2, Home, LockKeyhole, LogOut, MapPin, MessageCircle, MoreHorizontal,
  MoveHorizontal, Plus, Search, Send, Settings, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import BillingPage from './pages/billing';
import BillingSuccessPage from './pages/billing-success';
import BillingCancelPage from './pages/billing-cancel';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const cities = ['سيول', 'بوسان', 'إنتشون', 'دايجو', 'دايجون', 'جيجو'];
const interestChoices = ['القهوة المختصة', 'المشي', 'اللغة الكورية', 'التصوير', 'الطعام', 'الفن', 'القراءة', 'الموسيقى', 'التسوق', 'التنزه'];
type UiLanguage = 'ar' | 'en' | 'ko';
const LanguageContext = createContext<{ language: UiLanguage; setLanguage: (language: UiLanguage) => void }>({ language: 'ar', setLanguage: () => undefined });
function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(() => {
    const saved = localStorage.getItem('korea360-language');
    return saved === 'en' || saved === 'ko' ? saved : 'ar';
  });
  const setLanguage = (next: UiLanguage) => { localStorage.setItem('korea360-language', next); setLanguageState(next); };
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.body.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.body.style.direction = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}
function useLanguage() { return useContext(LanguageContext); }

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function Avatar({ profile, size = 'md' }: { profile?: Pick<Profile, 'displayName' | 'avatarUrl'> | null; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'h-20 w-20 text-xl' : size === 'sm' ? 'h-10 w-10 text-sm' : 'h-14 w-14 text-base';
  return profile?.avatarUrl
    ? <img data-testid={`img-avatar-${profile.displayName}`} className={`${dimensions} rounded-full object-cover ring-2 ring-background`} src={profile.avatarUrl} alt={`صورة ${profile.displayName}`} />
    : <div data-testid={`avatar-fallback-${profile?.displayName || 'member'}`} className={`${dimensions} flex shrink-0 items-center justify-center rounded-full bg-[#d9a47c] font-bold text-[#283f3a]`}>
        {profile?.displayName?.slice(0, 1)?.toUpperCase() || 'م'}
      </div>;
}

function ErrorMessage({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  return <div role="alert" data-testid="state-error" className={`rounded-2xl border border-[#e4b9ad] bg-[#fbefeb] text-[#793d32] ${compact ? 'p-4 text-sm' : 'p-7 text-center'}`}>
    <ShieldCheck className="mx-auto mb-2 h-6 w-6" />
    <p className="font-semibold">تعذّر تحميل هذه المساحة الآن</p><p className="mt-1 text-sm opacity-80">الخدمة لم تُكمل الاتصال بعد. جرّب مرة أخرى.</p>
    <button data-testid="button-retry" onClick={onRetry} className="mt-4 rounded-full bg-[#793d32] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button>
  </div>;
}

function Skeletons({ count = 3 }: { count?: number }) {
  return <div aria-label="جارٍ التحميل" data-testid="state-loading" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: count }, (_, i) => <div key={i} className="h-52 animate-pulse rounded-[1.5rem] bg-[#e9e1d1]" />)}</div>;
}

function EmptyState({ title, copy, icon: Icon = Compass }: { title: string; copy: string; icon?: typeof Compass }) {
  return <div data-testid="state-empty" className="flex min-h-64 flex-col items-center justify-center rounded-[1.7rem] border border-dashed border-[#c9c6b3] bg-[#f5f1e6] px-6 py-12 text-center">
    <div className="mb-4 rounded-2xl bg-[#dce7dc] p-4 text-primary"><Icon className="h-7 w-7" /></div>
    <h3 className="text-lg font-bold">{title}</h3><p className="mt-2 max-w-sm text-sm leading-7 text-muted-foreground">{copy}</p>
  </div>;
}

function useInvalidate() {
  const client = useQueryClient();
  return (keys: readonly (readonly unknown[])[]) => keys.forEach(queryKey => void client.invalidateQueries({ queryKey }));
}

function Shell({ children, title, eyebrow, action }: { children: ReactNode; title: string; eyebrow: string; action?: ReactNode }) {
  const { signOut } = useClerk();
  const [location] = useLocation();
  const profile = useGetMyProfile();
  const { language, setLanguage } = useLanguage();
  const labels = language === 'en' ? ['Discover', 'Messages', 'Rooms', 'Reels', 'Profile'] : language === 'ko' ? ['둘러보기', '메시지', '모임', '릴스', '프로필'] : ['اكتشف', 'رسائلك', 'الغرف', 'ريلز', 'الملف'];
  const links = [
    { href: '/discover', label: labels[0], icon: Compass },
    { href: '/messages', label: labels[1], icon: MessageCircle },
    { href: '/rooms', label: labels[2], icon: Users },
    { href: '/reels', label: labels[3], icon: Video },
    { href: '/profile', label: labels[4], icon: Home },
  ];
  return <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="app-grain min-h-[100dvh] bg-[#f4f1e6] text-[#213b38]">
    <aside className="fixed inset-y-0 right-0 z-30 hidden w-[258px] flex-col border-l border-[#d9d4c4] bg-[#eeebdf] px-5 py-6 lg:flex">
      <Link href="/" data-testid="link-brand" className="flex items-center gap-3 rounded-2xl px-2 py-1">
        <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#1f5c50] text-[#f6dbb5]"><Globe2 size={23} /></div>
        <div><div className="font-display text-lg font-extrabold tracking-tight">Korea 360</div><div className="text-[11px] font-medium text-muted-foreground">مساحتك لاكتشاف كوريا</div></div>
      </Link>
      <div className="mt-10 px-3 text-[10px] font-bold tracking-[.2em] text-[#80908a]">مساحتك الاجتماعية</div>
      <nav className="mt-3 space-y-1">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`nav-${href.slice(1)}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${location === href ? 'bg-[#dfe6d5] text-[#1b534e]' : 'text-[#66766f] hover:bg-white/60'}`}><Icon size={18} />{label}</Link>)}</nav>
      <div className="mt-8 rounded-[1.4rem] bg-[#d9e4d8] p-4">
        <div className="flex items-center gap-2 text-sm font-bold"><span className="scene-dot h-2 w-2 rounded-full bg-[#4d9473]" />مدينة تتسع لك</div>
        <p className="mt-2 text-xs leading-6 text-[#526b61]">مكان آمن لتبدأ محادثة، وتجد وجهك المألوف القادم.</p>
        <Link href="/discover" data-testid="link-explore-card" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#1f5c50]">ابدأ الاستكشاف <ArrowLeft size={14} /></Link>
      </div>
      <div className="mt-auto border-t border-[#d9d4c4] pt-5">
        <Link href="/settings" data-testid="nav-settings" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#66766f] hover:bg-white/60"><Settings size={18} />الإعدادات</Link>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#f8f5ec] p-3">
          <Avatar profile={profile.data?.profile} size="sm" />
          <div className="min-w-0 flex-1"><div data-testid="text-current-profile-name" className="truncate text-sm font-bold">{profile.data?.profile?.displayName || 'ملفك الشخصي'}</div><div className="text-[11px] text-muted-foreground">{profile.data?.profile ? 'متصل' : 'غير مسجل'}</div></div>
          <button data-testid="button-sign-out" aria-label="تسجيل الخروج" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-lg p-2 text-muted-foreground hover:bg-white/60"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#ded9c9] bg-[#f4f1e6]/90 px-4 py-3 backdrop-blur lg:hidden">
      <Link href="/" data-testid="link-mobile-brand" className="flex items-center gap-2"><div className="rounded-xl bg-[#1f5c50] p-2 text-[#f6dbb5]"><Globe2 size={18} /></div><strong className="text-sm font-black text-[#1d473f]">Korea 360</strong></Link>
      <Link href="/settings" data-testid="nav-mobile-settings" aria-label="الإعدادات" className="rounded-xl p-2 text-[#60736d]"><Settings size={19} /></Link>
    </header>
    <main className="min-h-[100dvh] pb-24 lg:mr-[258px] lg:pb-10">
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-6 sm:px-7 lg:px-10 lg:pt-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div><div className="mb-2 text-xs font-bold tracking-[.13em] text-[#789087]">{eyebrow}</div><h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-[2.5rem]">{title}</h1></div>
          {action}
        </div>{children}
      </div>
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[#d9d4c4] bg-[#f7f4eb]/95 px-2 py-2 backdrop-blur lg:hidden">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold ${location === href ? 'text-[#1d564d]' : 'text-[#6f7e77]'}`}><Icon size={17} />{label}</Link>)}</nav>
  </div>;
}

function HomeRedirect() { return <div>Home</div>; }
function SignInPage() { return <div>Sign In</div>; }
function SignUpPage() { return <div>Sign Up</div>; }

function Routes() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/billing/success" component={BillingSuccessPage} />
      <Route path="/billing/cancel" component={BillingCancelPage} />
      <Route><Redirect to="/" /></Route>
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <Routes />
    </WouterRouter>
  );
}

export default App;
