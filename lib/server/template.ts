export const template = (
  html: string,
  values: Record<string, string | number>,
): string => {
  for (const [key, value] of Object.entries(values)) {
    html = html.replaceAll(`[${key}]`, value.toString());
  }
  return html;
};
