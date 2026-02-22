import {createPopper, Instance} from "@popperjs/core";
import {IDropDownPopperOptions} from "./drop-down-popper-options";
import {makeObservable, observable, runInAction} from "mobx";


export class DropDownPopperModel {
    constructor(private readonly _options: IDropDownPopperOptions | undefined) {
        makeObservable<this, '_isReady'>(this, {
            _isReady: observable.ref
        })
    }

    private _popperInstance: Instance | null = null;
    private _resizeObserver: ResizeObserver | null = null;

    init(elementToAttach: HTMLElement, elementToShow: HTMLElement) {
        this._popperInstance = this._createPopperInstance(elementToAttach, elementToShow);
        this._resizeObserver = new ResizeObserver(() => {
            //This will prevent the ResizeObserver to enter in an infinite loop.
            //This might happen because _popperInstance.forceUpdate will change the size of the _elementToShow
            //which will trigger the ResizeObserver
            setTimeout(() => this._popperInstance?.forceUpdate());
        });
        this._resizeObserver.observe(elementToAttach);
        this._resizeObserver.observe(elementToShow);
    }



    private _isReady = false;
    get isReady(): boolean {
        return this._isReady;
    }

    private set isReady(value: boolean) {
        runInAction(() => {
            this._isReady = value;
        })
    }



    private _createPopperInstance(elementToAttach: HTMLElement, elementToShow: HTMLElement) {

        const sameWidthAsInput = this._options?.sameWidthAsElementToAttach ?? true;
        return createPopper(elementToAttach, elementToShow, {
            placement: this._options?.placement ?? 'bottom-start',
            strategy: "fixed",
            modifiers: [
                {
                    name: "sameWidthAsAttachedElement",
                    enabled: true,
                    fn: ({ state }) => {
                        const popperStyle = state.styles.popper
                        if(sameWidthAsInput) {
                            popperStyle.width = `${state.rects.reference.width}px`;
                        } else {
                            popperStyle.width = 'auto';
                        }

                        this.isReady = true;
                    },
                    phase: "beforeWrite",
                    requires: ["computeStyles"],
                }
            ]
        });
    }

    dispose(): void {
        this._popperInstance?.destroy();
        this._resizeObserver?.disconnect();
    }
}
