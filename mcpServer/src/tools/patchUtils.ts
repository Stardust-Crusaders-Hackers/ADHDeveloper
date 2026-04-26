export function simpleUnifiedDiff(oldText: string, newText: string, filePath = "file") {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const minLen = Math.min(oldLines.length, newLines.length);

  let start = 0;
  while (start < minLen && oldLines[start] === newLines[start]) start++;

  let suffixCount = 0;
  while (
    suffixCount < (minLen - start) &&
    oldLines[oldLines.length - 1 - suffixCount] === newLines[newLines.length - 1 - suffixCount]
  )
    suffixCount++;

  const oldMiddle = oldLines.slice(start, oldLines.length - suffixCount);
  const newMiddle = newLines.slice(start, newLines.length - suffixCount);

  const header = `--- ${filePath}\n+++ ${filePath}\n@@ ${start},${oldMiddle.length} ${start},${newMiddle.length}\n`;

  const lines: string[] = [];
  for (const l of oldMiddle) lines.push(`-${l}`);
  for (const l of newMiddle) lines.push(`+${l}`);

  return header + lines.join("\n") + "\n";
}

export function buildPatch(filePath: string, oldContent: string, newContent: string, summary?: string) {
  const patch = simpleUnifiedDiff(oldContent, newContent, filePath);
  return { filePath, patch, summary: summary ?? `${oldContent.split(/\r?\n/).length} -> ${newContent.split(/\r?\n/).length} lines` };
}
