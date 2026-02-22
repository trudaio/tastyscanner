import {Check} from "./type-checking";


export function scrollElementIntoViewSmooth(element: any, options?: ScrollIntoViewOptions): void {
    if(!Check.isFunction(element?.scrollIntoView)) {
        return;
    }

    options = {
        behavior: "smooth",
        block: "center",
        inline: "nearest",
        ...options
    };
    element.scrollIntoView(options);

}


export function scrollElementIntoViewLazySmooth(element: any, options?: ScrollIntoViewOptions, millisecondsDelay?: number) {
    if(!element) {
        return undefined;
    }

    return setTimeout(() => {
        if(element.current) {
            scrollElementIntoViewSmooth(element.current, options)
        } else {
            scrollElementIntoViewSmooth(element, options)
        }

    }, millisecondsDelay ?? 500);
}
