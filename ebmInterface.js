// EBM Interface - Switch between Mock and Real EBM
// Change the import below to switch between mock and real EBM

// FOR DEVELOPMENT: Use Mock EBM
import * as EBM from './ebmMock.js';

// FOR PRODUCTION: Use Real EBM (uncomment line below and comment line above)
// import * as EBM from './ebmReal.js';

// Export unified interface
export function sendInvoice(invoiceData) {
  return EBM.sendInvoiceToEBM(invoiceData);
}

export function verifyInvoice(invoiceNumber, verificationCode) {
  return EBM.verifyInvoice(invoiceNumber, verificationCode);
}

export function cancelInvoice(invoiceNumber, reason) {
  return EBM.cancelInvoice(invoiceNumber, reason);
}

// Configuration info
export function getEBMMode() {
  // Check which module is imported
  if (EBM.sendInvoiceToEBM.toString().includes('MOCK')) {
    return 'DEVELOPMENT (Mock EBM)';
  } else {
    return 'PRODUCTION (Real EBM)';
  }
}