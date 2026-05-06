import React from 'react';
import styled from 'styled-components';
import type { IGradesConsensus } from '../../services/api-clients/fmp.client';
import { C, Card, CardTitle, CardTitleRow, CardSubTitle, Empty } from './analyst-insider-styled';

interface IProps {
    consensus: IGradesConsensus | null;
}

const SCALE = ['Strong Sell', 'Sell', 'Hold', 'Buy', 'Strong Buy'] as const;

const Badge = styled.span<{ $kind: 'buy' | 'hold' | 'sell' }>`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: ${(p) => p.$kind === 'buy' ? C.success : p.$kind === 'sell' ? C.danger : C.warning};
  color: #ffffff;
`;

const ScoreBox = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 800;
  background: ${C.successDeep};
  color: #ffffff;
  margin-left: 8px;
`;

const SliderTrack = styled.div`
  position: relative;
  height: 10px;
  background: ${C.bgRow};
  border-radius: 5px;
  margin: 18px 0 8px;
`;

const SliderFill = styled.div<{ $left: number; $width: number; $color: string }>`
  position: absolute;
  top: 0; bottom: 0;
  left: ${(p) => p.$left}%;
  width: ${(p) => p.$width}%;
  background: ${(p) => p.$color};
  border-radius: 5px;
`;

const SliderMarker = styled.div<{ $left: number }>`
  position: absolute;
  top: 50%;
  left: ${(p) => p.$left}%;
  transform: translate(-50%, -50%);
  width: 10px; height: 10px;
  background: ${C.text};
  border-radius: 50%;
  box-shadow: 0 0 0 2px ${C.bgCard};
`;

const Ticks = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-top: 6px;
`;

const Tick = styled.div`
  text-align: center;
  font-size: 10px;
  color: ${C.textDim};
  & > strong { display: block; color: ${C.text}; font-size: 12px; margin-bottom: 2px; }
`;

function scoreToPct(score: number): number {
    return ((score - 1) / 4) * 100;
}

function bucketFor(score: number): { color: string; label: 'buy' | 'hold' | 'sell' } {
    if (score >= 4) return { color: C.success, label: 'buy' };
    if (score >= 3) return { color: C.warning, label: 'hold' };
    return { color: C.danger, label: 'sell' };
}

export const WallStRatingsCard: React.FC<IProps> = ({ consensus }) => {
    if (!consensus) {
        return (
            <Card>
                <CardTitleRow><CardTitle>Wall St. Ratings</CardTitle></CardTitleRow>
                <Empty>No analyst coverage.</Empty>
            </Card>
        );
    }

    const total = consensus.strongBuy + consensus.buy + consensus.hold + consensus.sell + consensus.strongSell;
    const score = total > 0
        ? (5 * consensus.strongBuy + 4 * consensus.buy + 3 * consensus.hold + 2 * consensus.sell + 1 * consensus.strongSell) / total
        : null;

    const bucket = score != null ? bucketFor(score) : { color: C.warning, label: 'hold' as const };
    const pct = score != null ? scoreToPct(score) : 50;

    // Filled segment width: 20% of the bar centered on the score, clamped to track edges
    const segWidth = 20;
    const segLeft = Math.max(0, Math.min(100 - segWidth, pct - segWidth / 2));

    return (
        <Card>
            <CardTitleRow>
                <CardTitle>Wall St. Ratings</CardTitle>
                <div>
                    <Badge $kind={bucket.label}>{consensus.consensus}</Badge>
                    {score != null && <ScoreBox>{score.toFixed(2)}</ScoreBox>}
                </div>
            </CardTitleRow>
            <CardSubTitle>Average analyst rating</CardSubTitle>
            <SliderTrack>
                <SliderFill $left={segLeft} $width={segWidth} $color={bucket.color} />
                {score != null && <SliderMarker $left={pct} />}
            </SliderTrack>
            <Ticks>
                {SCALE.map((label, i) => (
                    <Tick key={label}>
                        <strong>{i + 1}</strong>
                        {label}
                    </Tick>
                ))}
            </Ticks>
        </Card>
    );
};
