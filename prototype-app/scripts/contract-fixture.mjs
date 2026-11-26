// Synthetic contract fields for the isolated browser scenarios.
export async function fillMissingContractFields(page) {
  const values={
    'Полное наименование':'ООО Тест', 'КПП':'770101001','ОГРН / ОГРНИП':'1027700132195',
    'Юридический адрес / адрес регистрации':'г. Самара, ул. Полевая, 1','ФИО подписанта':'Тестов Иван',
    'Должность подписанта':'Директор','Банк':'Тестовый банк','БИК':'044525225','Расчётный счёт':'40702810000000000001',
    'Корреспондентский счёт':'30101810000000000001',
  }
  const tax=page.getByRole('combobox',{name:'Система налогообложения'})
  if(await tax.isVisible() && !await tax.inputValue())await tax.selectOption('УСН')
  for(const [name,value] of Object.entries(values)){
    const field=page.getByRole('textbox',{name,exact:true})
    if(await field.isVisible() && !await field.inputValue())await field.fill(value)
  }
}
