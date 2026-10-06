import { randomUUID } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";

/**
 * Writes a file so readers see either the old content or the new one, never a partial write: the
 * content goes to a temporary file in the same directory, is flushed, then renamed over the target.
 * On any failure the temporary file is removed and the previous file is left as it was.
 */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o644);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
