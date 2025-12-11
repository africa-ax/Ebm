/**
 * EBM Mock System for Rwanda Commerce
 * Simulates the Rwanda Revenue Authority EBM (Electronic Billing Machine) System
 * 
 * This mock generates fiscal invoices with:
 * - Unique invoice IDs
 * - QR codes for verification
 * - EBM compliance fields
 * - Tax calculations
 */

window.ebmMock = {
    /**
     * Generate a mock EBM invoice
     * @param {Object} data - Invoice data
     * @returns {Object} - Mock EBM invoice
     */
    generateInvoice: function(data) {
        const invoiceId = this.generateInvoiceId();
        const timestamp = data.timestamp || new Date();
        
        // Calculate taxes
        const taxBreakdown = this.calculateTaxes(data.items);
        
        // Generate QR code data (base64 mock)
        const qrData = this.generateQRCode({
            invoiceId,
            sellerTIN: data.sellerTIN,
            totalAmount: data.totalAmount,
            timestamp
        });
        
        // Create EBM-compliant invoice
        const invoice = {
            // EBM System Fields
            invoiceId: invoiceId,
            ebmStatus: 'MockIssued',
            ebmSignature: this.generateEBMSignature(invoiceId),
            qrCode: qrData,
            fiscalCounter: this.generateFiscalCounter(),
            
            // Seller Information
            seller: {
                name: data.sellerName,
                tin: data.sellerTIN,
                address: data.sellerAddress || 'Kigali, Rwanda',
                phone: data.sellerPhone || 'N/A'
            },
            
            // Buyer Information
            buyer: {
                name: data.buyerName,
                tin: data.buyerTIN || 'N/A',
                address: data.buyerAddress || 'N/A',
                phone: data.buyerPhone || 'N/A'
            },
            
            // Invoice Details
            items: data.items.map(item => ({
                ...item,
                taxType: item.taxType || 'A',
                vatRate: item.vatRate || 18,
                vatAmount: this.calculateVAT(item.total, item.vatRate || 18)
            })),
            
            // Financial Summary
            subtotal: data.totalAmount,
            taxBreakdown: taxBreakdown,
            totalVAT: taxBreakdown.totalVAT,
            totalAmount: data.totalAmount,
            grossTotal: data.totalAmount,
            
            // Timestamps
            dateIssued: timestamp.toISOString(),
            dateRecorded: new Date().toISOString(),
            
            // Compliance
            invoiceType: 'SALES',
            currency: 'RWF',
            paymentMethod: data.paymentMethod || 'CASH',
            ebmVersion: '2.0.0',
            
            // Metadata
            generatedBy: 'Rwanda Commerce EBM Mock',
            mockSystem: true
        };
        
        return invoice;
    },
    
    /**
     * Generate unique invoice ID (EBM format)
     */
    generateInvoiceId: function() {
        const prefix = 'EBM';
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `${prefix}-${timestamp}${random}`;
    },
    
    /**
     * Generate EBM signature (mock)
     */
    generateEBMSignature: function(invoiceId) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let signature = 'EBM_';
        for (let i = 0; i < 32; i++) {
            signature += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return signature;
    },
    
    /**
     * Generate fiscal counter (sequential number)
     */
    generateFiscalCounter: function() {
        // In real EBM, this is a sequential counter per device
        return Math.floor(Math.random() * 999999) + 100000;
    },
    
    /**
     * Generate QR code data (base64 encoded mock)
     */
    generateQRCode: function(data) {
        // In real EBM, this would be actual QR code image
        const qrString = `INV:${data.invoiceId}|TIN:${data.sellerTIN}|AMT:${data.totalAmount}|DATE:${data.timestamp.toISOString()}`;
        // Mock base64 encoding
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    
    /**
     * Calculate taxes for all items
     */
    calculateTaxes: function(items) {
        let totalVAT = 0;
        let vat18 = 0;
        let vat0 = 0;
        let exempt = 0;
        
        items.forEach(item => {
            const vatRate = item.vatRate || 18;
            const vatAmount = this.calculateVAT(item.total, vatRate);
            
            totalVAT += vatAmount;
            
            if (vatRate === 18) {
                vat18 += vatAmount;
            } else if (vatRate === 0) {
                vat0 += vatAmount;
            } else {
                exempt += item.total;
            }
        });
        
        return {
            totalVAT: totalVAT,
            vat18: vat18,
            vat0: vat0,
            exempt: exempt
        };
    },
    
    /**
     * Calculate VAT amount
     */
    calculateVAT: function(amount, rate) {
        if (rate === 0 || rate === 'exempt') return 0;
        // VAT is typically calculated as: amount * (rate / (100 + rate))
        // For 18% VAT: amount * (18/118)
        return amount * (rate / (100 + rate));
    },
    
    /**
     * Verify invoice (mock verification)
     */
    verifyInvoice: function(invoiceId) {
        return {
            valid: true,
            status: 'Verified',
            message: 'Invoice verified successfully (Mock)',
            invoiceId: invoiceId,
            verifiedAt: new Date().toISOString()
        };
    },
    
    /**
     * Cancel invoice (mock cancellation)
     */
    cancelInvoice: function(invoiceId, reason) {
        return {
            success: true,
            message: 'Invoice cancelled successfully (Mock)',
            invoiceId: invoiceId,
            reason: reason,
            cancelledAt: new Date().toISOString()
        };
    },
    
    /**
     * Get daily sales report (mock)
     */
    getDailySalesReport: function(date) {
        return {
            date: date || new Date().toISOString().split('T')[0],
            totalSales: Math.floor(Math.random() * 1000000) + 100000,
            totalInvoices: Math.floor(Math.random() * 100) + 10,
            totalVAT: Math.floor(Math.random() * 180000) + 18000,
            status: 'Mock Report'
        };
    }
};

// Log initialization
console.log('✅ EBM Mock System initialized');
console.log('📋 Available methods: generateInvoice, verifyInvoice, cancelInvoice, getDailySalesReport');