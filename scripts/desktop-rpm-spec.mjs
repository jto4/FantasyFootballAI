/**
 * rpm 4.20 and later run %install from BUILD/<name>-build, but electron-installer-redhat's spec
 * (through 4.0.0, with no option to replace it) copies `usr/*` relative to BUILD, where it stages
 * the app. An absolute path under %{_topdir} is right for every rpm version. Throws if the line
 * changes, so an upstream update cannot silently skip this.
 */
export function fixRpmSpecCopy(spec) {
  const staged = / usr\/\* %\{buildroot\}\/usr\//;
  if (!staged.test(spec)) throw new Error('The RPM spec template no longer copies usr/*.');
  return spec.replace(staged, ' %{_topdir}/BUILD/usr/* %{buildroot}/usr/');
}
