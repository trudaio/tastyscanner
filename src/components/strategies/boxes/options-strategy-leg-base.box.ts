import styled from "styled-components";

export const OptionsStrategyLegBaseBox = styled.div`
    display: grid;
    grid-template-columns: 30px 20px 1fr 1fr auto auto;
    gap: 8px;
    border-radius: 8px;
    padding: 4px 8px;
    text-align: center;
    font-size: 13px;

    @media (max-width: 480px) {
        gap: 6px;
        font-size: 12px;
        padding: 4px 6px;
    }
`