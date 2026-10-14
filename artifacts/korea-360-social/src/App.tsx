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

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const cities = ['سيول', 'بوسان', 'إنتشون', 'دايجو', 'دايجون', 'جيجو'];
const interestChoices = ['القهوة المختصة', 'المشي', 'اللغة الكورية', 'التصوير', 'الطعام', 'الفن', 'القراءة', 'الموسيقى', 'الرحلات', 'الألعاب', 'السينما', 'التقنية'];
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
    : <div data-testid={`avatar-fallback-${profile?.displayName || 'member'}`} className={`${dimensions} flex shrink-0 items-center justify-center rounded-full bg-[#d9a47c] font-bold text-[#283f3a] ring-2 ring-background`}>{profile?.displayName?.slice(0, 1) || '؟'}</div>;
}

function ErrorMessage({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  return <div role="alert" data-testid="state-error" className={`rounded-2xl border border-[#e4b9ad] bg-[#fbefeb] text-[#793d32] ${compact ? 'p-4 text-sm' : 'p-7 text-center'}`}>
    <ShieldCheck className="mx-auto mb-2 h-6 w-6" />
    <p className="font-semibold">تعذّر تحميل هذه المساحة الآن</p><p className="mt-1 text-sm opacity-80">الخدمة لم تُكمل الاتصال بعد. جرّب مرة أخرى بعد قليل.</p>
    <button data-testid="button-retry" onClick={onRetry} className="mt-4 rounded-full bg-[#793d32] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button>
  </div>;
}

function Skeletons({ count = 3 }: { count?: number }) {
  return <div aria-label="جارٍ التحميل" data-testid="state-loading" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: count }, (_, i) => <div key={i} className="h-48 animate-pulse rounded-[1.6rem] border border-border bg-card/70 p-5"><div className="h-12 w-12 rounded-full bg-muted" /><div className="mt-5 h-4 w-2/3 rounded-full bg-muted" /><div className="mt-3 h-3 w-full rounded-full bg-muted" /></div>)}</div>;
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
  const labels = language === 'en' ? ['Discover', 'Messages', 'Rooms', 'Reels', 'Profile'] : language === 'ko' ? ['둘러보기', '메시지', '모임', '릴스', '프로필'] : ['اكتشف', 'الرسائل', 'المجتمعات', 'مقاطع', 'ملفي'];
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
      <nav className="mt-3 space-y-1">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`nav-${href.slice(1)}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${location === href || location.startsWith(`${href}/`) ? 'bg-[#dce7dc] text-[#1f5c50]' : 'text-[#66766f] hover:bg-white/60 hover:text-[#1f5c50]'}`}><Icon size={18} /><span>{label}</span>{label === 'الرسائل' && <span className="mr-auto rounded-full bg-[#df9d77] px-2 py-0.5 text-[10px] text-[#3d342c]">+</span>}</Link>)}</nav>
      <div className="mt-8 rounded-[1.4rem] bg-[#d9e4d8] p-4">
        <div className="flex items-center gap-2 text-sm font-bold"><span className="scene-dot h-2 w-2 rounded-full bg-[#4d9473]" />مدينة تتسع لك</div>
        <p className="mt-2 text-xs leading-6 text-[#526b61]">مكان آمن لتبدأ محادثة، وتجد وجهك المألوف القادم.</p>
        <Link href="/discover" data-testid="link-explore-card" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#1f5c50]">ابدأ الاستكشاف <ArrowLeft size={14} /></Link>
      </div>
      <div className="mt-auto border-t border-[#d9d4c4] pt-5">
        <Link href="/settings" data-testid="nav-settings" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#66766f] hover:bg-white/60"><Settings size={18} />{language === 'en' ? 'Settings & privacy' : language === 'ko' ? '설정 및 개인정보' : 'الإعدادات والخصوصية'}</Link>
        <label className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#66766f]"><Languages size={15}/><span>{language === 'en' ? 'Interface language' : language === 'ko' ? '인터페이스 언어' : 'لغة الواجهة'}</span><select aria-label="Interface language" data-testid="select-ui-language" value={language} onChange={e=>setLanguage(e.target.value as UiLanguage)} className="ms-auto rounded-lg border border-[#d9d4c4] bg-[#f8f5ec] px-2 py-1"><option value="ar">العربية</option><option value="en">English</option><option value="ko">한국어</option></select></label>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#f8f5ec] p-3">
          <Avatar profile={profile.data?.profile} size="sm" />
          <div className="min-w-0 flex-1"><div data-testid="text-current-profile-name" className="truncate text-sm font-bold">{profile.data?.profile?.displayName || 'ملفك الشخصي'}</div><div className="text-[11px] text-muted-foreground">{profile.data?.profile?.city || 'كوريا الجنوبية'}</div></div>
          <button data-testid="button-sign-out" aria-label="تسجيل الخروج" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#ded9c9] bg-[#f4f1e6]/90 px-4 py-3 backdrop-blur lg:hidden">
      <Link href="/" data-testid="link-mobile-brand" className="flex items-center gap-2"><div className="rounded-xl bg-[#1f5c50] p-2 text-[#f6dbb5]"><Globe2 size={18} /></div><strong className="font-display">Korea 360</strong></Link>
      <Link href="/settings" data-testid="nav-mobile-settings" aria-label="الإعدادات" className="rounded-xl p-2 text-[#60736d]"><Settings size={19} /></Link>
    </header>
    <main className="min-h-[100dvh] pb-24 lg:mr-[258px] lg:pb-10">
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-6 sm:px-7 lg:px-10 lg:pt-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div><div className="mb-2 text-xs font-bold tracking-[.13em] text-[#789087]">{eyebrow}</div><h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-[2.5rem]">{title}</h1></div>{action}
        </div>{children}
      </div>
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[#d9d4c4] bg-[#f7f4eb]/95 px-2 py-2 backdrop-blur lg:hidden">{links.map(({ href, label, icon: Icon }) => <Link href={href} data-testid={`mobile-nav-${href.slice(1)}`} key={href} className={`flex min-w-[55px] flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold ${location === href || location.startsWith(`${href}/`) ? 'text-[#1f5c50]' : 'text-[#84918a]'}`}><Icon size={19} />{label}</Link>)}</nav>
  </div>;
}

