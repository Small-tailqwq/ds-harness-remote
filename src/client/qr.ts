import QRCode from 'qrcode'

export interface QrPath {
  size: number
  path: string
}

/** QR modules as one SVG path, so the code renders crisp at any size without a canvas. */
export function qrPath(text: string): QrPath {
  const modules = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules
  const size = modules.size
  let path = ''
  for (let row = 0; row < size; row += 1) {
    let column = 0
    while (column < size) {
      if (modules.get(row, column) !== 1) {
        column += 1
        continue
      }
      const start = column
      while (column < size && modules.get(row, column) === 1) column += 1
      path += `M${start} ${row}h${column - start}v1h${start - column}z`
    }
  }
  return { size, path }
}
