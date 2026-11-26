import { fileURLToPath } from 'node:url'
import { emailFont, emailHeading, emailLayout, emailLogo, escapeMailText } from './email-layout.ts'

const subject = 'Ваша рекламная кампания на модерации'
const status = 'Рекламная кампания на модерации.'
const nextSteps = 'Команда билайна проверит условия предложения. Показы начнутся после публикации.'
const signature = 'Команда партнерской платформы билайн'
const bannerTitle = 'Используй ИИ бесплатно в приложении билайн'
const promoUrl = 'https://samara.beeline.ru/customers/products/mobile/promobeegpt/'

const attachments = [
  emailLogo,
  {
    filename: 'beegpt-email.png',
    path: fileURLToPath(new URL('./mail-assets/beegpt-email.png', import.meta.url)),
    cid: 'beegpt-promo@beeline.ru',
  },
]

export function campaignModerationMail(offerTitle: string) {
  const text = [
    'Здравствуйте!', status, 'Ваше предложение\n' + offerTitle, nextSteps, signature,
    bannerTitle + '\nПопробовать: ' + promoUrl,
  ].join('\n\n')

  const html = emailLayout(subject, `
    <p style="margin:0 0 8px;">Здравствуйте!</p>
    ${emailHeading(status)}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr><td bgcolor="#f0f3f5" style="padding:16px;border-radius:12px;">
        <h2 style="margin:0 0 4px;color:#555d6d;font-family:${emailFont};font-size:14px;line-height:20px;font-weight:400;">Ваше предложение</h2>
        <p style="margin:0;color:#28303f;font-family:${emailFont};font-size:18px;line-height:24px;font-weight:700;word-wrap:break-word;overflow-wrap:anywhere;">${escapeMailText(offerTitle)}</p>
      </td></tr>
    </table>
    <p style="margin:20px 0 16px;">${nextSteps}</p>
    <p style="margin:0;color:#555d6d;">${signature}</p>
  `, `
    <tr><td height="16" style="height:16px;font-size:1px;line-height:16px;">&nbsp;</td></tr>
    <tr><td bgcolor="#fff5c5" style="border-radius:16px;font-family:${emailFont};">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td width="58%" valign="middle" style="padding:20px 0 20px 20px;">
            <h2 style="margin:0 0 12px;color:#28303f;font-family:${emailFont};font-size:20px;line-height:26px;font-weight:700;text-wrap:balance;">${bannerTitle}</h2>
            <a href="${promoUrl}" style="display:inline-block;padding:12px 16px;border-radius:24px;background-color:#28303f;color:#ffffff;text-decoration:none;font-family:${emailFont};font-size:14px;line-height:20px;font-weight:700;">Попробовать</a>
          </td>
          <td width="42%" valign="bottom" align="right" style="padding-right:8px;">
            <img src="cid:beegpt-promo@beeline.ru" width="218" alt="" style="display:block;width:100%;max-width:218px;height:auto;border:0;">
          </td>
        </tr>
      </table>
    </td></tr>
  `)

  return { subject, text, html, attachments }
}
