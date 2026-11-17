import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "zh";

const en = {
  "app.name": "SpotMe",
  "app.tagline": "Campus activity-partner matching.",
  "nav.discover": "Discover", "nav.post": "Post", "nav.mine": "Mine", "nav.inbox": "Inbox",
  "auth.title": "Never play, eat or study alone.",
  "auth.sub": "Post what you want to do, or that you're free. We match you with people at your school, in real time.",
  "auth.email": "School email", "auth.name": "Your name", "auth.go": "Continue",
  "auth.school": "You're joining {school}", "auth.notSchool": "Use your school email (.edu or your university's domain).",
  "auth.or": "or", "auth.devNote": "Demo sign-in: no password, school emails only.",
  "discover.title": "Happening at {school}", "discover.sub": "{n} open", "discover.near": "Near me", "discover.all": "All",
  "discover.list": "List", "discover.map": "Map", "discover.empty": "Nothing open here yet. Post the first one.",
  "discover.locating": "Finding you…", "discover.noLocation": "Location is off, showing soonest first.",
  "card.spots": "{n} spots left", "card.spot": "1 spot left", "card.full": "Full", "card.closes": "closes in {t}", "card.closed": "joining closed",
  "card.km": "{km} km", "card.host": "by {name}", "card.you": "You're in", "card.yours": "You host",
  "status.open": "Open", "status.full": "Full", "status.deciding": "Waiting for host", "status.confirmed": "It's on",
  "status.cancelled": "Cancelled", "status.done": "Done",
  "post.title": "What's the plan?", "post.activity": "Start an activity", "post.activitySub": "You have a time and place. Others join.",
  "post.seek": "Find a buddy", "post.seekSub": "You know what and roughly when. We'll match you.",
  "form.category": "What", "form.sport": "Sport", "form.level": "Level", "form.title": "Title", "form.titlePh": "Badminton doubles, friendly",
  "form.date": "Date", "form.from": "From", "form.to": "To", "form.people": "People in total (with you)",
  "form.fillBy": "Fill by", "form.fillByHint": "If it isn't full by then, you choose: start anyway or cancel.",
  "form.fill.30m": "30 min", "form.fill.1h": "1 hour", "form.fill.2h": "2 hours", "form.fill.6h": "6 hours", "form.fill.1d": "1 day",
  "form.fill.before": "before it starts",
  "form.area": "Meeting area (public)", "form.areaPh": "Near Pottruck Gym", "form.exact": "Exact spot (only people who join see it)",
  "form.exactPh": "Court 3, 2nd floor", "form.notes": "Notes", "form.useLocation": "Use my location", "form.located": "Location set",
  "form.publish": "Post activity", "form.when": "When are you free?", "form.days": "Days", "form.range": "Dates",
  "form.range.week": "Next 7 days", "form.range.weekend": "This weekend", "form.range.2w": "Next 2 weeks",
  "form.time.morning": "Morning", "form.time.afternoon": "Afternoon", "form.time.evening": "Evening", "form.time.custom": "Custom",
  "form.distance": "Within {km} km", "form.note": "Anything else?", "form.notePh": "Want to get back into badminton",
  "form.find": "Find buddies",
  "result.notified": "{n} people looking for this were notified", "result.none": "Nobody is looking for this right now. People who post later will be matched.",
  "result.view": "View activity", "result.matchesTitle": "Matches", "result.activities": "Open activities that fit",
  "result.buddies": "People who want the same", "result.noActivities": "No open activity fits yet.",
  "result.noBuddies": "Nobody else yet. We'll notify you when someone matches.", "result.startTogether": "Start one at this time",
  "act.when": "When", "act.where": "Where", "act.people": "People", "act.host": "Host", "act.notes": "Notes",
  "act.join": "Join", "act.leave": "Leave", "act.exactHidden": "Exact spot appears after you join.",
  "act.maps": "Open in Maps", "act.decideTitle": "Not full by the deadline", "act.decideTitleFull": "Everyone's in. Confirm?", "act.decideSubFull": "All {cap} spots filled. Start it, or cancel?", "act.decideSub": "{n} of {cap} joined. Start with them, or cancel?",
  "act.start": "Start anyway", "act.cancel": "Cancel activity", "act.startEarly": "Start now", "act.waiting": "Joining closed. Waiting for the host to decide.",
  "act.confirmed": "Confirmed with {n} people.", "act.cancelledMsg": "This activity was cancelled.",
  "act.conflict": "Heads up: this overlaps {title}.", "act.report": "Report", "act.block": "Block host",
  "act.reportPrompt": "What's wrong?", "act.reported": "Thanks, we'll look into it.", "act.blocked": "Blocked. You won't see each other's posts.",
  "act.youHost": "You're hosting", "act.fillBy": "Fill by {t}",
  "mine.title": "Your plans", "mine.hosting": "Hosting", "mine.joined": "Joined", "mine.seeks": "Looking for",
  "mine.noHosting": "You aren't hosting anything.", "mine.noJoined": "You haven't joined anything yet.",
  "mine.noSeeks": "No open buddy searches.", "mine.matches": "Matches", "mine.close": "Stop looking",
  "mine.profile": "Profile", "mine.lang": "Language", "mine.signOut": "Sign out", "mine.tz": "Time zone",
  "inbox.title": "Inbox", "inbox.empty": "Matches and updates show up here, live.", "inbox.markRead": "Mark all read",
  "n.match": "Matches what you're looking for: {title}", "n.seek-match": "Someone else wants the same thing. You're both free {when}.",
  "n.joined": "{name} joined {title} ({joined}/{capacity})", "n.left": "{name} left {title}", "n.full": "{title} is full",
  "n.deadline": "{title} isn't full ({joined}/{capacity}). Start or cancel?", "n.deadline-full": "{title} is full ({joined}/{capacity}). Confirm to start.", "n.confirmed": "{title} is on!",
  "n.cancelled": "{title} was cancelled", "n.auto-cancelled": "{title} was cancelled: the host didn't decide in time",
  "n.closed": "Joining closed for {title}. Waiting for the host.",
  "r.time.fits": "{when}, fully in your free time", "r.time.partly": "{when}, {pct}% inside your free time",
  "r.time.common": "You're both free {when} ({minutes} min)", "r.level.match": "Same level: {level}",
  "r.distance": "{km} km away", "r.urgent": "Closing soon, {spots} spots left",
  "level.any": "Any level", "level.beginner": "Beginner", "level.intermediate": "Intermediate", "level.advanced": "Advanced",
  "cat.sports": "Sports", "cat.meal": "Meals", "cat.study": "Study", "cat.movie": "Movies", "cat.travel": "Travel", "cat.other": "Other",
  "sport.badminton": "Badminton", "sport.basketball": "Basketball", "sport.tennis": "Tennis", "sport.table-tennis": "Table tennis",
  "sport.soccer": "Soccer", "sport.volleyball": "Volleyball", "sport.running": "Running", "sport.gym": "Gym", "sport.swimming": "Swimming",
  "sport.hiking": "Hiking", "sport.cycling": "Cycling", "sport.yoga": "Yoga",
  "common.back": "Back", "common.loading": "Loading…", "common.error": "Something went wrong", "common.retry": "Try again",
  "live.on": "Live", "live.off": "Reconnecting…",
};

