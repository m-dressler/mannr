/**
 * Progressively enhances the form to prevent multiple submissions and, if POST, avoid PRG pattern history pollution.
 *
 * To handle returning data, add a `form-response` event listener on the form in question.
 *
 * @module
 */

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  // Prevent further submissions
  const submitButtons = form.querySelectorAll<
    HTMLButtonElement | HTMLInputElement
  >(
    'button[type="submit"], input[type="submit"]',
  );
  submitButtons.forEach((button) => button.disabled = true);

  // Only do progressive enhancement for POST requests
  if (form.method.toLowerCase() !== "post") return;
  // Only do progressive enhancement if opted in
  if (!form.hasAttribute("enhance")) return;

  // Prevent default form submission to avoid history pollution
  event.preventDefault();

  const body = new FormData(form);
  try {
    const response = await fetch(form.action, {
      body,
      method: "POST",
      headers: { Accept: "application/json" },
    });
    // Panic for non-json content
    if (!response.headers.get("content-type")?.includes("application/json")) {
      alert(
        "Form cannot be progressively enhanced as it return non-JSON data",
      );
      throw new Error("Form submission returned non-JSON data", {
        cause: response,
      });
    }

    const data = await response.json() as unknown;

    // Render the toast if header is present
    const toastKey = response.headers.get("X-Toast");
    if (toastKey) dispatchEvent(new CustomEvent("toast", { detail: toastKey }));

    const detail = { success: response.ok, data };
    form.dispatchEvent(new CustomEvent("form-response", { detail }));
  } catch (error) {
    console.error("Error submitting form:", error);
    const detail = { success: false, data: null };
    form.dispatchEvent(new CustomEvent("form-response", { detail }));
  } finally {
    // Re-enable submissions
    submitButtons.forEach((button) => button.disabled = false);
  }
});
