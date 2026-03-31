import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Curriculum, Question, QuestionBank } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadCurriculum(): Curriculum {
  const raw = fs.readFileSync(path.join(__dirname, 'curriculum.json'), 'utf-8');
  return JSON.parse(raw) as Curriculum;
}

export function loadQuestions(domainId?: number): readonly Question[] {
  const questionsMap = new Map<number, readonly Question[]>();
  for (let d = 1; d <= 5; d++) {
    const filePath = path.join(__dirname, 'questions', `domain-${d}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const bank = JSON.parse(raw) as QuestionBank;
      questionsMap.set(d, bank.questions);
    } else {
      questionsMap.set(d, []);
    }
  }
  if (domainId !== undefined) return questionsMap.get(domainId) ?? [];
  return Array.from(questionsMap.values()).flat();
}

export function loadHandout(taskStatement: string): string | null {
  const filename = getHandoutFilename(taskStatement);
  const filePath = path.join(__dirname, 'handouts', filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

function getHandoutFilename(taskStatement: string): string {
  const curriculum = loadCurriculum();
  for (const domain of curriculum.domains) {
    for (const ts of domain.taskStatements) {
      if (ts.id === taskStatement) {
        const slug = ts.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        return `${ts.id}-${slug}.md`;
      }
    }
  }
  return `${taskStatement}.md`;
}
