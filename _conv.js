const { pdfToPng } = require('pdf-to-png-converter');
pdfToPng('c:/Users/LENOVO/Desktop/adel/لوحة_كيان_باشميل_زي_الأصل_٣م.pdf', {
  viewportScale: 0.4,
  outputFolder: 'c:/Users/LENOVO/Desktop/adel/_pdf_imgs'
}).then(r => console.log('done', r.length)).catch(e => console.error('ERR', e.message));
