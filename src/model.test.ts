import {describe,it,expect,vi} from 'vitest';
import {nodes,behaviors,type Status} from './data';
import {createRecord,feedback,aggregate,actionList,adjusted,remaining,load,persist,makeId,createCustomMethod,clearStorage,type Draft} from './model';
const draft:Draft={behavior:'sleep',when:'now',trail:[{id:'sleep',label:'困了，但舍不得睡'},{id:'s_reluctant',label:'终于有自己的时间'}],nodeId:'s_private',stage:'commit',action:nodes.s_private.reason!.actions[0]};
describe('五场景树完整性',()=>{
it('所有路径有终点，无环或断链，普通叶至少两种策略',()=>{const seen=new Set<string>();function visit(id:string,path:string[]){expect(nodes[id],id).toBeTruthy();expect(path.includes(id),path.join(' -> ')).toBe(false);const n=nodes[id];seen.add(id);if(n.reason){expect(n.reason.code).toBe(id);expect(n.reason.actions.length).toBeGreaterThanOrEqual(2);for(const a of n.reason.actions){expect(a.code).toBeTruthy();expect(a.title).toBeTruthy()}return}if(n.support)return;expect(n.options.length).toBeGreaterThanOrEqual(2);expect(n.options.length).toBeLessThanOrEqual(6);n.options.forEach(o=>visit(o.to,[...path,id]))}behaviors.forEach(b=>visit(b.id,[]));expect(seen.size).toBe(Object.keys(nodes).length)});
});
describe('反馈、推荐与版本链',()=>{
it('确认行动保存完整快照与 WAITING',()=>{const h=createRecord(draft);expect(h.status).toBe('WAITING');expect(h.reason_path).toHaveLength(2);expect(h.trail).toEqual(draft.trail);expect(h.action.title).toContain('10 分钟')});
it.each(['WORKED','PARTLY_WORKED','FAILED','NOT_TRIED'] as Status[])('只接受一次 %s 反馈',s=>{const h=createRecord(draft);const first=feedback([h],h.id,s,'effort');expect(first[0].status).toBe(s);expect(feedback(first,h.id,'WORKED')).toEqual(first)});
it('成功次数可重复累积，没试过不算失败',()=>{const a=createRecord(draft),b=createRecord(draft),c=createRecord(draft);const h=[{...a,status:'WORKED' as Status},{...b,status:'WORKED' as Status},{...c,status:'NOT_TRIED' as Status}];const s=aggregate(h)[0];expect(s.success_count).toBe(2);expect(s.fail_count).toBe(0);expect(s.status).toBe('effective');expect(actionList('s_private','sleep',h)[0].code).toBe(a.action.code)});
it('失败及不适合的相同版本不再推荐',()=>{for(const status of ['FAILED','NOT_TRIED'] as Status[]){const h={...createRecord(draft),status,feedback_code:'unsuitable'};expect(actionList(h.reason_code,h.behavior,[h]).some(a=>a.code===h.action.code&&a.version===h.action.version)).toBe(false)}});
it('部分有效形成明确升级，并保留父记录',()=>{const old=createRecord(draft),upgrade=adjusted(old,'during');expect(upgrade.version).toBe(2);expect(upgrade.title).toContain('勿扰');const next=createRecord({...draft,parent:old.id,action:upgrade});expect(next.parent_record_id).toBe(old.id);expect(next.intervention_version).toBe(2);expect(old.intervention_version).toBe(1)});
it('没执行的三个原因产生不同调整，不沿用计时',()=>{const h=createRecord(draft);const variants=['effort','forgot','unwilling'].map(c=>adjusted(h,c));expect(new Set(variants.map(a=>a.title)).size).toBe(3);expect(variants.every(a=>!a.minutes)).toBe(true)});
it('更正原因保留旧记录',()=>{const old=createRecord(draft);const next=createRecord({...draft,nodeId:'s_thought',action:nodes.s_thought.reason!.actions[0],parent:old.id});expect(next.reason_code).toBe('s_thought');expect(old.reason_code).toBe('s_private');expect(next.parent_record_id).toBe(old.id)});
it('同版本失败后，即使另一次旧尝试反馈有效也不重新推荐',()=>{const a={...createRecord(draft),status:'FAILED' as Status};const b={...createRecord(draft),status:'WORKED' as Status};expect(aggregate([a,b])[0].status).toBe('trying');expect(actionList(a.reason_code,a.behavior,[a,b]).some(x=>x.code===a.action.code)).toBe(false)});
it('所有候选失败后返回空列表，不循环',()=>{const h=nodes.s_private.reason!.actions.map(a=>({...createRecord({...draft,action:a}),status:'FAILED' as Status}));expect(actionList('s_private','sleep',h)).toEqual([])});
it('不同场景的历史不会参与当前推荐',()=>{const h={...createRecord(draft),status:'WORKED' as Status};expect(actionList('p_infinite','phone',[h]).some(a=>a.code===h.action.code)).toBe(false)});
});
describe('时间与存储',()=>{
it('刷新和跨日按绝对时间恢复，结束不会变为成功',()=>{const end=Date.parse('2026-09-18T00:05:00');expect(remaining(end,Date.parse('2026-09-17T23:55:00'))).toBe(600);expect(remaining(end,end+100)).toBe(0)});
it('损坏或不可用的存储不会抛出',()=>{vi.stubGlobal('localStorage',{getItem:()=>'{broken',setItem:()=>{throw Error('denied')}});expect(load().error).toBeTruthy();expect(persist([],undefined,'now')).toContain('无法保存');vi.unstubAllGlobals()});
it('草稿和三次解锁可恢复，清空作为新用户',()=>{const m=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>m.get(k)||null,setItem:(k:string,v:string)=>m.set(k,v)});const h=[createRecord(draft),createRecord(draft),createRecord(draft)];persist(h,draft,'2026-09-17');expect(load().history).toHaveLength(3);expect(load().draft).toEqual(draft);expect(JSON.parse(m.get('zd_profile_v1')!).unlocked).toBe(true);m.clear();expect(load().history).toEqual([]);vi.unstubAllGlobals()});
});