function Landing() {
  const summary = useGetSocialSummary();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const [adult, setAdult] = useState(false);
  const [angle, setAngle] = useState(0);
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchCity, setMatchCity] = useState('سيول');
  const [matchInterests, setMatchInterests] = useState<string[]>([]);
  const findMatch = useFindRandomMatch();
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const [dragging, setDragging] = useState(false);
  const dragX = useRef(0);
  const invalidate = useInvalidate();
  const toggleInterest = (interest: string) => setMatchInterests(current => current.includes(interest) ? current.filter(v => v !== interest) : [...current, interest].slice(0, 12));
  const startMatch = (event: FormEvent) => {
    event.preventDefault();
    if (!isSignedIn) { setLocation('/sign-in'); return; }
    findMatch.mutate({ data: { city: matchCity, interests: matchInterests } as MatchInput }, {
      onSuccess: result => { invalidate([getListConversationsQueryKey()]); setLocation(`/messages/${result.conversation.id}`); },
    });
  };
  return <div dir="rtl" className="app-grain min-h-[100dvh] overflow-hidden bg-[#f4f1e6] text-[#203c38]">
    <header className="relative z-10 mx-auto flex max-w-[1380px] items-center justify-between px-5 py-5 sm:px-9">
      <Link href="/" data-testid="link-brand" className="flex items-center gap-3"><div className="rounded-[15px] bg-[#205c50] p-3 text-[#f5d9b1]"><Globe2 size={22} /></div><span className="font-display text-lg font-extrabold">Korea <span className="text-[#d17f5e]">360</span></span></Link>
      <div className="hidden items-center gap-2 text-xs font-semibold text-[#73857e] sm:flex"><span className={`h-2 w-2 rounded-full ${health.isError ? 'bg-[#d17f5e]' : 'bg-[#63a580]'}`} />مساحة عربية في كوريا</div>
      <div className="flex items-center gap-2"><Link href="/sign-in" data-testid="link-sign-in" className="rounded-full px-4 py-2 text-sm font-bold text-[#45665b] hover:bg-[#e6e5d9]">دخول</Link><Link href="/sign-up" data-testid="link-sign-up" className="rounded-full bg-[#205c50] px-4 py-2.5 text-sm font-bold text-[#fff8e9] shadow-sm transition-transform hover:-translate-y-0.5">انضم إلينا</Link></div>
    </header>
    <main>
      <section className="mx-auto grid max-w-[1380px] items-center gap-10 px-5 pb-16 pt-5 sm:px-9 lg:grid-cols-[.93fr_1.07fr] lg:gap-14 lg:pb-24 lg:pt-10">
        <div className="relative z-10 rise-in">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#d8cdb6] bg-[#faf6ec] px-3 py-2 text-xs font-bold text-[#567568]"><Sparkles size={14} className="text-[#d17f5e]" />أهلاً بك في كوريا، على طريقتك</div>
          <h1 className="font-display max-w-2xl text-[3.2rem] font-extrabold leading-[1.17] tracking-[-.055em] sm:text-6xl lg:text-[5.1rem]">مدينة جديدة،<br /><span className="relative inline-block text-[#1f5c50]">وجوه قريبة.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-[#62756e] sm:text-lg">مجتمع عربي للبالغين في كوريا الجنوبية. اكتشف أشخاصاً يشبهون اهتماماتك، ادخل غرفاً تنبض بالحياة، وخذ جولة صغيرة قبل أن تقول مرحباً.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex cursor-pointer items-center gap-2 text-xs leading-5 text-[#64766e]"><input data-testid="checkbox-age-confirmation" type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} className="h-4 w-4 accent-[#205c50]" />أؤكد أن عمري 18 عاماً أو أكثر</label>
            <Link href={adult ? '/sign-up' : '#age-confirm'} onClick={e => { if (!adult) { e.preventDefault(); document.getElementById('age-confirm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }} data-testid="button-join-community" className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold transition-all ${adult ? 'bg-[#d98061] text-[#2d3530] shadow-[0_12px_25px_-14px_#a55139] hover:-translate-y-0.5' : 'bg-[#ded8c6] text-[#777669]'}`}>ابدأ رحلتك <ArrowLeft size={16} /></Link>
          </div>
          {!adult && <p id="age-confirm" className="mt-2 text-xs text-[#9b6653]">تأكيد السن مطلوب قبل إنشاء الحساب.</p>}
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-[#72837c]"><span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-[#43836b]" />مجتمع للبالغين فقط</span><span className="inline-flex items-center gap-2"><LockKeyhole size={14} />خصوصيتك بيدك</span></div>
        </div>
        <div className="relative">
          <div className="absolute -inset-5 -z-10 rounded-[3rem] bg-[#e7d7bb] opacity-45 blur-2xl" />
          <div data-testid="experience-panorama" onPointerDown={e => { setDragging(true); dragX.current = e.clientX; }} onPointerMove={e => { if (dragging) { const delta = e.clientX - dragX.current; setAngle(a => a + delta * .28); dragX.current = e.clientX; } }} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onPointerLeave={() => setDragging(false)} className="panorama relative aspect-[1.04/1] cursor-grab touch-pan-y select-none overflow-hidden rounded-[2rem] border-[7px] border-[#f9f2df] shadow-[0_30px_80px_-36px_rgba(30,70,58,.55)] active:cursor-grabbing sm:aspect-[1.15/1]">
            <div className="panorama-stage" style={{ transform: `rotateY(${-angle}deg)` }}>
              {Array.from({ length: 8 }, (_, index) => <div key={index} className={`panorama-wall panorama-wall-${index % 4}`} style={{ transform: `rotateY(${index * 45}deg) translateZ(var(--panorama-radius))` }}>
                <div className="panorama-building panorama-building-one" />
                <div className="panorama-building panorama-building-two" />
                <div className="panorama-building panorama-building-three" />
                <div className="panorama-street-lamp" />
                <div className="panorama-window-glow" />
              </div>)}
            </div>
            <div className="pointer-events-none absolute right-[16%] top-[22%] rounded-full border border-white/40 bg-[#f7f0dc]/90 px-3 py-2 text-xs font-bold text-[#345b50] shadow-lg"><span className="scene-dot ml-2 inline-block h-2 w-2 rounded-full bg-[#56886e]" />هونغداي، سيول</div>
            <div className="pointer-events-none absolute left-[10%] top-[38%] rounded-full border border-white/40 bg-[#f7f0dc]/90 px-3 py-2 text-xs font-bold text-[#345b50] shadow-lg">مقهى على الزاوية <span className="scene-dot mr-2 inline-block h-2 w-2 rounded-full bg-[#d88462]" /></div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-[#fff5de] sm:p-7">
              <div><div className="text-[10px] font-bold tracking-[.2em] text-white/70">جولة حية • سيول</div><div className="mt-1 font-display text-2xl font-bold">تمشَّ في هونغداي</div><div className="mt-1 text-xs text-white/80">اسحب لتدير المشهد حولك</div></div>
              <div className="flex gap-1.5"><button data-testid="button-panorama-left" aria-label="إدارة المشهد يساراً" onClick={() => setAngle(a => a - 30)} className="rounded-full border border-white/30 bg-[#173d38]/60 p-2.5"><ArrowRight size={16} /></button><button data-testid="button-panorama-right" aria-label="إدارة المشهد يميناً" onClick={() => setAngle(a => a + 30)} className="rounded-full border border-white/30 bg-[#173d38]/60 p-2.5"><ArrowLeft size={16} /></button></div>
            </div>
          </div>
          <div className="absolute -bottom-5 -right-2 hidden rounded-2xl border border-[#dfd8c6] bg-[#faf7ee] px-4 py-3 shadow-lg sm:block"><div className="flex items-center gap-2 text-xs font-bold"><span className="h-2 w-2 rounded-full bg-[#5a9a77]" />{summary.data?.onlineCount ?? '—'} متصلون الآن</div></div>
        </div>
      </section>
      <section className="border-y border-[#ded9c9] bg-[#ece8dc]">
        <div className="mx-auto grid max-w-[1380px] gap-6 px-5 py-8 sm:grid-cols-3 sm:px-9">
          {[{value:summary.data?.memberCount,label:'عضو يبني مجتمعاً',icon:Users},{value:summary.data?.activeRoomCount,label:'غرفة مجتمع نشطة',icon:MessageCircle},{value:summary.data?.onlineCount,label:'شخص متصل الآن',icon:Globe2}].map(({value,label,icon:Icon})=><div key={label} className="flex items-center gap-4 sm:justify-center"><div className="rounded-2xl bg-[#dbe5da] p-3 text-[#205c50]"><Icon size={19} /></div><div><div data-testid={`stat-${label}`} className="font-display text-2xl font-extrabold">{summary.isLoading?'…':value ?? '—'}</div><div className="mt-0.5 text-xs text-[#73827a]">{label}</div></div></div>)}
        </div>
      </section>
      <section className="mx-auto max-w-[1380px] px-5 py-16 sm:px-9 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-end"><div><div className="text-xs font-bold tracking-[.17em] text-[#d17f5e]">ليس مجرد مكان للدردشة</div><h2 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">اتّسع للمكان.<br />ثمّ للناس.</h2></div><p className="max-w-xl text-sm leading-8 text-[#6c7c74]">ابدأ من حيّ تحبّه أو اهتمام يجمعك بشخص آخر. ستبقى الأشياء التي تشاركها، ومن يستطيع رؤيتها، بقرارك دائماً.</p></div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[{n:'01',title:'تعرّف على الوجوه',copy:'ملفات من مدن كوريا، بلغات واهتمامات مختلفة. لا اقتراحات مجهولة ولا ضغط.',icon:Compass,color:'bg-[#d9e6d8]'},{n:'02',title:'ادخل حواراً حقيقياً',copy:'غرف مجتمعية عن الحياة اليومية، واللغة، والأكل، وأشياء صغيرة تصنع الصداقة.',icon:MessageCircle,color:'bg-[#f1dcc8]'},{n:'03',title:'اكتشف المدينة معاً',copy:'جولة بانورامية تفاعلية تمنحك بداية للحديث عن كوريا التي تعيشها.',icon:MoveHorizontal,color:'bg-[#d9e2e5]'}].map(({n,title,copy,icon:Icon,color})=><article key={n} className="rounded-[1.8rem] border border-[#ded9c9] bg-[#faf7ee] p-6 transition-transform hover:-translate-y-1"><div className="flex items-start justify-between"><div className={`${color} rounded-2xl p-3`}><Icon size={21} /></div><span className="font-display text-sm font-bold text-[#a3a393]">{n}</span></div><h3 className="mt-6 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-7 text-[#75837b]">{copy}</p></article>)}
        </div>
      </section>
      <section className="mx-5 mb-16 overflow-hidden rounded-[2rem] bg-[#205c50] px-6 py-10 text-[#f8f2e4] sm:mx-9 sm:px-10 lg:mx-auto lg:max-w-[1320px] lg:py-14">
        <div className="grid gap-7 md:grid-cols-[1fr_auto] md:items-center"><div><div className="text-xs font-bold tracking-[.16em] text-[#e3b98e]">لقاء عفوي، بحدودك</div><h2 className="mt-3 font-display text-3xl font-extrabold">أحياناً يكفي أن تقول: مرحباً.</h2><p className="mt-3 max-w-xl text-sm leading-7 text-[#d6e3d9]">مطابقة عشوائية اختيارية، بعد تسجيل الدخول، وبالمدينة والاهتمامات التي تختارها.</p></div><button data-testid="button-open-match" onClick={()=>setMatchOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#e5a57d] px-6 py-3.5 font-bold text-[#2b4037] transition-transform hover:-translate-y-0.5">اكتشف شخصاً جديداً <Sparkles size={17} /></button></div>
      </section>
      <footer className="mx-auto flex max-w-[1380px] flex-col gap-4 px-5 pb-8 text-xs text-[#829087] sm:flex-row sm:items-center sm:justify-between sm:px-9"><span>© Korea 360 Social · مجتمع عربي للبالغين في كوريا الجنوبية</span><span className="flex items-center gap-3"><Link href="/sign-in" data-testid="link-footer-signin">دخول الأعضاء</Link><Link href="/sign-up" data-testid="link-footer-signup">إنشاء حساب</Link><Link href="/settings" data-testid="link-footer-safety">الأمان والخصوصية</Link></span></footer>
    </main>
    {matchOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183c37]/55 p-4 backdrop-blur-sm"><form onSubmit={startMatch} className="w-full max-w-lg rounded-[2rem] bg-[#f9f6ec] p-6 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between"><div><div className="text-xs font-bold tracking-widest text-[#d17f5e]">مطابقة اختيارية</div><h2 className="mt-2 font-display text-2xl font-extrabold">من قد تصادف اليوم؟</h2></div><button type="button" data-testid="button-close-match" onClick={()=>setMatchOpen(false)} className="rounded-full p-2 hover:bg-muted" aria-label="إغلاق"><X size={18}/></button></div>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">لن نبدأ البحث إلا بعد تسجيل الدخول. اختر مدينة واهتماماتك لتكوين بداية لطيفة.</p>
      <label className="mt-5 block text-sm font-bold">المدينة<select data-testid="select-match-city" value={matchCity} onChange={e=>setMatchCity(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3">{cities.map(city=><option key={city}>{city}</option>)}</select></label>
      <div className="mt-5 text-sm font-bold">اهتماماتك <span className="font-normal text-muted-foreground">اختياري</span></div><div className="mt-3 flex flex-wrap gap-2">{interestChoices.map(interest=><button type="button" data-testid={`chip-match-${interest}`} key={interest} onClick={()=>toggleInterest(interest)} className={`rounded-full border px-3 py-2 text-xs ${matchInterests.includes(interest)?'border-[#205c50] bg-[#dce7dc] text-[#205c50]':'border-border bg-card text-muted-foreground'}`}>{interest}</button>)}</div>
      {findMatch.isError&&<p role="alert" className="mt-3 text-sm text-destructive">تعذّر العثور على مطابقة الآن. سجّل الدخول وتأكد من اتصال الخدمة.</p>}
      <button data-testid="button-submit-match" disabled={findMatch.isPending} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#205c50] px-5 py-3.5 font-bold text-white disabled:opacity-50">{findMatch.isPending?'جارٍ البحث…':'ابحث عن مطابقة'} <Sparkles size={16}/></button>
      <Link href="/sign-in" data-testid="link-match-signin" className="mt-4 block text-center text-xs font-semibold text-[#205c50]">لديك حساب؟ سجّل الدخول</Link>
    </form></div>}
  </div>;
}

function SignedInEntry() {
  const profile = useGetMyProfile();
  if (profile.isLoading) return <div dir="rtl" className="min-h-[100dvh] bg-[#f4f1e6] p-8"><div className="mx-auto max-w-4xl animate-pulse"><div className="h-10 w-48 rounded-full bg-[#dce4d8]"/><div className="mt-8 h-56 rounded-[2rem] bg-[#e8e4d8]"/></div></div>;
  if (profile.isError) return <div dir="rtl" className="min-h-[100dvh] bg-[#f4f1e6] p-8"><div className="mx-auto max-w-4xl"><ErrorMessage onRetry={() => void profile.refetch()} /></div></div>;
  if (profile.data && !profile.data.profile) return <Redirect to="/onboarding" />;
  return <Redirect to="/discover" />;
}
function HomeRedirect() { return <><Show when="signed-in"><SignedInEntry /></Show><Show when="signed-out"><Landing /></Show></>; }
function SignInPage() { return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthFrame>; }
function SignUpPage() {
  const [adult, setAdult] = useState(false);
  return <AuthFrame><div className="w-full max-w-[440px]"><label className="mb-3 flex items-center gap-2 rounded-xl bg-[#e7e5d8] px-4 py-3 text-xs leading-5 text-[#47665b]"><input data-testid="checkbox-signup-age" type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)} className="accent-[#205c50]" />أؤكد أن عمري 18 عاماً أو أكثر</label>{adult?<SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />:<div className="rounded-2xl border border-[#d8d0bd] bg-[#faf7ee] p-5 text-center text-sm text-[#65786e]">لإنشاء حساب، يجب تأكيد أن عمرك 18 عاماً أو أكثر.</div>}</div></AuthFrame>;
}
function AuthFrame({children}:{children:ReactNode}) {
  return <div dir="rtl" className="flex min-h-[100dvh] items-center justify-center bg-[#f4f1e6] px-4 py-10"><div className="w-full max-w-[520px]"><Link href="/" data-testid="link-auth-brand" className="mb-6 flex items-center justify-center gap-2 font-display text-lg font-extrabold"><span className="rounded-xl bg-[#205c50] p-2 text-[#f5d9b1]"><Globe2 size={20}/></span>Korea 360</Link><div className="mb-6 text-center"><p className="text-sm text-[#72827a]">أهلاً بك في مجتمع عربي يقرّب المسافات.</p></div>{children}</div></div>;
}

function AuthGate({ children }: { children: ReactNode }) {
  const profile = useGetMyProfile();
  const [location] = useLocation();
  return <><Show when="signed-in">{profile.isLoading?<div dir="rtl" className="min-h-[100dvh] bg-[#f4f1e6] p-8"><div className="mx-auto h-40 max-w-3xl animate-pulse rounded-[2rem] bg-[#e8e4d8]"/></div>:profile.isError?<div dir="rtl" className="min-h-[100dvh] bg-[#f4f1e6] p-8"><div className="mx-auto max-w-4xl"><ErrorMessage onRetry={() => void profile.refetch()} /></div></div>:profile.data&&!profile.data.profile&&location!=='/onboarding'?<Redirect to="/onboarding"/>:children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}
function Portal({children,title,eyebrow,action}:{children:ReactNode;title:string;eyebrow:string;action?:ReactNode}) { return <AuthGate><Shell title={title} eyebrow={eyebrow} action={action}>{children}</Shell></AuthGate>; }

function DiscoverPage() {
  const [city,setCity]=useState(''); const [search,setSearch]=useState(''); const [interest,setInterest]=useState('');
  const filters=useMemo(()=>({city:city||undefined,search:search||undefined,interest:interest||undefined}),[city,search,interest]);
  const profiles=useDiscoverProfiles(filters);
  const start=useStartConversation(); const block=useBlockProfile(); const report=useReportProfile(); const invalidate=useInvalidate(); const [,setLocation]=useLocation();
  const [safetyProfile,setSafetyProfile]=useState<Profile|null>(null); const [reportReason,setReportReason]=useState<ReportInput['reason']>('other');
  const message=(profile:Profile)=>start.mutate({profileId:profile.id},{onSuccess:conv=>{invalidate([getListConversationsQueryKey()]);setLocation(`/messages/${conv.id}`);}});
  const doBlock=()=>{if(!safetyProfile)return;block.mutate({data:{profileId:safetyProfile.id}},{onSuccess:()=>{invalidate([getDiscoverProfilesQueryKey(filters),getListBlockedProfilesQueryKey()]);setSafetyProfile(null);}});};
  const doReport=()=>{if(!safetyProfile)return;report.mutate({data:{profileId:safetyProfile.id,reason:reportReason,details:''}},{onSuccess:()=>{invalidate([getDiscoverProfilesQueryKey(filters)]);setSafetyProfile(null);}});};
  return <Portal title="وجوه جديدة، قريبة" eyebrow="استكشف مجتمعك" action={<div className="hidden items-center gap-2 rounded-full bg-[#dce7dc] px-3 py-2 text-xs font-semibold text-[#356956] sm:flex"><span className="h-2 w-2 rounded-full bg-[#579a76]"/>{profiles.data?.length ?? '—'} ملفاً متاحاً</div>}>
    <div className="mb-6 flex flex-col gap-3 rounded-[1.5rem] border border-[#ded9c9] bg-[#faf7ee] p-4 sm:flex-row sm:items-center">
      <label className="relative flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-[#8b9991]"/><input data-testid="input-discover-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث بالاسم أو بالكلمة..." className="w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] py-2.5 pr-10 pl-3 text-sm outline-none focus:border-[#6f9a82]"/></label>
      <select data-testid="select-discover-city" value={city} onChange={e=>setCity(e.target.value)} className="rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5 text-sm"><option value="">كل المدن</option>{cities.map(c=><option key={c}>{c}</option>)}</select>
      <select data-testid="select-discover-interest" value={interest} onChange={e=>setInterest(e.target.value)} className="rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5 text-sm"><option value="">كل الاهتمامات</option>{interestChoices.map(c=><option key={c}>{c}</option>)}</select>
    </div>
    {profiles.isLoading?<Skeletons/>:profiles.isError?<ErrorMessage onRetry={()=>void profiles.refetch()}/>:!profiles.data?.length?<EmptyState title="لا توجد ملفات مطابقة بعد" copy="جرّب مدينة أخرى أو وسّع بحثك. المجتمع يتغير مع كل عضو جديد."/>:
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{profiles.data.map((person,index)=><article data-testid={`card-profile-${person.id}`} key={person.id} className="group overflow-hidden rounded-[1.6rem] border border-[#ded9c9] bg-[#faf7ee] transition-all hover:-translate-y-1 hover:shadow-[0_18px_40px_-28px_rgba(32,73,62,.38)]" style={{animationDelay:`${index*55}ms`}}>
        <div className={`relative h-24 ${index%3===0?'bg-[#d8e3d6]':index%3===1?'bg-[#efdec9]':'bg-[#d7e0e2]'}`}><div className="absolute -bottom-7 right-5"><Avatar profile={person} size="lg"/></div><span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-[#faf7ee]/90 px-2.5 py-1 text-[10px] font-semibold">{person.isOnline?<><span className="h-1.5 w-1.5 rounded-full bg-[#58a079]"/>متصل الآن</>:'غير متصل'}</span><button data-testid={`button-profile-menu-${person.id}`} onClick={()=>setSafetyProfile(person)} aria-label={`خيارات الأمان لـ ${person.displayName}`} className="absolute right-4 top-4 rounded-full bg-[#faf7ee]/85 p-2"><MoreHorizontal size={16}/></button></div>
        <div className="px-5 pb-5 pt-10"><div className="flex items-baseline gap-2"><Link href={`/members/${person.id}`} data-testid={`link-member-profile-${person.id}`} className="text-lg font-bold hover:text-[#205c50]">{person.displayName}</Link><span className="text-sm text-muted-foreground">{person.age}</span></div><div className="mt-1 flex items-center gap-1 text-xs text-[#75867e]"><MapPin size={13}/>{person.city}</div><p className="mt-3 min-h-12 text-sm leading-6 text-[#64766e]">{person.bio || 'ما زال هذا العضو يكتب حكايته.'}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{person.interests.slice(0,3).map(tag=><span key={tag} className="rounded-full bg-[#e8e5d8] px-2.5 py-1 text-[10px] font-semibold text-[#61746b]">{tag}</span>)}</div>
          <div className="mt-4 flex items-center justify-between border-t border-[#e5e0d2] pt-4"><span className="text-[11px] text-[#829088]">{person.languages.join(' · ') || 'لغات غير محددة'}</span><button data-testid={`button-message-${person.id}`} disabled={start.isPending} onClick={()=>message(person)} className="inline-flex items-center gap-2 rounded-full bg-[#205c50] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><MessageCircle size={14}/>مراسلة</button></div>
        </div>
      </article>)}</div>}
    {start.isError&&<p role="alert" data-testid="status-conversation-error" className="mt-4 text-sm text-destructive">تعذّر بدء المحادثة. تحقق من تسجيل الدخول ثم أعد المحاولة.</p>}
    {safetyProfile&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183c37]/50 p-4"><div className="w-full max-w-md rounded-[1.7rem] bg-[#faf7ee] p-6"><div className="flex items-start justify-between"><div><div className="text-xs font-bold text-[#8b7061]">أدوات السلامة</div><h3 className="mt-1 text-xl font-bold">{safetyProfile.displayName}</h3></div><button data-testid="button-close-safety" onClick={()=>setSafetyProfile(null)} aria-label="إغلاق" className="rounded-full p-2 hover:bg-muted"><X size={18}/></button></div><p className="mt-3 text-sm leading-6 text-muted-foreground">الإبلاغ يرسل مراجعة للمسؤولين. الحظر يمنع التواصل مع هذا الملف.</p><select data-testid="select-report-reason" value={reportReason} onChange={e=>setReportReason(e.target.value as ReportInput['reason'])} className="mt-4 w-full rounded-xl border border-border bg-card p-3 text-sm"><option value="harassment">مضايقة أو إساءة</option><option value="spam">رسائل مزعجة</option><option value="inappropriate">محتوى غير لائق</option><option value="underage">اشتباه بأن العمر أقل من 18</option><option value="other">سبب آخر</option></select><button data-testid="button-report-profile" onClick={doReport} disabled={report.isPending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9b5a7] px-4 py-3 text-sm font-bold text-[#924c3d]"><Flag size={15}/>{report.isPending?'جارٍ الإرسال…':'إبلاغ عن هذا الملف'}</button><button data-testid="button-block-profile" onClick={doBlock} disabled={block.isPending} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#803f36] px-4 py-3 text-sm font-bold text-white"><EyeOff size={15}/>{block.isPending?'جارٍ الحظر…':'حظر هذا الملف'}</button>{(report.isError||block.isError)&&<p role="alert" className="mt-3 text-sm text-destructive">تعذّر تنفيذ الإجراء. حاول مرة أخرى.</p>}</div></div>}
  </Portal>;
}

function TranslatableMessage({ text }: { text: string }) {
  const translate = useTranslateText();
  const { language } = useLanguage();
  const [translated, setTranslated] = useState('');
  const target = language;
  const run = () => translate.mutate({ data: { text, targetLanguage: target } }, { onSuccess: result => setTranslated(result.translatedText) });
  return <><div>{text}</div>{translated ? <div className="mt-2 border-t border-current/10 pt-2 text-sm" lang={target} dir={target === 'ar' ? 'rtl' : 'ltr'}><span className="mb-1 block text-[10px] font-bold opacity-60">{target === 'ar' ? 'الترجمة' : target === 'ko' ? '번역' : 'Translation'}</span>{translated}</div> : <button type="button" data-testid="button-translate-message" onClick={run} disabled={translate.isPending} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold opacity-70 underline underline-offset-2">{translate.isPending ? '…' : target === 'ar' ? 'ترجم' : target === 'ko' ? '번역' : 'Translate'}</button>}{translate.isError && <p role="alert" className="mt-1 text-xs text-destructive">Translation unavailable. Try again.</p>}</>;
}

function MessagesPage(){const conversations=useListConversations({query:{queryKey:getListConversationsQueryKey(),refetchInterval:5000}});return <Portal title="رسائلك" eyebrow="تواصل على مهل"><div className="max-w-4xl">{conversations.isLoading?<Skeletons count={2}/>:conversations.isError?<ErrorMessage onRetry={()=>void conversations.refetch()}/>:!conversations.data?.length?<EmptyState title="أول محادثة تنتظرك" copy="ابدأ من اكتشاف الأشخاص. عندما تبدأ محادثة، ستجدها هنا." icon={MessageCircle}/>:<div className="overflow-hidden rounded-[1.6rem] border border-[#ded9c9] bg-[#faf7ee]">{conversations.data.map((conv:Conversation)=><Link href={`/messages/${conv.id}`} data-testid={`conversation-${conv.id}`} key={conv.id} className="flex items-center gap-4 border-b border-[#e8e3d7] p-4 transition-colors hover:bg-[#f0eee4] last:border-b-0 sm:p-5"><Avatar profile={conv.partner}/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="font-bold">{conv.partner.displayName}</span><time className="text-[10px] text-[#88958d]">{new Date(conv.updatedAt).toLocaleDateString('ar')}</time></div><p data-testid={`text-last-message-${conv.id}`} className="mt-1 truncate text-sm text-[#718078]">{conv.lastMessage || 'ابدأ أول رسالة بينكما'}</p></div>{conv.unreadCount>0&&<span className="rounded-full bg-[#d98061] px-2 py-1 text-[10px] font-bold text-white">{conv.unreadCount}</span>}<ArrowLeft size={16} className="text-[#91a098]"/></Link>)}</div>}</div></Portal>;}

function ConversationPage(){const {conversationId=''}=useParams<{conversationId:string}>();const id=Number(conversationId);const list=useListConversations({query:{queryKey:getListConversationsQueryKey(),refetchInterval:5000}});const conv=list.data?.find(c=>c.id===id);const messages=useListConversationMessages(id,{query:{enabled:Number.isFinite(id)&&id>0,queryKey:getListConversationMessagesQueryKey(id),refetchInterval:3000}});const send=useSendConversationMessage();const block=useBlockProfile();const report=useReportProfile();const invalidate=useInvalidate();const [text,setText]=useState('');const [safetyOpen,setSafetyOpen]=useState(false);const [reason,setReason]=useState<ReportInput['reason']>('other');
  const submit=(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;send.mutate({conversationId:id,data:{text:text.trim()}},{onSuccess:()=>{setText('');invalidate([getListConversationMessagesQueryKey(id),getListConversationsQueryKey()]);}});};
  const blockPartner=()=>{if(!conv)return;block.mutate({data:{profileId:conv.partner.id}},{onSuccess:()=>{invalidate([getListBlockedProfilesQueryKey(),getListConversationsQueryKey()]);setSafetyOpen(false);}});};
  const reportPartner=()=>{if(!conv)return;report.mutate({data:{profileId:conv.partner.id,reason,details:''}},{onSuccess:()=>{invalidate([getListConversationsQueryKey()]);setSafetyOpen(false);}});};
  return <Portal title={conv?.partner.displayName||'محادثة خاصة'} eyebrow="رسائل خاصة" action={<Link href="/messages" data-testid="link-back-messages" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold"><ArrowRight size={16}/>كل الرسائل</Link>}>
    <div className="mx-auto flex h-[min(68vh,720px)] max-w-4xl flex-col overflow-hidden rounded-[1.7rem] border border-[#ded9c9] bg-[#faf7ee]">
      <div className="flex items-center gap-3 border-b border-[#e5e0d2] bg-[#f1eee4] px-5 py-4"><Avatar profile={conv?.partner} size="sm"/><div><div className="font-bold">{conv?.partner.displayName||'تحميل المحادثة…'}</div><div className="text-xs text-muted-foreground">{conv?.partner.city||'رسائلك خاصة بينكما'}</div></div><button data-testid={`button-conversation-safety-${id}`} onClick={()=>setSafetyOpen(true)} aria-label="إجراءات السلامة" className="mr-auto rounded-full p-2 text-[#8d7365] hover:bg-[#e5dfd0]"><ShieldCheck size={18}/></button></div>
       <div className="scrollbar-none flex-1 space-y-3 overflow-y-auto p-5">{messages.isLoading?<div className="space-y-3">{[0,1,2].map(n=><div key={n} className="h-12 w-2/3 animate-pulse rounded-2xl bg-muted"/>)}</div>:messages.isError?<ErrorMessage compact onRetry={()=>void messages.refetch()}/>:!messages.data?.length?<EmptyState title="ابدأ برسالة بسيطة" copy="سؤال عن الحيّ المفضل قد يكون بداية جميلة." icon={MessageCircle}/>:messages.data.map(message=><div key={message.id} data-testid={`message-${message.id}`} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${conv?.partner.id===message.senderId?'ml-auto bg-[#dce7dc] text-[#294d42]':'mr-auto bg-[#eee8dc] text-[#475a51]'}`}><div className="mb-1 text-[10px] font-bold opacity-60">{message.senderName} · {new Date(message.createdAt).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})}</div><TranslatableMessage text={message.text}/></div>)}</div>
      <form onSubmit={submit} className="flex gap-2 border-t border-[#e5e0d2] bg-[#f1eee4] p-3"><input data-testid="input-conversation-message" value={text} onChange={e=>setText(e.target.value)} maxLength={2000} placeholder="اكتب رسالة..." className="min-w-0 flex-1 rounded-full border border-border bg-card px-5 py-3 text-sm outline-none focus:border-[#78a18b]"/><button data-testid="button-send-conversation-message" disabled={!text.trim()||send.isPending} className="rounded-full bg-[#205c50] px-5 text-white disabled:opacity-45" aria-label="إرسال"><Send size={17}/></button></form>
    </div>{send.isError&&<p role="alert" className="mt-3 text-sm text-destructive">لم تُرسل الرسالة. جرّب مرة أخرى.</p>}
    {safetyOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183c37]/50 p-4"><div className="w-full max-w-md rounded-[1.7rem] bg-[#faf7ee] p-6"><div className="flex items-start justify-between"><div><div className="text-xs font-bold text-[#8b7061]">إجراءات السلامة</div><h3 className="mt-1 text-xl font-bold">{conv?.partner.displayName}</h3></div><button data-testid="button-close-conversation-safety" onClick={()=>setSafetyOpen(false)} aria-label="إغلاق" className="rounded-full p-2"><X size={18}/></button></div><p className="mt-3 text-sm leading-6 text-muted-foreground">يمكنك إرسال بلاغ خاص أو حظر هذا الملف. لا يمكن التراجع عن الحظر من هنا؛ ستجده في الإعدادات.</p><select data-testid="select-conversation-report-reason" value={reason} onChange={e=>setReason(e.target.value as ReportInput['reason'])} className="mt-4 w-full rounded-xl border border-border bg-card p-3 text-sm"><option value="harassment">مضايقة أو إساءة</option><option value="spam">رسائل مزعجة</option><option value="inappropriate">محتوى غير لائق</option><option value="underage">اشتباه بأن العمر أقل من 18</option><option value="other">سبب آخر</option></select><button data-testid="button-report-conversation-profile" onClick={reportPartner} disabled={report.isPending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9b5a7] px-4 py-3 text-sm font-bold text-[#924c3d]"><Flag size={15}/>{report.isPending?'جارٍ الإرسال…':'إبلاغ عن هذا الملف'}</button><button data-testid="button-block-conversation-profile" onClick={blockPartner} disabled={block.isPending} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#803f36] px-4 py-3 text-sm font-bold text-white"><EyeOff size={15}/>{block.isPending?'جارٍ الحظر…':'حظر هذا الملف'}</button>{(report.isError||block.isError)&&<p role="alert" className="mt-3 text-sm text-destructive">تعذّر تنفيذ الإجراء. حاول مرة أخرى.</p>}</div></div>}
  </Portal>;
}

function RoomsPage(){const rooms=useListRooms();const create=useCreateRoom();const join=useJoinRoom();const leave=useLeaveRoom();const invalidate=useInvalidate();const [open,setOpen]=useState(false);const [values,setValues]=useState<RoomInput>({name:'',description:'',city:'سيول',topic:''});const [,setLocation]=useLocation();
  const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:values},{onSuccess:r=>{invalidate([getListRoomsQueryKey()]);setOpen(false);setValues({name:'',description:'',city:'سيول',topic:''});setLocation(`/rooms/${r.id}`);}});};
  const membership=(roomId:number,joined:boolean)=> (joined?leave:join).mutate({roomId},{onSuccess:()=>invalidate([getListRoomsQueryKey()])});
  return <Portal title="غرف لها نبض" eyebrow="المجتمعات" action={<button data-testid="button-create-room" onClick={()=>setOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#205c50] px-4 py-2.5 text-sm font-bold text-white"><Plus size={16}/>أنشئ غرفة</button>}>
    {rooms.isLoading?<Skeletons/>:rooms.isError?<ErrorMessage onRetry={()=>void rooms.refetch()}/>:!rooms.data?.length?<EmptyState title="الغرفة الأولى قد تكون لك" copy="ابدأ مساحة صغيرة حول اهتمام يجمع الناس في مدينتك." icon={Users}/>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rooms.data.map((room,index)=><article key={room.id} data-testid={`card-room-${room.id}`} className="relative overflow-hidden rounded-[1.7rem] border border-[#ded9c9] bg-[#faf7ee] p-5"><div className={`absolute inset-x-0 top-0 h-2 ${index%3===0?'bg-[#d98061]':index%3===1?'bg-[#719b82]':'bg-[#d4ac73]'}`}/><div className="mt-2 flex items-start justify-between"><span className="rounded-full bg-[#e5e9dd] px-3 py-1 text-[10px] font-bold text-[#496c5c]">{room.topic}</span><span className="flex items-center gap-1 text-xs text-[#829087]"><Users size={13}/>{room.memberCount}</span></div><h2 data-testid={`text-room-name-${room.id}`} className="mt-4 font-display text-xl font-extrabold">{room.name}</h2><div className="mt-1 flex items-center gap-1 text-xs text-[#849088]"><MapPin size={13}/>{room.city}</div><p className="mt-4 min-h-[3.2rem] text-sm leading-6 text-[#6b7a72]">{room.description}</p><div className="mt-5 flex gap-2"><Link href={`/rooms/${room.id}`} data-testid={`link-room-${room.id}`} className="flex-1 rounded-full border border-[#cbd6c8] px-3 py-2.5 text-center text-xs font-bold text-[#315f50]">افتح الغرفة</Link><button data-testid={`${room.isJoined?'button-leave':'button-join'}-room-${room.id}`} onClick={()=>membership(room.id,room.isJoined)} disabled={join.isPending||leave.isPending} className={`rounded-full px-4 py-2.5 text-xs font-bold ${room.isJoined?'bg-[#e9e3d7] text-[#65746c]':'bg-[#205c50] text-white'}`}>{room.isJoined?'غادِر':'انضم'}</button></div></article>)}</div>}
    {(join.isError||leave.isError||create.isError)&&<p role="alert" className="mt-4 text-sm text-destructive">تعذّر حفظ هذا التغيير. حاول مجدداً.</p>}
    {open&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183c37]/50 p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-[1.8rem] bg-[#faf7ee] p-6"><div className="flex justify-between"><div><div className="text-xs font-bold text-[#c77c5e]">مكانك المشترك</div><h2 className="mt-1 text-2xl font-bold">إنشاء غرفة</h2></div><button type="button" data-testid="button-close-create-room" onClick={()=>setOpen(false)} aria-label="إغلاق" className="rounded-full p-2"><X size={18}/></button></div><div className="mt-5 grid gap-3"><input data-testid="input-room-name" required minLength={3} maxLength={60} placeholder="اسم الغرفة" value={values.name} onChange={e=>setValues({...values,name:e.target.value})} className="rounded-xl border border-border bg-card px-4 py-3 text-sm"/><input data-testid="input-room-topic" required minLength={2} maxLength={40} placeholder="الموضوع، مثلاً: نزهات نهاية الأسبوع" value={values.topic} onChange={e=>setValues({...values,topic:e.target.value})} className="rounded-xl border border-border bg-card px-4 py-3 text-sm"/><select data-testid="select-room-city" value={values.city} onChange={e=>setValues({...values,city:e.target.value})} className="rounded-xl border border-border bg-card px-4 py-3 text-sm">{cities.map(c=><option key={c}>{c}</option>)}</select><textarea data-testid="input-room-description" required maxLength={300} rows={3} placeholder="ما الذي يجمع أعضاء هذه الغرفة؟" value={values.description} onChange={e=>setValues({...values,description:e.target.value})} className="resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm"/></div>{create.isError&&<p role="alert" className="mt-3 text-sm text-destructive">لم يتم إنشاء الغرفة.</p>}<button data-testid="button-submit-create-room" disabled={create.isPending} className="mt-5 w-full rounded-full bg-[#205c50] py-3 font-bold text-white">{create.isPending?'جارٍ الإنشاء…':'أنشئ الغرفة'}</button></form></div>}
  </Portal>;
}

function RoomPage(){const {roomId=''}=useParams<{roomId:string}>();const id=Number(roomId);const rooms=useListRooms();const room=rooms.data?.find(r=>r.id===id);const messages=useListRoomMessages(id,{query:{enabled:Number.isFinite(id)&&id>0,queryKey:getListRoomMessagesQueryKey(id),refetchInterval:3000}});const send=useSendRoomMessage();const join=useJoinRoom();const invalidate=useInvalidate();const [text,setText]=useState('');
  const submit=(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;send.mutate({roomId:id,data:{text:text.trim()}},{onSuccess:()=>{setText('');invalidate([getListRoomMessagesQueryKey(id)]);}});};
  return <Portal title={room?.name||'مساحة المجتمع'} eyebrow={room?.topic||'غرفة محادثة'} action={<Link href="/rooms" data-testid="link-back-rooms" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold"><ArrowRight size={16}/>الغرف</Link>}>
    <div className="mx-auto max-w-4xl overflow-hidden rounded-[1.7rem] border border-[#ded9c9] bg-[#faf7ee]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e0d2] bg-[#f0eee4] px-5 py-4"><div><div className="flex items-center gap-2 text-sm font-bold"><MapPin size={14}/>{room?.city||'كوريا الجنوبية'} <span className="font-normal text-muted-foreground">· {room?.memberCount??'—'} أعضاء</span></div><div className="mt-1 text-xs text-[#77867e]">{room?.description||'مساحة للحديث وتبادل التجارب.'}</div></div>{room&&!room.isJoined&&<button data-testid={`button-join-room-${id}`} onClick={()=>join.mutate({roomId:id},{onSuccess:()=>invalidate([getListRoomsQueryKey()])})} className="rounded-full bg-[#205c50] px-4 py-2 text-xs font-bold text-white">انضم للمحادثة</button>}</div>
       <div className="scrollbar-none flex h-[min(58vh,620px)] flex-col gap-3 overflow-y-auto p-5">{messages.isLoading?<div className="h-full animate-pulse rounded-2xl bg-muted"/>:messages.isError?<ErrorMessage compact onRetry={()=>void messages.refetch()}/>:!messages.data?.length?<EmptyState title="الغرفة هادئة حتى الآن" copy="ابدأ الحديث وامنح الآخرين مدخلاً للمشاركة." icon={Users}/>:messages.data.map(message=><div data-testid={`room-message-${message.id}`} key={message.id} className="flex max-w-[90%] gap-2.5"><Avatar profile={{displayName:message.senderName,avatarUrl:message.senderAvatarUrl}} size="sm"/><div className="rounded-2xl bg-[#e9e7dc] px-4 py-3"><div className="mb-1 flex gap-2 text-[10px] font-bold text-[#63766c]">{message.senderName}<time className="font-normal opacity-70">{new Date(message.createdAt).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})}</time></div><div className="text-sm leading-6"><TranslatableMessage text={message.text}/></div></div></div>)}</div>
      <form onSubmit={submit} className="flex gap-2 border-t border-[#e5e0d2] bg-[#f0eee4] p-3"><input data-testid="input-room-message" value={text} onChange={e=>setText(e.target.value)} maxLength={2000} placeholder={room?.isJoined?'شارك فكرة مع الغرفة…':'انضم إلى الغرفة لتكتب رسالة'} disabled={!room?.isJoined} className="min-w-0 flex-1 rounded-full border border-border bg-card px-5 py-3 text-sm disabled:opacity-60"/><button data-testid="button-send-room-message" disabled={!room?.isJoined||!text.trim()||send.isPending} aria-label="إرسال" className="rounded-full bg-[#205c50] px-5 text-white disabled:opacity-45"><Send size={17}/></button></form>
    </div>{send.isError&&<p role="alert" className="mt-3 text-sm text-destructive">تعذّر إرسال الرسالة.</p>}
  </Portal>;
}

function VideoTile({ post, onDelete }: { post: { id:number; profileId:number; author:{id:number;displayName:string;avatarUrl:string|null;city:string}; caption:string; durationSeconds:number; mediaUrl:string; createdAt:string }; onDelete?: (id:number)=>void }) {
  return <article className="overflow-hidden rounded-[1.5rem] border border-[#ded9c9] bg-[#faf7ee]">
    <video data-testid={`video-post-${post.id}`} className="aspect-[9/12] w-full bg-[#193c38] object-cover" controls playsInline preload="metadata" src={post.mediaUrl} aria-label={`${post.author.displayName} short video`} />
    <div className="p-4"><div className="flex items-center gap-3"><Avatar profile={{displayName:post.author.displayName,avatarUrl:post.author.avatarUrl}} size="sm"/><div className="min-w-0 flex-1"><Link href={`/members/${post.profileId}`} className="block truncate text-sm font-bold">{post.author.displayName}</Link><div className="text-xs text-[#7b8981]">{post.author.city} · {post.durationSeconds}s</div></div>{onDelete&&<button data-testid={`button-delete-post-${post.id}`} onClick={()=>{if(window.confirm('Delete this video?'))onDelete(post.id);}} aria-label="Delete video" className="rounded-full p-2 text-[#8d5548] hover:bg-[#f3e4dc]"><Trash2 size={16}/></button>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#52655b]">{post.caption}</p></div>
  </article>;
}
function ProfilePage(){
  const profile=useGetMyProfile();
  const posts=useListMySocialPosts({query:{queryKey:getListMySocialPostsQueryKey(),enabled:!!profile.data?.profile,refetchOnMount:true}});
  const remove=useDeleteSocialPost(); const client=useQueryClient();
  const onDelete=(postId:number)=>remove.mutate({postId},{onSuccess:()=>{void client.invalidateQueries({queryKey:getListMySocialPostsQueryKey()});void client.invalidateQueries({queryKey:getListSocialPostFeedQueryKey()});}});
  if(profile.isLoading)return <Portal title="ملفي الشخصي" eyebrow="ملفي"><Skeletons count={1}/></Portal>;
  if(profile.isError)return <Portal title="ملفي الشخصي" eyebrow="ملفي"><ErrorMessage onRetry={()=>void profile.refetch()}/></Portal>;
  const member=profile.data?.profile;
  return <Portal title={member?.displayName||'ملفي الشخصي'} eyebrow="مساحتي">
    {!member ? <EmptyState title="ابدأ بملفك الشخصي" copy="عرّف مجتمع Korea 360 عليك." icon={Home}/> : <div className="mx-auto max-w-5xl">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#ded9c9] bg-[#faf7ee]">
        <div className="h-36 bg-[radial-gradient(ellipse_at_72%_8%,#e6bc8b,transparent_35%),linear-gradient(125deg,#1d5149,#779283_55%,#d5b78e)] sm:h-52"/>
        <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-end sm:px-8">
          <div className="-mt-12 rounded-full bg-[#faf7ee] p-1 sm:-mt-16"><Avatar profile={member} size="lg"/></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl font-extrabold">{member.displayName}</h2><span className="text-sm text-[#829087]">{member.age}</span></div><div className="mt-1 flex items-center gap-1 text-sm text-[#72837a]"><MapPin size={14}/>{member.city}</div></div>
          <Link href="/profile/edit" data-testid="link-edit-profile" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#205c50] px-5 py-3 text-sm font-bold text-white"><Settings size={16}/>تعديل الملف</Link>
        </div>
        <div className="grid gap-6 px-5 pb-7 sm:grid-cols-[1fr_auto] sm:px-8"><p className="max-w-2xl text-sm leading-7 text-[#566b60]">{member.bio||'أضف نبذة صغيرة في صفحة تعديل الملف.'}</p><div className="flex flex-wrap gap-2">{member.languages.map(lang=><span key={lang} className="rounded-full bg-[#e7e8dc] px-3 py-1.5 text-xs font-semibold">{lang}</span>)}{member.interests.map(tag=><span key={tag} className="rounded-full bg-[#f0e1d0] px-3 py-1.5 text-xs font-semibold text-[#705849]">{tag}</span>)}</div></div>
      </section>
      <div className="mb-4 mt-9 flex items-center justify-between"><div><p className="text-[11px] font-bold tracking-[.17em] text-[#bd795c]">SHORT FILMS</p><h2 className="mt-1 font-display text-2xl font-extrabold">My moments</h2></div><Link href="/reels" className="text-sm font-bold text-[#205c50]">Add a video <ArrowLeft size={14} className="inline"/></Link></div>
      {posts.isLoading?<Skeletons/>:posts.isError?<ErrorMessage onRetry={()=>void posts.refetch()}/>:!posts.data?.length?<EmptyState title="Your first moment is waiting" copy="Share a family-friendly glimpse of everyday life in Korea." icon={Video}/>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{posts.data.map(post=><VideoTile key={post.id} post={post} onDelete={onDelete}/>)}</div>}
      {remove.isError&&<p role="alert" className="mt-3 text-sm text-destructive">Could not delete this video. Please try again.</p>}
    </div>}
  </Portal>;
}
function MemberProfilePage(){
  const {profileId='0'}=useParams<{profileId:string}>(); const id=Number(profileId);
  const profile=useGetPublicProfile(id,{query:{queryKey:getGetPublicProfileQueryKey(id)}});
  const posts=useListProfileSocialPosts(id,{query:{queryKey:getListProfileSocialPostsQueryKey(id),enabled:Number.isFinite(id)&&id>0}});
  const start=useStartConversation(); const [,setLocation]=useLocation(); const invalidate=useInvalidate();
  if(profile.isLoading)return <Portal title="Member profile" eyebrow="COMMUNITY"><Skeletons count={1}/></Portal>;
  if(profile.isError||!profile.data)return <Portal title="Profile unavailable" eyebrow="COMMUNITY"><ErrorMessage onRetry={()=>void profile.refetch()}/></Portal>;
  const p=profile.data;
  return <Portal title={p.displayName} eyebrow="MEMBER PROFILE" action={<button onClick={()=>start.mutate({profileId:id},{onSuccess:c=>{invalidate([getListConversationsQueryKey()]);setLocation(`/messages/${c.id}`);}})} className="rounded-full bg-[#205c50] px-5 py-3 text-sm font-bold text-white">Message member</button>}>
    <section className="mb-8 rounded-[2rem] border border-[#ded9c9] bg-[#faf7ee] p-6 sm:p-9"><div className="flex items-center gap-5"><Avatar profile={p} size="lg"/><div><h2 className="font-display text-2xl font-extrabold">{p.displayName}, {p.age}</h2><p className="mt-1 flex items-center gap-1 text-sm text-[#78877f]"><MapPin size={14}/>{p.city}</p><span className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[#527963]"><span className={`h-2 w-2 rounded-full ${p.isOnline?'bg-[#4d9473]':'bg-[#adb4ab]'}`}/>{p.isOnline?'Online now':'Around Korea'}</span></div></div><p className="mt-6 max-w-3xl text-sm leading-7 text-[#5f7167]">{p.bio||'This member is still writing their story.'}</p><div className="mt-4 flex flex-wrap gap-2">{[...p.languages,...p.interests].map(tag=><span key={tag} className="rounded-full bg-[#e8e6da] px-3 py-1.5 text-xs font-medium">{tag}</span>)}</div></section>
    {posts.isLoading?<Skeletons/>:posts.isError?<ErrorMessage onRetry={()=>void posts.refetch()}/>:!posts.data?.length?<EmptyState title="No videos yet" copy="When this member shares a moment, it will appear here." icon={Video}/>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{posts.data.map(post=><VideoTile key={post.id} post={post}/>)}</div>}
  </Portal>;
}
function ReelsPage(){
  const feed=useListSocialPostFeed({query:{queryKey:getListSocialPostFeedQueryKey(),refetchOnMount:true}});
  const uploadUrl=useRequestUploadUrl(); const create=useCreateSocialPost(); const client=useQueryClient();
  const [open,setOpen]=useState(false); const [file,setFile]=useState<File|null>(null); const [caption,setCaption]=useState(''); const [duration,setDuration]=useState(0); const [confirmed,setConfirmed]=useState(false); const [progress,setProgress]=useState(0); const [uploadError,setUploadError]=useState('');
  const invalidate=()=>{void client.invalidateQueries({queryKey:getListSocialPostFeedQueryKey()});void client.invalidateQueries({queryKey:getListMySocialPostsQueryKey()});};
  const chooseFile=(selected:File|null)=>{setFile(selected);setDuration(0);setUploadError('');if(!selected)return;const localUrl=URL.createObjectURL(selected);const video=document.createElement('video');video.preload='metadata';video.onloadedmetadata=()=>{setDuration(Math.round(video.duration));URL.revokeObjectURL(localUrl);};video.onerror=()=>{setDuration(0);URL.revokeObjectURL(localUrl);};video.src=localUrl;};
  const publish=async(e:FormEvent)=>{e.preventDefault();setUploadError('');if(!file||!confirmed||duration<1||duration>90)return;const mime=file.type as 'video/mp4'|'video/webm'|'video/quicktime';if(!['video/mp4','video/webm','video/quicktime'].includes(mime)){setUploadError('Choose an MP4, WebM, or QuickTime video.');return;}
    try {
      const signed=await uploadUrl.mutateAsync({data:{name:file.name,size:file.size,contentType:mime}});
      await new Promise<void>((resolve,reject)=>{const request=new XMLHttpRequest();request.open('PUT',signed.uploadURL);request.setRequestHeader('Content-Type',mime);request.upload.onprogress=event=>{if(event.lengthComputable)setProgress(Math.round(event.loaded/event.total*100));};request.onload=()=>request.status>=200&&request.status<300?resolve():reject(new Error(`Upload failed (${request.status})`));request.onerror=()=>reject(new Error('Network error during upload'));request.send(file);});
      await create.mutateAsync({data:{objectPath:signed.objectPath,caption:caption.trim(),durationSeconds:duration,familySafeConfirmed:true}});
      invalidate();setOpen(false);setFile(null);setCaption('');setDuration(0);setProgress(0);setConfirmed(false);
    } catch { setUploadError('Upload could not be completed. Check your connection and try again.'); }
  };
  return <Portal title="Moments from Korea" eyebrow="KOREA 360 · REELS" action={<button data-testid="button-open-video-upload" onClick={()=>setOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#205c50] px-5 py-3 text-sm font-bold text-white"><Upload size={16}/>Share a moment</button>}>
    <div className="mb-7 flex items-center justify-between rounded-[1.6rem] bg-[#205c50] px-5 py-5 text-[#f8f2e4] sm:px-8"><div><p className="text-[10px] font-bold tracking-[.2em] text-[#e6bf94]">ADULT-CREATED · FAMILY-FRIENDLY</p><h2 className="mt-2 font-display text-xl font-extrabold sm:text-2xl">Little scenes. A wider world.</h2><p className="mt-1 text-sm text-[#d6e3d9]">Real moments shared by members across South Korea.</p></div><Play size={28} className="shrink-0 text-[#e7ad7e]"/></div>
    {feed.isLoading?<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:3},(_,i)=><div key={i} className="aspect-[9/12] animate-pulse rounded-[1.5rem] bg-[#e4e1d5]"/>)}</div>:feed.isError?<ErrorMessage onRetry={()=>void feed.refetch()}/>:!feed.data?.length?<EmptyState title="A quiet feed, for now" copy="There are no shared videos yet. Be the first adult member to share a family-friendly moment." icon={Video}/>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{feed.data.map(post=><VideoTile key={post.id} post={post}/>)}</div>}
    {open&&<div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#183c37]/60 p-4 backdrop-blur-sm"><form onSubmit={publish} className="my-6 w-full max-w-xl rounded-[1.8rem] bg-[#faf7ee] p-6 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between"><div><p className="text-[10px] font-bold tracking-[.2em] text-[#c17a5e]">SHARE A MOMENT</p><h2 className="mt-2 font-display text-2xl font-extrabold">A short scene from your Korea</h2></div><button type="button" data-testid="button-close-video-upload" onClick={()=>setOpen(false)} aria-label="Close" className="rounded-full p-2 hover:bg-[#ece9df]"><X size={19}/></button></div>
      <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-[#aebcaf] bg-[#f0f1e7] px-4 py-8 text-center"><Upload className="mb-3 text-[#47745f]"/><span className="text-sm font-bold">{file?.name||'Choose a video file'}</span><span className="mt-1 text-xs text-[#79877f]">MP4, WebM, or QuickTime · 100 MB max</span><input data-testid="input-social-video" type="file" accept="video/mp4,video/webm,video/quicktime,.mov" className="sr-only" onChange={e=>chooseFile(e.target.files?.[0]||null)}/></label>
      {file&&<div className="mt-3 flex items-center justify-between rounded-xl bg-[#e8eadd] px-4 py-3 text-xs"><span className="truncate">{file.type||'Unknown MIME type'}</span><span className="font-bold">{duration ? `${duration} sec` : 'Reading duration…'}</span></div>}
      <label className="mt-5 block text-sm font-bold">Caption <textarea data-testid="input-social-caption" value={caption} onChange={e=>setCaption(e.target.value)} maxLength={2200} rows={3} placeholder="A small detail you love about today…" className="mt-2 w-full resize-y rounded-xl border border-[#d9d4c4] bg-[#fffdf6] px-4 py-3 text-sm font-normal"/></label>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#e0d8c8] bg-[#f2eee4] p-4 text-sm leading-6"><input data-testid="checkbox-family-safe" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-[#205c50]"/><span>I confirm I am an adult and this video is family-friendly and appropriate for all ages.</span></label>
      {(uploadUrl.isPending||create.isPending||progress>0)&&<div className="mt-4" role="status"><div className="mb-1 flex justify-between text-xs"><span>{create.isPending?'Publishing…':'Uploading video'}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#e2dfd2]"><div className="h-full rounded-full bg-[#4c896d] transition-[width]" style={{width:`${progress}%`}}/></div></div>}
      {(uploadError||uploadUrl.isError||create.isError)&&<p role="alert" className="mt-3 text-sm text-destructive">{uploadError||'Could not publish this video. Please try again.'}</p>}
      <button data-testid="button-publish-video" disabled={!file||!confirmed||duration<1||duration>90||uploadUrl.isPending||create.isPending} className="mt-5 w-full rounded-full bg-[#205c50] py-3.5 text-sm font-bold text-white disabled:opacity-45">{uploadUrl.isPending?'Preparing secure upload…':create.isPending?'Publishing…':'Publish video'}</button>
      <p className="mt-3 text-center text-[11px] leading-5 text-[#829087]">Videos must be 1–90 seconds. Keep original files under 100 MB.</p>
    </form></div>}
  </Portal>;
}
function ProfileEditPage(){const profile=useGetMyProfile();const save=useSaveMyProfile();const invalidate=useInvalidate();const [form,setForm]=useState<ProfileInput>({displayName:'',age:18,city:'سيول',bio:'',avatarUrl:null,languages:['العربية'],interests:[],isPublic:true});const initialized=useRef(false);
  useEffect(()=>{if(profile.data?.profile&&!initialized.current){const p=profile.data.profile;setForm({displayName:p.displayName,age:p.age,city:p.city,bio:p.bio||'',avatarUrl:p.avatarUrl,languages:p.languages,interests:p.interests,isPublic:p.isPublic});initialized.current=true;}},[profile.data]);
  const submit=(e:FormEvent)=>{e.preventDefault();save.mutate({data:form},{onSuccess:()=>invalidate([getGetMyProfileQueryKey(),getDiscoverProfilesQueryKey(),getGetSocialSummaryQueryKey()])});};
  const toggle=(field:'languages'|'interests',value:string)=>setForm(f=>({...f,[field]:f[field].includes(value)?f[field].filter(x=>x!==value):[...f[field],value].slice(0,field==='languages'?5:12)}));
  if(profile.isLoading)return <Portal title="ملفك الشخصي" eyebrow="ملفك"><Skeletons count={1}/></Portal>;
  if(profile.isError)return <Portal title="ملفك الشخصي" eyebrow="ملفك"><ErrorMessage onRetry={()=>void profile.refetch()}/></Portal>;
  return <Portal title="ملفك الشخصي" eyebrow="كن كما أنت"><form onSubmit={submit} className="mx-auto max-w-3xl overflow-hidden rounded-[1.8rem] border border-[#ded9c9] bg-[#faf7ee]">
    <div className="relative h-36 bg-[#d9e5d9]"><div className="absolute -bottom-10 right-7 rounded-full bg-[#faf7ee] p-1"><Avatar profile={profile.data?.profile} size="lg"/></div><div className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-[#faf7ee]/80 px-3 py-2 text-xs font-bold text-[#4c6a5e]"><ShieldCheck size={14}/>ملفك تحت سيطرتك</div></div>
    <div className="grid gap-5 p-6 pt-14 sm:grid-cols-2 sm:p-8 sm:pt-14">
      <label className="text-sm font-bold">الاسم الظاهر<input data-testid="input-profile-name" required minLength={2} maxLength={40} value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 font-normal"/></label>
      <label className="text-sm font-bold">العمر (18+)<input data-testid="input-profile-age" type="number" min={18} max={120} required value={form.age} onChange={e=>setForm({...form,age:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 font-normal"/></label>
      <label className="text-sm font-bold">المدينة<select data-testid="select-profile-city" value={form.city} onChange={e=>setForm({...form,city:e.target.value})} className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 font-normal">{cities.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="text-sm font-bold">رابط الصورة <span className="font-normal text-muted-foreground">اختياري</span><input data-testid="input-profile-avatar" type="url" value={form.avatarUrl||''} onChange={e=>setForm({...form,avatarUrl:e.target.value||null})} placeholder="https://" className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 font-normal" dir="ltr"/></label>
      <label className="text-sm font-bold sm:col-span-2">نبذة عنك<textarea data-testid="input-profile-bio" maxLength={240} rows={3} value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})} placeholder="ما الذي تحب أن يعرفه الآخرون عنك؟" className="mt-2 w-full resize-none rounded-xl border border-border bg-card px-4 py-3 font-normal leading-6"/></label>
      <div className="sm:col-span-2"><div className="text-sm font-bold">اللغات</div><div className="mt-2 flex flex-wrap gap-2">{['العربية','English','한국어','Français','中文'].map(lang=><button type="button" data-testid={`chip-language-${lang}`} onClick={()=>toggle('languages',lang)} key={lang} className={`rounded-full border px-3 py-2 text-xs ${form.languages.includes(lang)?'border-[#205c50] bg-[#dce7dc] text-[#205c50]':'border-border bg-card text-muted-foreground'}`}>{lang}</button>)}</div></div>
      <div className="sm:col-span-2"><div className="text-sm font-bold">اهتماماتك <span className="font-normal text-muted-foreground">حتى 12</span></div><div className="mt-2 flex flex-wrap gap-2">{interestChoices.map(item=><button type="button" data-testid={`chip-profile-interest-${item}`} onClick={()=>toggle('interests',item)} key={item} className={`rounded-full border px-3 py-2 text-xs ${form.interests.includes(item)?'border-[#205c50] bg-[#dce7dc] text-[#205c50]':'border-border bg-card text-muted-foreground'}`}>{item}</button>)}</div></div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-[#efede2] p-4 text-sm font-semibold sm:col-span-2"><input data-testid="checkbox-profile-public" type="checkbox" checked={form.isPublic} onChange={e=>setForm({...form,isPublic:e.target.checked})} className="h-4 w-4 accent-[#205c50]"/><span className="flex-1">إظهار ملفي في الاكتشاف</span>{form.isPublic?<Eye size={16}/>:<EyeOff size={16}/>}</label>
      {save.isError&&<p role="alert" className="text-sm text-destructive sm:col-span-2">تعذّر حفظ الملف. لم يتم حفظ التغييرات محلياً.</p>}
      {save.isSuccess&&<p role="status" data-testid="status-profile-saved" className="text-sm font-semibold text-[#397452] sm:col-span-2">تم حفظ ملفك بنجاح.</p>}
      <button data-testid="button-save-profile" disabled={save.isPending||form.age<18} className="rounded-full bg-[#205c50] px-6 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2">{save.isPending?'جارٍ الحفظ…':'حفظ التغييرات'}</button>
    </div>
  </form></Portal>;
}

function OnboardingPage(){const profile=useGetMyProfile();const [,setLocation]=useLocation();const save=useSaveMyProfile();const [values,setValues]=useState<ProfileInput>({displayName:'',age:18,city:'سيول',bio:'',avatarUrl:null,languages:['العربية'],interests:[],isPublic:true});const invalidate=useInvalidate();
  useEffect(()=>{if(profile.data?.profile)setLocation('/profile');},[profile.data,setLocation]);
  const submit=(e:FormEvent)=>{e.preventDefault();save.mutate({data:values},{onSuccess:()=>{invalidate([getGetMyProfileQueryKey()]);setLocation('/discover');}});};
  return <AuthGate><div dir="rtl" className="app-grain min-h-[100dvh] bg-[#f4f1e6] px-4 py-8"><div className="mx-auto max-w-3xl"><Link href="/" data-testid="link-onboarding-brand" className="font-display font-extrabold">Korea 360</Link><div className="mt-9 rounded-[2rem] border border-[#ded9c9] bg-[#faf7ee] p-6 sm:p-10"><div className="text-xs font-bold tracking-widest text-[#d17f5e]">خطوتك الأولى</div><h1 className="mt-2 font-display text-3xl font-extrabold">عرّفنا عليك</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">أنشئ ملفاً بسيطاً. يجب أن يكون عمرك 18 عاماً أو أكثر.</p><form onSubmit={submit} className="mt-7 grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-bold">الاسم الظاهر<input data-testid="input-onboarding-name" required minLength={2} maxLength={40} value={values.displayName} onChange={e=>setValues({...values,displayName:e.target.value})} className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 font-normal"/></label>
    <label className="text-sm font-bold">العمر<input data-testid="input-onboarding-age" type="number" min={18} max={120} required value={values.age} onChange={e=>setValues({...values,age:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 font-normal"/></label>
    <label className="text-sm font-bold">المدينة<select data-testid="select-onboarding-city" value={values.city} onChange={e=>setValues({...values,city:e.target.value})} className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 font-normal">{cities.map(c=><option key={c}>{c}</option>)}</select></label>
    <label className="text-sm font-bold">رابط الصورة<input data-testid="input-onboarding-avatar" type="url" value={values.avatarUrl||''} onChange={e=>setValues({...values,avatarUrl:e.target.value||null})} placeholder="اختياري" className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 font-normal"/></label>
    <label className="text-sm font-bold sm:col-span-2">نبذة<textarea data-testid="input-onboarding-bio" maxLength={240} rows={3} value={values.bio} onChange={e=>setValues({...values,bio:e.target.value})} className="mt-2 w-full resize-none rounded-xl border border-border bg-card px-4 py-3 font-normal"/></label>
    <div className="sm:col-span-2"><div className="text-sm font-bold">اهتماماتك</div><div className="mt-2 flex flex-wrap gap-2">{interestChoices.map(i=><button type="button" data-testid={`chip-onboarding-${i}`} key={i} onClick={()=>setValues(v=>({...v,interests:v.interests.includes(i)?v.interests.filter(x=>x!==i):[...v.interests,i].slice(0,12)}))} className={`rounded-full border px-3 py-2 text-xs ${values.interests.includes(i)?'border-[#205c50] bg-[#dce7dc]':'border-border bg-card'}`}>{i}</button>)}</div></div>
    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input data-testid="checkbox-onboarding-public" type="checkbox" checked={values.isPublic} onChange={e=>setValues({...values,isPublic:e.target.checked})} className="accent-[#205c50]"/>أسمح بظهور ملفي في الاكتشاف</label>
    {save.isError&&<p role="alert" className="text-sm text-destructive sm:col-span-2">تعذّر الحفظ، تأكد من اتصال الخدمة وحاول مجدداً.</p>}<button data-testid="button-complete-onboarding" disabled={save.isPending||values.age<18} className="rounded-full bg-[#205c50] py-3 font-bold text-white disabled:opacity-50 sm:col-span-2">{save.isPending?'جارٍ إنشاء ملفك…':'أنشئ ملفي'}</button>
  </form></div></div></div></AuthGate>;
}

function SettingsPage(){const blocked=useListBlockedProfiles();const unblock=useUnblockProfile();const invalidate=useInvalidate();const {language,setLanguage}=useLanguage();return <Portal title="أمانك، على مقاسك" eyebrow="الإعدادات والخصوصية"><div className="mx-auto max-w-4xl space-y-5">
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-[1.7rem] border border-[#ded9c9] bg-[#faf7ee] p-6 sm:p-8"><div className="flex items-center gap-4"><div className="rounded-2xl bg-[#dce7dc] p-3 text-[#39745f]"><Languages size={21}/></div><div><h2 className="text-lg font-bold">لغة الواجهة</h2><p className="mt-1 text-sm text-muted-foreground">اختر لغة العرض والترجمة للرسائل. يتم حفظ اختيارك على هذا الجهاز.</p></div></div><select data-testid="select-settings-language" aria-label="لغة الواجهة" value={language} onChange={e=>setLanguage(e.target.value as UiLanguage)} className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold"><option value="ar">العربية · RTL</option><option value="en">English · LTR</option><option value="ko">한국어 · LTR</option></select></section>
    <section className="rounded-[1.7rem] border border-[#ded9c9] bg-[#faf7ee] p-6 sm:p-8"><div className="flex items-start gap-4"><div className="rounded-2xl bg-[#dce7dc] p-3 text-[#39745f]"><ShieldCheck size={21}/></div><div><h2 className="text-lg font-bold">مساحة آمنة تبدأ منك</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-[#6d7d75]">يمكنك جعل ملفك خاصاً من صفحة ملفك الشخصي، أو الإبلاغ عن أي سلوك غير مناسب من قائمة خيارات الملف. البلاغات لا تُعرض علناً.</p></div></div><div className="mt-5 flex flex-wrap gap-3"><Link href="/profile" data-testid="link-settings-profile" className="rounded-full bg-[#205c50] px-4 py-2.5 text-xs font-bold text-white">إعدادات الظهور</Link><Link href="/discover" data-testid="link-settings-discover" className="rounded-full border border-[#cad5c8] px-4 py-2.5 text-xs font-bold text-[#456b59]">اكتشف الملفات</Link></div></section>
    <section className="rounded-[1.7rem] border border-[#ded9c9] bg-[#faf7ee] p-6 sm:p-8"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">الملفات المحظورة</h2><p className="mt-1 text-sm text-muted-foreground">لن يتمكن الملف المحظور من مراسلتك.</p></div><LockKeyhole size={20} className="text-[#8c7364]"/></div>
      <div className="mt-5">{blocked.isLoading?<div className="h-16 animate-pulse rounded-xl bg-muted"/>:blocked.isError?<ErrorMessage compact onRetry={()=>void blocked.refetch()}/>:!blocked.data?.length?<EmptyState title="لا توجد ملفات محظورة" copy="يمكنك حظر ملف من صفحة الاكتشاف متى احتجت." icon={Eye}/>:<div className="divide-y divide-[#e6e1d5]">{blocked.data.map(person=><div key={person.id} data-testid={`blocked-profile-${person.id}`} className="flex items-center gap-3 py-3"><Avatar profile={person} size="sm"/><div className="flex-1"><div className="font-semibold">{person.displayName}</div><div className="text-xs text-muted-foreground">{person.city}</div></div><button data-testid={`button-unblock-${person.id}`} onClick={()=>unblock.mutate({profileId:person.id},{onSuccess:()=>invalidate([getListBlockedProfilesQueryKey(),getDiscoverProfilesQueryKey()])})} disabled={unblock.isPending} className="rounded-full border border-[#d5cbb8] px-4 py-2 text-xs font-bold text-[#5c7066]">إلغاء الحظر</button></div>)}</div>}</div>
      {unblock.isError&&<p role="alert" className="mt-3 text-sm text-destructive">تعذّر إلغاء الحظر.</p>}
    </section>
    <div className="rounded-2xl border border-[#e0c5b7] bg-[#f7ebe4] p-4 text-sm leading-7 text-[#80574a]"><strong>حدّ واضح:</strong> Korea 360 مخصص للبالغين بعمر 18 عاماً فما فوق. إذا شعرت بعدم الأمان، غادر المحادثة واستخدم الإبلاغ أو الحظر.</div>
  </div></Portal>;}

function RoutedErrorBoundary({children}:{children:ReactNode}){const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;}
function ClerkQueryClientCacheInvalidator(){const {addListener}=useClerk();const client=useQueryClient();const previous=useRef<string|null|undefined>(undefined);useEffect(()=>{const unsubscribe=addListener(({user})=>{const id=user?.id??null;if(previous.current!==undefined&&previous.current!==id)client.clear();previous.current=id;});return unsubscribe;},[addListener,client]);return null;}
function Routes(){const [,setLocation]=useLocation();return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})} localization={arSA} appearance={{theme:shadcn,cssLayerName:'clerk',options:{logoPlacement:'inside',logoLinkUrl:basePath||'/',logoImageUrl:`${window.location.origin}${basePath}/logo.svg`},variables:{colorPrimary:'#205c50',colorForeground:'#203c38',colorMutedForeground:'#718078',colorDanger:'#a54638',colorBackground:'#faf7ee',colorInput:'#f7f4eb',colorInputForeground:'#203c38',colorNeutral:'#d9d4c4',fontFamily:'IBM Plex Sans Arabic, sans-serif',borderRadius:'1rem'},elements:{rootBox:'w-full flex justify-center',cardBox:'bg-[#faf7ee] rounded-[1.7rem] w-[440px] max-w-full overflow-hidden shadow-xl',card:'!shadow-none !border-0 !bg-transparent',footer:'!shadow-none !border-0 !bg-transparent',headerTitle:'text-[#203c38] font-bold',headerSubtitle:'text-[#718078]',socialButtonsBlockButtonText:'text-[#203c38]',formFieldLabel:'text-[#45665b]',footerActionLink:'text-[#205c50]',footerActionText:'text-[#718078]',dividerText:'text-[#718078]',formButtonPrimary:'bg-[#205c50] hover:bg-[#174b41]',formFieldInput:'bg-[#f7f4eb] text-[#203c38] border-[#d9d4c4]',main:'text-[#203c38]'}}}>
    <QueryClientProvider client={queryClient}><LanguageProvider><ClerkQueryClientCacheInvalidator/><RoutedErrorBoundary><Switch>
      <Route path="/" component={HomeRedirect}/><Route path="/sign-in/*?" component={SignInPage}/><Route path="/sign-up/*?" component={SignUpPage}/>
      <Route path="/onboarding" component={OnboardingPage}/><Route path="/discover" component={DiscoverPage}/>
      <Route path="/reels" component={ReelsPage}/><Route path="/members/:profileId" component={MemberProfilePage}/>
      <Route path="/messages/:conversationId" component={ConversationPage}/><Route path="/messages" component={MessagesPage}/>
      <Route path="/rooms/:roomId" component={RoomPage}/><Route path="/rooms" component={RoomsPage}/>
      <Route path="/profile/edit" component={ProfileEditPage}/><Route path="/profile" component={ProfilePage}/><Route path="/settings" component={SettingsPage}/>
      <Route><Redirect to="/" /></Route>
    </Switch></RoutedErrorBoundary></LanguageProvider></QueryClientProvider></ClerkProvider>;}

function App(){if(!clerkPubKey)return <div dir="rtl" className="flex min-h-[100dvh] items-center justify-center bg-[#f4f1e6] p-6 text-center"><div className="max-w-md rounded-[1.7rem] bg-[#faf7ee] p-8"><Globe2 className="mx-auto h-8 w-8 text-[#205c50]"/><h1 className="mt-4 text-xl font-bold">Korea 360 Social</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">إعداد تسجيل الدخول غير مكتمل بعد. ستظهر صفحة المجتمع بمجرد تهيئة Clerk.</p></div></div>;
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><Routes/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;}

export default App;
