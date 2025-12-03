// Mock EBM Server for Development
// Simulates the Rwanda Revenue Authority EBM API

export function sendInvoiceToEBM(invoice) {
  // Simulate API processing delay
  return new Promise((resolve) => {
    setTimeout(() => {
      // Generate mock invoice number
      const invoiceNumber = 'MOCK-INV-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      
      // Generate mock verification code
      const verificationCode = 'VC-' + Math.floor(Math.random() * 999999).toString().padStart(6, '0');
      
      // Calculate tax details
      let totalTax = 0;
      invoice.items.forEach(item => {
        if (item.taxCategory === 'A') {
          totalTax += item.total * 0.18;
        }
      });
      
      // Mock successful response
      const response = {
        success: true,
        invoiceNumber: invoiceNumber,
        verificationCode: verificationCode,
        timestamp: Date.now(),
        qrCode: `QR-${invoiceNumber}`,
        totalAmount: invoice.totalAmount,
        totalTax: totalTax,
        message: 'Invoice successfully registered with EBM (Mock)',
        receiptSignature: 'MOCK-SIG-' + Math.random().toString(36).substring(7).toUpperCase()
      };
      
      // Simulate 95% success rate
      if (Math.random() > 0.95) {
        resolve({
          success: false,
          error: 'Mock EBM server error',
          message: 'Failed to register invoice (simulated failure)'
        });
      } else {
        resolve(response);
      }
    }, 500); // Simulate 500ms network delay
  });
}

// Mock function to verify invoice
export function verifyInvoice(invoiceNumber, verificationCode) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        verified: true,
        invoiceNumber: invoiceNumber,
        verificationCode: verificationCode,
        message: 'Invoice verified successfully (Mock)'
      });
    }, 300);
  });
}

// Mock function to cancel invoice
export function cancelInvoice(invoiceNumber, reason) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        cancelled: true,
        invoiceNumber: invoiceNumber,
        reason: reason,
        message: 'Invoice cancelled successfully (Mock)'
      });
    }, 400);
  });
}