describe('局域网 HTTP 与自建方法',()=>{
 it('缺少 randomUUID 时仍可提交记录',()=>{
  const original=globalThis.crypto;vi.stubGlobal('crypto',{getRandomValues:original.getRandomValues.bind(original)});
  const a=createRecord(draft),b=createRecord(draft);expect(a.id).not.toBe(b.id);expect(a.status).toBe('WAITING');vi.unstubAllGlobals();
 });
 it('完全没有 crypto 的旧环境仍能生成不同 ID',()=>{vi.stubGlobal('crypto',undefined);const ids=new Set(Array.from({length:100},()=>makeId()));expect(ids.size).toBe(100);vi.unstubAllGlobals()});
 it('方法可先保存，不会提前创建尝试记录',()=>{const m=createCustomMethod(draft,'  把想看的写在纸上  ',5);expect(m.action.title).toBe('把想看的写在纸上');expect(m.action.origin).toBe('custom');expect(aggregate([])).toEqual([])});
 it('拒绝空白、超长内容和无效时长',()=>{expect(()=>createCustomMethod(draft,'   ')).toThrow();expect(()=>createCustomMethod(draft,'长'.repeat(121))).toThrow();for(const minutes of [0,-1,1.5,181,NaN])expect(()=>createCustomMethod(draft,'我的做法',minutes)).toThrow()});
 it('前两次不进入推荐，第三次才进入；重复反馈不增加计数',()=>{
  const m=createCustomMethod(draft,'先把手机放进抽屉');let hs:ReturnType<typeof createRecord>[]=[];
  for(let i=1;i<=3;i++){const h=createRecord({...draft,action:m.action});hs=[...hs,h];hs=feedback(hs,h.id,'WORKED');hs=feedback(hs,h.id,'WORKED');expect(aggregate(hs)[0].success_count).toBe(i);expect(aggregate(hs)[0].status).toBe(i===3?'effective':'trying');expect(actionList(draft.nodeId,draft.behavior,hs).some(a=>a.code===m.code)).toBe(i===3)}
  expect(actionList('p_infinite','phone',hs).some(a=>a.code===m.code)).toBe(false);
 });
 it('有点意思、没用、没试均不算三次有效；失败后可以主动再试',()=>{
  const m=createCustomMethod(draft,'自己的做法');const hs=(['PARTLY_WORKED','FAILED','NOT_TRIED','WORKED','WORKED'] as Status[]).map(status=>({...createRecord({...draft,action:m.action}),status}));expect(aggregate(hs)[0].success_count).toBe(2);expect(aggregate(hs)[0].status).toBe('trying');hs.push({...createRecord({...draft,action:m.action}),status:'WORKED'});expect(aggregate(hs)[0].status).toBe('effective');
 });
 it('保存未试方法并刷新恢复，不改动原有历史；清空包含方法',()=>{
  const m=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>m.get(k)||null,setItem:(k:string,v:string)=>m.set(k,v),removeItem:(k:string)=>m.delete(k)});
  const old=createRecord(draft);const custom=createCustomMethod(draft,'先换个房间');persist([old],undefined,'2026-09-17',[custom]);expect(load().methods).toEqual([custom]);expect(load().history).toEqual([old]);expect(load().methods[0].action.origin).toBe('custom');clearStorage();expect(load().methods).toEqual([]);expect(load().history).toEqual([]);vi.unstubAllGlobals();
 });
});
