import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixRpmSpecCopy } from './desktop-rpm-spec.mjs';

test('points the RPM install copy at the staged files for every rpm version', () => {
  const line = "cp <%= process.platform === 'darwin' ? '-R' : '-r' %> usr/* %{buildroot}/usr/";
  assert.equal(
    fixRpmSpecCopy(`mkdir -p %{buildroot}/usr/\n${line}\n`),
    "mkdir -p %{buildroot}/usr/\ncp <%= process.platform === 'darwin' ? '-R' : '-r' %> %{_topdir}/BUILD/usr/* %{buildroot}/usr/\n",
  );
});

test('fails loudly when the template changes', () => {
  assert.throws(() => fixRpmSpecCopy('%install\ncp -r app/* %{buildroot}/\n'), /no longer copies/);
});
