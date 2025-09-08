/**
 * Adds a submit event listener to forms to disable the submit button upon submission.
 *
 * @module
 */
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  
  const submitButtons = form.querySelectorAll<
    HTMLButtonElement | HTMLInputElement
  >(
    'button[type="submit"], input[type="submit"]',
  );
  submitButtons.forEach((button) => button.disabled = true);
});
