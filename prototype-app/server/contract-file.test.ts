import {test} from 'node:test'
import assert from 'node:assert/strict'
import {extractRequisites} from './contract-file.ts'

test('Russian requisites are read by label and ambiguous identifiers are left for review',()=>{
  const text='ООО «Тест»\nИНН 0000000018  КПП 770101001\nРасчётный счёт: 40702810000000000001\nК/с: 30101810000000000001\nБИК 044525225\nСистема налогообложения: УСН'
  assert.deepEqual(extractRequisites(text),{inn:'0000000018',details:{legalName:'ООО «Тест»',kpp:'770101001',bik:'044525225',account:'40702810000000000001',correspondentAccount:'30101810000000000001',taxSystem:'УСН'}})
  assert.deepEqual(extractRequisites(text+'\nИНН 7707083893'),{inn:'',details:{}})
  assert.equal(extractRequisites(text+'\nБИК 999999999').details.bik,undefined)
  assert.equal(extractRequisites('ИНН: 0000000000').inn,'')
})
