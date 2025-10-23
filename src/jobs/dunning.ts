import { collections } from '../lib/firestore';
import subscriptionManager from '../services/subscriptionManager';
import invoiceService from '../services/invoiceService';
import logger from '../lib/logger';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Dunning job - Handle failed payment retries and grace period management
 * Runs on schedule: T+0, T+3, T+7
 */

const DUNNING_ATTEMPTS = [0, 3, 7]; // Days after initial failure
const GRACE_DAYS = parseInt(process.env.GRACE_DAYS || '7', 10);

interface DunningAttempt {
  subscriptionId: string;
  uid: string;
  invoiceId: string;
  attemptNumber: number;
  daysSinceFailure: number;
}

/**
 * Main dunning job function
 */
async function runDunningJob(): Promise<void> {
  logger.info('Starting dunning job');

  try {
    // Find all past_due subscriptions
    const pastDueSubscriptions = await findPastDueSubscriptions();

    logger.info(
      { count: pastDueSubscriptions.length },
      'Found past_due subscriptions'
    );

    const attempts: DunningAttempt[] = [];

    for (const subscription of pastDueSubscriptions) {
      const daysSinceFailure = calculateDaysSinceFailure(subscription);
      const attemptNumber = determineAttemptNumber(daysSinceFailure);

      if (attemptNumber !== null) {
        attempts.push({
          subscriptionId: subscription.id,
          uid: subscription.uid,
          invoiceId: subscription.metadata?.failedInvoiceId || 'unknown',
          attemptNumber,
          daysSinceFailure,
        });
      }
    }

    logger.info({ count: attempts.length }, 'Processing dunning attempts');

    // Process each attempt
    for (const attempt of attempts) {
      await processDunningAttempt(attempt);
    }

    // Check for expired grace periods
    await checkExpiredGracePeriods();

    logger.info('Dunning job completed successfully');
  } catch (error) {
    logger.error({ error }, 'Dunning job failed');
    throw error;
  }
}

/**
 * Find all subscriptions in past_due status
 */
async function findPastDueSubscriptions(): Promise<any[]> {
  const snapshot = await collections.subscriptions()
    .where('status', '==', 'past_due')
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Calculate days since the subscription entered past_due status
 */
function calculateDaysSinceFailure(subscription: any): number {
  const updatedAt = subscription.updatedAt?.toDate() || new Date();
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - updatedAt.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Determine which attempt number this corresponds to (T+0, T+3, T+7)
 */
function determineAttemptNumber(daysSinceFailure: number): number | null {
  // Check if we're at a dunning attempt milestone
  if (daysSinceFailure === 0 || daysSinceFailure === 1) return 0; // T+0
  if (daysSinceFailure === 3) return 1; // T+3
  if (daysSinceFailure === 7) return 2; // T+7
  return null; // Not a dunning day
}

/**
 * Process a dunning attempt
 */
async function processDunningAttempt(attempt: DunningAttempt): Promise<void> {
  logger.info(
    {
      subscriptionId: attempt.subscriptionId,
      attemptNumber: attempt.attemptNumber,
      daysSinceFailure: attempt.daysSinceFailure,
    },
    'Processing dunning attempt'
  );

  try {
    // Send reminder notification (mock)
    await sendDunningReminder(attempt);

    // Regenerate payment link for APMs (mock)
    await regeneratePaymentLink(attempt);

    // Log the attempt
    await collections.ledger().add({
      ts: new Date(),
      type: 'payment.failed',
      refId: attempt.subscriptionId,
      provider: 'stripe', // Assume stripe for dunning
      amount: 0,
      currency: 'USD',
      uid: attempt.uid,
      meta: {
        dunningAttempt: attempt.attemptNumber,
        daysSinceFailure: attempt.daysSinceFailure,
        invoiceId: attempt.invoiceId,
      },
    });

    // Update subscription manager
    await subscriptionManager.handleFailedRenewal(
      attempt.subscriptionId,
      attempt.attemptNumber
    );

    logger.info(
      { subscriptionId: attempt.subscriptionId },
      'Dunning attempt processed'
    );
  } catch (error) {
    logger.error(
      { error, subscriptionId: attempt.subscriptionId },
      'Failed to process dunning attempt'
    );
  }
}

/**
 * Send dunning reminder (MOCK)
 */
async function sendDunningReminder(attempt: DunningAttempt): Promise<void> {
  // In production, send email/SMS/push notification
  logger.info(
    { uid: attempt.uid, attemptNumber: attempt.attemptNumber },
    'Sending dunning reminder (MOCK)'
  );

  // Mock notification content based on attempt number
  const messages = [
    'Your payment has failed. Please update your payment method.',
    'Reminder: Your subscription payment is still pending. Update now to avoid service interruption.',
    'Final notice: Your subscription will be canceled if payment is not received.',
  ];

  const message = messages[attempt.attemptNumber] || messages[0];

  logger.info({ uid: attempt.uid, message }, 'Dunning reminder sent (MOCK)');
}

/**
 * Regenerate payment link for alternative payment methods (MOCK)
 */
async function regeneratePaymentLink(attempt: DunningAttempt): Promise<void> {
  // In production, generate a new payment link for the user
  logger.info(
    { subscriptionId: attempt.subscriptionId },
    'Regenerating payment link (MOCK)'
  );

  const paymentLink = `https://pay.example.com/retry/${attempt.subscriptionId}`;

  logger.info(
    { subscriptionId: attempt.subscriptionId, paymentLink },
    'Payment link regenerated (MOCK)'
  );
}

/**
 * Check for subscriptions with expired grace periods
 */
async function checkExpiredGracePeriods(): Promise<void> {
  logger.info('Checking for expired grace periods');

  try {
    await subscriptionManager.checkGracePeriodExpiry();
    logger.info('Grace period check completed');
  } catch (error) {
    logger.error({ error }, 'Failed to check grace periods');
  }
}

/**
 * Run the job if called directly
 */
if (require.main === module) {
  runDunningJob()
    .then(() => {
      logger.info('Dunning job finished');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Dunning job failed');
      process.exit(1);
    });
}

export { runDunningJob };
