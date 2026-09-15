import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
const source = fs.readFileSync(new URL('./router.js', import.meta.url), 'utf8')
const run = new (Object.getPrototypeOf(async function(){}).constructor)('update','Api','HTTP','crypto','process', source)
const fixture = JSON.parse(fs.readFileSync(new URL('./contract.json', import.meta.url)))
test('shared HMAC fixture', () => {
  assert.equal(crypto.createHmac('sha256',fixture.secret).update('response\n123\n'+fixture.response_payload).digest('hex'),fixture.response_signature)
  assert.equal(crypto.createHmac('sha256',fixture.secret).update(fixture.timestamp+'\n'+fixture.nonce+'\n'+crypto.createHash('sha256').update(fixture.body).digest('hex')).digest('hex'),fixture.signature)
})
function mocks() {
  const calls = []
  return { calls, Api: Object.fromEntries(['sendMessage','editMessageText','answerCallbackQuery'].map(method => [method, async data => calls.push({method,data})])), HTTP: { post: async (url, options) => { calls.push({method:'post',url,options}); const payload=JSON.stringify({text:'done',keyboard:[]}); const signature=crypto.createHmac('sha256',fixture.secret).update('response\n'+JSON.parse(options.body).update_id+'\n'+payload).digest('hex'); return {ok:true,data:{payload,signature}} } }, process: {env:{BAHARNAJ_BACKEND_URL:'https://example.com',BAHARNAJ_INTEGRATION_SECRET:fixture.secret}} }
}
test('start token asks confirmation and performs no backend mutation', async () => {
  const m=mocks(); await run({update_id:1,message:{text:'/start '+'a'.repeat(32),from:{id:123},chat:{id:123,type:'private'}}},m.Api,m.HTTP,crypto,m.process)
  assert.equal(m.calls.length,1); assert.equal(m.calls[0].data.reply_markup.inline_keyboard[0][0].callback_data,'link:'+'a'.repeat(32))
})
test('callback answered before authenticated HTTP and existing menu edited', async () => {
  const m=mocks(); await run({update_id:2,callback_query:{id:'c',data:'link:'+'a'.repeat(32),from:{id:123},message:{message_id:9,chat:{id:123,type:'private'}}}},m.Api,m.HTTP,crypto,m.process)
  assert.equal(m.calls[0].method,'answerCallbackQuery'); assert.equal(m.calls[1].method,'post'); assert.equal(m.calls[2].method,'editMessageText')
  const {body,headers}=m.calls[1].options
  assert.equal(JSON.parse(body).operation,'confirm_link')
  assert.equal(headers['X-Signature'],crypto.createHmac('sha256',fixture.secret).update(headers['X-Timestamp']+'\n'+headers['X-Nonce']+'\n'+crypto.createHash('sha256').update(body).digest('hex')).digest('hex'))
})
test('groups ignored; HTTP failures produce useful failure response', async () => {
  const m=mocks(); await run({update_id:3,message:{text:'/start',from:{id:123},chat:{id:-123,type:'group'}}},m.Api,m.HTTP,crypto,m.process); assert.equal(m.calls.length,0)
  m.HTTP.post=async()=>({ok:false,status:403}); await run({update_id:4,message:{text:'/stop',from:{id:123},chat:{id:123,type:'private'}}},m.Api,m.HTTP,crypto,m.process); assert.match(m.calls[0].data.text,/انجام نشد/)
})

test('tampered signed response is never displayed', async () => {
  const m=mocks(); m.HTTP.post=async()=>({ok:true,data:{payload:fixture.response_payload,signature:'0'.repeat(64)}})
  await run({update_id:123,message:{text:'/start',from:{id:123},chat:{id:123,type:'private'}}},m.Api,m.HTTP,crypto,m.process)
  assert.match(m.calls[0].data.text,/پاسخ معتبر دریافت نشد/)
  assert.notEqual(m.calls[0].data.text,JSON.parse(fixture.response_payload).text)
})
