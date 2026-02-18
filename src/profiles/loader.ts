import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { getProfilesDir } from '../config.js';

export interface ModelProfile {
  name: string;
  provider: string;
  preferredFormat: 'xml' | 'markdown' | 'jinja' | 'plain';
  systemPromptStyle: string;
  strengths: string[];
  quirks: string[];
  rewriteHints: Record<string, string>;
}

export async function loadProfile(name: string): Promise<ModelProfile | null> {
  const dir = getProfilesDir();
  const filePath = path.join(dir, `${name}.yaml`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return yaml.load(raw) as ModelProfile;
  } catch {
    return null;
  }
}

export async function listProfiles(): Promise<ModelProfile[]> {
  const dir = getProfilesDir();
  const profiles: ModelProfile[] = [];
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.yaml')) continue;
      const raw = await fs.readFile(path.join(dir, file), 'utf-8');
      const profile = yaml.load(raw) as ModelProfile;
      if (profile?.name) profiles.push(profile);
    }
  } catch {
    // No profiles dir yet
  }
  return profiles;
}

export async function findProfileForModel(modelName: string): Promise<ModelProfile | null> {
  const profiles = await listProfiles();
  const lower = modelName.toLowerCase();

  // Exact name match
  const exact = profiles.find(p => p.name.toLowerCase() === lower);
  if (exact) return exact;

  // Partial match
  const partial = profiles.find(p =>
    lower.includes(p.name.toLowerCase()) ||
    p.name.toLowerCase().includes(lower)
  );
  return partial ?? null;
}
