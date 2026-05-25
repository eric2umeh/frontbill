/** Shared 80mm thermal width for outlet sales summary and full reports. */
export function outletReportThermalStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Courier New', Courier, monospace; font-size: 10px; color: #000; background: #fff; }
    .wrap { max-width: 320px; margin: 0 auto; padding: 8px 10px 20px; }
    .center { text-align: center; }
    .hotel { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; margin: 0 0 2px; text-align: center; }
    .title { font-size: 12px; font-weight: 700; text-align: center; margin: 0 0 10px; text-decoration: underline; }
    .meta { font-size: 10px; line-height: 1.45; margin-bottom: 10px; }
    .meta div { display: flex; justify-content: space-between; gap: 6px; }
    .stats { font-size: 10px; line-height: 1.5; margin-bottom: 10px; }
    .stats div { display: flex; justify-content: space-between; }
    .hr { border: none; border-top: 1px dashed #333; margin: 8px 0; }
    h3 { font-size: 10px; font-weight: 700; margin: 10px 0 4px; text-decoration: underline; }
    table.sum { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px; }
    table.sum th, table.sum td { padding: 2px 0; border-bottom: 1px dotted #999; }
    table.sum th { font-weight: 700; }
    table.sum td.r, table.sum th.r { text-align: right; white-space: nowrap; }
    table.sum tr.section td { font-weight: 700; padding-top: 4px; }
    table.sum tr.total td { font-weight: 700; border-top: 1px solid #000; border-bottom: none; }
    .footnote { font-size: 9px; margin-top: 12px; line-height: 1.4; }
    .sub { font-size: 10px; line-height: 1.45; margin-bottom: 10px; }
    h2.sec { font-size: 10px; font-weight: 700; margin: 12px 0 6px; padding-bottom: 2px; border-bottom: 1px solid #000; }
    h2.sec .amt { display: block; font-weight: 400; font-size: 9px; margin-top: 2px; }
    .order { font-size: 10px; line-height: 1.45; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dotted #ccc; }
    .order .row { display: flex; justify-content: space-between; gap: 6px; }
    .order .items { margin: 2px 0; word-break: break-word; }
    .grand { margin-top: 10px; padding: 6px 0; font-size: 11px; font-weight: 700; border-top: 2px solid #000; display: flex; justify-content: space-between; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .wrap { max-width: 80mm; padding: 0 2mm; }
    }
  `
}
