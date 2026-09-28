import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function quarterlyIssueTitle(date = new Date()) {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Quarterly maintenance review (${year}-Q${quarter})`;
}

export function ensureQuarterlyReviewIssue({
  date = new Date(),
  repository = process.env.GITHUB_REPOSITORY,
  runGh = (args, options) =>
    execFileSync('gh', args, { cwd: repositoryRoot, encoding: 'utf8', ...options }),
} = {}) {
  const repositoryParts = typeof repository === 'string' ? repository.split('/') : [];
  if (
    repositoryParts.length !== 2 ||
    repositoryParts.some((part) => part === '.' || part === '..' || !/^[\w.-]+$/.test(part))
  ) {
    throw new Error('GITHUB_REPOSITORY must identify the owner and repository.');
  }

  const title = quarterlyIssueTitle(date);
  const issues = JSON.parse(
    runGh([
      'issue',
      'list',
      '--repo',
      repository,
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      'title',
    ]),
  );
  if (!Array.isArray(issues)) throw new Error('GitHub returned an invalid issue list.');
  if (issues.some((issue) => issue?.title === title)) return { title, created: false };

  runGh(
    [
      'issue',
      'create',
      '--repo',
      repository,
      '--title',
      title,
      '--body-file',
      path.join(repositoryRoot, 'docs', 'maintenance-review.md'),
    ],
    { stdio: 'inherit' },
  );
  return { title, created: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = ensureQuarterlyReviewIssue();
  console.log(result.created ? `Opened ${result.title}.` : `${result.title} is already open.`);
}
