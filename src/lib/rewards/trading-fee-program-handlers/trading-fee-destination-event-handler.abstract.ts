import { RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { FeesGeneratedDto, TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { formatEth } from '@infinityxyz/lib/utils';

import { Phase } from '../phases/phase.abstract';
import { TradingFeeProgramEventHandler } from './trading-fee-program-event-handler.abstract';

export abstract class TradingFeeDestinationEventHandler extends TradingFeeProgramEventHandler {
  constructor(programVariant: TradingFeeProgram, protected readonly _feeDestinationVariant: TradingFeeDestination) {
    super(programVariant);
  }

  protected isReferralPayer(phase: Phase) {
    const isReferralsEnabled =
      phase.details.referralConfig && phase.details.referralConfig.percentageOfDestinationFees > 0;
    if (!isReferralsEnabled) {
      return false;
    }

    return phase.details.referralConfig?.destinationPayer === this._feeDestinationVariant;
  }

  protected getFeePercentage(phase: Phase, hasReferral: boolean) {
    const totalPercent = phase.details.split[this._feeDestinationVariant].percentage;
    let destinationPercent = totalPercent;
    let referralPercent = 0;
    if (hasReferral && this.isReferralPayer(phase)) {
      const referralPercentOfDestination = phase.details.referralConfig?.percentageOfDestinationFees ?? 0;
      const referralPortionOfDestination = referralPercentOfDestination / 100;
      referralPercent = referralPortionOfDestination * totalPercent;
      destinationPercent = totalPercent - referralPercent;
    }

    return {
      destinationPercent,
      referralPercent,
      totalPercent
    };
  }

  protected updateFeesGenerated(
    feesGeneratedBeforeSale: FeesGeneratedDto,
    sale: RewardSaleEvent,
    phase: Phase,
    referralFeesGeneratedBeforeSale: FeesGeneratedDto
  ): { eventFees: FeesGeneratedDto; eventDestinationFees: FeesGeneratedDto; eventReferralFees: FeesGeneratedDto } {
    const hasReferral = !!sale.referral && !!sale.referral.referrer;

    const { referralPercent, totalPercent } = this.getFeePercentage(phase, hasReferral);

    const getPercentOfWei = (wei: string, percent: number) => {
      const precision = 100000;
      return (BigInt(wei) * BigInt(percent * precision)) / BigInt(100 * precision);
    };

    const getFeesGeneratedDto = (weiAmount: bigint, ethPrice: number): FeesGeneratedDto => {
      const fees: FeesGeneratedDto = {
        feesGeneratedWei: weiAmount.toString(),
        feesGeneratedEth: formatEth(weiAmount),
        feesGeneratedUSDC: formatEth(weiAmount) * ethPrice
      };
      return fees;
    };

    const eventFeesWei = getPercentOfWei(sale.protocolFeeWei, totalPercent);
    const referralFeesWei = getPercentOfWei(sale.protocolFeeWei, referralPercent);
    const destinationFeesWei = eventFeesWei - referralFeesWei;
    if (destinationFeesWei < BigInt(0)) {
      throw new Error('Destination fees cannot be negative');
    }

    const referralFeesGeneratedWei = BigInt(referralFeesGeneratedBeforeSale.feesGeneratedWei) + referralFeesWei;
    const referralFeesGenerated = getFeesGeneratedDto(referralFeesGeneratedWei, sale.ethPrice);

    const destinationFeesGeneratedWei = BigInt(feesGeneratedBeforeSale.feesGeneratedWei) + destinationFeesWei;
    const destinationFeesGenerated = getFeesGeneratedDto(destinationFeesGeneratedWei, sale.ethPrice);

    feesGeneratedBeforeSale.feesGeneratedWei = destinationFeesGenerated.feesGeneratedWei;
    feesGeneratedBeforeSale.feesGeneratedEth = destinationFeesGenerated.feesGeneratedEth;
    feesGeneratedBeforeSale.feesGeneratedUSDC = destinationFeesGenerated.feesGeneratedUSDC;

    referralFeesGeneratedBeforeSale.feesGeneratedWei = referralFeesGenerated.feesGeneratedWei;
    referralFeesGeneratedBeforeSale.feesGeneratedEth = referralFeesGenerated.feesGeneratedEth;
    referralFeesGeneratedBeforeSale.feesGeneratedUSDC = referralFeesGenerated.feesGeneratedUSDC;

    return {
      eventFees: getFeesGeneratedDto(eventFeesWei, sale.ethPrice),
      eventDestinationFees: getFeesGeneratedDto(destinationFeesWei, sale.ethPrice),
      eventReferralFees: getFeesGeneratedDto(referralFeesWei, sale.ethPrice)
    };
  }
}
