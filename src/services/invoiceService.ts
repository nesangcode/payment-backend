import { Invoice, InvoiceStatus, InvoiceLine, Provider, Currency } from '../types';
import { collections } from '../lib/firestore';
import logger from '../lib/logger';

export class InvoiceService {
  /**
   * Create a new invoice
   */
  async createInvoice(data: {
    uid: string;
    provider: Provider;
    amount: number;
    currency: Currency;
    lines: InvoiceLine[];
    subscriptionId?: string;
    tax?: number;
  }): Promise<Invoice> {
    try {
      const invoiceId = `inv_${Date.now()}_${data.uid}`;

      // Calculate tax if not provided (Indonesian PPN 11% for IDR)
      let tax = data.tax || 0;
      if (!data.tax && data.currency === 'IDR') {
        const ppnRate = parseFloat(process.env.INDONESIA_PPN_RATE || '0.11');
        tax = data.amount * ppnRate;
      }

      const invoice: Invoice = {
        id: invoiceId,
        uid: data.uid,
        provider: data.provider,
        amount: data.amount,
        currency: data.currency,
        tax,
        lines: data.lines,
        status: 'open',
        subscriptionId: data.subscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await collections.invoices().doc(invoiceId).set(invoice);

      // Write to ledger
      await collections.ledger().add({
        ts: new Date(),
        type: 'invoice.created',
        refId: invoiceId,
        provider: data.provider,
        amount: data.amount,
        currency: data.currency,
        uid: data.uid,
        meta: { invoiceId, subscriptionId: data.subscriptionId },
      });

      logger.info({ invoiceId, uid: data.uid }, 'Invoice created');
      return invoice;
    } catch (error) {
      logger.error({ error, data }, 'Failed to create invoice');
      throw error;
    }
  }

  /**
   * Update invoice status
   */
  async updateInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<void> {
    try {
      await collections.invoices().doc(invoiceId).update({
        status,
        updatedAt: new Date(),
      });

      logger.info({ invoiceId, status }, 'Invoice status updated');
    } catch (error) {
      logger.error({ error, invoiceId, status }, 'Failed to update invoice status');
      throw error;
    }
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    try {
      const doc = await collections.invoices().doc(invoiceId).get();
      return doc.exists ? (doc.data() as Invoice) : null;
    } catch (error) {
      logger.error({ error, invoiceId }, 'Failed to get invoice');
      throw error;
    }
  }

  /**
   * Get invoices for a user
   */
  async getUserInvoices(uid: string, limit = 10): Promise<Invoice[]> {
    try {
      const snapshot = await collections.invoices()
        .where('uid', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => doc.data() as Invoice);
    } catch (error) {
      logger.error({ error, uid }, 'Failed to get user invoices');
      throw error;
    }
  }

  /**
   * Mark invoice as paid
   */
  async markAsPaid(invoiceId: string, hostedInvoiceUrl?: string): Promise<void> {
    try {
      const updateData: any = {
        status: 'paid',
        updatedAt: new Date(),
      };

      if (hostedInvoiceUrl) {
        updateData.hostedInvoiceUrl = hostedInvoiceUrl;
      }

      await collections.invoices().doc(invoiceId).update(updateData);

      logger.info({ invoiceId }, 'Invoice marked as paid');
    } catch (error) {
      logger.error({ error, invoiceId }, 'Failed to mark invoice as paid');
      throw error;
    }
  }

  /**
   * Mark invoice as void
   */
  async markAsVoid(invoiceId: string): Promise<void> {
    try {
      await collections.invoices().doc(invoiceId).update({
        status: 'void',
        updatedAt: new Date(),
      });

      logger.info({ invoiceId }, 'Invoice marked as void');
    } catch (error) {
      logger.error({ error, invoiceId }, 'Failed to mark invoice as void');
      throw error;
    }
  }

  /**
   * Mark invoice as uncollectible
   */
  async markAsUncollectible(invoiceId: string): Promise<void> {
    try {
      await collections.invoices().doc(invoiceId).update({
        status: 'uncollectible',
        updatedAt: new Date(),
      });

      logger.info({ invoiceId }, 'Invoice marked as uncollectible');
    } catch (error) {
      logger.error({ error, invoiceId }, 'Failed to mark invoice as uncollectible');
      throw error;
    }
  }

  /**
   * Get unpaid invoices for dunning
   */
  async getUnpaidInvoices(): Promise<Invoice[]> {
    try {
      const snapshot = await collections.invoices()
        .where('status', '==', 'open')
        .get();

      return snapshot.docs.map((doc) => doc.data() as Invoice);
    } catch (error) {
      logger.error({ error }, 'Failed to get unpaid invoices');
      throw error;
    }
  }

  /**
   * Add proration credit to next invoice
   */
  async applyProrationCredit(
    uid: string,
    subscriptionId: string,
    creditAmount: number
  ): Promise<void> {
    try {
      // Find the next open invoice for this subscription
      const snapshot = await collections.invoices()
        .where('uid', '==', uid)
        .where('subscriptionId', '==', subscriptionId)
        .where('status', '==', 'open')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        logger.warn({ uid, subscriptionId }, 'No open invoice found to apply proration credit');
        return;
      }

      const invoiceDoc = snapshot.docs[0];
      const invoice = invoiceDoc.data() as Invoice;

      // Add credit line
      const updatedLines = [
        ...invoice.lines,
        {
          description: 'Proration credit',
          amount: -creditAmount,
        },
      ];

      const newAmount = invoice.amount - creditAmount;

      await collections.invoices().doc(invoiceDoc.id).update({
        lines: updatedLines,
        amount: Math.max(0, newAmount),
        updatedAt: new Date(),
      });

      logger.info({ invoiceId: invoiceDoc.id, creditAmount }, 'Proration credit applied');
    } catch (error) {
      logger.error({ error, uid, subscriptionId }, 'Failed to apply proration credit');
      throw error;
    }
  }
}

export default new InvoiceService();
