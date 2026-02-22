export function isClickInsideElement(event: MouseEvent, element: Element): boolean {
    const rect = element.getBoundingClientRect();
    return (rect.left <= event.x && event.x <= rect.right)
        && (rect.top <= event.y && event.y <= rect.bottom);
}
