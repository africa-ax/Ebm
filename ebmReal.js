// Real EBM API Implementation
// Rwanda Revenue Authority EBM Integration

const EBM_API_URL = 'https://ebm.rra.gov.rw/api/v1';
const EBM_API_KEY = 'YOUR_REAL_EBM_API_KEY'; // Replace with actual API key
const EBM_USERNAME = 'YOUR_EBM_USERNAME'; // Replace with actual username
const EBM_PASSWORD = 'YOUR_EBM_PASSWORD'; // Replace with actual password

// Get authentication token
async function getAuthToken() {
  try {
    const response = await fetch(`${EBM_API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': EBM_API_KEY
      },
      body: JSON.stringify({
        username: EBM_USERNAME,
        password: EBM_PASSWORD
      })
    });
    
    if (!response.ok) {
      throw new Error('EBM authentication failed');
    }
    
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('EBM Auth Error:', error);
    throw error;
  }
}

// Send invoice to real EBM API
export async function sendInvoiceToEBM(invoice) {
  try {
    const authToken = await getAuthToken();
    
    // Format invoice data according to EBM API specification
    const ebmInvoiceData = {
      seller: {
        tin: invoice.sellerTIN,
        name: invoice.sellerName
      },
      buyer: {
        tin: invoice.buyerTIN,
        name: invoice.buyerName,
        type: invoice.customerType || 'business'
      },
      items: invoice.items.map(item => ({
        itemCode: item.ebmProductCode,
        itemName: item.productName,
        quantity: item.quantity,
        unitPrice: item.price,
        taxCategory: item.taxCategory,
        totalAmount: item.total
      })),
      payment: {
        totalAmount: invoice.totalAmount,
        paymentMode: 'CASH' // Default payment mode
      },
      invoiceDate: new Date().toISOString()
    };
    
    const response = await fetch(`${EBM_API_URL}/invoices/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'API-Key': EBM_API_KEY
      },
      body: JSON.stringify(ebmInvoiceData)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'EBM API request failed');
    }
    
    const data = await response.json();
    
    return {
      success: true,
      invoiceNumber: data.invoiceNumber,
      verificationCode: data.verificationCode,
      timestamp: data.timestamp,
      qrCode: data.qrCode,
      totalAmount: data.totalAmount,
      totalTax: data.totalTax,
      message: 'Invoice successfully registered with EBM',
      receiptSignature: data.receiptSignature
    };
  } catch (error) {
    console.error('EBM API Error:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to register invoice with EBM'
    };
  }
}

// Verify invoice with real EBM API
export async function verifyInvoice(invoiceNumber, verificationCode) {
  try {
    const authToken = await getAuthToken();
    
    const response = await fetch(`${EBM_API_URL}/invoices/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'API-Key': EBM_API_KEY
      },
      body: JSON.stringify({
        invoiceNumber: invoiceNumber,
        verificationCode: verificationCode
      })
    });
    
    if (!response.ok) {
      throw new Error('Verification failed');
    }
    
    const data = await response.json();
    
    return {
      success: true,
      verified: data.verified,
      invoiceNumber: invoiceNumber,
      verificationCode: verificationCode,
      message: data.message
    };
  } catch (error) {
    console.error('EBM Verification Error:', error);
    return {
      success: false,
      verified: false,
      error: error.message
    };
  }
}

// Cancel invoice with real EBM API
export async function cancelInvoice(invoiceNumber, reason) {
  try {
    const authToken = await getAuthToken();
    
    const response = await fetch(`${EBM_API_URL}/invoices/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'API-Key': EBM_API_KEY
      },
      body: JSON.stringify({
        invoiceNumber: invoiceNumber,
        reason: reason
      })
    });
    
    if (!response.ok) {
      throw new Error('Cancellation failed');
    }
    
    const data = await response.json();
    
    return {
      success: true,
      cancelled: data.cancelled,
      invoiceNumber: invoiceNumber,
      reason: reason,
      message: data.message
    };
  } catch (error) {
    console.error('EBM Cancellation Error:', error);
    return {
      success: false,
      cancelled: false,
      error: error.message
    };
  }
}