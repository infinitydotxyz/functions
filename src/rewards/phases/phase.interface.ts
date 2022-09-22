import { TokenomicsPhase } from "../../tokenomics/types";


export interface Phase {
    isActive: boolean;

    toJSON(): TokenomicsPhase;
}