type Key = keyof typeof en;

const zh: Record<Key, string> = {
  "app.name": "SpotMe",
  "app.tagline": "在本校找搭子。",
  "nav.discover": "发现", "nav.post": "发帖", "nav.mine": "我的", "nav.inbox": "通知",
  "auth.title": "打球、吃饭、自习，不再一个人。",
  "auth.sub": "发起活动，或说一声你有空。系统实时帮你匹配本校同学。",
  "auth.email": "学校邮箱", "auth.name": "你的名字", "auth.go": "继续",
  "auth.school": "你将加入 {school}", "auth.notSchool": "请使用学校邮箱（.edu 或你学校的域名）。",
  "auth.or": "或", "auth.devNote": "演示登录：无需密码，仅限学校邮箱。",
  "discover.title": "{school} 正在约", "discover.sub": "{n} 个可加入", "discover.near": "离我最近", "discover.all": "全部",
  "discover.list": "列表", "discover.map": "地图", "discover.empty": "这里还没有活动，来发第一个吧。",
  "discover.locating": "正在定位…", "discover.noLocation": "未开启定位，按开始时间排序。",
  "card.spots": "还差 {n} 人", "card.spot": "还差 1 人", "card.full": "已满", "card.closes": "{t}后截止", "card.closed": "已停止加入",
  "card.km": "{km} 公里", "card.host": "{name} 发起", "card.you": "已加入", "card.yours": "我发起的",
  "status.open": "招募中", "status.full": "已满员", "status.deciding": "等发起人决定", "status.confirmed": "已确认",
  "status.cancelled": "已取消", "status.done": "已结束",
  "post.title": "想做点什么？", "post.activity": "发起活动", "post.activitySub": "时间地点已定，等人加入。",
  "post.seek": "找搭子", "post.seekSub": "知道想做什么、大概什么时候有空，系统帮你匹配。",
  "form.category": "类别", "form.sport": "项目", "form.level": "水平", "form.title": "标题", "form.titlePh": "羽毛球双打，友谊局",
  "form.date": "日期", "form.from": "开始", "form.to": "结束", "form.people": "总人数（含你）",
  "form.fillBy": "凑齐截止", "form.fillByHint": "到时还没满员，由你决定：照常开始或取消。",
  "form.fill.30m": "30 分钟", "form.fill.1h": "1 小时", "form.fill.2h": "2 小时", "form.fill.6h": "6 小时", "form.fill.1d": "1 天",
  "form.fill.before": "开始前",
  "form.area": "集合区域（公开）", "form.areaPh": "Pottruck 体育馆附近", "form.exact": "具体位置（加入后才能看到）",
  "form.exactPh": "二楼 3 号场", "form.notes": "备注", "form.useLocation": "使用我的位置", "form.located": "已定位",
  "form.publish": "发布活动", "form.when": "什么时候有空？", "form.days": "星期", "form.range": "日期范围",
  "form.range.week": "未来 7 天", "form.range.weekend": "这个周末", "form.range.2w": "未来 2 周",
  "form.time.morning": "上午", "form.time.afternoon": "下午", "form.time.evening": "晚上", "form.time.custom": "自定义",
  "form.distance": "{km} 公里以内", "form.note": "补充说明", "form.notePh": "想重新捡起羽毛球",
  "form.find": "开始匹配",
  "result.notified": "已通知 {n} 位正在找这类活动的同学", "result.none": "暂时没人在找这类活动，之后发帖的人会自动匹配到你。",
  "result.view": "查看活动", "result.matchesTitle": "匹配结果", "result.activities": "合适的活动",
  "result.buddies": "也想做这件事的人", "result.noActivities": "暂时没有合适的活动。",
  "result.noBuddies": "暂时没有，有人匹配时会通知你。", "result.startTogether": "在这个时间发起活动",
  "act.when": "时间", "act.where": "地点", "act.people": "人数", "act.host": "发起人", "act.notes": "备注",
  "act.join": "加入", "act.leave": "退出", "act.exactHidden": "加入后显示具体位置。",
  "act.maps": "在地图中打开", "act.decideTitle": "截止时还没凑满", "act.decideTitleFull": "人齐了，确认开始吗？", "act.decideSubFull": "{cap} 个名额已满，确认开始还是取消？", "act.decideSub": "{cap} 人里来了 {n} 人，照常开始还是取消？",
  "act.start": "照常开始", "act.cancel": "取消活动", "act.startEarly": "现在开始", "act.waiting": "已停止加入，等发起人决定。",
  "act.confirmed": "已确认，共 {n} 人。", "act.cancelledMsg": "活动已取消。",
  "act.conflict": "注意：和「{title}」时间冲突。", "act.report": "举报", "act.block": "拉黑发起人",
  "act.reportPrompt": "哪里有问题？", "act.reported": "收到，我们会处理。", "act.blocked": "已拉黑，你们将互相看不到对方的帖子。",
  "act.youHost": "你是发起人", "act.fillBy": "{t} 截止",
  "mine.title": "我的安排", "mine.hosting": "我发起的", "mine.joined": "我加入的", "mine.seeks": "我在找",
  "mine.noHosting": "还没有发起活动。", "mine.noJoined": "还没有加入活动。",
  "mine.noSeeks": "没有进行中的找搭子。", "mine.matches": "看匹配", "mine.close": "不找了",
  "mine.profile": "个人资料", "mine.lang": "语言", "mine.signOut": "退出登录", "mine.tz": "时区",
  "inbox.title": "通知", "inbox.empty": "匹配和活动动态会实时出现在这里。", "inbox.markRead": "全部已读",
  "n.match": "有符合你要求的活动：{title}", "n.seek-match": "有人和你想做同一件事，你们 {when} 都有空。",
  "n.joined": "{name} 加入了 {title}（{joined}/{capacity}）", "n.left": "{name} 退出了 {title}", "n.full": "{title} 已满员",
  "n.deadline": "{title} 截止时没凑满（{joined}/{capacity}），开始还是取消？", "n.deadline-full": "{title} 已满员（{joined}/{capacity}），请确认开始。", "n.confirmed": "{title} 确认开始！",
  "n.cancelled": "{title} 已取消", "n.auto-cancelled": "{title} 已自动取消：发起人没有及时决定",
  "n.closed": "{title} 已停止加入，等发起人决定。",
  "r.time.fits": "{when}，完全在你有空的时间里", "r.time.partly": "{when}，{pct}% 在你有空的时间里",
  "r.time.common": "你们 {when} 都有空（{minutes} 分钟）", "r.level.match": "水平相同：{level}",
  "r.distance": "距离 {km} 公里", "r.urgent": "快截止了，还差 {spots} 人",
  "level.any": "不限水平", "level.beginner": "新手", "level.intermediate": "中等", "level.advanced": "进阶",
  "cat.sports": "运动", "cat.meal": "吃饭", "cat.study": "自习", "cat.movie": "看电影", "cat.travel": "旅行", "cat.other": "其他",
  "sport.badminton": "羽毛球", "sport.basketball": "篮球", "sport.tennis": "网球", "sport.table-tennis": "乒乓球",
  "sport.soccer": "足球", "sport.volleyball": "排球", "sport.running": "跑步", "sport.gym": "健身", "sport.swimming": "游泳",
  "sport.hiking": "徒步", "sport.cycling": "骑行", "sport.yoga": "瑜伽",
  "common.back": "返回", "common.loading": "加载中…", "common.error": "出错了", "common.retry": "重试",
  "live.on": "实时", "live.off": "重新连接中…",
};

