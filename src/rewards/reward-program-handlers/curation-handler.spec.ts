import { RewardEvent, RewardProgram } from "@infinityxyz/lib/types/core";
import { RewardPhase } from "../reward-phase";
import { getMockRewardPhaseConfig } from "../reward-phase.spec";
import { CurationHandler } from "./curation-handler";

class MockCurationHandler extends CurationHandler {
    testIsApplicable(event: RewardEvent, phase: RewardPhase): boolean {
        return this._isApplicable(event, phase);
    }
}

describe('CurationHandler', () => {
    it('should return applicable if the phase has curation enabled', () => {
        const phaseConfig = getMockRewardPhaseConfig(100, 0);
        phaseConfig[RewardProgram.Curation] = true;
        const phase = new RewardPhase(phaseConfig);

        const handler = new MockCurationHandler();
        const isApplicable = handler.testIsApplicable({} as any, phase)
        expect(isApplicable).toBe(true);
    });

    it('should return not applicable if the phase does not have curation enabled', () => {
        const phaseConfig = getMockRewardPhaseConfig(100, 0);
        phaseConfig[RewardProgram.Curation] = false;
        const phase = new RewardPhase(phaseConfig);

        const handler = new MockCurationHandler();
        const isApplicable = handler.testIsApplicable({} as any, phase)
        expect(isApplicable).toBe(false);
    })
});