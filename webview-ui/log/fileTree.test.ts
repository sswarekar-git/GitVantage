import { describe, expect, it } from 'vitest';
import { buildFileTree } from './fileTree';

describe('buildFileTree', () => {
  it('nests files under their folder segments', () => {
    const tree = buildFileTree([{ status: 'M', path: 'src/components/Button.tsx' }]);
    expect(tree).toEqual([
      {
        kind: 'folder',
        name: 'src',
        path: 'src',
        children: [
          {
            kind: 'folder',
            name: 'components',
            path: 'src/components',
            children: [{ kind: 'file', name: 'Button.tsx', path: 'src/components/Button.tsx', status: 'M' }],
          },
        ],
      },
    ]);
  });

  it('places root-level files at the top of the tree', () => {
    const tree = buildFileTree([{ status: 'A', path: 'README.md' }]);
    expect(tree).toEqual([{ kind: 'file', name: 'README.md', path: 'README.md', status: 'A' }]);
  });

  it('groups multiple files sharing a folder under one folder node', () => {
    const tree = buildFileTree([
      { status: 'M', path: 'src/a.ts' },
      { status: 'A', path: 'src/b.ts' },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].kind).toBe('folder');
    expect(tree[0].kind === 'folder' && tree[0].children).toHaveLength(2);
  });

  it('sorts folders before files, then alphabetically', () => {
    const tree = buildFileTree([
      { status: 'A', path: 'zeta.ts' },
      { status: 'A', path: 'alpha/inner.ts' },
      { status: 'A', path: 'beta.ts' },
    ]);
    expect(tree.map((n) => n.name)).toEqual(['alpha', 'beta.ts', 'zeta.ts']);
  });
});
