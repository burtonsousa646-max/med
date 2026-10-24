/** CSV-экспорт: UTF-8 BOM, разделитель `;`, нейтрализация formula-injection
 *  (SOURCE: MED_HANDOFF/09_BUSINESS_RULES.md — "Экспорт CSV нейтрализует formula prefixes"). */
const DANGEROUS_PREFIXES = ['=', '+', '-', '@']

function escapeCell(value: string): string {
  let cell = value
  if (DANGEROUS_PREFIXES.some((p) => cell.startsWith(p))) cell = `'${cell}`
  if (cell.includes(';') || cell.includes('"') || cell.includes('\n')) {
    cell = `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

export function buildCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const lines = [headers, ...rows].map((row) => row.map((cell) => escapeCell(String(cell))).join(';'))
  return '﻿' + lines.join('\r\n')
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const csv = buildCsv(headers, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
