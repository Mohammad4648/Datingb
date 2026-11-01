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
const interestChoices = ['القهوة المختصة', 'المشي', 'اللغة الكورية', 'التصوير', 'الطعام', 'الفن', 'القراءة', 'الموسيقى', 'التسوق', 'الرحلات', 'الرياضة', 'الرحلات الداخلية'];
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
    : <div data-testid={`avatar-fallback-${profile?.displayName || 'member'}`} className={`${dimensions} flex shrink-0 items-center justify-center rounded-full bg-[#d9a47c] font-bold text-[#283f3a]`}>{(profile?.displayName || 'ك').slice(0, 1).toUpperCase()}</div>;
}

function ErrorMessage({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  return <div role="alert" data-testid="state-error" className={`rounded-2xl border border-[#e4b9ad] bg-[#fbefeb] text-[#793d32] ${compact ? 'p-4 text-sm' : 'p-7 text-center'}`}>
    <ShieldCheck className="mx-auto mb-2 h-6 w-6" />
    <p className="font-semibold">تعذّر تحميل هذه المساحة الآن</p><p className="mt-1 text-sm opacity-80">الخدمة لم تُكمل الاتصال بعد. جرّب مرة أخرى.</p>
    <button data-testid="button-retry" onClick={onRetry} className="mt-4 rounded-full bg-[#793d32] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button>
  </div>;
}

function Skeletons({ count = 3 }: { count?: number }) {
  return <div aria-label="جارٍ التحميل" data-testid="state-loading" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: count }, (_, i) => <div key={i} className="h-52 animate-pulse rounded-[1.5rem] bg-[#e7e2d7]" />)}</div>;
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
  const labels = language === 'en' ? ['Discover', 'Messages', 'Rooms', 'Reels', 'Profile'] : language === 'ko' ? ['둘러보기', '메시지', '모임', '릴스', '프로필'] : ['اكتشف', 'الرسائل', 'الغرف', 'ريلز', 'الملف'];
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
      <nav className="mt-3 space-y-1">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`nav-${href.slice(1)}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${location === href ? 'bg-[#dfe8dc] text-[#1d564d]' : 'text-[#66766f] hover:bg-white/60'}`}><Icon size={18} />{label}</Link>)}</nav>
      <div className="mt-8 rounded-[1.4rem] bg-[#d9e4d8] p-4">
        <div className="flex items-center gap-2 text-sm font-bold"><span className="scene-dot h-2 w-2 rounded-full bg-[#4d9473]" />مدينة تتسع لك</div>
        <p className="mt-2 text-xs leading-6 text-[#526b61]">مكان آمن لتبدأ محادثة، وتجد وجهك المألوف القادم.</p>
        <Link href="/discover" data-testid="link-explore-card" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#1f5c50]">ابدأ الاستكشاف <ArrowLeft size={14} /></Link>
      </div>
      <div className="mt-auto border-t border-[#d9d4c4] pt-5">
        <Link href="/settings" data-testid="nav-settings" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#66766f] hover:bg-white/60"><Settings size={18} />الإعدادات</Link>
        <label className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#66766f]"><Languages size={15}/><span>{language === 'en' ? 'Interface language' : language === 'ko' ? '인터페이스 언어' : 'لغة الواجهة'}</span><select value={language} onChange={e => setLanguage(e.target.value as UiLanguage)} className="w-full rounded-lg border border-[#d9d4c4] bg-white/60 px-2 py-1 text-xs"><option value="ar">العربية</option><option value="en">English</option><option value="ko">한국어</option></select></label>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#f8f5ec] p-3">
          <Avatar profile={profile.data?.profile} size="sm" />
          <div className="min-w-0 flex-1"><div data-testid="text-current-profile-name" className="truncate text-sm font-bold">{profile.data?.profile?.displayName || 'ملفك الشخصي'}</div><div className="text-[11px] text-[#819087]">{profile.data?.profile ? 'متصل الآن' : 'غير مُحدّد'}</div></div>
          <button data-testid="button-sign-out" aria-label="تسجيل الخروج" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-lg p-2 text-muted-foreground hover:bg-white/60"><LogOut size={17} /></button>
        </div>
      </div>
    </aside>
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#ded9c9] bg-[#f4f1e6]/90 px-4 py-3 backdrop-blur lg:hidden">
      <Link href="/" data-testid="link-mobile-brand" className="flex items-center gap-2"><div className="rounded-xl bg-[#1f5c50] p-2 text-[#f6dbb5]"><Globe2 size={18} /></div><strong className="font-display text-base">Korea 360</strong></Link>
      <Link href="/settings" data-testid="nav-mobile-settings" aria-label="الإعدادات" className="rounded-xl p-2 text-[#60736d]"><Settings size={19} /></Link>
    </header>
    <main className="min-h-[100dvh] pb-24 lg:mr-[258px] lg:pb-10">
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-6 sm:px-7 lg:px-10 lg:pt-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div><div className="mb-2 text-xs font-bold tracking-[.13em] text-[#789087]">{eyebrow}</div><h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-[2.5rem]">{title}</h1></div>{action}
        </div>{children}
      </div>
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[#d9d4c4] bg-[#f7f4eb]/95 px-2 py-2 backdrop-blur lg:hidden">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`nav-${href.slice(1)}`} className={`flex flex-col items-center gap-1 px-2 py-1 text-[10px] font-semibold ${location === href ? 'text-[#1d564d]' : 'text-[#6f7f7a]'}`}><Icon size={18} /><span>{label}</span></Link>)}</nav>
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
      <Link href="/" data-testid="link-brand" className="flex items-center gap-3"><div className="rounded-[15px] bg-[#205c50] p-3 text-[#f5d9b1]"><Globe2 size={22} /></div><span className="font-display text-xl font-extrabold">Korea 360</span></Link>
      <div className="hidden items-center gap-2 text-xs font-semibold text-[#73857e] sm:flex"><span className={`h-2 w-2 rounded-full ${health.isError ? 'bg-[#d17f5e]' : 'bg-[#63a580]'}`} />موقع حي ومباشر</div>
      <div className="flex items-center gap-2"><Link href="/sign-in" data-testid="link-sign-in" className="rounded-full px-4 py-2 text-sm font-bold text-[#45665b] hover:bg-[#e6e5d9]">دخول</Link><Link href="/sign-up" data-testid="link-sign-up" className="rounded-full bg-[#205c50] px-4 py-2 text-sm font-bold text-white shadow-sm">إنشاء حساب</Link></div>
    </header>
    <main>
      <section className="mx-auto grid max-w-[1380px] items-center gap-10 px-5 pb-16 pt-5 sm:px-9 lg:grid-cols-[.93fr_1.07fr] lg:gap-14 lg:pb-24 lg:pt-10">
        <div className="relative z-10 rise-in">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#d8cdb6] bg-[#faf6ec] px-3 py-2 text-xs font-bold text-[#567568]"><Sparkles size={14} className="text-[#d17f5e]" />موقع اجتماعي عربي متكامل</div>
          <h1 className="font-display max-w-2xl text-[3.2rem] font-extrabold leading-[1.17] tracking-[-.055em] sm:text-6xl lg:text-[5.1rem]">مدينة جديدة،<br /><span className="relative inline-block">معك في كل خطوة</span></h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-[#62756e] sm:text-lg">مجتمع عربي للبالغين في كوريا الجنوبية. اكتشف أشخاصاً يشبهونك، شارك لحظاتك، وابدأ محادثة هادئة مناسبة لك.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex cursor-pointer items-center gap-2 text-xs leading-5 text-[#64766e]"><input data-testid="checkbox-age-confirmation" type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} className="h-4 w-4 rounded border-[#c7d0ca] text-[#205c50]" />أؤكد أن عمري 18 أو أكثر</label>
            <Link href={adult ? '/sign-up' : '#age-confirm'} onClick={e => { if (!adult) { e.preventDefault(); document.getElementById('age-confirm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }} data-testid="button-start" className="inline-flex items-center justify-center rounded-full bg-[#205c50] px-5 py-3 text-sm font-bold text-white shadow-sm">ابدأ الآن</Link>
          </div>
          {!adult && <p id="age-confirm" className="mt-2 text-xs text-[#9b6653]">تأكيد السن مطلوب قبل إنشاء الحساب.</p>}
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-[#72837c]"><span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-[#3a7a5d]" />مراجعة آمنة</span><span className="inline-flex items-center gap-2"><Users size={15} className="text-[#3a7a5d]" />مكان للقاءات المحتملة</span><span className="inline-flex items-center gap-2"><MapPin size={15} className="text-[#3a7a5d]" />استكشاف مدن كوريا</span></div>
        </div>
        <div className="relative">
          <div className="absolute -inset-5 -z-10 rounded-[3rem] bg-[#e7d7bb] opacity-45 blur-2xl" />
          <div data-testid="experience-panorama" onPointerDown={e => { setDragging(true); dragX.current = e.clientX; }} onPointerMove={e => { if (dragging) { const delta = e.clientX - dragX.current; setAngle(prev => prev + delta / 6); dragX.current = e.clientX; } }} onPointerUp={() => setDragging(false)} className="relative h-[540px] overflow-hidden rounded-[2.3rem] border border-[#d9d1bf] bg-[radial-gradient(circle_at_top,_#f2d8ae_0%,_#dfe8dc_35%,_#b8c7be_100%)] shadow-[0_30px_90px_rgba(29,42,38,0.18)]">
            <div className="panorama-stage" style={{ transform: `rotateY(${-angle}deg)` }}>
              {Array.from({ length: 8 }, (_, index) => <div key={index} className={`panorama-wall panorama-wall-${index % 4}`} style={{ transform: `rotateY(${index * 45}deg) translateZ(320px)` }}>
                <div className="panorama-building panorama-building-one" />
                <div className="panorama-building panorama-building-two" />
                <div className="panorama-building panorama-building-three" />
                <div className="panorama-street-lamp" />
                <div className="panorama-window-glow" />
              </div>)}
            </div>
            <div className="pointer-events-none absolute right-[16%] top-[22%] rounded-full border border-white/40 bg-[#f7f0dc]/90 px-3 py-2 text-xs font-bold text-[#345b50] shadow-lg"><span className="inline-block h-2 w-2 rounded-full bg-[#66a58d] align-middle" /> قهوة مختصة</div>
            <div className="pointer-events-none absolute left-[10%] top-[38%] rounded-full border border-white/40 bg-[#f7f0dc]/90 px-3 py-2 text-xs font-bold text-[#345b50] shadow-lg">مقهى عربي في سيول</div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-[#fff5de] sm:p-7">
              <div><div className="text-[10px] font-bold tracking-[.2em] text-white/70">جولة حية • سيول</div><div className="mt-1 font-display text-2xl font-bold">تمشّ في قلب المدينة</div></div>
              <div className="flex gap-1.5"><button data-testid="button-panorama-left" aria-label="إدارة المشهد يساراً" onClick={() => setAngle(a => a - 30)} className="rounded-full bg-white/10 p-2 text-white/90 backdrop-blur-sm"><ArrowLeft size={16} /></button><button data-testid="button-panorama-right" aria-label="إدارة المشهد يميناً" onClick={() => setAngle(a => a + 30)} className="rounded-full bg-white/10 p-2 text-white/90 backdrop-blur-sm"><ArrowRight size={16} /></button></div>
            </div>
          </div>
          <div className="absolute -bottom-5 -right-2 hidden rounded-2xl border border-[#dfd8c6] bg-[#faf7ee] px-4 py-3 shadow-lg sm:block"><div className="flex items-center gap-2 text-xs font-bold text-[#345b50]"><Sparkles size={15} className="text-[#d17f5e]" />تجربة شخصية</div></div>
        </div>
      </section>
      <section className="border-y border-[#ded9c9] bg-[#ece8dc]">
        <div className="mx-auto grid max-w-[1380px] gap-6 px-5 py-8 sm:grid-cols-3 sm:px-9">
          {[{value: summary.data?.memberCount, label: 'عضو يبني مجتمعاً', icon: Users }, { value: summary.data?.activeRoomCount, label: 'غرفة مجتمع نشطة', icon: MessageCircle }, { value: summary.data?.matchCount, label: 'لقاء محتمل خلال الشهر', icon: Compass }].map(({ value, label, icon: Icon }) => <div key={label} className="rounded-[1.5rem] border border-[#d7d0bf] bg-[#f8f4eb] p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-[11px] font-bold tracking-[.16em] text-[#9c7d69]">{label}</span><Icon className="h-5 w-5 text-[#205c50]" /></div><div className="mt-4 font-display text-4xl font-extrabold text-[#1f5c50]">{value ?? 0}</div></div>)}
        </div>
      </section>
      <section className="mx-auto max-w-[1380px] px-5 py-16 sm:px-9 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-end"><div><div className="text-xs font-bold tracking-[.17em] text-[#d17f5e]">ليس مجرد مكان للدردشة</div><h2 className="mt-3 font-display text-3xl font-extrabold text-[#203c38] sm:text-4xl">تجربة ودية، تجمع بين المجتمع والراحة</h2></div><p className="max-w-2xl text-base leading-8 text-[#5f7169]">أشخاص في مدن مختلفة، واهتمامات متنوعة، وملف شخصي يشرحك قبل أن تتحدث. كل شيء صمم ليحافظ على طابعك.</p></div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[{n:'01', title:'تعرّف على الوجوه', copy:'ملفات من مدن كوريا، بلغات واهتمامات مختلفة. لا اقتراحات مجهولة ولا ضغط.'},{n:'02', title:'أرسل رسائلك بخفة', copy:'تواصل مباشر من داخل التطبيق مع وقت مناسب لك. لا حاجة للارتباك.'},{n:'03', title:'شارك لحظاتك', copy:'أضف فيديوهات قصيرة أو أغراضك في مجتمعك، داخل مساحة مريحة ومباشرة.'}].map((item)=><div key={item.n} className="rounded-[1.6rem] border border-[#ded9c9] bg-[#faf7ee] p-5"><div className="text-xs font-bold tracking-[.22em] text-[#d17f5e]">{item.n}</div><h3 className="mt-3 font-display text-2xl font-extrabold">{item.title}</h3><p className="mt-3 text-sm leading-7 text-[#647770]">{item.copy}</p></div>)}
        </div>
      </section>
      <section className="mx-5 mb-16 overflow-hidden rounded-[2rem] bg-[#205c50] px-6 py-10 text-[#f8f2e4] sm:mx-9 sm:px-10 lg:mx-auto lg:max-w-[1320px] lg:py-14">
        <div className="grid gap-7 md:grid-cols-[1fr_auto] md:items-center"><div><div className="text-xs font-bold tracking-[.16em] text-[#e3b98e]">لقاء عفوي، بحدودك</div><h2 className="mt-3 max-w-xl font-display text-3xl font-extrabold sm:text-4xl">ابدأ من شخصيتك، لا من الحظ.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-[#dfe9e4]">استكشف من يشاركونك نفس المدينة أو الاهتمامات أو طريقة التفكير، ثم اختر ما يناسبك.</p></div><button onClick={() => setMatchOpen(true)} className="inline-flex items-center justify-center rounded-full bg-[#f8f2e4] px-6 py-3 text-sm font-bold text-[#1d564d]">ابدأ المطابقة</button></div>
      </section>
      <footer className="mx-auto flex max-w-[1380px] flex-col gap-4 px-5 pb-8 text-xs text-[#829087] sm:flex-row sm:items-center sm:justify-between sm:px-9"><span>© Korea 360 Social · مجتمع عربي يسهل الوصول إليه</span><div className="flex items-center gap-4"><span>الخصوصية أولوية</span><span>التواصل الآمن</span></div></footer>
    </main>
    {matchOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183c37]/55 p-4 backdrop-blur-sm"><form onSubmit={startMatch} className="w-full max-w-lg rounded-[2rem] border border-[#d9d4c4] bg-[#faf7ee] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="text-xs font-bold tracking-widest text-[#d17f5e]">مطابقة اختيارية</div><h2 className="mt-2 font-display text-2xl font-extrabold text-[#203c38]">اختر ما يقترب منك</h2></div><button type="button" onClick={() => setMatchOpen(false)} className="rounded-full bg-[#ece7d9] p-2 text-[#597166]" aria-label="إغلاق"><X size={18} /></button></div>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">لن نبدأ البحث إلا بعد تسجيل الدخول. اختر مدينة واهتماماتك لتكوين بداية مناسبة.</p>
      <label className="mt-5 block text-sm font-bold">المدينة<select data-testid="select-match-city" value={matchCity} onChange={e => setMatchCity(e.target.value)} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5 text-sm"><option value="سيول">سيول</option><option value="بوسان">بوسان</option><option value="إنتشون">إنتشون</option><option value="دايجو">دايجو</option><option value="دايجون">دايجون</option><option value="جيجو">جيجو</option></select></label>
      <div className="mt-5 text-sm font-bold">اهتماماتك <span className="font-normal text-muted-foreground">اختياري</span></div><div className="mt-3 flex flex-wrap gap-2">{interestChoices.map(interest => <button key={interest} type="button" onClick={() => toggleInterest(interest)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${matchInterests.includes(interest) ? 'border-[#205c50] bg-[#dfe8dc] text-[#205c50]' : 'border-[#ded9c9] bg-[#f7f4eb] text-[#5f7169]'}`}>{interest}</button>)}</div>
      {findMatch.isError && <p role="alert" className="mt-3 text-sm text-destructive">تعذّر العثور على مطابقة الآن. سجّل الدخول وتأكد من اتصال الخدمة.</p>}
      <button data-testid="button-submit-match" disabled={findMatch.isPending} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#205c50] px-5 py-3.5 font-bold text-white disabled:opacity-60">{findMatch.isPending ? 'جارٍ البحث...' : 'ابدأ المقابلة'}</button>
      <Link href="/sign-in" data-testid="link-match-signin" className="mt-4 block text-center text-xs font-semibold text-[#205c50]">لديك حساب؟ سجّل الدخول</Link>
    </form></div>}
  </div>;
}

function SignedInEntry() {
  const profile = useGetMyProfile();
  if (profile.isLoading) return <div dir="rtl" className="min-h-[100dvh] bg-[#f4f1e6] p-8"><div className="mx-auto max-w-4xl animate-pulse"><div className="h-10 w-48 rounded-full bg-[#dce4d8]" /><div className="mt-6 h-20 rounded-[2rem] bg-[#e8e4d8]" /></div></div>;
  if (profile.isError) return <div dir="rtl" className="min-h-[100dvh] bg-[#f4f1e6] p-8"><div className="mx-auto max-w-4xl"><ErrorMessage onRetry={() => void profile.refetch()} /></div></div>;
  if (profile.data && !profile.data.profile) return <Redirect to="/onboarding" />;
  return <Redirect to="/discover" />;
}
function HomeRedirect() { return <><Show when="signed-in"><SignedInEntry /></Show><Show when="signed-out"><Landing /></Show></>; }
function SignInPage() { return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthFrame>; }
function SignUpPage() {
  const [adult, setAdult] = useState(false);
  return <AuthFrame><div className="w-full max-w-[440px]"><label className="mb-3 flex items-center gap-2 rounded-xl bg-[#e7e5d8] px-4 py-3 text-xs leading-5 text-[#47665b]"><input data-testid="checkbox-signup-age" type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} className="h-4 w-4" />أؤكد أنني بالغ فوق 18 عامًا</label><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></AuthFrame>;
}
function AuthFrame({ children }: { children: ReactNode }) {
  return <div dir="rtl" className="flex min-h-[100dvh] items-center justify-center bg-[#f4f1e6] px-4 py-10"><div className="w-full max-w-[520px]"><Link href="/" data-testid="link-auth-brand" className="mb-5 inline-flex items-center gap-3 text-[#1f5c50]"><div className="rounded-[15px] bg-[#205c50] p-3 text-[#f5d9b1]"><Globe2 size={20} /></div><span className="font-display text-xl font-extrabold">Korea 360</span></Link>{children}</div></div>;
}

function AuthGate({ children }: { children: ReactNode }) {
  const profile = useGetMyProfile();
  const [location] = useLocation();
  return <><Show when="signed-in">{profile.isLoading ? <div dir="rtl" className="min-h-[100dvh] bg-[#f4f1e6] p-8"><div className="mx-auto h-40 max-w-3xl animate-pulse rounded-[2rem] bg-[#e8e4d8]" /></div> : profile.isError ? <div className="min-h-[100dvh] bg-[#f4f1e6] p-8"><ErrorMessage onRetry={() => void profile.refetch()} /></div> : children}</Show><Show when="signed-out"><Redirect to="/sign-in" /></Show></>;
}
function Portal({ children, title, eyebrow, action }: { children: ReactNode; title: string; eyebrow: string; action?: ReactNode }) { return <AuthGate><Shell title={title} eyebrow={eyebrow} action={action}>{children}</Shell></AuthGate>; }

function generateBioSuggestions({ displayName, city, interests, languages }: { displayName: string; city: string; interests: string[]; languages: string[]; }) {
  const name = displayName.trim() || 'أنا';
  const currentCity = city || 'كوريا';
  const selectedInterests = interests.length ? interests.slice(0, 3) : ['القهوة المختصة', 'المشي', 'اللغة الكورية'];
  const selectedLanguages = languages.length ? languages.slice(0, 2) : ['العربية', 'English'];

  const suggestions = [
    `أنا ${name}، أعيش في ${currentCity} وأحب ${selectedInterests.join('، ')}. أبحث عن تواصل هادئ ومريح، مع شخص يحب المحادثة، الاهتمام، والرحلات الصغيرة داخل المدينة.`,
    `${name} هنا لأنني أحب أن ألتقي بأشخاص متفتحين، وأستمتع بـ ${selectedInterests[0]} و${selectedInterests[1] || 'الاستكشاف'}. أتكلم ${selectedLanguages.join(' و')} وأحب أن نبدأ بمحادثة بسيطة وممتعة.`,
    `مرحبًا، أنا ${name}. أعيش في ${currentCity} وأعشق ${selectedInterests.join('، ')}. أحب الأجواء الهادئة، الأحاديث الصغيرة، والتعرف على أشخاص لديهم نفس النبض واهتماماتهم.`,
  ];

  return suggestions;
}

function BioSuggestionPanel({ displayName, city, interests, languages, onApply }: { displayName: string; city: string; interests: string[]; languages: string[]; onApply: (value: string) => void; }) {
  const suggestions = useMemo(() => generateBioSuggestions({ displayName, city, interests, languages }), [displayName, city, interests, languages]);

  return (
    <div className="sm:col-span-2 rounded-[1.4rem] border border-[#dfe6d4] bg-[#f4f7ee] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold tracking-[.18em] text-[#b57360]">SMART BIO</p>
          <h3 className="mt-1 text-sm font-bold text-[#203c38]">اقتراحات سريعة للنبذة</h3>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {suggestions.map((suggestion, index) => (
          <button key={`${suggestion}-${index}`} type="button" onClick={() => onApply(suggestion)} className="w-full rounded-2xl border border-[#d6d8c8] bg-white/80 px-3 py-3 text-right text-sm leading-7 text-[#405b56] transition hover:border-[#9bb6a8] hover:bg-[#edf6ef]">
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function DiscoverPage() {
  const [city,setCity]=useState(''); const [search,setSearch]=useState(''); const [interest,setInterest]=useState('');
  const filters=useMemo(()=>({city:city||undefined,search:search||undefined,interest:interest||undefined}),[city,search,interest]);
  const profiles=useDiscoverProfiles(filters);
  const start=useStartConversation(); const block=useBlockProfile(); const report=useReportProfile(); const invalidate=useInvalidate(); const [,setLocation]=useLocation();
  const [safetyProfile,setSafetyProfile]=useState<Profile|null>(null); const [reportReason,setReportReason]=useState<ReportInput['reason']>('other');
  const message=(profile:Profile)=>start.mutate({profileId:profile.id},{onSuccess:conv=>{invalidate([getListConversationsQueryKey()]);setLocation(`/messages/${conv.id}`);}});
  const doBlock=()=>{if(!safetyProfile)return;block.mutate({data:{profileId:safetyProfile.id}},{onSuccess:()=>{invalidate([getDiscoverProfilesQueryKey(filters),getListBlockedProfilesQueryKey()]);setSafetyProfile(null);}});};
  const doReport=()=>{if(!safetyProfile)return;report.mutate({data:{profileId:safetyProfile.id,reason:reportReason,details:''}},{onSuccess:()=>{invalidate([getDiscoverProfilesQueryKey(filters)]);setSafetyProfile(null);}});};
  return <Portal title="وجوه جديدة، قريبة" eyebrow="استكشف مجتمعك" action={<div className="hidden items-center gap-2 rounded-full bg-[#dce7dc] px-3 py-2 text-xs font-semibold text-[#1d564d] sm:flex"><Search size={14} />بحث سريع</div>}>
    <div className="mb-6 flex flex-col gap-3 rounded-[1.5rem] border border-[#ded9c9] bg-[#faf7ee] p-4 sm:flex-row sm:items-center">
      <label className="relative flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-[#8b9991]"/><input data-testid="input-discover-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث باسم أو كلمة مفتاحية" className="w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] py-2.5 pr-10 pl-3 text-sm" /></label>
      <select data-testid="select-discover-city" value={city} onChange={e=>setCity(e.target.value)} className="rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5 text-sm"><option value="">كل المدن</option>{cities.map(cityName => <option key={cityName} value={cityName}>{cityName}</option>)}</select>
      <select data-testid="select-discover-interest" value={interest} onChange={e=>setInterest(e.target.value)} className="rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5 text-sm"><option value="">كل الاهتمامات</option>{interestChoices.map(item => <option key={item} value={item}>{item}</option>)}</select>
    </div>
    {profiles.isLoading ? <Skeletons/> : profiles.isError ? <ErrorMessage onRetry={()=>void profiles.refetch()}/> : !profiles.data?.length ? <EmptyState title="لا توجد ملفات مطابقة بعد" copy="جرّب تغيير الفلاتر أو أضف تفاصيل أكثر إلى ملفك الشخصي." icon={Compass}/> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{profiles.data.map((person,index)=><article data-testid={`card-profile-${person.id}`} key={person.id} className="group overflow-hidden rounded-[1.6rem] border border-[#ded9c9] bg-[#faf7ee] shadow-sm transition hover:-translate-y-0.5"><div className={`relative h-24 ${index%3===0?'bg-[#d8e3d6]':index%3===1?'bg-[#efdec9]':'bg-[#d7e0e2]'}`}><div className="absolute -bottom-7 right-5"><Avatar profile={person} size="lg" /></div><div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-[#1d564d]"><MapPin size={12} />{person.city}</div></div><div className="px-5 pb-5 pt-10"><div className="flex items-baseline gap-2"><Link href={`/members/${person.id}`} data-testid={`link-member-profile-${person.id}`} className="text-lg font-bold text-[#1d564d]">{person.displayName}</Link><span className="text-xs text-[#6e817a]">{person.age} سنة</span></div><p className="mt-2 text-sm leading-7 text-[#516a60]">{person.bio || 'لا توجد نبذة حتى الآن.'}</p><div className="mt-3 flex flex-wrap gap-1.5">{person.interests.slice(0,3).map(tag=><span key={tag} className="rounded-full bg-[#e8e5d8] px-2.5 py-1 text-[10px] font-semibold text-[#6174a4]">{tag}</span>)}</div><div className="mt-4 flex items-center justify-between border-t border-[#e5e0d2] pt-4"><span className="text-[11px] text-[#829088]">{person.languages.join(' · ') || 'لغات غير محددة'}</span><div className="flex gap-2"><button onClick={()=>setSafetyProfile(person)} className="rounded-full bg-[#f3ece1] p-2 text-[#7b5a4e]" aria-label="إبلاغ"><Flag size={14} /></button><button onClick={()=>message(person)} className="rounded-full bg-[#205c50] p-2 text-white" aria-label="ابدأ محادثة"><MessageCircle size={14} /></button></div></div></div></article>)}</div>}
    {start.isError && <p role="alert" data-testid="status-conversation-error" className="mt-4 text-sm text-destructive">تعذّر بدء المحادثة. تحقق من تسجيل الدخول ثم حاول مجدداً.</p>}
    {safetyProfile && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183c37]/50 p-4"><div className="w-full max-w-md rounded-[1.7rem] bg-[#faf7ee] p-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold tracking-[.18em] text-[#bd795c]">SAFETY</p><h3 className="mt-1 text-xl font-bold text-[#203c38]">إدارة الملف</h3></div><button onClick={()=>setSafetyProfile(null)} className="rounded-full bg-[#ece7d9] p-2 text-[#597166]"><X size={18} /></button></div><div className="mt-5 space-y-3"><button onClick={doBlock} className="flex w-full items-center justify-between rounded-2xl bg-[#f3ece1] px-4 py-3 text-sm font-semibold text-[#7b5a4e]"><span>حظر هذا الملف</span><ShieldCheck size={16} /></button><label className="block text-sm font-bold">سبب الإبلاغ<select value={reportReason} onChange={e=>setReportReason(e.target.value as ReportInput['reason'])} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5 text-sm"><option value="spam">محتوى مزعج</option><option value="harassment">مضايقات</option><option value="other">أخرى</option></select></label><button onClick={doReport} className="flex w-full items-center justify-between rounded-2xl bg-[#f0f3ef] px-4 py-3 text-sm font-semibold text-[#3f4f4a]"><span>إبلاغ</span><Flag size={16} /></button></div></div></div>}
  </Portal>;
}

function TranslatableMessage({ text }: { text: string }) {
  const translate = useTranslateText();
  const { language } = useLanguage();
  const [translated, setTranslated] = useState('');
  const target = language;
  const run = () => translate.mutate({ data: { text, targetLanguage: target } }, { onSuccess: result => setTranslated(result.translatedText) });
  return <><div>{text}</div>{translated ? <div className="mt-2 border-t border-current/10 pt-2 text-sm" lang={target} dir={target === 'ar' ? 'rtl' : 'ltr'}><span className="mb-1 block text-[10px] font-bold uppercase">{target === 'ar' ? 'ترجمة' : target === 'ko' ? '번역' : 'Translation'}</span>{translated}</div> : <button type="button" onClick={run} className="mt-2 rounded-full border border-current/20 px-3 py-1 text-[11px] font-bold">{target === 'ar' ? 'ترجمة' : target === 'ko' ? '번역' : 'Translate'}</button>}</>;
}

function MessagesPage(){const conversations=useListConversations({query:{queryKey:getListConversationsQueryKey(),refetchInterval:5000}});return <Portal title="رسائلك" eyebrow="تواصل عميق" action={<Link href="/discover" className="inline-flex items-center gap-2 rounded-full bg-[#dce7dc] px-3 py-2 text-xs font-bold text-[#1d564d]">إكتشف أصدقاء جدد</Link>}><div className="space-y-4">{conversations.isLoading?<Skeletons count={2}/>:(conversations.data||[]).length===0?<EmptyState title="لا توجد محادثات بعد" copy="ابدأ حديثك الأول من صفحة الاستكشاف." icon={MessageCircle}/>:(conversations.data||[]).map((conversation: Conversation) => <Link key={conversation.id} href={`/messages/${conversation.id}`} className="block rounded-[1.5rem] border border-[#ded9c9] bg-[#faf7ee] p-4"><div className="flex items-center gap-3"><Avatar profile={conversation.partner} size="sm" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate font-bold text-[#1d564d]">{conversation.partner.displayName}</span><span className="text-[10px] text-[#7c8d86]">{conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleDateString('ar-EG') : 'حديث جديد'}</span></div><p className="mt-1 truncate text-sm text-[#4e675f]">{conversation.lastMessage || 'ابدأ المحادثة...'}</p></div></div></Link>)}</div></Portal>;
}

function ConversationPage(){const {conversationId=''}=useParams<{conversationId:string}>();const id=Number(conversationId);const list=useListConversations({query:{queryKey:getListConversationsQueryKey()}});const messages=useListConversationMessages(id,{query:{queryKey:getListConversationMessagesQueryKey(id),enabled:Number.isFinite(id)&&id>0}});const send=useSendConversationMessage();const invalidate=useInvalidate();const [text,setText]=useState(''); const [safetyOpen,setSafetyOpen]=useState(false); const [reason,setReason]=useState<ReportInput['reason']>('other'); const block=useBlockProfile(); const report=useReportProfile(); const conv=list.data?.find((item: Conversation) => item.id===id); const submit=(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;send.mutate({conversationId:id,data:{text:text.trim()}},{onSuccess:()=>{setText('');invalidate([getListConversationMessagesQueryKey(id),getListConversationsQueryKey()]);}});};
  const blockPartner=()=>{if(!conv)return;block.mutate({data:{profileId:conv.partner.id}},{onSuccess:()=>{invalidate([getListBlockedProfilesQueryKey(),getListConversationsQueryKey()]);setSafetyOpen(false);}});};
  const reportPartner=()=>{if(!conv)return;report.mutate({data:{profileId:conv.partner.id,reason:reason,details:''}},{onSuccess:()=>{invalidate([getListConversationsQueryKey()]);setSafetyOpen(false);}});};
  return <Portal title={conv?.partner.displayName || 'محادثة خاصة'} eyebrow="رسائل خاصة" action={<Link href="/messages" className="inline-flex items-center gap-2 rounded-full bg-[#dce7dc] px-3 py-2 text-xs font-bold text-[#1d564d]">عودة</Link>}>
    <div className="mx-auto flex h-[min(68vh,720px)] max-w-4xl flex-col overflow-hidden rounded-[1.7rem] border border-[#ded9c9] bg-[#faf7ee]">
      <div className="flex items-center gap-3 border-b border-[#e5e0d2] bg-[#f1eee4] px-5 py-4"><Avatar profile={conv?.partner} size="sm" /><div><div className="font-bold text-[#1d564d]">{conv?.partner.displayName || 'محادثة'}</div><div className="text-xs text-[#70827c]">{conv?.partner.city || 'المدينة'}</div></div><button onClick={()=>setSafetyOpen(true)} className="ml-auto rounded-full bg-[#f0e7dd] p-2 text-[#7d584c]" aria-label="إدارة الملف"><MoreHorizontal size={16} /></button></div>
      <div className="scrollbar-none flex-1 space-y-3 overflow-y-auto p-5">{messages.isLoading ? <div className="space-y-3">{[0,1,2].map(n=><div key={n} className="h-12 w-2/3 animate-pulse rounded-2xl bg-[#e8e2d5]" />)}</div> : (messages.data || []).map((messageItem) => <div key={messageItem.id} className={`max-w-[80%] rounded-[1.4rem] px-4 py-3 text-sm leading-7 ${messageItem.isMine ? 'ml-auto bg-[#205c50] text-white' : 'bg-[#f0eee5] text-[#29433d]'}`}>{messageItem.text}</div>)}</div>
      <form onSubmit={submit} className="flex gap-2 border-t border-[#e5e0d2] bg-[#f1eee4] p-3"><input data-testid="input-conversation-message" value={text} onChange={e=>setText(e.target.value)} placeholder="اكتب رسالة..." className="flex-1 rounded-full border border-[#d9d4c4] bg-white px-4 py-3 text-sm focus:outline-none" /><button type="submit" className="rounded-full bg-[#205c50] p-3 text-white" aria-label="إرسال"><Send size={18} /></button></form>
    </div>{send.isError && <p role="alert" className="mt-3 text-sm text-destructive">لم تُرسل الرسالة. جرّب مرة أخرى.</p>}
    {safetyOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183c37]/50 p-4"><div className="w-full max-w-md rounded-[1.7rem] bg-[#faf7ee] p-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold tracking-[.18em] text-[#bd795c]">SAFETY</p><h3 className="mt-1 text-xl font-bold text-[#203c38]">إدارة محادثة</h3></div><button onClick={()=>setSafetyOpen(false)} className="rounded-full bg-[#ece7d9] p-2 text-[#597166]"><X size={18} /></button></div><div className="mt-5 space-y-3"><button onClick={blockPartner} className="flex w-full items-center justify-between rounded-2xl bg-[#f3ece1] px-4 py-3 text-sm font-semibold text-[#7b5a4e]"><span>حظر هذا المستخدم</span><ShieldCheck size={16} /></button><label className="block text-sm font-bold">سبب الإبلاغ<select value={reason} onChange={e=>setReason(e.target.value as ReportInput['reason'])} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5 text-sm"><option value="spam">محتوى مزعج</option><option value="harassment">مضايقات</option><option value="other">أخرى</option></select></label><button onClick={reportPartner} className="flex w-full items-center justify-between rounded-2xl bg-[#f0f3ef] px-4 py-3 text-sm font-semibold text-[#3f4f4a]"><span>إبلاغ</span><Flag size={16} /></button></div></div></div>}
  </Portal>;
}

function RoomsPage(){const rooms=useListRooms();const create=useCreateRoom();const join=useJoinRoom();const leave=useLeaveRoom();const invalidate=useInvalidate();const [open,setOpen]=useState(false);const [values,setValues]=useState({name:'',description:'',city:'سيول',topic:'',visibility:'public' as 'public'|'private'}); const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:values as RoomInput},{onSuccess:()=>{invalidate([getListRoomsQueryKey()]);setOpen(false);setValues({name:'',description:'',city:'سيول',topic:'',visibility:'public'});}});}; const membership=(roomId:number,joined:boolean)=> (joined?leave:join).mutate({roomId},{onSuccess:()=>invalidate([getListRoomsQueryKey()])}); return <Portal title="غرف لها نبض" eyebrow="المجتمعات" action={<button onClick={()=>setOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#205c50] px-4 py-2 text-xs font-bold text-white">+ إنشاء غرفة</button>}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rooms.isLoading?<Skeletons count={3}/>:(rooms.data||[]).length===0?<EmptyState title="الغرفة الأولى قد تكون لك" copy="ابدأ مجتمعك الخاص مع أشخاص يتشاركونك نفس الاهتمامات." icon={Users}/>:(rooms.data||[]).map(room => <div key={room.id} className="rounded-[1.6rem] border border-[#ded9c9] bg-[#faf7ee] p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold tracking-[.18em] text-[#d17f5e]">{room.city}</p><h3 className="mt-1 text-xl font-bold text-[#1d564d]">{room.name}</h3></div><button onClick={()=>membership(room.id,room.joined)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${room.joined ? 'bg-[#ece7d9] text-[#4a685d]' : 'bg-[#205c50] text-white'}`}>{room.joined ? 'مغادرة' : 'الانضمام'}</button></div><p className="mt-3 text-sm leading-7 text-[#526b60]">{room.description || room.topic || 'غرفة نشطة في المجتمع.'}</p><div className="mt-4 flex items-center justify-between text-xs text-[#7b8b85]"><span>{room.memberCount} عضو</span><Link href={`/rooms/${room.id}`} className="font-bold text-[#205c50]">فتح الغرفة</Link></div></div>)}</div>{rooms.isError && <ErrorMessage onRetry={()=>void rooms.refetch()} />}{open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183c37]/60 p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-[1.8rem] bg-[#faf7ee] p-6"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold tracking-[.18em] text-[#c17a5e]">CREATE ROOM</p><h2 className="mt-2 font-display text-2xl font-extrabold text-[#203c38]">غرفة جديدة</h2></div><button type="button" onClick={()=>setOpen(false)} className="rounded-full bg-[#ece7d9] p-2 text-[#597166]"><X size={18} /></button></div><div className="mt-5 space-y-4"><label className="block text-sm font-bold">اسم الغرفة<input value={values.name} onChange={e=>setValues({...values,name:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" /></label><label className="block text-sm font-bold">الوصف<textarea value={values.description} onChange={e=>setValues({...values,description:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" rows={3} /></label><label className="block text-sm font-bold">المدينة<select value={values.city} onChange={e=>setValues({...values,city:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5"><option>سيول</option><option>بوسان</option><option>إنتشون</option><option>دايجو</option><option>دايجون</option><option>جيجو</option></select></label><label className="block text-sm font-bold">موضوع الغرفة<input value={values.topic} onChange={e=>setValues({...values,topic:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" /></label></div><button type="submit" className="mt-5 w-full rounded-full bg-[#205c50] px-5 py-3 font-bold text-white">نشر الغرفة</button></form></div>}</Portal>;
}

function RoomPage(){const {roomId=''}=useParams<{roomId:string}>();const id=Number(roomId);const rooms=useListRooms();const room=rooms.data?.find(r=>r.id===id);const messages=useListRoomMessages(id,{query:{queryKey:getListRoomMessagesQueryKey(id),enabled:Number.isFinite(id)&&id>0}});const send=useSendRoomMessage();const invalidate=useInvalidate();const [text,setText]=useState(''); const submit=(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;send.mutate({roomId:id,data:{text:text.trim()}},{onSuccess:()=>{setText('');invalidate([getListRoomMessagesQueryKey(id)]);}});}; return <Portal title={room?.name || 'مساحة المجتمع'} eyebrow={room?.topic || 'غرفة محادثة'} action={<Link href="/rooms" className="inline-flex items-center gap-2 rounded-full bg-[#dce7dc] px-3 py-2 text-xs font-bold text-[#1d564d]">عودة</Link>}><div className="mx-auto max-w-4xl overflow-hidden rounded-[1.7rem] border border-[#ded9c9] bg-[#faf7ee]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e0d2] bg-[#f1eee4] px-5 py-4"><div><p className="text-[10px] font-bold tracking-[.18em] text-[#bd795c]">ROOM</p><h3 className="mt-1 text-xl font-bold text-[#203c38]">{room?.name || 'غرفة'}</h3></div><span className="rounded-full bg-[#dfe8dc] px-3 py-1 text-xs font-bold text-[#1d564d]">{room?.memberCount || 0} عضو</span></div><div className="scrollbar-none flex h-[min(58vh,620px)] flex-col gap-3 overflow-y-auto p-5">{messages.isLoading ? <div className="h-full animate-pulse rounded-2xl bg-[#e8e2d5]" /> : (messages.data || []).map(msg => <div key={msg.id} className={`max-w-[80%] rounded-[1.3rem] px-4 py-3 text-sm leading-7 ${msg.isMine ? 'ml-auto bg-[#205c50] text-white' : 'bg-[#f0eee5] text-[#29433d]'}`}>{msg.text}</div>)}</div><form onSubmit={submit} className="flex gap-2 border-t border-[#e5e0d2] bg-[#f0eee4] p-3"><input value={text} onChange={e=>setText(e.target.value)} className="flex-1 rounded-full border border-[#d9d4c4] bg-white px-4 py-3 text-sm" placeholder="اكتب في الغرفة..." /><button type="submit" className="rounded-full bg-[#205c50] p-3 text-white"><Send size={18} /></button></form></div>{send.isError && <p role="alert" className="mt-3 text-sm text-destructive">تعذّر إرسال الرسالة.</p>}</Portal>;
}

function VideoTile({ post, onDelete }: { post: { id:number; profileId:number; author:{id:number;displayName:string;avatarUrl:string|null;city:string}; caption:string; durationSeconds:number; mediaUrl:string; createdAt:string; }; onDelete: (postId:number)=>void; }) {
  return <article className="overflow-hidden rounded-[1.5rem] border border-[#ded9c9] bg-[#faf7ee]">
    <video data-testid={`video-post-${post.id}`} className="aspect-[9/12] w-full bg-[#193c38] object-cover" controls playsInline preload="metadata" src={post.mediaUrl} aria-label={`${post.author.displayName} post`} />
    <div className="p-4"><div className="flex items-center gap-3"><Avatar profile={{displayName:post.author.displayName,avatarUrl:post.author.avatarUrl}} size="sm" /><div className="min-w-0 flex-1"><div className="truncate font-bold text-[#203c38]">{post.author.displayName}</div><div className="text-[11px] text-[#788b84]">{post.author.city}</div></div><button onClick={()=>onDelete(post.id)} className="rounded-full bg-[#f3ece1] p-2 text-[#7b5a4e]" aria-label="حذف"><Trash2 size={15} /></button></div><p className="mt-3 text-sm leading-7 text-[#4b605b]">{post.caption}</p><div className="mt-3 flex items-center justify-between text-[11px] text-[#788b84]"><span>{post.durationSeconds}s</span><span>{new Date(post.createdAt).toLocaleDateString('ar-EG')}</span></div></div>
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
  return <Portal title={member?.displayName || 'ملفي الشخصي'} eyebrow="مساحتي">
    {!member ? <EmptyState title="ابدأ بملفك الشخصي" copy="عرّف مجتمع Korea 360 عليك." icon={Home}/> : <div className="mx-auto max-w-5xl">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#ded9c9] bg-[#faf7ee]">
        <div className="h-36 bg-[radial-gradient(ellipse_at_72%_8%,#e6bc8b,transparent_35%),linear-gradient(125deg,#1d5149,#779283_55%,#d5b78e)] sm:h-52"/>
        <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-end sm:px-8">
          <div className="-mt-12 rounded-full bg-[#faf7ee] p-1 sm:-mt-16"><Avatar profile={member} size="lg"/></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl font-extrabold">{member.displayName}</h2><span className="text-sm text-[#5d726b]">{member.age} سنة</span></div><p className="mt-1 text-sm text-[#567068]">{member.city}</p></div>
          <Link href="/profile/edit" data-testid="link-edit-profile" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#205c50] px-5 py-3 text-sm font-bold text-white"><Settings size={16} />تعديل الملف</Link>
        </div>
        <div className="grid gap-6 px-5 pb-7 sm:grid-cols-[1fr_auto] sm:px-8"><p className="max-w-2xl text-sm leading-7 text-[#566b60]">{member.bio || 'أضف نبذة صغيرة في صفحة تعديل الملف.'}</p><div className="flex flex-wrap gap-2">{member.interests.map(interest => <span key={interest} className="rounded-full bg-[#e8e5d8] px-2.5 py-1 text-[10px] font-semibold text-[#6174a4]">{interest}</span>)}</div></div>
      </section>
      <div className="mb-4 mt-9 flex items-center justify-between"><div><p className="text-[11px] font-bold tracking-[.17em] text-[#bd795c]">SHORT FILMS</p><h2 className="mt-1 font-display text-2xl font-extrabold text-[#203c38]">لحظاتك</h2></div><Link href="/reels" className="text-sm font-bold text-[#205c50]">فتح الريلز</Link></div>
      {posts.isLoading ? <Skeletons count={2}/> : posts.isError ? <ErrorMessage onRetry={()=>void posts.refetch()}/> : !posts.data?.length ? <EmptyState title="Your first moment is waiting" copy="شارك فيديو قصير يوضحك ويحكي عنك." icon={Video}/> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{posts.data.map(post => <VideoTile key={post.id} post={post} onDelete={onDelete} />)}</div>}
      {remove.isError && <p role="alert" className="mt-3 text-sm text-destructive">Could not delete this video. Please try again.</p>}
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
  return <Portal title={p.displayName} eyebrow="MEMBER PROFILE" action={<button onClick={()=>start.mutate({profileId:id},{onSuccess:c=>{invalidate([getListConversationsQueryKey()]);setLocation(`/messages/${c.id}`);}})} className="inline-flex items-center gap-2 rounded-full bg-[#205c50] px-4 py-2 text-xs font-bold text-white">ابدأ محادثة</button>}><section className="mb-8 rounded-[2rem] border border-[#ded9c9] bg-[#faf7ee] p-6 sm:p-9"><div className="flex items-center gap-5"><Avatar profile={p} size="lg"/><div><h2 className="font-display text-2xl font-extrabold text-[#203c38]">{p.displayName}</h2><p className="mt-1 text-sm text-[#536a63]">{p.city} · {p.age} سنة</p></div></div><p className="mt-5 max-w-2xl text-sm leading-7 text-[#586f66]">{p.bio || 'لا توجد نبذة متاحة.'}</p></section>{posts.isLoading?<Skeletons/>:posts.isError?<ErrorMessage onRetry={()=>void posts.refetch()}/>:!posts.data?.length?<EmptyState title="No videos yet" copy="When this member shares a moment, it will appear here." icon={Video}/> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{posts.data.map(post => <VideoTile key={post.id} post={post} onDelete={()=>{}} />)}</div>}</Portal>;
}

function ReelsPage(){
  const feed=useListSocialPostFeed({query:{queryKey:getListSocialPostFeedQueryKey(),refetchOnMount:true}});
  const uploadUrl=useRequestUploadUrl(); const create=useCreateSocialPost(); const client=useQueryClient();
  const [open,setOpen]=useState(false); const [file,setFile]=useState<File|null>(null); const [caption,setCaption]=useState(''); const [duration,setDuration]=useState(0); const [confirmed,setConfirmed]=useState(false); const [uploadError,setUploadError]=useState(''); const [progress,setProgress]=useState(0);
  const invalidate=()=>{void client.invalidateQueries({queryKey:getListSocialPostFeedQueryKey()});void client.invalidateQueries({queryKey:getListMySocialPostsQueryKey()});};
  const chooseFile=(selected:File|null)=>{setFile(selected);setDuration(0);setUploadError('');if(!selected)return;const localUrl=URL.createObjectURL(selected);const video=document.createElement('video');video.preload='metadata';video.onloadedmetadata=()=>{setDuration(Number.isFinite(video.duration) ? Math.min(Math.max(video.duration, 1), 90) : 0); URL.revokeObjectURL(localUrl);};video.src=localUrl;};
  const publish=async(e:FormEvent)=>{e.preventDefault();setUploadError('');if(!file||!confirmed||duration<1||duration>90)return;const mime=file.type as 'video/mp4'|'video/webm'|'video/quicktime';try {const signed=await uploadUrl.mutateAsync({data:{name:file.name,size:file.size,contentType:mime}}); await new Promise<void>((resolve,reject)=>{const request=new XMLHttpRequest();request.open('PUT',signed.uploadURL);request.setRequestHeader('Content-Type',mime);request.upload.onprogress=ev=>setProgress(Math.round((ev.loaded/ev.total)*100));request.onload=()=>request.status>=200&&request.status<300?resolve():reject(new Error('Upload failed'));request.onerror=()=>reject(new Error('Upload failed'));request.send(file);}); await create.mutateAsync({data:{objectPath:signed.objectPath,caption:caption.trim(),durationSeconds:duration,familySafeConfirmed:true}}); invalidate();setOpen(false);setFile(null);setCaption('');setDuration(0);setProgress(0);setConfirmed(false);} catch { setUploadError('Upload could not be completed. Check your connection and try again.'); }};
  return <Portal title="Moments from Korea" eyebrow="KOREA 360 · REELS" action={<button onClick={()=>setOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#205c50] px-4 py-2 text-xs font-bold text-white"><Upload size={15} />نشر لحظة</button>}>
    <div className="mb-7 flex items-center justify-between rounded-[1.6rem] bg-[#205c50] px-5 py-5 text-[#f8f2e4] sm:px-8"><div><p className="text-[10px] font-bold tracking-[.2em] text-[#e6bf94]">KOREA 360</p><h2 className="mt-2 font-display text-2xl font-extrabold">لحظات من كوريا</h2></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{feed.data?.length ?? 0} منشور</span></div>
    {feed.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:3},(_,i)=><div key={i} className="aspect-[9/12] animate-pulse rounded-[1.5rem] bg-[#e4e1d5]" />)}</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(feed.data || []).map(post => <VideoTile key={post.id} post={post} onDelete={()=>{}} />)}</div>}
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#183c37]/60 p-4 backdrop-blur-sm"><form onSubmit={publish} className="my-6 w-full max-w-xl rounded-[1.7rem] bg-[#faf7ee] p-6"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold tracking-[.2em] text-[#c17a5e]">SHARE A MOMENT</p><h2 className="mt-2 font-display text-2xl font-extrabold text-[#203c38]">انشر لقطة من يومك</h2></div><button type="button" onClick={()=>setOpen(false)} className="rounded-full bg-[#ece7d9] p-2 text-[#597166]"><X size={18} /></button></div><label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-[#aebcaf] bg-[#f0f1e7] px-4 py-8 text-center"><Upload className="h-7 w-7 text-[#205c50]" /><span className="mt-3 text-sm font-bold text-[#205c50]">اختر فيديو</span><input type="file" accept="video/*" onChange={e => chooseFile(e.target.files?.[0] ?? null)} className="hidden" /></label>{file && <div className="mt-3 flex items-center justify-between rounded-xl bg-[#e8eadd] px-4 py-3 text-xs"><span className="truncate">{file.name}</span><span className="font-bold text-[#205c50]">{duration ? `${duration}s` : 'جارٍ التحليل...'}</span></div>}<label className="mt-5 block text-sm font-bold">Caption <textarea value={caption} onChange={e=>setCaption(e.target.value)} maxLength={2200} rows={3} placeholder="اكتب وصف اللحظة..." className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5 text-sm" /></label><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#e0d8c8] bg-[#f2eee4] p-4 text-sm leading-6"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-4 w-4" />أؤكد أن الفيديو مناسب للفئة العمرية ولا يحتوي على محتوى غير مناسب.</label>{(uploadUrl.isPending||create.isPending||progress>0) && <div className="mt-4" role="status"><div className="mb-1 flex justify-between text-xs"><span>{create.isPending ? 'Publishing…' : 'Uploading…'}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#e5e1d7]"><div className="h-full rounded-full bg-[#205c50]" style={{ width: `${progress}%` }} /></div></div>}{(uploadError||uploadUrl.isError||create.isError) && <p role="alert" className="mt-3 text-sm text-destructive">{uploadError || 'Could not publish this video. Please try again.'}</p>}<button type="submit" disabled={!file||!confirmed||duration<1||duration>90||uploadUrl.isPending||create.isPending} className="mt-5 w-full rounded-full bg-[#205c50] py-3 font-bold text-white disabled:opacity-60">نشر اللحظة</button><p className="mt-3 text-center text-[11px] leading-5 text-[#829087]">يجب أن تكون المدة بين 1 و90 ثانية، وألا يتجاوز الملف 100 MB.</p></form></div>}
  </Portal>;
}

function ProfileEditPage(){const profile=useGetMyProfile();const save=useSaveMyProfile();const invalidate=useInvalidate();const [form,setForm]=useState<ProfileInput>({displayName:'',age:18,city:'سيول',bio:'',avatarUrl:'',languages:['العربية'],interests:['القهوة المختصة'],isPublic:true}); const [initialized,setInitialized]=useState(false); useEffect(()=>{if(profile.data?.profile && !initialized){const p=profile.data.profile;setForm({displayName:p.displayName,age:p.age,city:p.city,bio:p.bio||'',avatarUrl:p.avatarUrl||'',languages:p.languages||['العربية'],interests:p.interests||['القهوة المختصة'],isPublic:p.isPublic}); setInitialized(true);}},[profile.data,initialized]); const submit=(e:FormEvent)=>{e.preventDefault();save.mutate({data:form},{onSuccess:()=>invalidate([getGetMyProfileQueryKey(),getDiscoverProfilesQueryKey(),getGetSocialSummaryQueryKey()])});}; const toggle=(field:'languages'|'interests',value:string)=>setForm(f=>({...f,[field]:f[field].includes(value)?f[field].filter(x=>x!==value):[...f[field],value].slice(0,field==='languages'?5:12)})); if(profile.isLoading)return <Portal title="ملفك الشخصي" eyebrow="ملفك"><Skeletons count={1}/></Portal>; if(profile.isError)return <Portal title="ملفك الشخصي" eyebrow="ملفك"><ErrorMessage onRetry={()=>void profile.refetch()}/></Portal>; return <Portal title="ملفك الشخصي" eyebrow="كن كما أنت"><form onSubmit={submit} className="mx-auto max-w-3xl overflow-hidden rounded-[1.8rem] border border-[#ded9c9] bg-[#faf7ee]">
    <div className="relative h-36 bg-[#d9e5d9]"><div className="absolute -bottom-10 right-7 rounded-full bg-[#faf7ee] p-1"><Avatar profile={profile.data?.profile} size="lg"/></div><div className="absolute inset-x-0 top-0 flex items-center justify-between p-5"><span className="rounded-full bg-white/65 px-3 py-1 text-[10px] font-bold tracking-[.18em] text-[#205c50]">PROFILE</span><button type="button" className="rounded-full bg-white/65 p-2 text-[#205c50]" aria-label="Back"><ArrowLeft size={16} /></button></div></div>
    <div className="grid gap-5 p-6 pt-14 sm:grid-cols-2 sm:p-8 sm:pt-14">
      <label className="text-sm font-bold">الاسم الظاهر<input data-testid="input-profile-name" required minLength={2} maxLength={40} value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" /></label>
      <label className="text-sm font-bold">العمر (18+)<input data-testid="input-profile-age" type="number" min={18} max={120} required value={form.age} onChange={e=>setForm({...form,age:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" /></label>
      <label className="text-sm font-bold">المدينة<select data-testid="select-profile-city" value={form.city} onChange={e=>setForm({...form,city:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5"><option>سيول</option><option>بوسان</option><option>إنتشون</option><option>دايجو</option><option>دايجون</option><option>جيجو</option></select></label>
      <label className="text-sm font-bold">رابط الصورة <span className="font-normal text-muted-foreground">اختياري</span><input data-testid="input-profile-avatar" type="url" value={form.avatarUrl||''} onChange={e=>setForm({...form,avatarUrl:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" /></label>
      <BioSuggestionPanel displayName={form.displayName} city={form.city} interests={form.interests} languages={form.languages} onApply={bio => setForm({ ...form, bio })} />
      <label className="text-sm font-bold sm:col-span-2">نبذة عنك<textarea data-testid="input-profile-bio" maxLength={240} rows={3} value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" /></label>
      <div className="sm:col-span-2"><div className="text-sm font-bold">اللغات</div><div className="mt-2 flex flex-wrap gap-2">{['العربية','English','한국어','Français','中文'].map(lang => <button type="button" key={lang} onClick={()=>toggle('languages',lang)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${form.languages.includes(lang) ? 'border-[#205c50] bg-[#dfe8dc] text-[#205c50]' : 'border-[#ded9c9] bg-[#f7f4eb] text-[#5f7169]'}`}>{lang}</button>)}</div></div>
      <div className="sm:col-span-2"><div className="text-sm font-bold">اهتماماتك <span className="font-normal text-muted-foreground">حتى 12</span></div><div className="mt-2 flex flex-wrap gap-2">{interestChoices.map(item => <button type="button" key={item} onClick={()=>toggle('interests',item)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${form.interests.includes(item) ? 'border-[#205c50] bg-[#dfe8dc] text-[#205c50]' : 'border-[#ded9c9] bg-[#f7f4eb] text-[#5f7169]'}`}>{item}</button>)}</div></div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-[#efede2] p-4 text-sm font-semibold sm:col-span-2"><input data-testid="checkbox-profile-public" type="checkbox" checked={form.isPublic} onChange={e=>setForm({...form,isPublic:e.target.checked})} className="h-4 w-4" />عرض ملفي للجمهور</label>
      {save.isError && <p role="alert" className="text-sm text-destructive sm:col-span-2">تعذّر حفظ الملف. لم يتم حفظ التغييرات محلياً.</p>}
      {save.isSuccess && <p role="status" data-testid="status-profile-saved" className="text-sm font-semibold text-[#397452] sm:col-span-2">تم حفظ ملفك بنجاح.</p>}
      <button data-testid="button-save-profile" disabled={save.isPending||form.age<18} className="rounded-full bg-[#205c50] px-6 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2">{save.isPending ? 'جارٍ الحفظ...' : 'حفظ الملف'}</button>
    </div>
  </form></Portal>;
}

function OnboardingPage(){const profile=useGetMyProfile();const [,setLocation]=useLocation();const save=useSaveMyProfile();const invalidate=useInvalidate();const [values,setValues]=useState<ProfileInput>({displayName:'',age:18,city:'سيول',bio:'',avatarUrl:'',languages:['العربية'],interests:['القهوة المختصة'],isPublic:true}); useEffect(()=>{if(profile.data?.profile)setLocation('/profile');},[profile.data,setLocation]); const submit=(e:FormEvent)=>{e.preventDefault();save.mutate({data:values},{onSuccess:()=>{invalidate([getGetMyProfileQueryKey()]);setLocation('/discover');}});}; const toggle=(field:'languages'|'interests',value:string)=>setValues(v=>({...v,[field]:v[field].includes(value)?v[field].filter(x=>x!==value):[...v[field],value].slice(0,field==='languages'?5:12)})); return <AuthGate><div dir="rtl" className="app-grain min-h-[100dvh] bg-[#f4f1e6] px-4 py-8"><div className="mx-auto max-w-3xl"><Link href="/" data-testid="link-onboarding-brand" className="mb-5 inline-flex items-center gap-3 font-display text-xl font-extrabold text-[#1f5c50]"><div className="rounded-[15px] bg-[#205c50] p-3 text-[#f5d9b1]"><Globe2 size={20} /></div>Korea 360</Link><form onSubmit={submit} className="rounded-[2rem] border border-[#ded9c9] bg-[#faf7ee] p-6 sm:p-8"><div className="mb-6"><p className="text-[10px] font-bold tracking-[.18em] text-[#bd795c]">WELCOME</p><h1 className="mt-2 font-display text-3xl font-extrabold text-[#203c38]">أنشئ ملفك الشخصي</h1></div><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-bold">الاسم الظاهر<input data-testid="input-onboarding-name" required minLength={2} maxLength={40} value={values.displayName} onChange={e=>setValues({...values,displayName:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" /></label><label className="text-sm font-bold">العمر<input data-testid="input-onboarding-age" type="number" min={18} max={120} required value={values.age} onChange={e=>setValues({...values,age:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" /></label><label className="text-sm font-bold">المدينة<select data-testid="select-onboarding-city" value={values.city} onChange={e=>setValues({...values,city:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5"><option>سيول</option><option>بوسان</option><option>إنتشون</option><option>دايجو</option><option>دايجون</option><option>جيجو</option></select></label><label className="text-sm font-bold">رابط الصورة<input data-testid="input-onboarding-avatar" type="url" value={values.avatarUrl||''} onChange={e=>setValues({...values,avatarUrl:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" /></label><BioSuggestionPanel displayName={values.displayName} city={values.city} interests={values.interests} languages={values.languages} onApply={bio => setValues({ ...values, bio })} /><label className="text-sm font-bold sm:col-span-2">نبذة<textarea data-testid="input-onboarding-bio" maxLength={240} rows={3} value={values.bio} onChange={e=>setValues({...values,bio:e.target.value})} className="mt-2 w-full rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5" /></label><div className="sm:col-span-2"><div className="text-sm font-bold">اللغات</div><div className="mt-2 flex flex-wrap gap-2">{['العربية','English','한국어','Français','中文'].map(lang => <button type="button" key={lang} onClick={()=>toggle('languages',lang)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${values.languages.includes(lang) ? 'border-[#205c50] bg-[#dfe8dc] text-[#205c50]' : 'border-[#ded9c9] bg-[#f7f4eb] text-[#5f7169]'}`}>{lang}</button>)}</div></div><div className="sm:col-span-2"><div className="text-sm font-bold">اهتماماتك</div><div className="mt-2 flex flex-wrap gap-2">{interestChoices.map(item => <button type="button" key={item} onClick={()=>toggle('interests',item)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${values.interests.includes(item) ? 'border-[#205c50] bg-[#dfe8dc] text-[#205c50]' : 'border-[#ded9c9] bg-[#f7f4eb] text-[#5f7169]'}`}>{item}</button>)}</div></div><label className="flex items-center gap-2 text-sm sm:col-span-2"><input data-testid="checkbox-onboarding-public" type="checkbox" checked={values.isPublic} onChange={e=>setValues({...values,isPublic:e.target.checked})} className="h-4 w-4" />عرض الملف للعامة</label>{save.isError && <p role="alert" className="text-sm text-destructive sm:col-span-2">تعذّر الحفظ، تأكد من اتصال الخدمة وحاول مجدداً.</p>}<button data-testid="button-save-onboarding" type="submit" disabled={save.isPending||values.age<18} className="rounded-full bg-[#205c50] px-6 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2">{save.isPending ? 'جارٍ الحفظ...' : 'إنهاء الملف الشخصي'}</button></div></form></div></div></AuthGate>;
}

function SettingsPage(){const blocked=useListBlockedProfiles();const unblock=useUnblockProfile();const invalidate=useInvalidate();const {language,setLanguage}=useLanguage();return <Portal title="الإعدادات" eyebrow="حسابك"><div className="space-y-6"><section className="flex flex-wrap items-center justify-between gap-4 rounded-[1.7rem] border border-[#ded9c9] bg-[#faf7ee] p-6 sm:p-8"><div className="flex items-center gap-4"><div className="rounded-2xl bg-[#dce7dc] p-3 text-[#39745f]"><Settings size={24} /></div><div><h2 className="text-lg font-bold">لغة الواجهة</h2><p className="text-sm text-[#5e7169]">اختر لغتك المفضلة للمنصة</p></div></div><select value={language} onChange={e=>setLanguage(e.target.value as UiLanguage)} className="rounded-xl border border-[#ded9c9] bg-[#f7f4eb] px-3 py-2.5 text-sm"><option value="ar">العربية</option><option value="en">English</option><option value="ko">한국어</option></select></section><section className="rounded-[1.7rem] border border-[#ded9c9] bg-[#faf7ee] p-6 sm:p-8"><div className="flex items-start gap-4"><div className="rounded-2xl bg-[#dce7dc] p-3 text-[#39745f]"><ShieldCheck size={24} /></div><div><h2 className="text-lg font-bold">الملفات المحظورة</h2><p className="text-sm text-[#5e7169]">إدارة المحظورات لحماية التجربة الشخصية</p>{blocked.isLoading ? <div className="mt-4 h-16 animate-pulse rounded-xl bg-[#efeae0]" /> : blocked.isError ? <ErrorMessage compact onRetry={()=>void blocked.refetch()} /> : !blocked.data?.length ? <p className="mt-4 text-sm text-[#5e7169]">لا توجد عناصر محظورة حالياً.</p> : <div className="mt-4 space-y-2">{blocked.data.map((profile: Profile) => <div key={profile.id} className="flex items-center justify-between rounded-xl bg-[#f3efe6] px-3 py-3"><div className="flex items-center gap-3"><Avatar profile={profile} size="sm" /><span className="text-sm font-semibold text-[#203c38]">{profile.displayName}</span></div><button onClick={() => unblock.mutate({profileId:profile.id},{onSuccess:()=>invalidate([getListBlockedProfilesQueryKey()])})} className="rounded-full bg-[#205c50] px-3 py-1.5 text-xs font-bold text-white">إلغاء الحظر</button></div>)}</div>}</div></div></section><div className="rounded-2xl border border-[#e0c5b7] bg-[#f7ebe4] p-4 text-sm leading-7 text-[#80574a]"><strong>حدّ واضح:</strong> Korea 360 مخصص للبالغين بعمر 18 عام أو أكثر. يرجى الالتزام بالمعايير الأمنية والاحترام بين الأعضاء.</div></div></Portal>;
}

function RoutedErrorBoundary({children}:{children:ReactNode}){const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;} 
function ClerkQueryClientCacheInvalidator(){const {addListener}=useClerk();const client=useQueryClient();const previous=useRef<string|null|undefined>(undefined);useEffect(()=>{const unsubscribe=addListener((event)=>{if(event.type==='session' && event.session){previous.current = event.session.id; void client.invalidateQueries();}}); return unsubscribe;},[addListener,client]); return null; }
function Routes(){const [,setLocation]=useLocation();return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} afterSignInUrl={`${basePath}/discover`} afterSignUpUrl={`${basePath}/discover`} appearance={{ baseTheme: shadcn, variables: { colorPrimary: '#205c50', colorText: '#203c38' }, localization: arSA }}>
    <QueryClientProvider client={queryClient}><LanguageProvider><ClerkQueryClientCacheInvalidator/><RoutedErrorBoundary><Switch>
      <Route path="/" component={HomeRedirect}/><Route path="/sign-in/*?" component={SignInPage}/><Route path="/sign-up/*?" component={SignUpPage}/>
      <Route path="/onboarding" component={OnboardingPage}/><Route path="/discover" component={DiscoverPage}/>
      <Route path="/reels" component={ReelsPage}/><Route path="/members/:profileId" component={MemberProfilePage}/>
      <Route path="/messages/:conversationId" component={ConversationPage}/><Route path="/messages" component={MessagesPage}/>
      <Route path="/rooms/:roomId" component={RoomPage}/><Route path="/rooms" component={RoomsPage}/>
      <Route path="/profile/edit" component={ProfileEditPage}/><Route path="/profile" component={ProfilePage}/><Route path="/settings" component={SettingsPage}/>
      <Route><Redirect to="/" /></Route>
    </Switch></RoutedErrorBoundary></LanguageProvider></QueryClientProvider></ClerkProvider>;
}

function App(){if(!clerkPubKey)return <div dir="rtl" className="flex min-h-[100dvh] items-center justify-center bg-[#f4f1e6] p-6 text-center"><div className="max-w-md rounded-[1.7rem] bg-[#faf7ee] p-6 shadow-sm"><h1 className="font-display text-2xl font-extrabold text-[#203c38]">تحتاج إلى مفتاح Clerk</h1><p className="mt-3 text-sm leading-7 text-[#5f7169]">يرجى ضبط متغيرات البيئة: VITE_CLERK_PUBLISHABLE_KEY و VITE_CLERK_PROXY_URL.</p></div></div>;
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><Routes/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;
