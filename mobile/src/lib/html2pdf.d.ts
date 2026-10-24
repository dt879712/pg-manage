declare module "html2pdf.js" {
  interface Html2PdfOptions {
    pagebreak?: { mode?: string | string[] };
  }

  const html2pdf: any;
  export default html2pdf;
}
