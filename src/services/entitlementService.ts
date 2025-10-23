import { Entitlement, EntitlementFeatures } from '../types';
import { collections } from '../lib/firestore';
import logger from '../lib/logger';

export class EntitlementService {
  /**
   * Get user's entitlements
   */
  async getEntitlements(uid: string): Promise<Entitlement | null> {
    try {
      const doc = await collections.entitlements().doc(uid).get();
      return doc.exists ? (doc.data() as Entitlement) : null;
    } catch (error) {
      logger.error({ error, uid }, 'Failed to get entitlements');
      throw error;
    }
  }

  /**
   * Update user's entitlements
   */
  async updateEntitlements(
    uid: string,
    features: Partial<EntitlementFeatures>
  ): Promise<void> {
    try {
      const existing = await this.getEntitlements(uid);

      const updatedFeatures: EntitlementFeatures = {
        groupReplay: features.groupReplay ?? existing?.features.groupReplay ?? false,
        oneToOne: features.oneToOne ?? existing?.features.oneToOne ?? false,
        androidNoReplay: features.androidNoReplay ?? existing?.features.androidNoReplay,
      };

      await collections.entitlements().doc(uid).set({
        uid,
        features: updatedFeatures,
        updatedAt: new Date(),
      });

      logger.info({ uid, features: updatedFeatures }, 'Entitlements updated');
    } catch (error) {
      logger.error({ error, uid, features }, 'Failed to update entitlements');
      throw error;
    }
  }

  /**
   * Revoke all entitlements
   */
  async revokeAllEntitlements(uid: string): Promise<void> {
    try {
      await collections.entitlements().doc(uid).set({
        uid,
        features: {
          groupReplay: false,
          oneToOne: false,
        },
        updatedAt: new Date(),
      });

      logger.info({ uid }, 'All entitlements revoked');
    } catch (error) {
      logger.error({ error, uid }, 'Failed to revoke entitlements');
      throw error;
    }
  }

  /**
   * Check if user has specific feature
   */
  async hasFeature(uid: string, feature: keyof EntitlementFeatures): Promise<boolean> {
    try {
      const entitlements = await this.getEntitlements(uid);
      return entitlements?.features[feature] ?? false;
    } catch (error) {
      logger.error({ error, uid, feature }, 'Failed to check feature');
      return false;
    }
  }

  /**
   * Grant feature to user
   */
  async grantFeature(uid: string, feature: keyof EntitlementFeatures): Promise<void> {
    try {
      await this.updateEntitlements(uid, { [feature]: true });
      logger.info({ uid, feature }, 'Feature granted');
    } catch (error) {
      logger.error({ error, uid, feature }, 'Failed to grant feature');
      throw error;
    }
  }

  /**
   * Revoke feature from user
   */
  async revokeFeature(uid: string, feature: keyof EntitlementFeatures): Promise<void> {
    try {
      await this.updateEntitlements(uid, { [feature]: false });
      logger.info({ uid, feature }, 'Feature revoked');
    } catch (error) {
      logger.error({ error, uid, feature }, 'Failed to revoke feature');
      throw error;
    }
  }
}

export default new EntitlementService();
