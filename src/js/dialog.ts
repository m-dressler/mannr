import onDomReady from "@md/on-dom-ready";

onDomReady(() => {
  const dialogButtons = document.querySelectorAll<HTMLButtonElement>(
    "button[data-dialog]",
  );
  dialogButtons.forEach((button) => {
    const dialog = document.querySelector<HTMLDialogElement>(
      "dialog#" + button.dataset.dialog,
    );
    if (dialog) button.addEventListener("click", () => dialog.showModal());
  });
});
