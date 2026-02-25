/**
 * Toast notification system that displays success messages.
 * Reads toast parameter from URL query string and displays a toast notification.
 *
 * Also listens to `toast` event on the window to render toasts from JS.
 *
 * @module
 */
import { HTMLTemplater } from "@md/html-templater";
import onDomReady from "@md/on-dom-ready";

onDomReady(() => {
  const containerId = "#toast-container";
  const container = document.querySelector<HTMLElement>(containerId)!;
  const templater = new HTMLTemplater(`${containerId} template`);
  const supportsPopover = "showPopover" in HTMLElement.prototype;

  const showToast = (toastName: string) => {
    const toastData = document.querySelector<HTMLDataElement>(
      `${containerId} data[name="${toastName}"]`,
    );
    if (!toastData) {
      return console.warn(`No toast data for toast "${toastName}"`);
    }

    const type = toastData.getAttribute("data-type") || "success";

    // Re-insert into top layer so toasts stack above any open modal dialogs
    if (supportsPopover) {
      container.togglePopover(false);
      container.showPopover();
    }

    templater.instantiate({
      ".toast": { className: (v: string) => `${v} toast-${type}` },
      ".toast-message": { textContent: toastData.value },
    });
    const toastElement = templater.parent!.querySelector(':scope > :last-child')!;

    // Trigger animation after a brief delay
    requestAnimationFrame(() => toastElement.classList.add("toast-show"));

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      toastElement.classList.remove("toast-show");
      setTimeout(() => toastElement.remove(), 300); // Wait for fade-out animation
    }, 4000);
  };

  addEventListener("toast", (e) => {
    if (e instanceof CustomEvent && typeof e.detail === "string") {
      showToast(e.detail);
    }
  });

  const url = new URL(location.href);
  const toastParam = url.searchParams.get("toast");
  if (toastParam) {
    showToast(toastParam);
    // Remove toast parameter from URL without reloading
    url.searchParams.delete("toast");
    history.replaceState({}, "", url.toString());
  }
});
