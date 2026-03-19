import React, {useEffect, useRef, useState} from "react";
import ReactDOM from 'react-dom';
import {useServices} from "../hooks/use-services.hook";
import {observer} from "mobx-react";
import {reaction} from "mobx";
import styled from "styled-components";
import {ISearchTickerResultItem} from "../services/tickers/tickers.service.interface";
import {DropDownPopperModel} from "../models/popper/drop-down-popper.model";
import {isClickInsideElement} from "../utils/is-click-inside-element";
import {IonIcon} from "@ionic/react";
import {searchOutline} from "ionicons/icons";
import {InputBaseBox} from "./input-base.box";


const ComponentContainerBox = styled.div`
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    min-width: min(320px, 100%);
`

const SearchIconBox = styled.div`
    position: absolute;
    right: 14px;
    display: flex;
    align-items: center;
    color: var(--app-text-muted);
`



const DropDownContainerBox = styled.div<{$isOpen: boolean}>`
    display: ${props => props.$isOpen ? 'block' : 'none'};
    min-width: min(460px, calc(100vw - 32px));
    max-width: min(460px, calc(100vw - 32px));
    min-height: 150px;
    max-height: min(420px, 60vh);
    z-index: 1000;
    border: 1px solid var(--app-border-strong);
    background:
        radial-gradient(circle at top right, rgba(103, 168, 255, 0.12), transparent 32%),
        var(--app-panel-surface);
    box-shadow: var(--app-shadow);
    border-radius: 18px;
    padding: 10px;
    overflow-y: auto;
`

const SymbolBox = styled.div`
    font-weight: bold;
    color: var(--ion-color-primary);
`

const DropDownItemContainerBox = styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
    border-bottom: 1px solid rgba(162, 184, 219, 0.1);
    padding: 12px 14px;
    cursor: pointer;
    gap: 4px;
    color: var(--app-text-soft);
    border-radius: 12px;
    &:last-of-type {
        border-bottom: none;
    }
    
    &:hover {
        background: var(--app-hover-surface);
        color: var(--app-text);
        ${SymbolBox} {
            color: var(--ion-color-primary);
        }
        
    }
`

const DropDownInputBox = styled(InputBaseBox)`
    width: min(320px, calc(100vw - 80px));
    min-height: 48px;
    padding: 11px 44px 11px 14px;
    border-radius: 14px;
    border: 1px solid var(--app-border);
    background: var(--app-surface-1);
    color: var(--app-text);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);

    &::placeholder {
        color: var(--app-text-muted);
    }

    &:focus {
        border-color: rgba(103, 168, 255, 0.45);
        box-shadow: 0 0 0 4px rgba(103, 168, 255, 0.12);
    }
`


interface DropDownItemComponentProps {
    item: ISearchTickerResultItem;
    onSelected: (item: ISearchTickerResultItem) => void;
}
const DropDownItemComponent: React.FC<DropDownItemComponentProps> = observer((props) => {
    const onClickHandle = () => {
        props.onSelected(props.item);
    }
    return (
        <DropDownItemContainerBox onClick={onClickHandle}>
            <SymbolBox>{props.item.symbol}</SymbolBox>
            <div>{props.item.description}</div>
        </DropDownItemContainerBox>
    )
})

export const SymbolSearchDropDownComponent: React.FC = observer(() => {
    const services = useServices();
    const [query, setQuery] = useState(services.tickers.currentTicker?.symbol ?? "");
    const [results, setResults] = useState<ISearchTickerResultItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropDownPopperModelRef = useRef(new DropDownPopperModel({
        sameWidthAsElementToAttach: false
    }));
    const dropDownContainerRef = useRef<HTMLDivElement | null>(null);
    const inputElementRef = useRef<HTMLInputElement>(null);
    const tickerSearchDebounceTimerRef = useRef<any>(null);

    useEffect(() => {
        const r = reaction(() => services.tickers.currentTicker, () => {
            setQuery(services.tickers.currentTicker?.symbol ?? "");
        });
        return () => r();
    }, [services.tickers.currentTicker]);

    useEffect(() => {
        const dropDownModel = dropDownPopperModelRef.current;
        if(dropDownContainerRef.current && inputElementRef.current && !dropDownModel.isReady) {
            dropDownModel.init(inputElementRef.current, dropDownContainerRef.current);
        }

        const onDocumentClickHandler = (event: MouseEvent) => {
            if(dropDownContainerRef.current && inputElementRef.current) {
                if(!isClickInsideElement(event, dropDownContainerRef.current)
                    && !isClickInsideElement(event, inputElementRef.current)) {
                    setIsOpen(false);
                }
            }
        }

        document.addEventListener('click', onDocumentClickHandler);

        return (() => {
            if(dropDownModel.isReady) {
                dropDownModel.dispose();
            }

            document.removeEventListener('click', onDocumentClickHandler);
            if(tickerSearchDebounceTimerRef.current) {
                clearTimeout(tickerSearchDebounceTimerRef.current);
            }
        });
    }, []);

    const search = async (query: string) => {
        if(tickerSearchDebounceTimerRef.current) {
            clearTimeout(tickerSearchDebounceTimerRef.current);
        }

        tickerSearchDebounceTimerRef.current = setTimeout(async () => {
            const result = await services.tickers.searchTicker(query);
            setResults(result);
        }, 200);

    }

    const onChange = async (q: string) => {
        setQuery(q);
        setIsOpen(true);
        await search(q);

    }

    const onFocus = async () => {
        inputElementRef.current?.select();
        setIsOpen(true);
        await search(query);
    }

    const onItemSelected = async (item: ISearchTickerResultItem) => {
        setIsOpen(false);
        await services.tickers.setCurrentTicker(item.symbol);
    }
    const renderDropDown = () => {
        return ReactDOM.createPortal((
            <DropDownContainerBox ref={dropDownContainerRef} $isOpen={isOpen}>
                {results.map((item) => (<DropDownItemComponent key={item.symbol} item={item} onSelected={onItemSelected}/>))}
            </DropDownContainerBox>
        ), document.body)
    }

    return (
        <ComponentContainerBox>
            <DropDownInputBox
                ref={inputElementRef}
                value={query}
                placeholder="Cauta SPY, QQQ, AAPL..."
                onChange={(e) => onChange(e.target.value ?? "")}
                onFocus={onFocus}
            />
            <SearchIconBox>
                <IonIcon icon={searchOutline}/>
            </SearchIconBox>
            {renderDropDown()}
        </ComponentContainerBox>
    )


})