const DICT: Record<Lang, Record<Key, string>> = { en, zh };
export const hasKey = (k: string): k is Key => k in en;

interface Ctx {
  lang: Lang;
  setLang(l: Lang): void;
  t(key: Key, params?: Record<string, string | number>): string;
  /** "Wed 6:00–8:00 PM" / "周三 18:00–20:00" in the viewer's zone. */
  when(start: string | Date, end?: string | Date): string;
  /** "1 h 20 min" / "1小时20分" */
  duration(ms: number): string;
}

const I18n = createContext<Ctx | null>(null);
const KEY = "spotme.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s === "en" || s === "zh") return s;
    } catch {
      /* ignore */
    }
    return navigator.language.startsWith("zh") ? "zh" : "en";
  });
  const value = useMemo<Ctx>(() => {
    const locale = lang === "zh" ? "zh-CN" : "en-US";
    const day = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" });
    const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12: lang === "en" });
    return {
      lang,
      setLang(l) {
        setLangState(l);
        document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
        try {
          localStorage.setItem(KEY, l);
        } catch {
          /* ignore */
        }
      },
      t(key, params) {
        let s = DICT[lang][key] ?? en[key] ?? key;
        if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
      when(start, end) {
        const a = new Date(start);
        if (!end) return `${day.format(a)} ${time.format(a)}`;
        const b = new Date(end);
        const sameDay = a.toDateString() === b.toDateString();
        return sameDay ? `${day.format(a)} ${time.format(a)}–${time.format(b)}` : `${day.format(a)} ${time.format(a)} – ${day.format(b)} ${time.format(b)}`;
      },
      duration(ms) {
        const m = Math.max(0, Math.round(ms / 60_000));
        const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
        if (lang === "zh") return d ? `${d}天${h ? `${h}小时` : ""}` : h ? `${h}小时${mm ? `${mm}分` : ""}` : `${mm}分钟`;
        return d ? `${d} d${h ? ` ${h} h` : ""}` : h ? `${h} h${mm ? ` ${mm} min` : ""}` : `${mm} min`;
      },
    };
  }, [lang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n() {
  const c = useContext(I18n);
  if (!c) throw new Error("I18nProvider missing");
  return c;
}
