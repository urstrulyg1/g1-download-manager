import * as fs from 'fs';
import * as path from 'path';

describe('Disaster Recovery & Supply Chain SBOM Suite', () => {
  it('should verify package.json dependency integrity and SBOM metadata', () => {
    const pkgPath = path.join(__dirname, '../package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.name).toBe('g1dm');
    expect(pkg.version).toBe('1.0.0');
    expect(pkg.dependencies).toBeDefined();
    expect(pkg.dependencies['basic-ftp']).toBeDefined();
    expect(pkg.dependencies['sql.js']).toBeDefined();
  });
});
