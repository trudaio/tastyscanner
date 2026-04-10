import React, {useState} from "react";
import {observer} from "mobx-react-lite";
import styled, {css} from "styled-components";
import {IOptionsStrategyViewModel} from "../../models/options-strategy.view-model.interface";
import {IonButton, IonSpinner} from "@ionic/react";


const StrategyFooterBox = styled.div`
    display: grid;
    grid-template-columns: auto 1fr auto 1fr;
    row-gap: 6px;
    column-gap: 8px;
    font-weight: bold;
    font-size: 13px;

    @media (max-width: 480px) {
        grid-template-columns: auto 1fr;
        column-gap: 6px;
        font-size: 12px;
    }
`

const ButtonBox = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    width: 100%;
    grid-column: 1 / -1;
`

const GuvidButton = styled.button<{ $saving?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(155, 89, 255, 0.15);
    border: 1.5px solid #9b59ff;
    border-radius: 6px;
    color: #9b59ff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: rgba(155, 89, 255, 0.3);
        box-shadow: 0 0 12px rgba(155, 89, 255, 0.3);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    img {
        width: 20px;
        height: 20px;
        border-radius: 50%;
    }
`

const EvValueBox = styled.span<{ $positive: boolean }>`
    ${props => props.$positive
        ? css`color: var(--ion-color-success);`
        : css`color: var(--ion-color-danger);`
    }
`

const AlphaValueBox = styled.span<{ $positive: boolean }>`
    ${props => props.$positive
        ? css`color: var(--ion-color-success);`
        : css`color: var(--ion-color-danger);`
    }
`

export const OptionsStrategyFooterComponent: React.FC<{
    strategy: IOptionsStrategyViewModel;
    onOpenTradeDialog: () => void;
    onGuvidChallenge?: (strategy: IOptionsStrategyViewModel) => Promise<void>;
}> = observer((props) => {
    const { strategy } = props;
    const evPositive = strategy.expectedValue >= 0;
    const alphaPositive = strategy.alpha >= 0;
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleGuvidChallenge = async () => {
        if (!props.onGuvidChallenge || saving || saved) return;
        setSaving(true);
        try {
            await props.onGuvidChallenge(strategy);
            setSaved(true);
        } catch (e) {
            console.error('[GuvidChallenge] Error:', e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <StrategyFooterBox>
            <span>Risk/Reward:</span>
            <span>{strategy.riskRewardRatio}</span>
            <span>POP:</span>
            <span>{`${strategy.pop}%`}</span>
            <span>BPE:</span>
            <span>{`$${strategy.maxLoss.toFixed(0)}`}</span>
            <span>Credit:</span>
            <span>{`${strategy.credit.toFixed(2)}$`}</span>
            <span>EV:</span>
            <EvValueBox $positive={evPositive}>
                {`${evPositive ? '+' : ''}${strategy.expectedValue.toFixed(2)}$`}
            </EvValueBox>
            <span>Alpha:</span>
            <AlphaValueBox $positive={alphaPositive}>
                {`${alphaPositive ? '+' : ''}${strategy.alpha.toFixed(2)}%`}
            </AlphaValueBox>
            <span>Delta:</span>
            <span>{strategy.delta}</span>
            <span>Theta:</span>
            <span>{strategy.theta}</span>
            <ButtonBox>
                {props.onGuvidChallenge && (
                    <GuvidButton onClick={handleGuvidChallenge} disabled={saving || saved}>
                        {saving ? (
                            <IonSpinner name="crescent" style={{ width: 16, height: 16 }} />
                        ) : (
                            <img src="/logo-guvidul.svg" alt="Guvid" />
                        )}
                        {saved ? 'Salvat' : 'Challenge'}
                    </GuvidButton>
                )}
                <IonButton color={"success"} onClick={() => props.onOpenTradeDialog()}>
                    Trade
                </IonButton>
            </ButtonBox>
        </StrategyFooterBox>
    )
})