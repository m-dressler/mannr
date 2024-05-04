const run = () => {
    console.log("Hello from esite with DOM ready");
    const copyright = document.querySelector<HTMLElement>(".copyright-notice");
    // Update copyright year to be current year
    if (copyright)
      copyright.innerText = copyright.innerText.replace(
        "(YEAR)",
        new Date().getFullYear() + ""
      );
  };
  
  if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run);
  