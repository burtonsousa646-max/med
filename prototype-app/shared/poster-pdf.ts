import { PDFDocument, PageSizes } from 'pdf-lib'

export async function createPosterPdf(jpeg:ArrayBuffer, title:string) {
  const pdf = await PDFDocument.create()
  const image = await pdf.embedJpg(jpeg)
  if (image.width !== 2480 || image.height !== 3508) throw new Error('Не удалось подготовить изображение постера A4.')
  pdf.setTitle(title)
  const page = pdf.addPage(PageSizes.A4)
  page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()})
  return pdf.save()
}
