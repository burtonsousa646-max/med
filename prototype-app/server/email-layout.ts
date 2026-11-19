import { fileURLToPath } from 'node:url'
import { platformName } from '../shared/brand.ts'

export const emailFont = "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans',Arial,sans-serif"

export const emailLogo = {
  filename: 'beeline-email-logo.png',
  path: fileURLToPath(new URL('./mail-assets/beeline-email-logo.png', import.meta.url)),
  cid: 'partner-platform-logo@beeline.ru',
}

export function escapeMailText(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function emailHeading(title: string) {
  return `<h1 style="margin:0 0 24px;font-family:${emailFont};font-size:28px;line-height:34px;font-weight:700;text-wrap:balance;">${escapeMailText(title)}</h1>`
}

export function emailLayout(subject: string, body: string, footer = '') {
  // Use resolved design-system colors because email clients may ignore CSS variables.
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeMailText(subject)}</title>
  <!--[if mso]><style>body, table, td, p, a, h1, h2 { font-family: 'Segoe UI', Arial, sans-serif !important; }</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f0f3f5;color:#28303f;font-family:${emailFont};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f0f3f5">
    <tr><td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
        <tr><td style="padding:0 12px 16px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td valign="middle"><img src="cid:${emailLogo.cid}" width="44" height="44" alt="" style="display:block;border:0;"></td>
              <td valign="middle" style="padding-left:12px;color:#28303f;font-family:${emailFont};font-size:16px;line-height:20px;font-weight:700;">${platformName}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="padding:24px;border-radius:16px;font-family:${emailFont};font-size:16px;line-height:24px;color:#28303f;">
          ${body}
        </td></tr>
        ${footer}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`
}
