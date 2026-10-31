function escapeCsvField(value: string | number): string {
  const str = String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\r\n')
}
