import { describe, it, expect } from 'vitest';
import { IronCondorModel } from './iron-condor.model';

// Minimal mock of OptionModel — just enough for the getters under test.
function mockOption(delta: number, theta: number, gamma: number, vega: number, iv: number) {
    return {
        greeksData: { delta, theta, gamma, vega, iv },
        get delta() { return delta; },
        get theta() { return theta; },
        get gamma() { return gamma; },
        get vega() { return vega; },
        get iv() { return iv; },
    } as unknown as import('./option.model').OptionModel;
}

describe('IronCondorModel net Greeks', () => {
    // Realistic short-IC entry Greeks (raw option data from streamer):
    //   - All raw thetas are NEGATIVE (options decay; standard convention)
    //   - Raw gammas and vegas are POSITIVE for all options
    //   - Short legs (stoPut/stoCall) have LARGER magnitude theta/gamma/vega than long legs
    //
    // Position-perspective net Greeks for short IC:
    //   Formula: btoPut.X + btoCall.X - stoPut.X - stoCall.X (long legs keep sign; short legs flip)
    //   Expected: netDelta≈0, netTheta>0 (collecting), netGamma<0 (short gamma), netVega<0 (short vega)

    const btoPut  = mockOption(-0.05, -0.02, 0.0010, 0.05, 0.18);  // 5Δ long put
    const stoPut  = mockOption(-0.16, -0.08, 0.0030, 0.12, 0.20);  // 16Δ short put
    const stoCall = mockOption(+0.16, -0.08, 0.0030, 0.12, 0.22);  // 16Δ short call
    const btoCall = mockOption(+0.05, -0.02, 0.0010, 0.05, 0.19);  // 5Δ long call

    const ic = new IronCondorModel(10, btoPut, stoPut, stoCall, btoCall, {} as never);

    it('netDelta is 0 for a symmetric IC', () => {
        // -0.05 + 0.05 - (-0.16) - (+0.16) = 0
        expect(ic.netDelta).toBeCloseTo(0, 10);
    });

    it('netTheta is positive for short IC (theta collected)', () => {
        // -0.02 + (-0.02) - (-0.08) - (-0.08) = -0.04 + 0.16 = +0.12
        expect(ic.netTheta).toBeCloseTo(0.12, 4);
    });

    it('netGamma is negative for short IC (short gamma)', () => {
        // 0.0010 + 0.0010 - 0.0030 - 0.0030 = -0.0040
        expect(ic.netGamma).toBeCloseTo(-0.0040, 6);
    });

    it('netVega is negative for short IC (short vega)', () => {
        // 0.05 + 0.05 - 0.12 - 0.12 = -0.14
        expect(ic.netVega).toBeCloseTo(-0.14, 4);
    });

    it('avgShortIV is mean of stoPut.iv and stoCall.iv', () => {
        // (0.20 + 0.22) / 2 = 0.21
        expect(ic.avgShortIV).toBeCloseTo(0.21, 4);
    });
});
