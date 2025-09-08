/**
 * Toast notification system that displays success messages.
 * Reads toast parameter from URL query string and displays a toast notification.
 *
 * @module
 */
import { HTMLTemplater } from "@md/html-templater";
import onDomReady from "@md/on-dom-ready";

onDomReady(() => {
  const url = new URL(location.href);
  const toastParam = url.searchParams.get("toast");
  if (!toastParam) return;

  const toastData = document.querySelector<HTMLDataElement>(
    `#toast-container data[name="${toastParam}"]`,
  );
  if (!toastData) return;

  const type = toastData.getAttribute("data-type") || "success";

  const templater = new HTMLTemplater("#toast-container template");
  templater.instantiate({
    ".toast": { className: (v) => `${v} toast-${type}` },
    ".toast-message": { textContent: toastData.value },
  });
  const toastElement = templater.instances[1] as HTMLElement;

  // Trigger animation after a brief delay
  requestAnimationFrame(() => toastElement.classList.add("toast-show"));

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toastElement.classList.remove("toast-show");
    setTimeout(() => toastElement.remove(), 300); // Wait for fade-out animation
  }, 4000);

  // Remove toast parameter from URL without reloading
  url.searchParams.delete("toast");
  history.replaceState({}, "", url.toString());
});
