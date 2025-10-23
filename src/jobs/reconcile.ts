import { collections } from '../lib/firestore';
import logger from '../lib/logger';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Reconciliation job - Compare ledger entries with payment provider records
 * Runs daily to ensure data consistency
 */

interface ReconciliationResult {
  provider: string;
  ledgerTotal: number;
  providerTotal: number;
  difference: number;
  matched: boolean;
  mismatches: any[];
}

/**
 * Main reconciliation job function
 */
async function runReconcileJob(): Promise<void> {
  logger.info('Starting reconciliation job');

  try {
    const startDate = getStartDate();
    const endDate = new Date();

    logger.info(
      { startDate, endDate },
      'Reconciling transactions for date range'
    );

    // Reconcile each provider
    const results: ReconciliationResult[] = [];

    results.push(await reconcileProvider('stripe', startDate, endDate));
    results.push(await reconcileProvider('iap', startDate, endDate));
    results.push(await reconcileProvider('wise', startDate, endDate));

    // Log results
    for (const result of results) {
      if (!result.matched) {
        logger.error(
          {
            provider: result.provider,
            difference: result.difference,
            mismatches: result.mismatches,
          },
          'Reconciliation mismatch detected'
        );

        // Write mismatch alert to ledger
        await collections.ledger().add({
          ts: new Date(),
          type: 'payment.failed' as any,
          refId: `reconcile_${result.provider}_${Date.now()}`,
          provider: result.provider as any,
          amount: result.difference,
          currency: 'USD',
          meta: {
            type: 'reconciliation_mismatch',
            ledgerTotal: result.ledgerTotal,
            providerTotal: result.providerTotal,
            mismatches: result.mismatches,
          },
        });
      } else {
        logger.info(
          { provider: result.provider },
          'Reconciliation successful - no mismatches'
        );
      }
    }

    logger.info('Reconciliation job completed successfully');
  } catch (error) {
    logger.error({ error }, 'Reconciliation job failed');
    throw error;
  }
}

/**
 * Reconcile transactions for a specific provider
 */
async function reconcileProvider(
  provider: string,
  startDate: Date,
  endDate: Date
): Promise<ReconciliationResult> {
  logger.info({ provider }, 'Reconciling provider');

  try {
    // Get ledger totals
    const ledgerTotal = await getLedgerTotal(provider, startDate, endDate);

    // Get provider totals (MOCK - in production, call provider API)
    const providerTotal = await getProviderTotal(provider, startDate, endDate);

    const difference = Math.abs(ledgerTotal - providerTotal);
    const matched = difference < 0.01; // Allow for rounding errors

    const mismatches: any[] = [];
    if (!matched) {
      mismatches.push({
        reason: 'Total mismatch',
        ledgerTotal,
        providerTotal,
        difference,
      });
    }

    return {
      provider,
      ledgerTotal,
      providerTotal,
      difference,
      matched,
      mismatches,
    };
  } catch (error) {
    logger.error({ error, provider }, 'Failed to reconcile provider');
    return {
      provider,
      ledgerTotal: 0,
      providerTotal: 0,
      difference: 0,
      matched: false,
      mismatches: [{ reason: 'Reconciliation error', error }],
    };
  }
}

/**
 * Get total amount from ledger for a provider and date range
 */
async function getLedgerTotal(
  provider: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const snapshot = await collections.ledger()
    .where('provider', '==', provider)
    .where('ts', '>=', startDate)
    .where('ts', '<=', endDate)
    .where('type', 'in', ['payment.succeeded', 'refund.succeeded', 'payout.paid'])
    .get();

  let total = 0;
  for (const doc of snapshot.docs) {
    const entry = doc.data();
    if (entry.type === 'refund.succeeded') {
      total -= entry.amount; // Subtract refunds
    } else {
      total += entry.amount;
    }
  }

  return total;
}

/**
 * Get total amount from provider API (MOCK)
 */
async function getProviderTotal(
  provider: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  // MOCK implementation
  // In production, call provider APIs:
  // - Stripe: List balance transactions
  // - IAP: Apple/Google reporting APIs
  // - Wise: List transfers

  logger.info({ provider }, 'Getting provider total (MOCK)');

  // For demo purposes, return the same as ledger total (no mismatch)
  return await getLedgerTotal(provider, startDate, endDate);
}

/**
 * Get start date for reconciliation (previous day)
 */
function getStartDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Get detailed transaction mismatches (for debugging)
 */
async function getTransactionMismatches(
  provider: string,
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  // In production, compare individual transactions
  // Return list of transactions that don't match between ledger and provider

  logger.info({ provider }, 'Getting transaction mismatches (MOCK)');
  return [];
}

/**
 * Generate reconciliation report
 */
async function generateReconciliationReport(
  results: ReconciliationResult[]
): Promise<string> {
  const timestamp = new Date().toISOString();
  let report = `Reconciliation Report - ${timestamp}\n`;
  report += '='.repeat(50) + '\n\n';

  for (const result of results) {
    report += `Provider: ${result.provider}\n`;
    report += `Ledger Total: $${result.ledgerTotal.toFixed(2)}\n`;
    report += `Provider Total: $${result.providerTotal.toFixed(2)}\n`;
    report += `Difference: $${result.difference.toFixed(2)}\n`;
    report += `Status: ${result.matched ? '✓ MATCHED' : '✗ MISMATCH'}\n`;

    if (result.mismatches.length > 0) {
      report += `Mismatches:\n`;
      for (const mismatch of result.mismatches) {
        report += `  - ${JSON.stringify(mismatch)}\n`;
      }
    }

    report += '\n';
  }

  return report;
}

/**
 * Run the job if called directly
 */
if (require.main === module) {
  runReconcileJob()
    .then(() => {
      logger.info('Reconciliation job finished');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Reconciliation job failed');
      process.exit(1);
    });
}

export { runReconcileJob };
