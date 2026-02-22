import {Check} from "./type-checking";

export function setElementFocus(element: any): void {
    if(!element) {
        return;
    }

    if(Check.isFunction(element.getInputElement)) {
        setTimeout(() => {
            element.getInputElement()?.then((el: any) => {
                el?.focus()
            })
        }, 350);

    } else if(Check.isFunction(element.focus)) {
        setTimeout(() => element.focus(), 350);
    }
}
