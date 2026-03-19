import React from 'react';
import './ExploreContainer.css';
import styled from "styled-components";
import { observer } from "mobx-react-lite";
import { TickerOptionsStrategiesComponent } from "./strategies/ticker-options-strategies.component";

const ContainerBox = styled.div`
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px;

    @media (max-width: 720px) {
        padding: 16px;
    }
`;

const ExploreContainer: React.FC = observer(() => {
    return (
        <ContainerBox>
            <TickerOptionsStrategiesComponent />
        </ContainerBox>
    );
});

export default ExploreContainer;
