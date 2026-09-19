import { test, expect, type Page } from '@playwright/test';
const button=(p:Page,name:string)=>p.getByRole('button',{name,exact:true});
async function sleepStrategy(p:Page){
 await button(p,'又舍不得睡').click();await button(p,'困了，但舍不得睡').click();
 await button(p,'终于有自己的时间').click();await button(p,'嗯，选一个小办法').click();
}
test('五张等宽卡片、第五张居中，删除备注',async({page})=>{
 await page.goto('/');
 for(const width of [390,1100]){
  await page.setViewportSize({width,height:900});
  const rects=await page.locator('.scene').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,width:r.width,height:r.height}}));
  expect(rects).toHaveLength(5);for(const r of rects){expect(Math.abs(r.width-rects[0].width)).toBeLessThan(1);expect(Math.abs(r.height-rects[0].height)).toBeLessThan(1)}
  const center=await page.locator('.scene-grid').evaluate(e=>{const r=e.getBoundingClientRect();return r.x+r.width/2});
  expect(Math.abs(rects[4].x+rects[4].width/2-center)).toBeLessThan(1);
 }
 await expect(button(page,'沉迷玩耍，停不下来')).toBeVisible();await expect(button(page,'工作堆积如山，但不想开始')).toBeVisible();
 await expect(page.getByText('一个小动作，也算往前走。')).toHaveCount(0);await expect(page.getByText('不讲大道理。我们一起找找，')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/zilv-new-home-mobile.png',fullPage:true});
});
test('HTTP 不支持 randomUUID 时确认仍保存，三档效果点击即生效',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined})});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 for(const rating of ['好像没什么用','有点意思','很有效！']){
  await sleepStrategy(page);await page.locator('.options .choice').first().click();
  await button(page,'好，就试这个').click();await expect(page.getByRole('heading',{name:'已加入我的记录'})).toBeVisible();
  await page.reload();await button(page,'查看我的记录').click();
  const pending=page.locator('.record').filter({has:page.locator('.status.WAITING')});await expect(pending).toHaveCount(1);
  await pending.getByRole('button',{name:'验证效果 →',exact:true}).click();await button(page,rating).click();
  await expect(page.getByRole('heading',{name:'验证结果已保存'})).toBeVisible();await page.reload();
  await button(page,'查看我的记录').click();await expect(page.locator('.record').first().locator('.status')).toHaveText(rating);
  await button(page,'此刻').click();
 }
 expect(errors).toEqual([]);
});
test('自建方法单独保存，部分有效不计数，三次有效后加入办法库和策略',async({page})=>{
 const name='先把想看的写在纸上，再把手机放进抽屉';await page.goto('/');await sleepStrategy(page);
 await button(page,'都不合适？创建自己的方法').click();await page.getByLabel('创建自己的方法',{exact:true}).fill(name);
 await button(page,'保存并选择这个方法').click();await expect(page.getByRole('heading',{name:'就从这一小步开始。'})).toBeVisible();
 // Saving a method before commitment does not create an attempt.
 await button(page,'暂存并退出').click();await button(page,'我的方法').click();await page.reload();
 await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();await expect(page.getByText('很有效 0 / 3',{exact:true})).toBeVisible();
 await button(page,'我的记录').click();await expect(page.locator('.record')).toHaveCount(0);
 for(const [index,rating] of ['有点意思','很有效！','很有效！','很有效！'].entries()){
  await button(page,'我的方法').click();await button(page,'我创建的').click();await button(page,'再试一次').click();
  await button(page,'好，就试这个').click();await button(page,'我试过了，验证效果').click();await button(page,rating).click();
  await expect(page.getByRole('heading',{name:'验证结果已保存'})).toBeVisible();await button(page,'我的方法').click();
  if(index<3){await expect(page.getByText(`很有效 ${index} / 3`,{exact:true})).toBeVisible();await button(page,'我的办法').click();await expect(page.getByRole('heading',{name,exact:true})).toHaveCount(0)}
  else{await expect(page.getByText('已加入我的办法',{exact:true})).toBeVisible();await button(page,'我的办法').click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible()}
 }
 await page.reload();await button(page,'此刻').click();await expect(button(page,name)).toHaveCount(0);await expect(page.getByRole('heading',{name:'我的办法',exact:true})).toHaveCount(0);
 await sleepStrategy(page);await expect(page.locator('.options').getByRole('button',{name:new RegExp(name)})).toBeVisible();
 await page.screenshot({path:'/tmp/zilv-custom-approved.png',fullPage:true});
});
