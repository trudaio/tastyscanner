import styled from "styled-components";

export const InputBaseBox = styled.input`
    padding: 8px;
    border-radius: 8px;
    border: 1px solid var(--ion-color-light-shade);
    outline: none;
    &:focus {
        border-color: var(--ion-color-medium);
    }
`