/**
 * Minimal HTML pricing parser for OpenAI's pricing page.
 *
 * Pure function — takes an HTML string and an asOf date, returns parsed
 * pricing rows. No network, no file I/O.
 */

export type ParsedPricing = {
  modelId: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
  asOf: string;
};

/**
 * Parse a dollar-per-million-tokens value from a table cell.
 * Accepts formats like "$2.50 / 1M tokens" and returns the numeric value.
 * Returns undefined for non-price cells (e.g. "—" or missing).
 */
function parsePrice(cell: string): number | undefined {
  const match = cell.match(/\$([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return undefined;
  return Number(match[1]);
}

/**
 * Extract pricing rows from OpenAI-style HTML containing a <table> with
 * columns: Model | Input | Cached input | Output.
 *
 * The parser is deliberately simple — it finds <tr> elements inside <tbody>,
 * then extracts text from each <td>.
 */
export function parseOpenAIPricingHtml(
  html: string,
  asOf: string,
): ParsedPricing[] {
  const results: ParsedPricing[] = [];

  // Find the table body section
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return results;

  const tbody = tbodyMatch[1];

  // Split into rows
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tbody)) !== null) {
    const rowHtml = rowMatch[1];

    // Extract cell texts
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      // Strip any inner HTML tags and trim whitespace
      cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
    }

    // Need at least 4 cells: model, input, cached, output
    if (cells.length < 4) continue;

    const modelId = cells[0];
    const inputPerMillion = parsePrice(cells[1]);
    const cachedInputPerMillion = parsePrice(cells[2]);
    const outputPerMillion = parsePrice(cells[3]);

    // Skip rows where essential prices are missing
    if (inputPerMillion === undefined || outputPerMillion === undefined) continue;

    const entry: ParsedPricing = {
      modelId,
      inputPerMillion,
      outputPerMillion,
      asOf,
    };

    if (cachedInputPerMillion !== undefined) {
      entry.cachedInputPerMillion = cachedInputPerMillion;
    }

    results.push(entry);
  }

  return results;
}
