import styled from "styled-components";

export const OptionsStrategyLegBaseBox = styled.div`
    display: grid;
    grid-template-columns: 30px 24px 1fr 1fr auto auto;
    gap: 16px;
    border-radius: 8px;
    padding: 4px 8px;
    text-align: center;

    @media (max-width: 480px) {
        gap: 8px;
        font-size: 13px;
    }
`