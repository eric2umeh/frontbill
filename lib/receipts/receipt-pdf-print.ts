import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/** Export a DOM element (e.g. iframe body wrapper) as a one-page A4 PDF. */
export async function exportElementToPdf(el: HTMLElement, fileName: string): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  })
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const ratio = canvas.width / canvas.height
  let imgW = pageW
  let imgH = imgW / ratio
  if (imgH > pageH) {
    imgH = pageH
    imgW = imgH * ratio
  }
  const x = (pageW - imgW) / 2
  const y = 8
  pdf.addImage(imgData, 'PNG', x, y, imgW, imgH)
  pdf.save(fileName)
}

export function printHtmlDocument(html: string): void {
  const w = window.open('', '_blank')
  if (!w) {
    throw new Error('Popup blocked — allow popups to print.')
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  window.setTimeout(() => {
    w.focus()
    w.print()
  }, 400)
}
