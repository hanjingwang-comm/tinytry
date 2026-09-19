import { nodes, type Action, type Behavior, type Status } from './data';
export interface RecordItem {
  id: string; createdAt: string; behavior: Behavior; when: 'now' | 'past';
  situation_code: string; reason_code: string; reason_path: string[];
  trail?: { id: string; label: string }[];
  intervention_code: string; intervention_version: number; status: Status;
  feedback_code?: string; feedbackAt?: string; parent_record_id?: string;
  reasonLabel: string; action: Action; timerEnd?: number;
}
export interface Draft {
  behavior: Behavior; when: 'now' | 'past'; trail: { id: string; label: string }[];
  nodeId: string; stage: 'question' | 'reason' | 'strategy' | 'commit';
  action?: Action; parent?: string; adjustment?: string; noShortcut?: boolean;
  customText?: string; customMinutes?: string;
}
export interface CustomMethod {
  code: string; createdAt: string; behavior: Behavior; reason_code: string;
  reasonLabel: string; action: Action;
}
export interface Strategy {
  reason_code: string; intervention_code: string; version: number;
  success_count: number; partial_count: number; fail_count: number;
  last_used_at: string; status: 'effective' | 'trying'; action: Action;
  behavior: Behavior; reasonLabel: string;
}
let idSequence = 0;
// randomUUID is secure-context-only; LAN HTTP previews still need working IDs.
export function makeId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const s = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
  }
  return `local-${Date.now().toString(36)}-${++idSequence}-${Math.random().toString(36).slice(2)}`;
}
export function createCustomMethod(d: Draft, title: string, minutes?: number): CustomMethod {
  const clean = title.trim();
  if (!clean || clean.length > 120) throw new Error('请填写 1–120 字的方法。');
  if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)) throw new Error('计时请填写 1–180 分钟，或留空。');
  const reason = nodes[d.nodeId]?.reason;
  if (!reason) throw new Error('请先选择当前情境。');
  const code = `custom_${makeId()}`;
  return { code, createdAt: new Date().toISOString(), behavior: d.behavior,
    reason_code: reason.code, reasonLabel: reason.label,
    action: { code, title: clean, minutes, detail: '', version: 1, origin: 'custom' } };
}
export function aggregate(history: RecordItem[]): Strategy[] {
  const map = new Map<string, Strategy>();
  for (const h of history) {
    const k = [h.behavior, h.reason_code, h.intervention_code, h.intervention_version].join(':');
    let s = map.get(k);
    if (!s) { s = { reason_code: h.reason_code, intervention_code: h.intervention_code,
      version: h.intervention_version, success_count: 0, partial_count: 0, fail_count: 0,
      last_used_at: h.createdAt, status: 'trying', action: h.action, behavior: h.behavior, reasonLabel: h.reasonLabel };
      map.set(k, s); }
    if (h.status === 'WORKED') s.success_count++;
    if (h.status === 'PARTLY_WORKED') s.partial_count++;
    if (h.status === 'FAILED') s.fail_count++;
    if (h.createdAt >= s.last_used_at) s.last_used_at = h.createdAt;
  }
  return [...map.values()].map(s => {
    const unsuitable = history.some(h => h.behavior === s.behavior && h.reason_code === s.reason_code &&
      h.intervention_code === s.intervention_code && h.intervention_version === s.version &&
      h.status === 'NOT_TRIED' && h.feedback_code === 'unsuitable');
    // Custom methods remain available for deliberate re-trial. Promotion requires
    // three distinct attempts rated WORKED, not three clicks or partial outcomes.
    const effective = s.action.origin === 'custom' ? s.success_count >= 3 : s.success_count > 0 && !s.fail_count && !unsuitable;
    return { ...s, status: effective ? 'effective' : 'trying' };
  });
}
export function feedback(history: RecordItem[], id: string, status: Status, code?: string) {
  return history.map(h => h.id === id && h.status === 'WAITING'
    ? { ...h, status, feedback_code: code, feedbackAt: new Date().toISOString() } : h);
}
export function actionList(reason: string, behavior: Behavior, history: RecordItem[], extra?: Action): Action[] {
  const base = nodes[reason]?.reason?.actions || [];
  const same = history.filter(h => h.reason_code === reason && h.behavior === behavior);
  const blocked = (a: Action) => a.origin !== 'custom' && same.some(h => h.intervention_code === a.code && h.intervention_version === a.version &&
    (h.status === 'FAILED' || (h.status === 'NOT_TRIED' && h.feedback_code === 'unsuitable')));
  const good = aggregate(history).filter(s => s.reason_code === reason && s.behavior === behavior && s.status === 'effective')
    .sort((a, b) => b.success_count - a.success_count).map(s => s.action);
  const all = [...(extra ? [extra] : []), ...good, ...base.filter(a => !same.some(h => h.intervention_code === a.code)), ...base];
  return all.filter((a, i) => !blocked(a) && all.findIndex(b => b.code === a.code && b.version === a.version) === i);
}
export function adjusted(h: RecordItem, code: string): Action {
  const a = h.action; let title = '';
  if (code === 'before' || code === 'effort') title = h.behavior === 'sleep' ? '先把手机放到充电处，再开始洗漱' : h.behavior === 'food' ? '先拿出一个碗，只盛好这一份' : h.behavior === 'move' ? '只把鞋放到脚边，不要求马上运动' : h.behavior === 'phone' ? '只锁屏一次，把手机放到桌上' : '只打开文件，不要求完成内容';
  if (code === 'during') title = ['sleep','phone'].includes(h.behavior) ? '手机充电、开启勿扰，放到必须起身才能拿的位置' : h.behavior === 'food' ? '把剩余食物收进柜子，再坐到别处' : h.behavior === 'move' ? '只做一个熟悉的轻松动作，然后停下' : '只处理一个最小步骤，关闭其余页面';
  if (code === 'after') title = ['sleep','phone'].includes(h.behavior) ? '只看一个有结尾的内容，结束后离开屏幕' : h.behavior === 'food' ? '吃完固定一份后离开餐桌，再重新决定' : h.behavior === 'move' ? '完成最小活动后就结束，不追加目标' : '做完一个小步骤就保存，标记下次接续处';
  if (code === 'forgot') title = `把「${a.title}」绑定在${h.behavior === 'sleep' ? '刷牙之后' : h.behavior === 'food' ? '下一次拿食物之前' : h.behavior === 'move' ? '下一次饭后' : h.behavior === 'phone' ? '下一次解锁之前' : '下一次坐到桌前'}，先准备好所需物品`;
  if (code === 'unwilling') title = `提前决定下一次的结束点，并在开始前准备好：${a.title}`;
  return { ...a, title: title || a.title, minutes: undefined, code: a.code, version: a.version + 1, detail: '根据这次的卡点调整了方法。' };
}
export function createRecord(d: Draft): RecordItem {
  const r = nodes[d.nodeId]?.reason;
  if (!r || !d.action) throw new Error('请先选择原因和方法。');
  return { id: makeId(), createdAt: new Date().toISOString(), behavior: d.behavior, when: d.when,
    situation_code: d.trail[0]?.label || d.nodeId, reason_code: r.code, reason_path: d.trail.map(t => t.label), trail: d.trail,
    intervention_code: d.action.code, intervention_version: d.action.version, status: 'WAITING',
    parent_record_id: d.parent, reasonLabel: r.label, action: d.action };
}
const keys = ['zd_history_v1','zd_strategies_v1','zd_profile_v1','zd_methods_v1'];
const validAction = (a: any): a is Action => a && typeof a.title === 'string' && !!a.title.trim() && typeof a.code === 'string' && Number.isInteger(a.version) && a.version > 0;
export function load(): { history: RecordItem[]; methods: CustomMethod[]; draft?: Draft; firstVisit: string; error: string } {
  let error = ''; let history: RecordItem[] = []; let methods: CustomMethod[] = []; let draft: Draft | undefined; let firstVisit = new Date().toISOString();
  const read = (key: string, fallback: any) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { error = '部分本地数据无法读取，可以继续使用。'; return fallback; } };
  const parsed = read(keys[0], []);
  if (Array.isArray(parsed)) {
    history = parsed.filter(h => h && typeof h.id === 'string' && Number.isFinite(Date.parse(h.createdAt)) &&
      typeof h.reasonLabel === 'string' && typeof h.situation_code === 'string' && nodes[h.behavior] && nodes[h.reason_code]?.reason &&
      Array.isArray(h.reason_path) && validAction(h.action) && (!h.timerEnd || Number.isFinite(h.timerEnd)) &&
      ['WAITING','WORKED','PARTLY_WORKED','FAILED','NOT_TRIED'].includes(h.status));
    if (history.length !== parsed.length) error = '部分本地记录无法读取，已保留可用记录。';
  }
  const saved = read(keys[3], []);
  if (Array.isArray(saved)) methods = saved.filter(m => m && typeof m.code === 'string' && nodes[m.behavior] && nodes[m.reason_code]?.reason &&
    typeof m.reasonLabel === 'string' && validAction(m.action) && m.action.origin === 'custom' && m.code === m.action.code);
  // Recover a custom-method entry from action history if the method list is missing.
  for (const h of history) if (h.action.origin === 'custom' && !methods.some(m => m.code === h.action.code && m.action.version === h.action.version))
    methods.push({ code: h.action.code, createdAt: h.createdAt, behavior: h.behavior, reason_code: h.reason_code, reasonLabel: h.reasonLabel, action: h.action });
  const p = read(keys[2], {}) || {};
  if (typeof p.firstVisit === 'string') firstVisit = p.firstVisit;
  if (p.draft && nodes[p.draft.nodeId] && nodes[p.draft.behavior] && Array.isArray(p.draft.trail) &&
    p.draft.trail.every((t: any) => t && nodes[t.id] && typeof t.label === 'string') && ['now','past'].includes(p.draft.when) &&
    ['question','reason','strategy','commit'].includes(p.draft.stage) && (p.draft.stage !== 'commit' || validAction(p.draft.action)) &&
    (!p.draft.parent || history.some(h => h.id === p.draft.parent))) draft = p.draft;
  return { history, methods, draft, firstVisit, error };
}
export function persist(history: RecordItem[], draft: Draft | undefined, firstVisit: string, methods: CustomMethod[] = []) {
  try {
    localStorage.setItem(keys[0], JSON.stringify(history));
    localStorage.setItem(keys[1], JSON.stringify(aggregate(history)));
    localStorage.setItem(keys[2], JSON.stringify({ firstVisit, usageCount: history.length, unlocked: history.length >= 3, draft }));
    localStorage.setItem(keys[3], JSON.stringify(methods)); return '';
  } catch { return '浏览器无法保存数据；本次仍可使用，但关闭后可能丢失记录。'; }
}
export function clearStorage() { for (const key of keys) localStorage.removeItem(key); }
export function remaining(end: number, now = Date.now()) { return Math.max(0, Math.ceil((end - now) / 1000)); }
