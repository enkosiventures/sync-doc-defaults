import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';


export async function createTempDirectory(prefix = 'sdd-tests-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return dir;
}

export async function write(file: string, text: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, 'utf8');
}
